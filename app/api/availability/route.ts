import { NextResponse } from "next/server";
import { getCustomer } from "../../../lib/customer-auth";
import { availability, pool } from "../../../lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const customer = await getCustomer();
    if (!customer)
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const data = await availability();
    const active = await pool().query("SELECT reference FROM bookings WHERE customer_id=$1 AND status IN ('confirmed','being_packed','shipped') ORDER BY created_at DESC LIMIT 1", [customer.id]);
    return NextResponse.json(
      {
        demo: data.demo,
        activeBooking: active.rows[0]?.reference || null,
        settings: {
          timezone: data.settings.timezone,
          horizon: data.settings.horizon,
        },
        days: data.days.map((day) => ({
          date: day.date,
          available: day.slots.some((s) => s.remaining > 0),
        })),
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "The schedule is temporarily unavailable. Please try again shortly.",
      },
      { status: 503 },
    );
  }
}
