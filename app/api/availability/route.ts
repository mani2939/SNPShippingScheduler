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
    const rejected = await pool().query("SELECT reference,status FROM urgent_requests WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 1", [customer.id]);
    const deletion = await pool().query("SELECT 1 FROM gdpr_erasure_requests WHERE customer_id=$1 AND status='pending' LIMIT 1", [customer.id]);
    const pending = await pool().query("SELECT reference,preferred_date FROM urgent_requests WHERE customer_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1", [customer.id]);
    const active = await pool().query("SELECT reference FROM bookings WHERE customer_id=$1 AND status IN ('confirmed','being_packed','shipped') ORDER BY created_at DESC LIMIT 1", [customer.id]);
    return NextResponse.json(
      {
        demo: data.demo,
        activeBooking: active.rows[0]?.reference || null,
        pendingUrgent: pending.rows[0] || null,
        deletionRequested: !!deletion.rowCount,
        latestRejectedUrgent: rejected.rows[0]?.status === "rejected" ? rejected.rows[0].reference : null,
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
