import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "../../../../lib/customer-auth";
import { pool } from "../../../../lib/db";
import { customerHistory } from "../../../../lib/customer-history";
export const dynamic = "force-dynamic";
function reply(data: object, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function GET(request: NextRequest) {
  try {
    const customer = await getCustomer();
    if (!customer)
      return reply({ error: "Please sign in to view your bookings." }, 401);
    const rawPage = request.nextUrl.searchParams.get("page") || "0";
    if (!/^\d{1,6}$/.test(rawPage))
      return reply({ error: "Invalid history page." }, 400);
    return reply(await customerHistory(pool(), customer.id, Number(rawPage)));
  } catch {
    return reply(
      { error: "Could not load your booking history. Please try again." },
      503,
    );
  }
}
