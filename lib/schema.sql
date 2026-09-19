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
