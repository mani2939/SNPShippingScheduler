import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

export async function readMigrations(
  directory = new URL("../migrations/", import.meta.url),
) {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (!names.length) throw new Error("No database migrations found.");
  const versions = new Set();
  return Promise.all(
    names.map(async (name) => {
      if (
        !/^\d{4}_[a-z0-9_]+\.sql$/.test(name) ||
        versions.has(name.slice(0, 4))
      ) {
        throw new Error(`Invalid or duplicate migration version: ${name}`);
      }
      versions.add(name.slice(0, 4));
      const sql = await readFile(new URL(name, directory), "utf8");
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

// One connection and transaction keep the lock valid with pooled Neon URLs.
export async function migrate(client, migrations, log = console.log) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '60s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query("SELECT pg_advisory_xact_lock(1936617521, 1)");
    await client.query(`CREATE TABLE IF NOT EXISTS snp_schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query(
      "SELECT name, checksum FROM snp_schema_migrations",
    );
    const applied = new Map(rows.map((row) => [row.name, row.checksum]));
    let count = 0;
    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        if (applied.get(migration.name) !== migration.checksum) {
          throw new Error(
            `Applied migration changed: ${migration.name}. Restore it and add a new migration.`,
          );
        }
        continue;
      }
      log(`Applying ${migration.name}`);
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO snp_schema_migrations(name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      count++;
    }
    await client.query("COMMIT");
    log(`Database ready: ${count} migration(s) applied.`);
    return count;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
