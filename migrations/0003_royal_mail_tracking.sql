ALTER TABLE bookings ADD COLUMN IF NOT EXISTS royal_mail_tracking text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
