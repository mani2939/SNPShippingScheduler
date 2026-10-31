-- Keep old database photos readable during the rolling deployment and backfill.
ALTER TABLE order_photos ALTER COLUMN image DROP NOT NULL;
ALTER TABLE order_photos ADD COLUMN IF NOT EXISTS blob_pathname text;
ALTER TABLE order_photos DROP CONSTRAINT IF EXISTS order_photos_storage_present;
ALTER TABLE order_photos ADD CONSTRAINT order_photos_storage_present
 CHECK (image IS NOT NULL OR blob_pathname IS NOT NULL);
CREATE INDEX IF NOT EXISTS order_photos_retention ON order_photos(created_at);

-- Durable outbox: survives upload/commit failures and cascading account deletion.
CREATE TABLE IF NOT EXISTS photo_blob_deletions (
 pathname text PRIMARY KEY,
 not_before timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photo_blob_deletions_due ON photo_blob_deletions(not_before);
CREATE OR REPLACE FUNCTION queue_deleted_photo_blob() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.blob_pathname IS NOT NULL THEN
  INSERT INTO photo_blob_deletions(pathname) VALUES(OLD.blob_pathname)
   ON CONFLICT(pathname) DO UPDATE SET not_before=now();
 END IF;
 RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS order_photos_queue_blob_deletion ON order_photos;
CREATE TRIGGER order_photos_queue_blob_deletion AFTER DELETE ON order_photos
 FOR EACH ROW EXECUTE FUNCTION queue_deleted_photo_blob();
