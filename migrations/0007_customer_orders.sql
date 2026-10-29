CREATE TABLE IF NOT EXISTS customer_orders (
 id uuid PRIMARY KEY,
 number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 order_date text NOT NULL,
 total_pence integer NOT NULL CHECK (total_pence >= 400),
 shipping_pence integer NOT NULL DEFAULT 400 CHECK (shipping_pence = 400),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_orders_history ON customer_orders(customer_id, order_date DESC, number DESC);
