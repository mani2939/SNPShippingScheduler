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
    const [bookings, blocked, schedule] = await Promise.all([
      pool().query(
        "SELECT b.*,COALESCE(jsonb_object_agg(n.channel,jsonb_build_object('status',n.status,'error',n.last_error)) FILTER(WHERE n.channel IS NOT NULL),'{}'::jsonb) AS notifications FROM bookings b LEFT JOIN notifications n ON n.booking_id=b.id GROUP BY b.id ORDER BY b.dispatch_date DESC,b.created_at DESC LIMIT 500",
      ),
      pool().query("SELECT * FROM blocked_slots"),
      availability(),
    ]);
    return NextResponse.json(
      {
        demo: false,
        settings: schedule.settings,
        bookings: bookings.rows,
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
    } else if (input.action === "status") {
      if (
        !["cancelled", "dispatched"].includes(input.status) ||
        typeof input.id !== "string"
      )
        throw Error("Invalid booking update.");
      const changed = await pool().query(
        "UPDATE bookings SET status=$2 WHERE id=$1 AND status='confirmed' RETURNING id",
        [input.id, input.status],
      );
      if (!changed.rowCount)
        throw Error("Only confirmed bookings can be updated.");
    } else if (input.action === "retry") {
      if (typeof input.id !== "string") throw Error("Invalid booking.");
      await sendNotifications(input.id);
    } else throw Error("Unknown action.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    const safe =
      /^(Choose |This slot|Only confirmed|Use |Enter |Invalid |Unknown action)/.test(
        message,
      );
    return NextResponse.json(
      { error: safe ? message : "Unable to save changes. Please try again." },
      { status: 400 },
    );
  }
}
