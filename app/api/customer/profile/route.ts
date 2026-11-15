import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "../../../../lib/customer-auth";
import { pool } from "../../../../lib/db";
import { updateCustomerTikTok } from "../../../../lib/customer-profile";
import { sameOrigin, smallJSON } from "../../../../lib/security";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  try {
    const customer = await getCustomer();
    if (!customer) return NextResponse.json({ error: "Please sign in." }, { status: 401, headers });
    return NextResponse.json({ customer }, { headers });
  } catch { return NextResponse.json({ error: "Could not load your profile." }, { status: 503, headers }); }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  try {
    const customer = await getCustomer();
    if (!customer) return NextResponse.json({ error: "Please sign in." }, { status: 401, headers });
    const input = await smallJSON(request);
    if (!Object.hasOwn(input, "tiktokId")) return NextResponse.json({ error: "Enter a TikTok ID or leave it blank to clear it." }, { status: 400, headers });
    const updated = await updateCustomerTikTok(pool(), customer.id, input.tiktokId);
    return NextResponse.json({ customer: updated }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const invalid = /^(Enter a valid TikTok ID|Request is too large)/.test(message) || error instanceof SyntaxError;
    return NextResponse.json({ error: invalid ? message : "Could not save your profile." }, { status: invalid ? 400 : 503, headers });
  }
}
