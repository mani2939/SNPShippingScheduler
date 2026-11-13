import { NextResponse } from "next/server";
import { isAdmin } from "../../../../../lib/security";
import { pool } from "../../../../../lib/db";
import { adminCustomerDetails } from "../../../../../lib/admin-customers";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: { params: Promise<{ customerId: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin sign-in required." }, { status: 401, headers });
  }
  try {
    const { customerId } = await context.params;
    const customer = await adminCustomerDetails(pool(), customerId);
    if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404, headers });
    return NextResponse.json({ customer }, { headers });
  } catch {
    return NextResponse.json({ error: "Could not load customer details." }, { status: 503, headers });
  }
}
