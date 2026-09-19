import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
export function adminConfigured() {
  return (
    !!process.env.ADMIN_PASSWORD_HASH &&
    !!process.env.SESSION_SECRET &&
    process.env.SESSION_SECRET.length >= 32
  );
}
export function passwordMatches(password: string) {
  try {
    const [salt, hash] = process.env.ADMIN_PASSWORD_HASH!.split(":");
    const expected = Buffer.from(hash, "hex");
    const actual = scryptSync(password, salt, 64);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}
function sign(value: string) {
  return createHmac("sha256", process.env.SESSION_SECRET!)
    .update(value)
    .digest("hex");
}
export function newSession() {
  const payload = Buffer.from(
    JSON.stringify({
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
    return (
      JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now()
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
