import { randomUUID } from "node:crypto";
import type { CustomerDB } from "./customer-store.ts";
import { activeBookingMessage } from "./booking-status.ts";
import { addDays, nextAvailableSlot, today, validDate, type Settings } from "./schedule.ts";

function validUrgentDate(date: string, timezone: string, now: Date) {
  const current = today(timezone, now);
  return validDate(date) && date >= current && date <= addDays(current, 90);
}

// Called only by the authenticated admin urgent-decision route, inside a transaction.
// The date lock is shared with normal booking and closed-place operations.
export async function decideUrgentRequestInTransaction(db: CustomerDB, id: string, decision: "approve" | "reject", date?: string, now = new Date()) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Error("Invalid urgent request.");

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
  if (!date || !validUrgentDate(date, settings.timezone, now)) throw Error("Choose a dispatch date from today through the next 90 days.");
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [date]);
  const active = await db.query("SELECT 1 FROM bookings WHERE customer_id=$1 AND status IN ('confirmed','being_packed','shipped') LIMIT 1", [customer.id]);
  if (active.rowCount) throw Error(activeBookingMessage);
  const occupied = (await db.query("SELECT slot FROM bookings WHERE dispatch_date=$1 AND status <> 'cancelled' UNION SELECT slot FROM blocked_slots WHERE dispatch_date=$1", [date])).rows;
  // Reuse a normal place first. Overflow is private to this urgent approval;
  // settings and the public booking calendar keep their normal three places.
  let slot = nextAvailableSlot(settings, occupied);
  if (!slot) {
    const used = new Set(occupied.map((row: {slot: string}) => row.slot));
    let extra = 1;
    while (used.has(`urgent-${extra}`)) extra++;
    slot = `urgent-${extra}`;
  }
  const bookingId = randomUUID();
  await db.query("UPDATE urgent_requests SET status='approved',assigned_date=$2,decided_at=now() WHERE id=$1", [id,date]);
  await db.query("INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,customer_id,urgent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true)", [bookingId,randomUUID(),urgent.reference,customer.name,customer.email,date,slot,settings.timezone,customer.id]);
  await db.query("UPDATE urgent_requests SET booking_id=$2 WHERE id=$1", [id,bookingId]);
  await db.query("INSERT INTO notifications(booking_id,channel) VALUES($1,'email'),($1,'whatsapp')", [bookingId]);
  return { decision, bookingId };
}
