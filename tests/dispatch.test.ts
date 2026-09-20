import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { saveDispatch } from "../lib/dispatch.ts";
import { trackingURL } from "../lib/tracking.ts";
import { customerHistory } from "../lib/customer-history.ts";
import type { CustomerDB } from "../lib/customer-store.ts";
test("dispatch requires tracking, saves atomically and exposes it only to the owner", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8"),
    );
    const db = {
      query: async (sql: string, params?: unknown[]) => {
        const r = await pg.query(sql, params);
        return { ...r, rowCount: r.affectedRows };
      },
    } as unknown as CustomerDB;
    const id = randomUUID(),
      owner = randomUUID();
    await pg.query(
      "INSERT INTO customers(id,name,email,password_hash) VALUES($1,'Owner','owner@example.com','hash')",
      [owner],
    );
    await pg.query(
      `INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,customer_id) VALUES($1,$2,'TRACK','Owner','owner@example.com','2026-09-21','slot-1','Europe/London',$3)`,
      [id, randomUUID(), owner],
    );
    await assert.rejects(saveDispatch(db, id, ""), /Enter a Royal Mail/);
    await assert.rejects(
      saveDispatch(db, id, "https://evil.example"),
      /Enter a Royal Mail/,
    );
    assert.equal(
      (await pg.query<{ status: string }>("SELECT status FROM bookings WHERE id=$1", [id])).rows[0]
        .status,
      "confirmed",
    );
    await saveDispatch(db, id, "ab 123456789 gb");
    const first = (await customerHistory(db, owner)).bookings[0];
    assert.equal(first.status, "dispatched");
    assert.equal(first.royal_mail_tracking, "AB123456789GB");
    assert.ok(first.dispatched_at);
    assert.deepEqual((await customerHistory(db, randomUUID())).bookings, []);
    await assert.rejects(
      saveDispatch(db, id, "CD123456789GB"),
      /Only confirmed/,
    );
    await saveDispatch(db, id, "CD123456789GB", true);
    const updated = (await customerHistory(db, owner)).bookings[0];
    assert.equal(updated.royal_mail_tracking, "CD123456789GB");
    assert.deepEqual(updated.dispatched_at, first.dispatched_at);
    await pg.query("UPDATE bookings SET status='cancelled' WHERE id=$1", [id]);
    await assert.rejects(
      saveDispatch(db, id, "AB123456789GB"),
      /Only confirmed/,
    );
    await assert.rejects(
      saveDispatch(db, id, "AB123456789GB", true),
      /Only dispatched/,
    );
    assert.equal(
      trackingURL("AB123456789GB"),
      "https://www.royalmail.com/portal/rm/track?trackNumber=AB123456789GB",
    );
  } finally {
    await pg.close();
  }
});
