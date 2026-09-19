import { cookies } from "next/headers";
import { pool } from "./db";
import { customerFromSession } from "./customer-store";
export const customerCookie = "snp_customer";
export async function getCustomer() {
  if (!process.env.SNP_DATABASE_URL) return null;
  const token = (await cookies()).get(customerCookie)?.value;
  if (!token) return null;
  return customerFromSession(pool(), token);
}
