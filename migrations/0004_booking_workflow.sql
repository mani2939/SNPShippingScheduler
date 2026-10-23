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
