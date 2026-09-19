import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { adminConfigured } from "./credentials";
export { adminConfigured, credentialsMatch } from "./credentials";
function sign(value: string) {
  return createHmac("sha256", process.env.SESSION_SECRET!)
    .update(value)
    .digest("hex");
}
export function newSession() {
  const payload = Buffer.from(
    JSON.stringify({
      username: process.env.ADMIN_USERNAME,
      exp: Date.now() + 8 * 60 * 60 * 1000,
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  return payload + "." + sign(payload);
}
export async function isAdmin() {
  if (!adminConfigured()) return false;
  const token = (await cookies()).get("snp_admin")?.value;
  if (!token) return false;
  try {
    const [payload, sig] = token.split(".");
    const expected = Buffer.from(sign(payload), "hex"),
      actual = Buffer.from(sig, "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      return false;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString());
    return (
      session.username === process.env.ADMIN_USERNAME &&
      session.exp > Date.now()
    );
  } catch {
    return false;
  }
}
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return (
    origin === request.nextUrl.origin ||
    (!!process.env.APP_URL && origin === new URL(process.env.APP_URL).origin)
  );
}
export function clientKey(request: NextRequest, category: string) {
  const ip = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for") || "unknown"
    : "local";
  return (
    category +
    ":" +
    createHmac("sha256", process.env.SESSION_SECRET || "local-preview")
      .update(ip)
      .digest("hex")
  );
}
export async function smallJSON(request: NextRequest) {
  const text = await request.text();
  if (text.length > 4096) throw new Error("Request is too large.");
  return JSON.parse(text);
}
