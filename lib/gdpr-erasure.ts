import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { tokenHash } from "./customer-password.ts";

type ErasureDB = Pick<PoolClient, "query">;
export const erasurePendingMessage = "Your data deletion request is under review. New bookings are paused until it is resolved.";

export async function requestErasure(db: ErasureDB, customerId: string) {
  const customer = await db.query("SELECT id FROM customers WHERE id=$1 FOR UPDATE", [customerId]);
  if (!customer.rowCount) throw Error("Customer account not found.");
  const existing = await db.query("SELECT id,requested_at FROM gdpr_erasure_requests WHERE customer_id=$1 AND status='pending'", [customerId]);
  if (existing.rows[0]) return existing.rows[0];
  return (await db.query("INSERT INTO gdpr_erasure_requests(id,customer_id) VALUES($1,$2) RETURNING id,requested_at", [randomUUID(),customerId])).rows[0];
}

export async function eraseCustomer(db: ErasureDB, requestId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw Error("Invalid GDPR request.");
  const initial = (await db.query("SELECT customer_id FROM gdpr_erasure_requests WHERE id=$1", [requestId])).rows[0];
  if (!initial?.customer_id) throw Error("This GDPR request is no longer pending.");
  const customer = (await db.query("SELECT id,name,email FROM customers WHERE id=$1 FOR UPDATE", [initial.customer_id])).rows[0];
  if (!customer) throw Error("Customer account not found.");
  const request = (await db.query("SELECT status,customer_id FROM gdpr_erasure_requests WHERE id=$1 FOR UPDATE", [requestId])).rows[0];
  if (request?.status !== "pending" || request.customer_id !== customer.id) throw Error("This GDPR request is no longer pending.");

  // Legacy pre-account bookings can contain this verified email without a customer ID.
  // The admin review explicitly includes them in the removal count.
  const bookings = (await db.query("SELECT id FROM bookings WHERE customer_id=$1 OR (customer_id IS NULL AND lower(email)=lower($2))", [customer.id,customer.email])).rows;
  const bookingIds = bookings.map((b: { id: string }) => b.id);
  await db.query("DELETE FROM urgent_requests WHERE customer_id=$1", [customer.id]);
  if (bookingIds.length) {
    await db.query("DELETE FROM notifications WHERE booking_id=ANY($1::uuid[])", [bookingIds]);
    await db.query("DELETE FROM bookings WHERE id=ANY($1::uuid[])", [bookingIds]);
  }
  await db.query("DELETE FROM customer_sessions WHERE customer_id=$1", [customer.id]);
  await db.query("DELETE FROM customer_tokens WHERE customer_id=$1", [customer.id]);
  await db.query("DELETE FROM rate_limits WHERE key=$1", ["customer-mail:" + tokenHash(customer.email)]);
  await db.query("DELETE FROM customers WHERE id=$1", [customer.id]);
  await db.query("UPDATE gdpr_erasure_requests SET status='completed',completed_at=now(),customer_id=NULL WHERE id=$1", [requestId]);
  return { bookingCount: bookingIds.length, email: customer.email, name: customer.name };
}

export async function sendErasureCompletion(email: string, name: string, requestId: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return "not_configured";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `gdpr-erasure-${requestId}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [email],
        subject: "Your SNP Dispatch account deletion request",
        text: `Hi ${name},\n\nWe have deleted your SNP Dispatch account and associated dispatch records from our active application database. You can no longer sign in with this account.\n\nIf you have questions about other records or services, contact support@shapesandpieces.com.\n\nSNP Dispatch`,
      }),
      signal: AbortSignal.timeout(12000),
    });
    return response.ok ? "sent" : response.status >= 500 ? "unknown" : "failed";
  } catch { return "unknown"; }
}
