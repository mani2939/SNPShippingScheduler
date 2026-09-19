import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { tokenHash, validToken } from "./customer-password.ts";
export type CustomerDB = Pick<PoolClient, "query">;
export type Customer = {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
};
export async function registerCustomer(
  db: CustomerDB,
  data: { name: string; email: string; passwordHash: string },
) {
  await db.query(
    "INSERT INTO customers(id,name,email,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING",
    [randomUUID(), data.name, data.email, data.passwordHash],
  );
  return (
    await db.query(
      "SELECT id,name,email,email_verified FROM customers WHERE email=$1 FOR UPDATE",
      [data.email],
    )
  ).rows[0] as Customer;
}
export async function issueCustomerToken(
  db: CustomerDB,
  customerId: string,
  purpose: "verify" | "reset",
) {
  // All account mutations lock the customer before its tokens/sessions.
  await db.query("SELECT id FROM customers WHERE id=$1 FOR UPDATE", [
    customerId,
  ]);
  await db.query(
    "DELETE FROM customer_tokens WHERE customer_id=$1 AND purpose=$2",
    [customerId, purpose],
  );
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO customer_tokens(token_hash,customer_id,purpose,expires_at) VALUES($1,$2,$3,now()+($4*interval '1 minute'))",
    [tokenHash(token), customerId, purpose, purpose === "reset" ? 30 : 1440],
  );
  return token;
}
export async function consumeCustomerToken(
  db: CustomerDB,
  token: string,
  purpose: "verify" | "reset",
  passwordHash?: string,
) {
  if (!validToken(token)) return false;
  const lookup = (
    await db.query(
      "SELECT customer_id FROM customer_tokens WHERE token_hash=$1 AND purpose=$2",
      [tokenHash(token), purpose],
    )
  ).rows[0];
  if (!lookup) return false;
  await db.query("SELECT id FROM customers WHERE id=$1 FOR UPDATE", [
    lookup.customer_id,
  ]);
  const result = await db.query(
    "DELETE FROM customer_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now() RETURNING customer_id",
    [tokenHash(token), purpose],
  );
  if (!result.rowCount) return false;
  const id = result.rows[0].customer_id;
  if (purpose === "reset") {
    if (!passwordHash) throw Error("A password is required.");
    // Possession of the emailed reset link also proves email ownership.
    await db.query(
      "UPDATE customers SET password_hash=$2,email_verified=true WHERE id=$1",
      [id, passwordHash],
    );
  } else
    await db.query("UPDATE customers SET email_verified=true WHERE id=$1", [
      id,
    ]);
  await db.query("DELETE FROM customer_sessions WHERE customer_id=$1", [id]);
  await db.query("DELETE FROM customer_tokens WHERE customer_id=$1", [id]);
  return true;
}
export async function createCustomerSession(
  db: CustomerDB,
  customerId: string,
) {
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO customer_sessions(token_hash,customer_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [tokenHash(token), customerId],
  );
  return token;
}
export async function customerFromSession(
  db: CustomerDB,
  token: string,
): Promise<Customer | null> {
  if (!validToken(token)) return null;
  return (
    (
      await db.query(
        "SELECT c.id,c.name,c.email,c.email_verified FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=$1 AND s.expires_at>now() AND c.email_verified=true",
        [tokenHash(token)],
      )
    ).rows[0] || null
  );
}
