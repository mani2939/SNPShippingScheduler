-- Open regular dispatches on all weekdays; retain approved urgent exceptions.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_dispatch_day_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_dispatch_day_check
 CHECK (urgent OR extract(isodow from dispatch_date::date) IN (1,2,3,4,5));
