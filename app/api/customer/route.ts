import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool, rateLimit, transaction } from "../../../lib/db";
import { sameOrigin, smallJSON, clientKey } from "../../../lib/security";
import { customerCookie, getCustomer } from "../../../lib/customer-auth";
import {
  registerCustomer,
  issueCustomerToken,
  consumeCustomerToken,
  createCustomerSession,
} from "../../../lib/customer-store";
import {
  hashPassword,
  checkPassword,
  normalEmail,
  validPassword,
  validToken,
  tokenHash,
} from "../../../lib/customer-password";
import {
  sendAccountMail,
  accountMailConfigured,
} from "../../../lib/account-mail";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const generic =
  "If this email address is eligible, we have sent a link. Check your inbox and spam folder.";
function reply(data: object, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function GET() {
  try {
    return reply({ customer: await getCustomer() });
  } catch {
    return reply({ error: "Account service is temporarily unavailable." }, 503);
  }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return reply({ error: "Please use the account page to continue." }, 403);
  try {
    const input = await smallJSON(request);
    if (input.action === "logout") {
      const token = (await cookies()).get(customerCookie)?.value;
      if (process.env.SNP_DATABASE_URL && token && validToken(token))
        await pool().query(
          "DELETE FROM customer_sessions WHERE token_hash=$1",
          [tokenHash(token)],
        );
      const r = reply({ ok: true });
      r.cookies.set(customerCookie, "", {
        path: "/",
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      return r;
    }
    if (!process.env.SNP_DATABASE_URL)
      return reply(
        {
          error: "Customer accounts are not open yet. Please try again later.",
        },
        503,
      );
    if (
      !["login", "register", "forgot", "resend", "verify", "reset"].includes(
        input.action,
      )
    )
      return reply({ error: "Invalid account action." }, 400);
    if (!(await rateLimit(clientKey(request, "customer-account"), 30, 900)))
      return reply(
        { error: "Too many attempts. Please try again in 15 minutes." },
        429,
      );
    if (input.action === "verify" || input.action === "reset") {
      if (!validToken(input.token))
        return reply(
          { error: "This link is invalid or has expired. Request a new link." },
          400,
        );
      if (input.action === "reset" && !validPassword(input.password))
        return reply({ error: "Use a password of 12–128 characters." }, 400);
      const passwordHash =
        input.action === "reset"
          ? await hashPassword(input.password)
          : undefined;
      const ok = await transaction(async (db) => {
        if (input.action === "verify") {
          if (typeof input.password !== "string" || input.password.length > 128)
            return false;
          const result = await db.query(
            "SELECT c.password_hash FROM customer_tokens t JOIN customers c ON c.id=t.customer_id WHERE t.token_hash=$1 AND t.purpose='verify' AND t.expires_at>now() FOR UPDATE OF c",
            [tokenHash(input.token)],
          );
          if (
            !result.rows[0] ||
            !(await checkPassword(input.password, result.rows[0].password_hash))
          )
            return false;
        }
        return consumeCustomerToken(
          db,
          input.token,
          input.action,
          passwordHash,
        );
      });
      if (!ok)
        return reply(
          {
            error:
              input.action === "verify"
                ? "The password is incorrect, or this link has expired. Try again or request a new link."
                : "This link is invalid or has expired. Request a new link.",
          },
          400,
        );
      const r = reply({
        ok: true,
        message:
          input.action === "verify"
            ? "Email verified. You can now sign in."
            : "Password updated. Please sign in with your new password.",
      });
      r.cookies.set(customerCookie, "", { path: "/", maxAge: 0 });
      return r;
    }
    const email = normalEmail(input.email);
    if (input.action === "login") {
      if (typeof input.password !== "string" || input.password.length > 128)
        return reply({ error: "Incorrect email or password." }, 401);
      if (!(await rateLimit("customer-login:" + tokenHash(email), 10, 900)))
        return reply(
          { error: "Too many attempts. Please try again in 15 minutes." },
          429,
        );
      const result = await transaction(async (db) => {
        const c = (
          await db.query("SELECT * FROM customers WHERE email=$1 FOR UPDATE", [
            email,
          ])
        ).rows[0];
        // Perform a password derivation even when the email does not exist.
        const valid = await checkPassword(
          input.password,
          c?.password_hash || "account-dummy:" + "0".repeat(128),
        );
        if (!c || !valid)
          return { error: "Incorrect email or password.", status: 401 };
        if (!c.email_verified)
          return {
            error:
              "Verify your email before signing in. You can request a new verification link below.",
            status: 403,
          };
        return { token: await createCustomerSession(db, c.id) };
      });
      if (!result.token) return reply({ error: result.error }, result.status);
      const r = reply({ ok: true });
      r.cookies.set(customerCookie, result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 86400,
      });
      return r;
    }
    if (!accountMailConfigured())
      return reply(
        {
          error:
            "Account email is not ready. Please contact SNP Dispatch or try again later.",
        },
        503,
      );
    if (!(await rateLimit("customer-mail:" + tokenHash(email), 3, 3600)))
      return reply({ message: generic });
    let mail: { token: string; purpose: "verify" | "reset" } | null = null;
    if (input.action === "register") {
      if (
        typeof input.name !== "string" ||
        input.name.trim().length < 2 ||
        input.name.trim().length > 100
      )
        return reply(
          { error: "Enter your full name (2–100 characters)." },
          400,
        );
      if (!validPassword(input.password))
        return reply({ error: "Use a password of 12–128 characters." }, 400);
      const passwordHash = await hashPassword(input.password);
      mail = await transaction(async (db) => {
        const c = await registerCustomer(db, {
          name: input.name.trim(),
          email,
          passwordHash,
        });
        return c.email_verified
          ? null
          : {
              token: await issueCustomerToken(db, c.id, "verify"),
              purpose: "verify" as const,
            };
      });
    } else {
      mail = await transaction(async (db) => {
        const c = (
          await db.query(
            "SELECT id,email_verified FROM customers WHERE email=$1 FOR UPDATE",
            [email],
          )
        ).rows[0];
        if (!c || (input.action === "resend" && c.email_verified)) return null;
        const purpose = input.action === "forgot" ? "reset" : "verify";
        return { token: await issueCustomerToken(db, c.id, purpose), purpose };
      });
    }
    if (mail) {
      try {
        await sendAccountMail(email, mail.token, mail.purpose);
      } catch {
        return reply(
          {
            error:
              "We could not send the account email. Please try again shortly.",
          },
          503,
        );
      }
    }
    return reply({ message: generic });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return reply(
      {
        error: /^(Enter a valid email|Request is too large)/.test(m)
          ? m
          : "Account service is temporarily unavailable. Please try again.",
      },
      /^(Enter a valid email|Request is too large)/.test(m) ? 400 : 503,
    );
  }
}
