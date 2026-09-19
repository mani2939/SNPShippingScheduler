import { getCustomer } from "../../../lib/customer-auth";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool, rateLimit, transaction } from "../../../lib/db";
import {
  validateBooking,
  nextAvailableSlot,
  type Settings,
} from "../../../lib/schedule";
import { clientKey, sameOrigin, smallJSON } from "../../../lib/security";
import { sendNotifications } from "../../../lib/notifications";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Please submit from the booking page." },
      { status: 403 },
    );
  if (!process.env.DATABASE_URL)
    return NextResponse.json(
      { error: "Bookings are not open yet." },
      { status: 503 },
    );
  try {
    const customer = await getCustomer();
    if (!customer)
      return NextResponse.json(
        { error: "Please sign in with a verified customer account." },
        { status: 401 },
      );
    if (!(await rateLimit(clientKey(request, "booking"), 20, 3600)))
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    const input = await smallJSON(request);
    const booking = await transaction(async (db) => {
      const settings = (
        await db.query("SELECT value FROM settings WHERE id=1 FOR SHARE")
      ).rows[0].value as Settings;
      const v = validateBooking(
        { ...input, name: customer.name, email: customer.email },
        settings,
      );
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [v.date]);
      const existing = (
        await db.query("SELECT * FROM bookings WHERE request_id=$1", [
          v.requestId,
        ])
      ).rows[0];
      if (existing) {
        if (existing.status === "cancelled")
          throw Error(
            "This request was cancelled. Reload the page to make a new booking.",
          );
        if (
          existing.customer_id !== customer.id ||
          existing.name !== v.name ||
          existing.email !== v.email ||
          existing.dispatch_date !== v.date
        )
          throw Error(
            "This request has changed. Reload the page and try again.",
          );
        return existing;
      }
      const occupied = (
        await db.query(
          "SELECT slot FROM bookings WHERE dispatch_date=$1 AND status <> 'cancelled' UNION SELECT slot FROM blocked_slots WHERE dispatch_date=$1",
          [v.date],
        )
      ).rows;
      const assignedSlot = nextAvailableSlot(settings, occupied);
      if (!assignedSlot)
        throw Error("This day is fully booked. Please choose another date.");
      const id = randomUUID(),
        reference = "SNP-" + randomUUID().slice(0, 8).toUpperCase();
      const b = (
        await db.query(
          "INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,customer_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
          [
            id,
            v.requestId,
            reference,
            v.name,
            v.email,
            v.date,
            assignedSlot,
            settings.timezone,
            customer.id,
          ],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO notifications(booking_id,channel) VALUES($1,'email'),($1,'whatsapp')",
        [id],
      );
      return b;
    });
    // The booking has committed. Notification problems must never turn success into a failed booking.
    try {
      await sendNotifications(booking.id);
    } catch {
      /* Persisted outbox is visible in admin. */
    }
    let emailStatus = "pending";
    try {
      emailStatus =
        (
          await pool().query(
            "SELECT status FROM notifications WHERE booking_id=$1 AND channel='email'",
            [booking.id],
          )
        ).rows[0]?.status || "pending";
    } catch {}
    return NextResponse.json(
      { reference: booking.reference, emailStatus },
      { status: 201 },
    );
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505")
      return NextResponse.json(
        {
          error:
            "That day has just filled up. Please refresh and choose another date.",
        },
        { status: 409 },
      );
    const message = e instanceof Error ? e.message : "";
    const safe =
      /^(Please enter|This day|This request|Request is too large)/.test(
        message,
      );
    return NextResponse.json(
      {
        error: safe
          ? message
          : "We could not complete the request. Please try again.",
      },
      { status: message.startsWith("This day") ? 409 : safe ? 400 : 503 },
    );
  }
}
