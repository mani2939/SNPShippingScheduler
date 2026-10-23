import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "../../../lib/customer-auth";
import { pool, rateLimit } from "../../../lib/db";
import { createUrgentRequest } from "../../../lib/urgent";
import { clientKey, sameOrigin, smallJSON } from "../../../lib/security";
export const maxDuration = 30;
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const customer = await getCustomer();
    if (!customer) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    if (!(await rateLimit(clientKey(request, "urgent"), 10, 3600))) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    const urgent = await createUrgentRequest(customer, await smallJSON(request));
    return NextResponse.json({ reference: urgent.reference }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    const safe = /^(Enter |Invalid |Choose |This request|You already|Your data deletion)/.test(message);
    return NextResponse.json({ error: safe ? message : "Could not save urgent request. Please try again." }, { status: message.includes("active booking") || message.includes("data deletion request") ? 409 : safe ? 400 : 503 });
  }
}
