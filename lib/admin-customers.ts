import type { CustomerDB } from "./customer-store.ts";

export type AdminCustomerDetails = {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  tiktok_id: string | null;
  created_at: string;
  booking_count: number;
  active_count: number;
  order_count: number;
};

export function validCustomerId(id: string) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
}

export async function adminCustomerDetails(db: CustomerDB, id: string) {
  if (!validCustomerId(id)) return undefined;
  const { rows } = await db.query(
    `SELECT c.id,c.name,c.email,c.email_verified,c.tiktok_id,c.created_at,
      (SELECT count(*)::int FROM bookings b WHERE b.customer_id=c.id
        OR (b.customer_id IS NULL AND lower(b.email)=lower(c.email))) AS booking_count,
      (SELECT count(*)::int FROM bookings b WHERE
        (b.customer_id=c.id OR (b.customer_id IS NULL AND lower(b.email)=lower(c.email)))
        AND b.status IN ('confirmed','being_packed','shipped')) AS active_count,
      (SELECT count(*)::int FROM customer_orders o WHERE o.customer_id=c.id) AS order_count
     FROM customers c WHERE c.id=$1`,
    [id],
  );
  return rows[0] as AdminCustomerDetails | undefined;
}
