import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("pending urgent request blocks bookings; approval permits exceptional dispatch date and preserves three-place capacity", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8"));
    const owner = randomUUID();
    await pg.query("INSERT INTO customers(id,name,email,password_hash) VALUES($1,'Owner','owner@example.com','hash')", [owner]);
    const urgentId = randomUUID();
    await pg.query("INSERT INTO urgent_requests(id,request_id,reference,customer_id,reason,preferred_date) VALUES($1,$2,'URG-TEST',$3,'A shipment is needed this weekend','2026-10-24')", [urgentId, randomUUID(), owner]);
    await assert.rejects(pg.query("INSERT INTO urgent_requests(id,request_id,reference,customer_id,reason) VALUES($1,$2,'URG-SECOND',$3,'Another urgent shipment needed')", [randomUUID(),randomUUID(),owner]), /one_pending_urgent_per_customer/);
    await assert.rejects(pg.query("INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,customer_id) VALUES($1,$2,'REGULAR','Owner','owner@example.com','2026-10-26','slot-1','Europe/London',$3)", [randomUUID(),randomUUID(),owner]), /active booking/);
    await pg.query("UPDATE urgent_requests SET status='approved',assigned_date='2026-10-24' WHERE id=$1", [urgentId]);
    const bookingId = randomUUID();
    await pg.query("INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,customer_id,urgent) VALUES($1,$2,'URG-TEST','Owner','owner@example.com','2026-10-24','slot-1','Europe/London',$3,true)", [bookingId,randomUUID(),owner]);
    await pg.query("UPDATE urgent_requests SET booking_id=$2 WHERE id=$1", [urgentId,bookingId]);
    assert.deepEqual((await pg.query("SELECT status,dispatch_date,urgent FROM bookings WHERE id=$1",[bookingId])).rows[0], { status:"confirmed", dispatch_date:"2026-10-24", urgent:true });
    await assert.rejects(pg.query("INSERT INTO urgent_requests(id,request_id,reference,customer_id,reason) VALUES($1,$2,'URG-THIRD',$3,'Another urgent shipment needed')", [randomUUID(),randomUUID(),owner]), /active booking/);
    await assert.rejects(pg.query("INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,customer_id) VALUES($1,$2,'WEEKEND','Owner','owner@example.com','2026-10-25','slot-1','Europe/London',$3)", [randomUUID(),randomUUID(),randomUUID()]), /bookings_dispatch_day_check|foreign key/);
  } finally { await pg.close(); }
});
