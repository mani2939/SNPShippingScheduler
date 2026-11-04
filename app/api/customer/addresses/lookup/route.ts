import { NextRequest, NextResponse } from "next/server";
import { ukPostcode } from "../../../../../lib/address-fields";
import { getCustomer } from "../../../../../lib/customer-auth";
import { rateLimit } from "../../../../../lib/db";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const customer = await getCustomer();
    if (!customer) return NextResponse.json({ error: "Please sign in." }, { status: 401, headers });
    const postcode = ukPostcode(request.nextUrl.searchParams.get("postcode") ?? "");
    if (!postcode) return NextResponse.json({ error: "Enter a full UK postcode." }, { status: 400, headers });
    const key = process.env.IDEAL_POSTCODES_API_KEY;
    if (!key) return NextResponse.json({ error: "Postcode lookup is not configured. Enter the address below." }, { status: 503, headers });
    if (!(await rateLimit(`address-lookup:${customer.id}`, 20, 3600))) {
      return NextResponse.json({ error: "Lookup limit reached. Enter the address below." }, { status: 429, headers });
    }

    const url = new URL(`https://api.ideal-postcodes.co.uk/v1/postcodes/${encodeURIComponent(postcode)}`);
    url.searchParams.set("api_key", key);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (response.status === 404) return NextResponse.json({ suggestions: [] }, { headers });
    if (!response.ok) throw Error("Lookup failed.");
    const data = await response.json() as { result: Record<string, unknown>[] };
    const suggestions = data.result.map(row => ({
      line1: String(row.line_1 ?? ""),
      line2: [row.line_2, row.line_3].filter(Boolean).join(", "),
      city: String(row.post_town ?? ""),
      region: String(row.county ?? ""),
      postcode,
    })).filter(address => address.line1 && address.city);
    return NextResponse.json({ suggestions }, { headers });
  } catch {
    return NextResponse.json({ error: "Postcode lookup is unavailable. Enter the address below." }, { status: 503, headers });
  }
}
