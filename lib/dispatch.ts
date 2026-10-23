import type { CustomerDB } from "./customer-store.ts";
import { trackingNumber } from "./tracking.ts";
import { bookingStatuses, type BookingStatus } from "./booking-status.ts";
function bookingID(id: unknown): asserts id is string {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw Error("Invalid booking.");
}
export async function updateBookingStatus(
  db: CustomerDB,
  id: unknown,
  status: unknown,
  tracking?: unknown,
) {
  bookingID(id);
  if (typeof status !== "string" || !Object.hasOwn(bookingStatuses, status))
    throw Error("Invalid booking status.");
  const number = tracking === undefined ? null : trackingNumber(tracking);
  // Shipping completes the request in the same database update. Legacy shipped
  // rows can also be completed explicitly from the admin's Shipped tab.
  const allowed: Record<BookingStatus, string[]> = {
    confirmed: ["confirmed", "being_packed"],
    being_packed: ["confirmed", "being_packed"],
    shipped: ["confirmed", "being_packed", "shipped"],
    completed: ["confirmed", "being_packed", "shipped"],
    cancelled: ["confirmed", "being_packed", "shipped"],
  };
  const finalStatus = status === "shipped" ? "completed" : status;
  const result = await db.query(
    `UPDATE bookings SET status=$2,
      royal_mail_tracking=COALESCE($3,royal_mail_tracking),
      dispatched_at=CASE WHEN $4 IN ('shipped','completed')
        THEN COALESCE(dispatched_at,now()) ELSE dispatched_at END
     WHERE id=$1 AND status=ANY($5::text[])
       AND ($4 NOT IN ('shipped','completed') OR status='shipped'
         OR COALESCE($3,royal_mail_tracking) IS NOT NULL)
     RETURNING id`,
    [id, finalStatus, number, status, allowed[status as BookingStatus]],
  );
  if (!result.rowCount)
    throw Error("Invalid status change. Add Royal Mail tracking before shipping or completing. Closed bookings cannot be reopened.");
}
export async function saveTracking(db: CustomerDB, id: unknown, tracking: unknown) {
  bookingID(id);
  const number=trackingNumber(tracking);
  const result=await db.query("UPDATE bookings SET royal_mail_tracking=$2 WHERE id=$1 AND status<>'cancelled' RETURNING id",[id,number]);
  if (!result.rowCount) throw Error("Invalid booking. Tracking cannot be added to a cancelled request.");
}
