import { updateCustomerTikTok } from "../../../../../lib/customer-profile";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin, sameOrigin, smallJSON } from "../../../../../lib/security";
import { pool } from "../../../../../lib/db";
import { adminCustomerDetails, validCustomerId } from "../../../../../lib/admin-customers";

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

export async function POST(request: NextRequest, context: { params: Promise<{ customerId: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401, headers });
  try {
    const { customerId } = await context.params;
    if (!validCustomerId(customerId)) return NextResponse.json({ error: "Customer not found." }, { status: 404, headers });
    const input = await smallJSON(request);
    if (!Object.hasOwn(input, "tiktokId")) return NextResponse.json({ error: "Enter a TikTok ID or leave it blank to clear it." }, { status: 400, headers });
    const customer = await updateCustomerTikTok(pool(), customerId, input.tiktokId);
    if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404, headers });
    return NextResponse.json({ customer }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const invalid = /^(Enter a valid TikTok ID|Request is too large)/.test(message) || error instanceof SyntaxError;
    return NextResponse.json({ error: invalid ? message : "Could not save customer details." }, { status: invalid ? 400 : 503, headers });
  }
}
