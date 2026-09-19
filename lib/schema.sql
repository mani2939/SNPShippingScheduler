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
