import type { CustomerDB } from "./customer-store.ts";
export type CustomerBooking = {
  reference: string;
  dispatch_date: string;
  status: "confirmed" | "dispatched" | "cancelled";
  created_at: string;
  timezone: string;
  royal_mail_tracking: string | null;
  dispatched_at: string | null;
};
export async function customerHistory(
  db: CustomerDB,
  customerId: string,
  page = 0,
) {
  const { rows } = await db.query(
    `SELECT reference, dispatch_date, status, created_at, timezone, royal_mail_tracking, dispatched_at FROM bookings
     WHERE customer_id=$1 ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET $2`,
    [customerId, page * 20],
  );
  return {
    bookings: rows.slice(0, 20) as CustomerBooking[],
    hasMore: rows.length > 20,
  };
}
