CREATE TABLE IF NOT EXISTS order_photos (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
 name text NOT NULL,
 content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
 image bytea NOT NULL CHECK(octet_length(image) BETWEEN 1 AND 3145728),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_photos_order ON order_photos(order_id,created_at,id);
