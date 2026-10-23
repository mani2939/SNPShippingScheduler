import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { eraseCustomer, requestErasure } from "../lib/gdpr-erasure.ts";
import type { PoolClient } from "pg";

function adapter(pg: PGlite) {
  return { query: async (sql: string, params?: unknown[]) => {
    const result = await pg.query(sql, params);
    return { ...result, rowCount: result.rows.length || result.affectedRows };
  } } as unknown as Pick<PoolClient, "query">;
}

test("erasure removes linked and matching legacy customer data while keeping only an anonymous completion record", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8"));
    const db = adapter(pg);
    const customerId = randomUUID();
    const otherId = randomUUID();
    await pg.query("INSERT INTO customers(id,name,email,password_hash,email_verified) VALUES($1,'Delete Me','delete@example.com','hash',true),($2,'Keep Me','keep@example.com','hash',true)", [customerId,otherId]);
    const linkedId = randomUUID();
    const legacyId = randomUUID();
    const keepId = randomUUID();
    for (const [id, owner, email, date, slot] of [
      [linkedId,customerId,"delete@example.com","2026-10-26","slot-1"],
      [legacyId,null,"delete@example.com","2026-10-28","slot-1"],
      [keepId,otherId,"keep@example.com","2026-10-26","slot-2"],
    ]) {
      await pg.query("INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,customer_id,royal_mail_tracking) VALUES($1,$2,$3,'Name',$4,$5,$6,'Europe/London',$7,'AB123456789GB')", [id,randomUUID(),id,email,date,slot,owner]);
      await pg.query("INSERT INTO notifications(booking_id,channel) VALUES($1,'email')", [id]);
    }
    await pg.query("INSERT INTO urgent_requests(id,request_id,reference,customer_id,reason,status,booking_id) VALUES($1,$2,'URG-ERASE',$3,'Need to dispatch urgently','approved',$4)", [randomUUID(),randomUUID(),customerId,linkedId]);
    await pg.query("INSERT INTO customer_sessions(token_hash,customer_id,expires_at) VALUES('session',$1,now()+interval '1 day')", [customerId]);
    await pg.query("INSERT INTO customer_tokens(token_hash,customer_id,purpose,expires_at) VALUES('reset',$1,'reset',now()+interval '1 day')", [customerId]);
    await pg.query("BEGIN");
    const request = await requestErasure(db,customerId);
    assert.equal((await requestErasure(db,customerId)).id,request.id);
    await pg.query("COMMIT");
    await pg.query("BEGIN");
    const result = await eraseCustomer(db,request.id);
    await pg.query("COMMIT");
    assert.equal(result.bookingCount,2);
    assert.equal(result.email,"delete@example.com");
    for (const table of ["customers","bookings","notifications","urgent_requests","customer_sessions","customer_tokens"]) {
      const column = table === "customers" ? "email" : table === "bookings" ? "email" : null;
      const rows = column ? (await pg.query(`SELECT 1 FROM ${table} WHERE ${column}='delete@example.com'`)).rows : (await pg.query(`SELECT 1 FROM ${table} WHERE ${table === "notifications" ? "booking_id" : "customer_id"}=$1`,[table === "notifications" ? linkedId : customerId])).rows;
      assert.equal(rows.length,0,`${table} retained customer data`);
    }
    assert.equal((await pg.query("SELECT 1 FROM bookings WHERE id=$1",[keepId])).rows.length,1);
    assert.deepEqual((await pg.query("SELECT status,customer_id,completed_at IS NOT NULL AS done FROM gdpr_erasure_requests WHERE id=$1",[request.id])).rows[0],{status:"completed",customer_id:null,done:true});
    await assert.rejects(eraseCustomer(db,request.id),/no longer pending/);
  } finally { await pg.close(); }
});
