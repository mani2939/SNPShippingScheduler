ALTER TABLE urgent_requests DROP CONSTRAINT IF EXISTS urgent_requests_status_check;
ALTER TABLE urgent_requests ADD CONSTRAINT urgent_requests_status_check
 CHECK (status IN ('pending','approved','rejected','cancelled'));
