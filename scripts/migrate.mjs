import { databaseURL } from "../lib/database-url.mjs";
import { Pool } from "pg";
import { migrate, readMigrations } from "./migrations.mjs";

if (!process.env.SNP_DATABASE_URL) {
  console.error(
    "Database migration requires SNP_DATABASE_URL in this Vercel environment or .env.local.",
  );
  process.exitCode = 1;
} else {
  const pool = new Pool({
    connectionString: databaseURL(process.env.SNP_DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 15000,
    application_name: "snp-dispatch-migrations",
  });
  let client;
  try {
    const migrations = await readMigrations();
    client = await pool.connect();
    await migrate(client, migrations);
  } catch (error) {
    // Never print connection strings, SQL parameters or raw provider errors.
    const code =
      typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
        ? ` (${error.code})`
        : "";
    console.error(
      `Database migration failed${code}. Check database access, schema permissions and migration files. Deployment stopped.`,
    );
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}
