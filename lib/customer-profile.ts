import type { CustomerDB } from "./customer-store.ts";

export function normalTikTokId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw Error("Enter a valid TikTok ID using letters, numbers, dots or underscores (up to 100 characters).");
  const id = value.trim().replace(/^@/, "");
  if (!id && !value.trim()) return null;
  if (!/^[a-zA-Z0-9_.]{1,100}$/.test(id)) throw Error("Enter a valid TikTok ID using letters, numbers, dots or underscores (up to 100 characters).");
  return id;
}

export async function updateCustomerTikTok(db: CustomerDB, customerId: string, value: unknown) {
  const id = normalTikTokId(value);
  const { rows } = await db.query(
    "UPDATE customers SET tiktok_id=$2 WHERE id=$1 RETURNING id,name,email,email_verified,tiktok_id",
    [customerId, id],
  );
  return rows[0];
}
