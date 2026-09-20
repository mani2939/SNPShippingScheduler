import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { customerHistory } from "../lib/customer-history.ts";
import type { CustomerDB } from "../lib/customer-store.ts";
test("customer history isolates ownership, hides internal fields, and paginates newest first", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8"),
    );
    const owner = randomUUID(),
      other = randomUUID();
    for (const id of [owner, other])
      await pg.query(
        "INSERT INTO customers(id,name,email,password_hash) VALUES($1,'Customer',$2,'hash')",
        [id, `${id}@example.com`],
      );
    for (let i = 0; i < 23; i++) {
      await pg.query(
        `INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,status,customer_id,created_at)
      VALUES($1,$2,$3,'Customer','same@example.com','2026-09-21','slot-1','Europe/London','cancelled',$4,$5)`,
        [
          randomUUID(),
          randomUUID(),
          `REF-${i}`,
          i === 22 ? other : i === 21 ? null : owner,
          new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
        ],
      );
    }
    const db = {
      query: (sql: string, params?: unknown[]) => pg.query(sql, params),
    } as unknown as CustomerDB;
    const first = await customerHistory(db, owner);
    assert.equal(first.bookings.length, 20);
    assert.equal(first.hasMore, true);
    assert.equal(first.bookings[0].reference, "REF-20");
    assert.deepEqual(Object.keys(first.bookings[0]).sort(), [
      "created_at",
      "dispatch_date",
      "dispatched_at",
      "reference",
      "royal_mail_tracking",
      "status",
      "timezone",
    ]);
    const second = await customerHistory(db, owner, 1);
    assert.deepEqual(
      second.bookings.map((b) => b.reference),
      ["REF-0"],
    );
    assert.equal(second.hasMore, false);
    assert.deepEqual(
      (await customerHistory(db, other)).bookings.map((b) => b.reference),
      ["REF-22"],
    );
    assert.deepEqual((await customerHistory(db, randomUUID())).bookings, []);
  } finally {
    await pg.close();
  }
});
