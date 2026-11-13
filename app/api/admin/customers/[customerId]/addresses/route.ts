import { NextRequest, NextResponse } from "next/server";
import { isAdmin, sameOrigin, smallJSON } from "../../../../../../lib/security";
import { pool, transaction } from "../../../../../../lib/db";
import { validCustomerId } from "../../../../../../lib/admin-customers";
import { customerAddresses, saveCustomerAddress } from "../../../../../../lib/addresses";

const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ customerId: string }> };

export async function GET(_request: Request, context: Context) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin sign-in required." }, { status: 401, headers });
  }
  try {
    const { customerId } = await context.params;
    if (!validCustomerId(customerId)) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404, headers });
    }
    const customer = await pool().query("SELECT id FROM customers WHERE id=$1", [customerId]);
    if (!customer.rows.length) return NextResponse.json({ error: "Customer not found." }, { status: 404, headers });
    return NextResponse.json({ addresses: await customerAddresses(pool(), customerId) }, { headers });
  } catch {
    return NextResponse.json({ error: "Could not load customer addresses." }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest, context: Context) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  }
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin sign-in required." }, { status: 401, headers });
  }
  try {
    const { customerId } = await context.params;
    if (!validCustomerId(customerId)) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404, headers });
    }
    const input = await smallJSON(request);
    const addresses = await transaction(db => saveCustomerAddress(db, customerId, input));
    return NextResponse.json({ addresses }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Customer account not found.") {
      return NextResponse.json({ error: "Customer not found." }, { status: 404, headers });
    }
    if (/^(Check the |Choose |You can save |Request is too large)/.test(message) || error instanceof SyntaxError) {
      return NextResponse.json({ error: error instanceof SyntaxError ? "Enter a valid address." : message }, { status: 400, headers });
    }
    return NextResponse.json({ error: "Could not save the customer address. Please try again." }, { status: 503, headers });
  }
}
