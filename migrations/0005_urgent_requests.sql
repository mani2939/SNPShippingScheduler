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
