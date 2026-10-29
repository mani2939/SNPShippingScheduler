import { randomUUID } from "node:crypto";
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
    JOIN customer_orders o ON o.id=p.order_id WHERE o.id=$1 AND ($2::uuid IS NULL OR o.customer_id=$2) ORDER BY p.created_at,p.id`,[orderId,customerId]);
  return rows as OrderPhoto[];
}
export async function readOrderPhoto(db: CustomerDB, orderId: string, photoId: string, customerId: string | null) {
  const { rows } = await db.query(`SELECT p.image,p.content_type FROM order_photos p JOIN customer_orders o ON o.id=p.order_id
    WHERE o.id=$1 AND p.id=$2 AND ($3::uuid IS NULL OR o.customer_id=$3)`,[orderId,photoId,customerId]);
  return rows[0] as {image: Buffer;content_type:string} | undefined;
}
// Caller must use a transaction: the parent lock serializes uploads per order.
export async function addOrderPhoto(db: CustomerDB, orderId: string, name: string, bytes: Uint8Array) {
  const type = photoType(bytes);
  const order = await db.query("SELECT id FROM customer_orders WHERE id=$1 FOR UPDATE",[orderId]);
  if (!order.rows.length) throw Error("Order not found.");
  const count = await db.query("SELECT count(*)::int AS count FROM order_photos WHERE order_id=$1",[orderId]);
  if (count.rows[0].count >= maxOrderPhotos) throw Error("Each order can have up to 12 photos.");
  await db.query("INSERT INTO order_photos(id,order_id,name,content_type,image) VALUES($1,$2,$3,$4,$5)",[randomUUID(),orderId,name.replace(/[\x00-\x1f\x7f]/g,"").slice(0,160) || "Packaging photo",type,Buffer.from(bytes)]);
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
