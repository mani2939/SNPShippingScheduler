import type { CustomerDB } from "./customer-store.ts";
import { canCustomerCancelBooking } from "./booking-status.ts";

export type DispatchKind = "booking" | "urgent";

// The caller uses a transaction. Match the customer-first lock order used by
// booking creation and admin urgent approval so those operations serialize.
export async function cancelCustomerDispatch(
  db: CustomerDB,
  customerId: string,
  kind: DispatchKind,
  reference: unknown,
) {
  if ((kind !== "booking" && kind !== "urgent") ||
      typeof reference !== "string" || !reference.trim() || reference.length > 100) {
    throw Error("Choose a valid dispatch request.");
  }
  await db.query("SELECT id FROM customers WHERE id=$1 FOR UPDATE", [customerId]);
  if (kind === "urgent") {
    const { rows } = await db.query(
      "SELECT id,status FROM urgent_requests WHERE customer_id=$1 AND reference=$2 FOR UPDATE",
      [customerId, reference],
    );
    const request = rows[0];
    if (!request) return { outcome: "not_found" as const };
    if (request.status === "cancelled") return { outcome: "cancelled" as const };
    if (request.status !== "pending") return { outcome: "already_decided" as const };
    await db.query(
      "UPDATE urgent_requests SET status='cancelled',decided_at=now() WHERE id=$1",
      [request.id],
    );
  } else {
    const { rows } = await db.query(
      "SELECT id,status,dispatched_at FROM bookings WHERE customer_id=$1 AND reference=$2 FOR UPDATE",
      [customerId, reference],
    );
    const booking = rows[0];
    if (!booking) return { outcome: "not_found" as const };
    if (booking.status === "cancelled") return { outcome: "cancelled" as const };
    if (!canCustomerCancelBooking(booking)) return { outcome: "packing_started" as const };
    await db.query("UPDATE bookings SET status='cancelled' WHERE id=$1", [booking.id]);
    await db.query(
      "UPDATE urgent_requests SET status='cancelled',decided_at=now() WHERE booking_id=$1 AND customer_id=$2",
      [booking.id, customerId],
    );
  }
  return { outcome: "cancelled" as const };
}
