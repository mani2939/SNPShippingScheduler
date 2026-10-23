import { eraseCustomer, sendErasureCompletion } from "../../../lib/gdpr-erasure";
import { decideUrgentRequest, sendUrgentRejection } from "../../../lib/urgent";
import { updateBookingStatus, saveTracking } from "../../../lib/dispatch";
import { NextRequest, NextResponse } from "next/server";
import { pool, rateLimit, transaction, availability } from "../../../lib/db";
import {
  adminConfigured,
  credentialsMatch,
  newSession,
  isAdmin,
  sameOrigin,
  clientKey,
  smallJSON,
} from "../../../lib/security";
import { connections, sendNotifications } from "../../../lib/notifications";
import {
  defaults,
  eligible,
  validateSettings,
  type Settings,
} from "../../../lib/schedule";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() {
  if (!(await isAdmin()))
    return NextResponse.json(
      { error: "Please sign in." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  if (!process.env.SNP_DATABASE_URL)
    return NextResponse.json(
      { error: "Connect the database to enable admin controls." },
      { status: 503 },
    );
  try {
    await pool().query(
      "UPDATE notifications SET status='unknown',last_error='Sending was interrupted. Check the provider console.',updated_at=now() WHERE status='sending' AND updated_at<now()-interval '5 minutes'",
    );
    const [bookings, blocked, schedule, urgent, customers, gdpr] = await Promise.all([
      pool().query(
        "SELECT b.*,COALESCE(jsonb_object_agg(n.channel,jsonb_build_object('status',n.status,'error',n.last_error)) FILTER(WHERE n.channel IS NOT NULL),'{}'::jsonb) AS notifications FROM bookings b LEFT JOIN notifications n ON n.booking_id=b.id GROUP BY b.id ORDER BY b.dispatch_date DESC,b.created_at DESC LIMIT 500",
      ),
      pool().query("SELECT * FROM blocked_slots"),
      availability(),
      pool().query("SELECT u.*,c.name,c.email FROM urgent_requests u JOIN customers c ON c.id=u.customer_id ORDER BY (u.status='pending') DESC,u.created_at DESC LIMIT 500"),
      pool().query("SELECT c.id,c.name,c.email,c.email_verified,c.created_at,COUNT(b.id)::int AS booking_count FROM customers c LEFT JOIN bookings b ON b.customer_id=c.id GROUP BY c.id ORDER BY c.created_at DESC"),
      pool().query("SELECT r.id,r.status,r.requested_at,r.completed_at,c.name,c.email,(SELECT COUNT(*)::int FROM bookings b WHERE b.customer_id=c.id OR (b.customer_id IS NULL AND lower(b.email)=lower(c.email))) AS booking_count,(SELECT COUNT(*)::int FROM bookings b WHERE b.customer_id=c.id AND b.status IN ('confirmed','being_packed','shipped')) AS active_count FROM gdpr_erasure_requests r LEFT JOIN customers c ON c.id=r.customer_id ORDER BY (r.status='pending') DESC,r.requested_at DESC LIMIT 500"),
    ]);
    return NextResponse.json(
      {
        demo: false,
        settings: schedule.settings,
        bookings: bookings.rows,
        urgentRequests: urgent.rows,
        customers: customers.rows,
        gdprRequests: gdpr.rows,
        blocked: blocked.rows,
        schedule: schedule.days,
        connections: connections(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load dispatch data." },
      { status: 503 },
    );
  }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  if (!process.env.SNP_DATABASE_URL)
    return NextResponse.json(
      { error: "Connect the database to enable admin controls." },
      { status: 503 },
    );
  try {
    const input = await smallJSON(request);
    if (input.action === "login") {
      if (!adminConfigured())
        return NextResponse.json(
          { error: "Admin sign-in has not been configured." },
          { status: 503 },
        );
      if (!(await rateLimit(clientKey(request, "login"), 10, 900)))
        return NextResponse.json(
          { error: "Too many attempts. Please wait 15 minutes." },
          { status: 429 },
        );
      if (!credentialsMatch(input.username, input.password))
        return NextResponse.json(
          { error: "Incorrect username or password." },
          { status: 401 },
        );
      const r = NextResponse.json({ ok: true });
      r.cookies.set("snp_admin", newSession(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 28800,
      });
      return r;
    }
    if (!(await isAdmin()))
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    if (input.action === "logout") {
      const r = NextResponse.json({ ok: true });
      r.cookies.set("snp_admin", "", { maxAge: 0, path: "/" });
      return r;
    }
    if (input.action === "settings") {
      const settings = validateSettings(input.settings);
      await pool().query("UPDATE settings SET value=$1 WHERE id=1", [
        JSON.stringify(settings),
      ]);
    } else if (input.action === "block") {
      if (
        typeof input.date !== "string" ||
        !defaults.slots.some((s) => s.id === input.slot) ||
        typeof input.blocked !== "boolean"
      )
        throw Error("Invalid slot.");
      await transaction(async (db) => {
        const settings = (
          await db.query("SELECT value FROM settings WHERE id=1 FOR SHARE")
        ).rows[0].value as Settings;
        if (!eligible(input.date, settings))
          throw Error("Choose an upcoming dispatch day.");
        await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          input.date,
        ]);
        if (input.blocked) {
          if (
            (
              await db.query(
                "SELECT 1 FROM bookings WHERE dispatch_date=$1 AND slot=$2 AND status <> 'cancelled'",
                [input.date, input.slot],
              )
            ).rowCount
          )
            throw Error(
              "This slot is booked. Cancel the booking before closing it.",
            );
          await db.query(
            "INSERT INTO blocked_slots(dispatch_date,slot) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [input.date, input.slot],
          );
        } else
          await db.query(
            "DELETE FROM blocked_slots WHERE dispatch_date=$1 AND slot=$2",
            [input.date, input.slot],
          );
      });
    } else if (input.action === "gdpr_delete") {
      const erased = await transaction(db => eraseCustomer(db, input.id));
      const emailStatus = await sendErasureCompletion(erased.email, erased.name, input.id);
      return NextResponse.json({ ok: true, deletedBookings: erased.bookingCount, emailStatus, contactEmail: emailStatus === "sent" ? null : erased.email });
    } else if (input.action === "urgent_approve" || input.action === "urgent_reject") {
      const result = await decideUrgentRequest(input.id, input.action === "urgent_approve" ? "approve" : "reject", input.date);
      return NextResponse.json({ ok: true, emailStatus: result.emailStatus });
    } else if (input.action === "urgent_retry") {
      if (typeof input.id !== "string") throw Error("Invalid urgent request.");
      return NextResponse.json({ ok: true, emailStatus: await sendUrgentRejection(input.id) });
    } else if (input.action === "status") {
      await updateBookingStatus(pool(), input.id, input.status, input.tracking);
    } else if (input.action === "tracking") {
      await saveTracking(pool(), input.id, input.tracking);
    } else if (input.action === "retry") {
      if (typeof input.id !== "string") throw Error("Invalid booking.");
      await sendNotifications(input.id);
    } else throw Error("Unknown action.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    const safe =
      /^(Choose |This slot|Only confirmed|Only dispatched|Use |Enter |Invalid |Urgent |This urgent|This dispatch|This GDPR|Customer account|You already|Unknown action)/.test(
        message,
      );
    return NextResponse.json(
      { error: safe ? message : "Unable to save changes. Please try again." },
      { status: 400 },
    );
  }
}
