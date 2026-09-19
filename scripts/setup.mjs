import { Pool } from "pg";
import { readFile } from "node:fs/promises";
if (!process.env.SNP_DATABASE_URL)
  throw Error("Set SNP_DATABASE_URL in .env.local or your environment.");
const pool = new Pool({ connectionString: process.env.SNP_DATABASE_URL });
try {
  await pool.query(
    await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8"),
  );
  console.log("Dispatch database is ready.");
} finally {
  await pool.end();
}
