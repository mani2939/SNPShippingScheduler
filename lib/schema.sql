CREATE TABLE IF NOT EXISTS settings (id integer PRIMARY KEY CHECK(id=1), value jsonb NOT NULL);
INSERT INTO settings(id,value) VALUES (1,'{"timezone":"Europe/London","horizon":42,"capacity":1,"slots":[{"id":"slot-1","label":"Slot 1"},{"id":"slot-2","label":"Slot 2"},{"id":"slot-3","label":"Slot 3"}]}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS bookings (
 id uuid PRIMARY KEY, request_id uuid UNIQUE NOT NULL, reference text UNIQUE NOT NULL,
 name text NOT NULL, email text NOT NULL, dispatch_date text NOT NULL,
 slot text NOT NULL CHECK(slot IN ('slot-1','slot-2','slot-3')),
 timezone text NOT NULL, status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','dispatched','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (extract(isodow from dispatch_date::date) IN (1,3,5))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_booking_per_slot ON bookings(dispatch_date,slot) WHERE status <> 'cancelled';
CREATE TABLE IF NOT EXISTS blocked_slots (dispatch_date text NOT NULL, slot text NOT NULL, PRIMARY KEY(dispatch_date,slot));
CREATE TABLE IF NOT EXISTS notifications (
 id bigserial PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id), channel text NOT NULL CHECK(channel IN ('email','whatsapp')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','unknown')),
 attempts integer NOT NULL DEFAULT 0, provider_id text, last_error text, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(booking_id,channel)
);
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL);

-- Customer accounts: safe to apply to existing installations.
CREATE TABLE IF NOT EXISTS customers (
 id uuid PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL,
 password_hash text NOT NULL, email_verified boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customer_sessions (
 token_hash text PRIMARY KEY, customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_sessions_owner ON customer_sessions(customer_id);
CREATE TABLE IF NOT EXISTS customer_tokens (
 token_hash text PRIMARY KEY, customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('verify','reset')), expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_tokens_owner ON customer_tokens(customer_id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS royal_mail_tracking text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
UPDATE bookings SET status='shipped' WHERE status='dispatched';
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('confirmed','being_packed','shipped','completed','cancelled'));

CREATE INDEX IF NOT EXISTS bookings_customer_active ON bookings(customer_id)
WHERE status IN ('confirmed','being_packed','shipped');

-- Preserve existing duplicate active bookings, but prevent any new ones.
-- Admins can finish the existing requests without silently cancelling customer work.
CREATE OR REPLACE FUNCTION snp_check_active_booking() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_id IS NULL OR NEW.status NOT IN ('confirmed','being_packed','shipped') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id
       AND OLD.status IN ('confirmed','being_packed','shipped') THEN
      RETURN NEW;
    END IF;
  END IF;
  PERFORM id FROM customers WHERE id=NEW.customer_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM bookings WHERE customer_id=NEW.customer_id AND id<>NEW.id
             AND status IN ('confirmed','being_packed','shipped')) THEN
    RAISE EXCEPTION 'You already have an active booking. Please wait until it is completed or cancelled.'
      USING ERRCODE='23505', CONSTRAINT='one_active_booking_per_customer';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS snp_active_booking_guard ON bookings;
CREATE TRIGGER snp_active_booking_guard BEFORE INSERT OR UPDATE OF customer_id,status ON bookings
FOR EACH ROW EXECUTE FUNCTION snp_check_active_booking();

-- Urgent requests wait for a decision and do not take a dispatch place.
CREATE TABLE IF NOT EXISTS urgent_requests (
 id uuid PRIMARY KEY,
 request_id uuid UNIQUE NOT NULL,
 reference text UNIQUE NOT NULL,
 customer_id uuid NOT NULL REFERENCES customers(id),
 preferred_date text,
 reason text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 assigned_date text,
 booking_id uuid UNIQUE REFERENCES bookings(id),
 notification_status text NOT NULL DEFAULT 'pending' CHECK (notification_status IN ('pending','sending','sent','failed','unknown')),
 notification_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 CHECK (preferred_date IS NULL OR preferred_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
 CHECK (char_length(reason) BETWEEN 10 AND 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_urgent_per_customer
 ON urgent_requests(customer_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS urgent_requests_queue ON urgent_requests(status,created_at DESC);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS urgent boolean NOT NULL DEFAULT false;
DO $$
DECLARE constraint_name text;
BEGIN
 FOR constraint_name IN
  SELECT conname FROM pg_constraint
  WHERE conrelid='bookings'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) ILIKE '%isodow%'
 LOOP EXECUTE format('ALTER TABLE bookings DROP CONSTRAINT %I', constraint_name); END LOOP;
END;
$$;
ALTER TABLE bookings ADD CONSTRAINT bookings_dispatch_day_check
 CHECK (urgent OR extract(isodow from dispatch_date::date) IN (1,3,5));

-- Serialized on customers.id, shared by both request paths.
CREATE OR REPLACE FUNCTION snp_check_active_booking() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_id IS NULL OR NEW.status NOT IN ('confirmed','being_packed','shipped') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id
     AND OLD.status IN ('confirmed','being_packed','shipped') THEN RETURN NEW; END IF;
  PERFORM id FROM customers WHERE id=NEW.customer_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM bookings WHERE customer_id=NEW.customer_id AND id<>NEW.id
             AND status IN ('confirmed','being_packed','shipped'))
     OR EXISTS (SELECT 1 FROM urgent_requests WHERE customer_id=NEW.customer_id AND status='pending') THEN
    RAISE EXCEPTION 'You already have an active booking or urgent request.'
      USING ERRCODE='23505', CONSTRAINT='one_active_booking_per_customer';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION snp_check_urgent_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status='pending' AND OLD.customer_id=NEW.customer_id THEN RETURN NEW; END IF;
  PERFORM id FROM customers WHERE id=NEW.customer_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM bookings WHERE customer_id=NEW.customer_id
             AND status IN ('confirmed','being_packed','shipped')) THEN
    RAISE EXCEPTION 'You already have an active booking or urgent request.'
      USING ERRCODE='23505', CONSTRAINT='one_active_booking_per_customer';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS snp_urgent_request_guard ON urgent_requests;
CREATE TRIGGER snp_urgent_request_guard BEFORE INSERT OR UPDATE OF customer_id,status ON urgent_requests
FOR EACH ROW EXECUTE FUNCTION snp_check_urgent_request();
-- Keep pending requests linked to verified customers. Completed rows retain only
-- an anonymous request ID and timestamps as a minimal processing record.
CREATE TABLE IF NOT EXISTS gdpr_erasure_requests (
 id uuid PRIMARY KEY,
 customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_erasure_per_customer
 ON gdpr_erasure_requests(customer_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS gdpr_erasure_queue
 ON gdpr_erasure_requests(status,requested_at DESC);

CREATE TABLE IF NOT EXISTS customer_orders (
 id uuid PRIMARY KEY,
 number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 order_date text NOT NULL,
 total_pence integer NOT NULL CHECK (total_pence >= 400),
 shipping_pence integer NOT NULL DEFAULT 400 CHECK (shipping_pence = 400),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_orders_history ON customer_orders(customer_id, order_date DESC, number DESC);

CREATE TABLE IF NOT EXISTS order_photos (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
 name text NOT NULL,
 content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
 image bytea NOT NULL CHECK(octet_length(image) BETWEEN 1 AND 3145728),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_photos_order ON order_photos(order_id,created_at,id);

-- Historical orders retain an unknown count; new order creation requires a count.
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS item_count integer
 CHECK (item_count BETWEEN 1 AND 999999);
