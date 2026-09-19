import { NextResponse } from "next/server";
import { availability } from "../../../lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await availability(), {
      headers: { "Cache-Control": "no-store" },
    });
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
