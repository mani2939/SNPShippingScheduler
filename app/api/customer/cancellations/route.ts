import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "../../../../lib/customer-auth";
import { transaction, rateLimit } from "../../../../lib/db";
import { sameOrigin, smallJSON } from "../../../../lib/security";
import { cancelCustomerDispatch } from "../../../../lib/customer-cancellation";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  }
  try {
    const customer = await getCustomer();
    if (!customer) return NextResponse.json({ error: "Please sign in." }, { status: 401, headers });
    if (!(await rateLimit(`customer-cancel:${customer.id}`, 30, 3600))) {
      return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429, headers });
    }
    const input = await smallJSON(request);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ error: "Choose a valid dispatch request." }, { status: 400, headers });
    }
    const result = await transaction(db => cancelCustomerDispatch(db, customer.id, input.kind, input.reference));
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Dispatch request not found." }, { status: 404, headers });
    }
    if (result.outcome === "already_decided") {
      return NextResponse.json({
        error: "This urgent request has already been reviewed. Refresh your bookings to see its current status.",
      }, { status: 409, headers });
    }
    if (result.outcome === "packing_started") {
      return NextResponse.json({
        error: "Packing or dispatch has already started. Please contact SNP Dispatch to request a cancellation.",
      }, { status: 409, headers });
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Choose a valid dispatch request." || message === "Request is too large." || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Choose a valid dispatch request." }, { status: 400, headers });
    }
    return NextResponse.json({ error: "Could not cancel your request. Please try again." }, { status: 503, headers });
  }
}
