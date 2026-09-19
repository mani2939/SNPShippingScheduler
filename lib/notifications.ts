import { pool } from "./db";
import { dateLabel } from "./schedule";
export function connections() {
  return {
    email: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    whatsapp: !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM &&
      process.env.TWILIO_CONTENT_SID &&
      process.env.BUSINESS_WHATSAPP_TO
    ),
  };
}
export async function sendNotifications(bookingId: string) {
  const b = (
    await pool().query("SELECT * FROM bookings WHERE id=$1", [bookingId])
  ).rows[0];
  if (!b || b.status === "cancelled") return;
  for (const channel of ["email", "whatsapp"] as const) {
    const config = connections();
    if (!config[channel]) {
      await pool().query(
        "UPDATE notifications SET status='failed',last_error='Sending service is not configured',updated_at=now() WHERE booking_id=$1 AND channel=$2 AND status IN ('pending','failed')",
        [bookingId, channel],
      );
      continue;
    }
    const result = await pool().query(
      "UPDATE notifications SET status='sending',attempts=attempts+1,updated_at=now(),last_error=NULL WHERE booking_id=$1 AND channel=$2 AND status IN ('pending','failed') RETURNING id",
      [bookingId, channel],
    );
    if (!result.rowCount) continue;
    const id = result.rows[0].id;
    let accepted = false;
    try {
      let response: Response;
      const label = "Slot " + b.slot.slice(-1);
      if (channel === "email") {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `dispatch-${bookingId}`,
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM,
            to: [b.email],
            subject: `Your SNP dispatch is booked · ${b.reference}`,
            text: `Hi ${b.name},\n\nYour dispatch is confirmed.\n\n${dateLabel(b.dispatch_date)}\nTimezone: ${b.timezone}\nReference: ${b.reference}\n\nThis is your shipment dispatch day, not its delivery date.\n\nSNP Dispatch`,
          }),
          signal: AbortSignal.timeout(12000),
        });
      } else {
        const form = new URLSearchParams({
          From: process.env.TWILIO_WHATSAPP_FROM!,
          To: process.env.BUSINESS_WHATSAPP_TO!,
          ContentSid: process.env.TWILIO_CONTENT_SID!,
          ContentVariables: JSON.stringify({
            "1": b.name,
            "2": dateLabel(b.dispatch_date),
            "3": label,
            "4": b.reference,
          }),
        });
        response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization:
                "Basic " +
                Buffer.from(
                  `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
                ).toString("base64"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: form,
            signal: AbortSignal.timeout(12000),
          },
        );
      }
      if (!response.ok) {
        await pool().query(
          "UPDATE notifications SET status=$2,last_error=$3,updated_at=now() WHERE id=$1",
          [
            id,
            response.status >= 500 ? "unknown" : "failed",
            `Provider returned HTTP ${response.status}`,
          ],
        );
        continue;
      }
      accepted = true;
      const data = await response.json();
      await pool().query(
        "UPDATE notifications SET status='sent',provider_id=$2,updated_at=now() WHERE id=$1",
        [id, data.id || data.sid],
      );
    } catch {
      await pool().query(
        "UPDATE notifications SET status='unknown',last_error=$2,updated_at=now() WHERE id=$1",
        [
          id,
          accepted
            ? "Provider accepted request; verify delivery in provider console."
            : "Request outcome unknown. Check provider console before resending.",
        ],
      );
    }
  }
}
