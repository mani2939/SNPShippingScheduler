import { createHash, scryptSync, timingSafeEqual } from "node:crypto";
export function adminConfigured() {
  return (
    !!process.env.ADMIN_USERNAME?.trim() &&
    !!process.env.ADMIN_PASSWORD_HASH &&
    !!process.env.SESSION_SECRET &&
    process.env.SESSION_SECRET.length >= 32
  );
}
export function credentialsMatch(username: unknown, password: unknown) {
  if (
    !adminConfigured() ||
    typeof username !== "string" ||
    username.length > 100 ||
    typeof password !== "string" ||
    password.length > 256
  )
    return false;
  try {
    const [salt, hash] = process.env.ADMIN_PASSWORD_HASH!.split(":");
    const expected = Buffer.from(hash, "hex"),
      actual = scryptSync(password, salt, 64);
    const validPassword =
      expected.length === actual.length && timingSafeEqual(expected, actual);
    const digest = (v: string) => createHash("sha256").update(v).digest();
    const validUsername = timingSafeEqual(
      digest(username),
      digest(process.env.ADMIN_USERNAME!),
    );
    return validUsername && validPassword;
  } catch {
    return false;
  }
}
