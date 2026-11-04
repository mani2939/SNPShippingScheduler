CREATE TABLE IF NOT EXISTS customer_addresses (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_addresses_owner ON customer_addresses(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_default ON customer_addresses(customer_id) WHERE is_default;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS shipping_address jsonb;
