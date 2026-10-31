import { randomUUID, timingSafeEqual } from "node:crypto";
import type { CustomerDB } from "./customer-store.ts";
import { migrateLegacyPhoto } from "./order-photos.ts";
import { photoBlobPath, photoBlobStorage, type PhotoBlobStorage } from "./photo-blob.ts";

// Fail closed when CRON_SECRET is missing, including outside Vercel.
export function authorizedPhotoCleanup(authorization: string | null, secret: string | undefined) {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(authorization);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function purgeQueuedPhotoBlobs(db: CustomerDB, storage: PhotoBlobStorage = photoBlobStorage) {
  const { rows } = await db.query(`SELECT q.pathname FROM photo_blob_deletions q
    WHERE q.not_before <= now() AND NOT EXISTS
      (SELECT 1 FROM order_photos p WHERE p.blob_pathname=q.pathname)
    ORDER BY q.not_before,q.pathname LIMIT 200`);
  const pathnames = rows.map((row: {pathname: string}) => row.pathname);
  // Delete from Blob FIRST. Failed/partial deletions stay queued for retry.
  // Repeating a delete is safe, including after a crash between these calls.
  await storage.remove(pathnames);
  if (pathnames.length) await db.query("DELETE FROM photo_blob_deletions WHERE pathname=ANY($1::text[])", [pathnames]);
  return pathnames.length;
}

export async function cleanupOrderPhotos(db: CustomerDB, storage: PhotoBlobStorage = photoBlobStorage) {
  const expired = await db.query("DELETE FROM order_photos WHERE created_at <= now()-interval '30 days' RETURNING id");
  let deleted = 0;
  // Bound each invocation; the durable queue carries unfinished work forward.
  for (let batch = 0; batch < 10; batch++) {
    const count = await purgeQueuedPhotoBlobs(db, storage);
    deleted += count;
    if (count < 200) break;
  }
  return {expired: expired.rows.length, deleted};
}

export async function migrateLegacyOrderPhotos(db: CustomerDB, storage: PhotoBlobStorage = photoBlobStorage) {
  // Fetch one image at a time rather than buffering hundreds of MB in a function.
  let migrated = 0;
  for (let index = 0; index < 50; index++) {
    const { rows } = await db.query(`SELECT id,image,blob_pathname,content_type FROM order_photos
      WHERE blob_pathname IS NULL AND created_at > now()-interval '30 days'
      ORDER BY created_at,id LIMIT 1`);
    if (!rows.length) break;
    await migrateLegacyPhoto(db, rows[0], storage);
    migrated++;
  }
  return migrated;
}

// Optional authenticated live check. Uses the same adapter as customer images,
// with a tiny synthetic image and a durable deletion intent; no customer records.
export async function verifyPhotoBlobStorage(db: CustomerDB, storage: PhotoBlobStorage = photoBlobStorage) {
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5N8AAAAASUVORK5CYII=", "base64");
  const pathname = photoBlobPath(`verification-${randomUUID()}`, "image/png");
  await db.query("INSERT INTO photo_blob_deletions(pathname,not_before) VALUES($1,now()+interval '1 hour')", [pathname]);
  try {
    await storage.upload(pathname, bytes, "image/png");
    const stream = await storage.read(pathname);
    if (!stream || !Buffer.from(await new Response(stream).arrayBuffer()).equals(bytes)) {
      throw Error("Blob verification failed.");
    }
  } finally {
    await storage.remove([pathname]);
    if (await storage.read(pathname)) throw Error("Blob deletion verification failed.");
    await db.query("DELETE FROM photo_blob_deletions WHERE pathname=$1", [pathname]);
  }
  return true;
}
