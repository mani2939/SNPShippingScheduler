import { randomBytes, scryptSync } from "node:crypto";
const password = randomBytes(18).toString("base64url"),
  salt = randomBytes(16).toString("hex");
console.log("Keep this password in your password manager. Do not commit it.");
console.log("Admin password: " + password);
console.log(
  "ADMIN_PASSWORD_HASH=" +
    salt +
    ":" +
    scryptSync(password, salt, 64).toString("hex"),
);
console.log("SESSION_SECRET=" + randomBytes(48).toString("base64url"));
