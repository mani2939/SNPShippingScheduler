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
