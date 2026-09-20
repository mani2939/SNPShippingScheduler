import type { CustomerDB } from "./customer-store.ts";
import { trackingNumber } from "./tracking.ts";
export async function saveDispatch(
  db: CustomerDB,
  id: unknown,
  tracking: unknown,
  correction = false,
) {
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw Error("Invalid booking.");
  const number = trackingNumber(tracking);
  const result = await db.query(
    `UPDATE bookings SET status='dispatched', royal_mail_tracking=$2,
      dispatched_at=COALESCE(dispatched_at,now())
     WHERE id=$1 AND status=$3 RETURNING id`,
    [id, number, correction ? "dispatched" : "confirmed"],
  );
  if (!result.rowCount)
    throw Error(
      correction
        ? "Only dispatched bookings can have tracking updated."
        : "Only confirmed bookings can be dispatched.",
    );
}
