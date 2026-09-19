import { NextResponse } from "next/server";
import { availability } from "../../../lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const data = await availability();
    return NextResponse.json(
      {
        demo: data.demo,
        settings: {
          timezone: data.settings.timezone,
          horizon: data.settings.horizon,
        },
        days: data.days.map((day) => ({
          date: day.date,
          remaining: day.slots.reduce((n, s) => n + s.remaining, 0),
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
