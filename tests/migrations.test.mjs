import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate, readMigrations } from "../scripts/migrations.mjs";
import { spawnSync } from "node:child_process";

const quiet = () => {};
// pg accepts multiple SQL statements without parameters; PGlite uses exec for that.
function client(db) {
  return {
    query: async (sql, params) =>
      params ? db.query(sql, params) : (await db.exec(sql)).at(-1),
  };
}

test("migration installs account schema, preserves existing bookings, and is repeatable", async () => {
  const db = new PGlite();
  try {
    const migrations = await readMigrations();
    // Simulate an installation predating customer accounts.
    await db.exec(migrations[0].sql.split("-- Customer accounts:")[0]);
    await db.query(`INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone)
      VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',
      'KEEP','Existing Customer','existing@example.com','2026-09-21','slot-1','Europe/London')`);
    assert.equal(
      await migrate(client(db), migrations, quiet),
      migrations.length,
    );
    assert.equal(await migrate(client(db), migrations, quiet), 0);
    const { rows } = await db.query(
      "SELECT reference, customer_id FROM bookings",
    );
    assert.deepEqual(rows, [{ reference: "KEEP", customer_id: null }]);
    await db.query(
      "SELECT * FROM customers, customer_sessions, customer_tokens",
    );
    assert.equal(
      (await db.query("SELECT * FROM snp_schema_migrations")).rows.length,
      migrations.length,
    );
    await assert.rejects(
      migrate(client(db), [{ ...migrations[0], checksum: "modified" }], quiet),
      /Applied migration changed/,
    );
  } finally {
    await db.close();
  }
});

test("fresh installation and failed migrations roll back together", async () => {
  const db = new PGlite();
  try {
    const migrations = await readMigrations();
    const bad = {
      name: "0004_broken.sql",
      checksum: "broken",
      sql: "CREATE TABLE should_rollback(id int); SELECT * FROM nonexistent_table;",
    };
    await assert.rejects(migrate(client(db), [...migrations, bad], quiet));
    assert.equal(
      (await db.query("SELECT to_regclass('public.customers') AS name")).rows[0]
        .name,
      null,
    );
    assert.equal(
      (
        await db.query(
          "SELECT to_regclass('public.snp_schema_migrations') AS name",
        )
      ).rows[0].name,
      null,
    );
    assert.equal(
      (await db.query("SELECT to_regclass('public.should_rollback') AS name"))
        .rows[0].name,
      null,
    );
    assert.equal(
      await migrate(client(db), migrations, quiet),
      migrations.length,
    );
  } finally {
    await db.close();
  }
});

test("migration command fails closed when SNP_DATABASE_URL is missing", () => {
  const env = { ...process.env };
  delete env.SNP_DATABASE_URL;
  const result = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires SNP_DATABASE_URL/);
});
