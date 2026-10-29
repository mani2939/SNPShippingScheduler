-- Historical orders retain an unknown count; new order creation requires a count.
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS item_count integer
 CHECK (item_count BETWEEN 1 AND 999999);
