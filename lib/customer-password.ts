import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;
  return salt + ":" + key.toString("hex");
}
export async function checkPassword(password: string, encoded: string) {
  try {
    const [salt, hex] = encoded.split(":");
    const expected = Buffer.from(hex, "hex");
    const actual = (await derive(password, salt, 64)) as Buffer;
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}
export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}
export function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
export function normalEmail(value: unknown) {
  if (typeof value !== "string") throw Error("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^\S+@[^\s@]+\.[^\s@]+$/.test(email))
    throw Error("Enter a valid email address.");
  return email;
}
