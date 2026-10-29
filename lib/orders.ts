import { randomUUID } from "node:crypto";
import type { CustomerDB } from "./customer-store.ts";
export type Order = { id: string; number: string; customer_id: string; order_date: string; item_count: number | null; total_pence: number; shipping_pence: number; name?: string; email?: string };
export function validateOrder(input: { customerId?: unknown; date?: unknown; total?: unknown; itemCount?: unknown }) {
  if (typeof input.customerId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.customerId)) throw Error("Choose a customer.");
  if (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0,10) !== input.date) throw Error("Enter a valid order date.");
  if (typeof input.total !== "string" || !/^\d{1,7}(\.\d{1,2})?$/.test(input.total)) throw Error("Enter a valid total amount.");
  const total = Math.round(Number(input.total) * 100);
  if (total < 400) throw Error("Enter a total of at least £4 including shipping.");
  if (typeof input.itemCount !== "string" || !/^[1-9]\d{0,5}$/.test(input.itemCount)) throw Error("Enter a total items count from 1 to 999999.");
  const itemCount = Number(input.itemCount);
  return { itemCount, customerId: input.customerId, date: input.date, total };
}
export async function createOrder(db: CustomerDB, input: Parameters<typeof validateOrder>[0]) {
  const order = validateOrder(input);
  const result = await db.query(`INSERT INTO customer_orders(id,customer_id,order_date,total_pence,item_count)
    SELECT $1,id,$3,$4,$5 FROM customers WHERE id=$2 RETURNING id`, [randomUUID(), order.customerId, order.date, order.total, order.itemCount]);
  if (!result.rows.length) throw Error("Choose an existing customer.");
}
export async function customerOrders(db: CustomerDB, customerId: string, page = 0) {
  const { rows } = await db.query("SELECT id,number,order_date,total_pence,shipping_pence,item_count FROM customer_orders WHERE customer_id=$1 ORDER BY order_date DESC,number DESC LIMIT 21 OFFSET $2", [customerId,page*20]);
  return { orders: rows.slice(0,20) as Order[], hasMore: rows.length > 20 };
}
