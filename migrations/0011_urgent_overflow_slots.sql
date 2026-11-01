-- Additional places exist only on an urgent booking; normal slots stay fixed.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_slot_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_slot_check CHECK (
 slot IN ('slot-1','slot-2','slot-3')
 OR (urgent AND slot ~ '^urgent-[1-9][0-9]*$')
);
-- Keep the existing unique (dispatch_date,slot) index for all active places.
