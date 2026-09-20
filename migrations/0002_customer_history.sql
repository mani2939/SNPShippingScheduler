CREATE INDEX IF NOT EXISTS bookings_customer_history ON bookings(customer_id, created_at DESC, id DESC);
