import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "../../../../lib/customer-auth";
import { pool } from "../../../../lib/db";
import { customerOrders } from "../../../../lib/orders";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const customer = await getCustomer();
    if (!customer) return NextResponse.json({error:"Please sign in."},{status:401,headers});
    const page = request.nextUrl.searchParams.get("page") || "0";
    if (!/^\d{1,6}$/.test(page)) return NextResponse.json({error:"Invalid page."},{status:400,headers});
    return NextResponse.json(await customerOrders(pool(),customer.id,Number(page)),{headers});
  } catch { return NextResponse.json({error:"Could not load orders. Please try again."},{status:503,headers}); }
}
