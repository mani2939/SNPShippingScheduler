import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "../../../lib/customer-auth";
import { transaction, rateLimit } from "../../../lib/db";
import { requestErasure } from "../../../lib/gdpr-erasure";
import { clientKey, sameOrigin } from "../../../lib/security";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const customer = await getCustomer();
    if (!customer) return NextResponse.json({ error: "Please sign in to submit this request." }, { status: 401 });
    if (!(await rateLimit(clientKey(request, "gdpr-request"), 10, 3600))) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    const result = await transaction(db => requestErasure(db, customer.id));
    return NextResponse.json({ id: result.id, requestedAt: result.requested_at }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not submit your request. Please try again or contact support." }, { status: 503 });
  }
}
