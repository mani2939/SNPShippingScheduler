import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "../../../../lib/customer-auth";
import { pool, transaction } from "../../../../lib/db";
import { customerAddresses, saveCustomerAddress } from "../../../../lib/addresses";
import { sameOrigin, smallJSON } from "../../../../lib/security";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const customer = await getCustomer();
    if (!customer) return NextResponse.json({ error: "Please sign in." }, { status: 401, headers });
    return NextResponse.json({ addresses: await customerAddresses(pool(), customer.id) }, { headers });
  } catch {
    return NextResponse.json({ error: "Could not load addresses." }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  try {
    const customer = await getCustomer();
    if (!customer) return NextResponse.json({ error: "Please sign in." }, { status: 401, headers });
    const input = await smallJSON(request);
    const addresses = await transaction(db => saveCustomerAddress(db, customer.id, input));
    return NextResponse.json({ addresses }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/^(Check the |Choose |You can save |Request is too large)/.test(message)) {
      return NextResponse.json({ error: message }, { status: 400, headers });
    }
    return NextResponse.json({ error: "Could not save the address. Please try again." }, { status: 503, headers });
  }
}
