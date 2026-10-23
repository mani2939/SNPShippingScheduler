import { erasurePendingMessage } from "./gdpr-erasure";
import { randomUUID } from "node:crypto";
import { pool, transaction } from "./db";
import { activeBookingMessage } from "./booking-status";
import { addDays, nextAvailableSlot, today, validDate, dateLabel, type Settings } from "./schedule";
import { sendNotifications } from "./notifications";

function validUrgentDate(date: string, timezone: string) {
  const current = today(timezone);
  return validDate(date) && date >= current && date <= addDays(current, 90);
}

export async function createUrgentRequest(customer: { id: string }, input: Record<string, unknown>) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Invalid request. Refresh and try again.");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const preferredDate = input.preferredDate === "" || input.preferredDate == null ? null : input.preferredDate;
  if (reason.length < 10 || reason.length > 500) throw Error("Enter a reason of 10–500 characters.");
  if (typeof input.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId)) throw Error("Invalid request. Refresh and try again.");
  return transaction(async (db) => {
    const settings = (await db.query("SELECT value FROM settings WHERE id=1")).rows[0].value as Settings;
    if (preferredDate !== null && (typeof preferredDate !== "string" || !validUrgentDate(preferredDate, settings.timezone))) throw Error("Choose a valid date within 90 days, or leave it blank.");
    await db.query("SELECT id FROM customers WHERE id=$1 FOR UPDATE", [customer.id]);
    const existing = (await db.query("SELECT * FROM urgent_requests WHERE request_id=$1", [input.requestId])).rows[0];
    if (existing) {
      if (existing.customer_id !== customer.id || existing.reason !== reason || existing.preferred_date !== preferredDate) throw Error("This request has changed. Refresh and try again.");
      return existing;
    }
    const erasure = await db.query("SELECT 1 FROM gdpr_erasure_requests WHERE customer_id=$1 AND status='pending' LIMIT 1", [customer.id]);
    if (erasure.rowCount) throw Error(erasurePendingMessage);
    const active = await db.query("SELECT 1 FROM bookings WHERE customer_id=$1 AND status IN ('confirmed','being_packed','shipped') LIMIT 1", [customer.id]);
    const pending = await db.query("SELECT 1 FROM urgent_requests WHERE customer_id=$1 AND status='pending' LIMIT 1", [customer.id]);
    if (active.rowCount || pending.rowCount) throw Error(activeBookingMessage);
    return (await db.query("INSERT INTO urgent_requests(id,request_id,reference,customer_id,preferred_date,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [randomUUID(), input.requestId, "URG-" + randomUUID().slice(0, 8).toUpperCase(), customer.id, preferredDate, reason])).rows[0];
  });
}

export async function decideUrgentRequest(id: string, decision: "approve" | "reject", date?: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Error("Invalid urgent request.");
  const result = await transaction(async (db) => {
    const initial = (await db.query("SELECT customer_id FROM urgent_requests WHERE id=$1", [id])).rows[0];
    if (!initial) throw Error("Urgent request not found.");
    const customer = (await db.query("SELECT id,name,email FROM customers WHERE id=$1 FOR UPDATE", [initial.customer_id])).rows[0];
    const urgent = (await db.query("SELECT * FROM urgent_requests WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (urgent.status !== "pending") throw Error("This urgent request has already been decided.");
    if (decision === "reject") {
      await db.query("UPDATE urgent_requests SET status='rejected',decided_at=now(),notification_status='pending' WHERE id=$1", [id]);
      return { decision, bookingId: null as string | null };
    }
    const settings = (await db.query("SELECT value FROM settings WHERE id=1")).rows[0].value as Settings;
    if (!date || !validUrgentDate(date, settings.timezone)) throw Error("Choose a dispatch date from today through the next 90 days.");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [date]);
    const active = await db.query("SELECT 1 FROM bookings WHERE customer_id=$1 AND status IN ('confirmed','being_packed','shipped') LIMIT 1", [customer.id]);
    if (active.rowCount) throw Error(activeBookingMessage);
    const occupied = (await db.query("SELECT slot FROM bookings WHERE dispatch_date=$1 AND status <> 'cancelled' UNION SELECT slot FROM blocked_slots WHERE dispatch_date=$1", [date])).rows;
    const slot = nextAvailableSlot(settings, occupied);
    if (!slot) throw Error("This dispatch date is full. Choose another date.");
    const bookingId = randomUUID();
    await db.query("UPDATE urgent_requests SET status='approved',assigned_date=$2,decided_at=now() WHERE id=$1", [id,date]);
    await db.query("INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,customer_id,urgent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true)", [bookingId,randomUUID(),urgent.reference,customer.name,customer.email,date,slot,settings.timezone,customer.id]);
    await db.query("UPDATE urgent_requests SET booking_id=$2 WHERE id=$1", [id,bookingId]);
    await db.query("INSERT INTO notifications(booking_id,channel) VALUES($1,'email'),($1,'whatsapp')", [bookingId]);
    return { decision, bookingId };
  });
  if (result.bookingId) {
    try { await sendNotifications(result.bookingId); } catch { /* durable outbox is shown to admin */ }
    try {
      const emailStatus = (await pool().query("SELECT status FROM notifications WHERE booking_id=$1 AND channel='email'", [result.bookingId])).rows[0]?.status;
      return { ...result, emailStatus };
    } catch { return { ...result, emailStatus: "unknown" }; }
  }
  try {
    const emailStatus = await sendUrgentRejection(id);
    return { ...result, emailStatus };
  } catch { return { ...result, emailStatus: "unknown" }; }
}

export async function sendUrgentRejection(id: string) {
  const row = (await pool().query("SELECT u.*,c.name,c.email FROM urgent_requests u JOIN customers c ON c.id=u.customer_id WHERE u.id=$1", [id])).rows[0];
  if (!row || row.status !== "rejected") throw Error("Urgent request is not rejected.");
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    await pool().query("UPDATE urgent_requests SET notification_status='failed',notification_error='Email service is not configured' WHERE id=$1", [id]);
    return "failed";
  }
  const claimed = await pool().query("UPDATE urgent_requests SET notification_status='sending',notification_error=NULL WHERE id=$1 AND status='rejected' AND notification_status IN ('pending','failed') RETURNING id", [id]);
  if (!claimed.rowCount) return row.notification_status;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `urgent-rejected-${id}` },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [row.email], subject: `Update on your urgent dispatch request · ${row.reference}`, text: `Hi ${row.name},\n\nYour urgent dispatch request ${row.reference} was not approved. Please sign in to request a regular dispatch date or contact SNP Dispatch if you need help.\n\nSNP Dispatch` }),
      signal: AbortSignal.timeout(12000),
    });
    const status = response.ok ? "sent" : response.status >= 500 ? "unknown" : "failed";
    await pool().query("UPDATE urgent_requests SET notification_status=$2,notification_error=$3 WHERE id=$1", [id,status,response.ok ? null : `Provider returned HTTP ${response.status}`]);
    return status;
  } catch {
    await pool().query("UPDATE urgent_requests SET notification_status='unknown',notification_error='Check provider delivery log before retrying' WHERE id=$1", [id]);
    return "unknown";
  }
}
