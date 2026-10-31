import { randomUUID } from "node:crypto";
import { photoBlobPath, photoBlobStorage, type PhotoBlobStorage } from "./photo-blob.ts";
import type { CustomerDB } from "./customer-store.ts";
export const maxPhotoBytes = 3 * 1024 * 1024;
export const maxOrderPhotos = 12;
export type OrderPhoto = { id: string; name: string; content_type: string };
export function photoType(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > maxPhotoBytes) throw Error("Choose an image up to 3 MB.");
  const b = Buffer.from(bytes);
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (b.length >= 12 && b.toString("ascii",0,4) === "RIFF" && b.toString("ascii",8,12) === "WEBP") return "image/webp";
  throw Error("Choose a JPEG, PNG or WebP image.");
}
// A null customer ID is used only after the route has verified the admin session.
export async function canViewOrder(db: CustomerDB, orderId: string, customerId: string | null) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return false;
  const result = await db.query("SELECT id FROM customer_orders WHERE id=$1 AND ($2::uuid IS NULL OR customer_id=$2)", [orderId,customerId]);
  return result.rows.length > 0;
}
export async function orderPhotos(db: CustomerDB, orderId: string, customerId: string | null) {
  const { rows } = await db.query(`SELECT p.id,p.name,p.content_type FROM order_photos p
    JOIN customer_orders o ON o.id=p.order_id WHERE o.id=$1 AND ($2::uuid IS NULL OR o.customer_id=$2)
    AND p.created_at > now()-interval '30 days' ORDER BY p.created_at,p.id`,[orderId,customerId]);
  return rows as OrderPhoto[];
}

// Register cleanup BEFORE any network upload. If the process dies or COMMIT fails,
// the cron can remove the unreferenced blob after the one-hour upload grace period.
async function prepareBlob(db: CustomerDB, type: string) {
  const pathname = photoBlobPath(randomUUID(), type);
  await db.query("INSERT INTO photo_blob_deletions(pathname,not_before) VALUES($1,now()+interval '1 hour')", [pathname]);
  return pathname;
}

type PhotoRecord = { id: string; image: Uint8Array | null; blob_pathname: string | null; content_type: string };

export async function migrateLegacyPhoto(db: CustomerDB, photo: PhotoRecord, storage: PhotoBlobStorage = photoBlobStorage) {
  if (photo.blob_pathname) return photo.blob_pathname;
  if (!photo.image) throw Error("Photo data is missing.");
  const pathname = await prepareBlob(db, photo.content_type);
  await storage.upload(pathname, photo.image, photo.content_type);
  // Preserve the original upload timestamp: migrating never extends retention.
  const updated = await db.query(`UPDATE order_photos SET blob_pathname=$2,image=NULL
    WHERE id=$1 AND blob_pathname IS NULL AND created_at > now()-interval '30 days' RETURNING id`, [photo.id, pathname]);
  if (updated.rows.length) {
    await db.query("DELETE FROM photo_blob_deletions WHERE pathname=$1", [pathname]);
    return pathname;
  }
  // Another reader may have migrated it, or the order may have been erased.
  // Our unused upload remains in the durable cleanup queue.
  const current = await db.query("SELECT blob_pathname FROM order_photos WHERE id=$1 AND created_at > now()-interval '30 days'", [photo.id]);
  return current.rows[0]?.blob_pathname as string | undefined;
}

export async function readOrderPhoto(db: CustomerDB, orderId: string, photoId: string, customerId: string | null, storage: PhotoBlobStorage = photoBlobStorage) {
  const { rows } = await db.query(`SELECT p.id,p.image,p.blob_pathname,p.content_type FROM order_photos p JOIN customer_orders o ON o.id=p.order_id
    WHERE o.id=$1 AND p.id=$2 AND ($3::uuid IS NULL OR o.customer_id=$3)
    AND p.created_at > now()-interval '30 days'`,[orderId,photoId,customerId]);
  const photo = rows[0] as PhotoRecord | undefined;
  if (!photo) return undefined;
  const pathname = await migrateLegacyPhoto(db, photo, storage);
  if (!pathname) return undefined;
  const stream = await storage.read(pathname);
  return stream ? {stream, content_type: photo.content_type} : undefined;
}

type PhotoTransaction = <T>(fn: (db: CustomerDB) => Promise<T>) => Promise<T>;
// Use a separate pool query for the durable upload intent, not the transaction
// that registers the photo. Only metadata is written to the order_photos table.
export async function addOrderPhoto(db: CustomerDB, runTransaction: PhotoTransaction, orderId: string, name: string, bytes: Uint8Array, storage: PhotoBlobStorage = photoBlobStorage) {
  const type = photoType(bytes);
  const pathname = await prepareBlob(db, type);
  await storage.upload(pathname, bytes, type);
  await runTransaction(async tx => {
    const order = await tx.query("SELECT id FROM customer_orders WHERE id=$1 FOR UPDATE",[orderId]);
    if (!order.rows.length) throw Error("Order not found.");
    const count = await tx.query("SELECT count(*)::int AS count FROM order_photos WHERE order_id=$1 AND created_at > now()-interval '30 days'",[orderId]);
    if (count.rows[0].count >= maxOrderPhotos) throw Error("Each order can have up to 12 photos.");
    await tx.query("INSERT INTO order_photos(id,order_id,name,content_type,blob_pathname) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(),orderId,name.replace(/[\x00-\x1f\x7f]/g,"").slice(0,160) || "Packaging photo",type,pathname]);
    await tx.query("DELETE FROM photo_blob_deletions WHERE pathname=$1", [pathname]);
  });
}

export async function boundedFormData(request: Request) {
  const limit = maxPhotoBytes + 65536;
  if (Number(request.headers.get("content-length")) > limit) throw Error("Choose an image up to 3 MB.");
  const reader = request.body?.getReader();
  if (!reader) throw Error("Choose a photo to upload.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const {done,value} = await reader.read(); if(done) break; size += value.length;
    if(size > limit) { await reader.cancel(); throw Error("Choose an image up to 3 MB."); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  return new Response(Buffer.concat(chunks),{headers:{"Content-Type":request.headers.get("content-type") || ""}}).formData();
}
