export function accountMailConfigured() {
  if (
    !process.env.RESEND_API_KEY ||
    !process.env.EMAIL_FROM ||
    !process.env.APP_URL
  )
    return false;
  try {
    const u = new URL(process.env.APP_URL);
    return (
      u.protocol === "https:" ||
      (process.env.NODE_ENV !== "production" &&
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname))
    );
  } catch {
    return false;
  }
}
export async function sendAccountMail(
  email: string,
  token: string,
  purpose: "verify" | "reset",
) {
  if (!accountMailConfigured()) throw Error("Account email is not configured.");
  const url = new URL("/account", process.env.APP_URL!);
  url.searchParams.set("mode", purpose);
  url.searchParams.set("token", token);
  const verify = purpose === "verify";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `account-${purpose}-${token}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: verify
        ? "Verify your SNP Dispatch account"
        : "Reset your SNP Dispatch password",
      text: verify
        ? `Verify your email address to finish creating your SNP Dispatch account. Open the link and confirm your account password:\n\n${url}\n\nThis link expires in 24 hours. If you did not request an account, ignore this email.`
        : `To choose a new SNP Dispatch password, open:\n\n${url}\n\nThis link expires in 30 minutes and can only be used once. If you did not request a password reset, ignore this email.`,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw Error("Account email could not be sent. Please try again shortly.");
}
