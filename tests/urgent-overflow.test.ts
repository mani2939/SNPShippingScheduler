import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { CustomerDB } from "../lib/customer-store.ts";
import { decideUrgentRequestInTransaction } from "../lib/urgent-decision.ts";
import { bookingSlotLabel, defaults, nextAvailableSlot } from "../lib/schedule.ts";

const now = new Date("2026-11-01T12:00:00Z");
const date = "2026-11-02";
async function fixture() {
  const pg = new PGlite();
  await pg.exec(await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8"));
  const db = {query: async (sql: string, params?: unknown[]) => {
    const result = await pg.query(sql, params);
    return {...result, rowCount: result.rows.length};
  }} as unknown as CustomerDB;
  async function request() {
    const customer = randomUUID(), id = randomUUID();
    await db.query("INSERT INTO customers(id,name,email,password_hash) VALUES($1,'Customer',$2,'hash')", [customer,`${customer}@example.com`]);
    await db.query("INSERT INTO urgent_requests(id,request_id,reference,customer_id,reason,preferred_date) VALUES($1,$2,$3,$4,'Please dispatch urgently',$5)", [id,randomUUID(),`URG-${id}`,customer,date]);
    return id;
  }
  async function decide(id: string, decision: "approve" | "reject" = "approve", chosenDate = date, adapter = db) {
    await pg.exec("BEGIN");
    try {
      const result = await decideUrgentRequestInTransaction(adapter,id,decision,chosenDate,now);
      await pg.exec("COMMIT");
      return result;
    } catch(e) {await pg.exec("ROLLBACK");throw e;}
  }
  async function fill() {
    for (const slot of defaults.slots) await db.query("INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone) VALUES($1,$2,$3,'Existing','existing@example.com',$4,$5,'Europe/London')", [randomUUID(),randomUUID(),randomUUID(),date,slot.id]);
  }
  return {pg,db,request,decide,fill};
}

test("admin urgent approvals add distinct extra places on a full date without expanding public capacity", async () => {
  const f = await fixture();try {
    await f.fill();
    const first = await f.request(), second = await f.request();
    const one = await f.decide(first), two = await f.decide(second);
    const bookings = (await f.db.query("SELECT id,slot,urgent,status FROM bookings WHERE urgent=true ORDER BY slot")).rows;
    assert.deepEqual(bookings.map(b=>({slot:b.slot,urgent:b.urgent,status:b.status})), [
      {slot:"urgent-1",urgent:true,status:"confirmed"}, {slot:"urgent-2",urgent:true,status:"confirmed"},
    ]);
    assert.equal(bookings[0].id,one.bookingId);assert.equal(bookings[1].id,two.bookingId);
    const requests = (await f.db.query("SELECT status,assigned_date,booking_id FROM urgent_requests ORDER BY booking_id")).rows;
    assert.ok(requests.every(r=>r.status==="approved" && r.assigned_date===date && r.booking_id));
    assert.equal((await f.db.query("SELECT * FROM notifications")).rows.length,4);
    const settings = (await f.db.query("SELECT value FROM settings WHERE id=1")).rows[0].value;
    assert.equal(settings.slots.length,3);
    assert.equal(nextAvailableSlot(settings,(await f.db.query("SELECT slot FROM bookings WHERE dispatch_date=$1 AND status<>'cancelled'",[date])).rows),undefined);
    await assert.rejects(f.decide(first),/already been decided/);
    assert.equal((await f.db.query("SELECT * FROM bookings")).rows.length,5);
    // Extra places can never be used by an ordinary booking, even via direct SQL.
    await assert.rejects(f.db.query("INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone) VALUES($1,$2,$3,'Regular','regular@example.com',$4,'urgent-3','Europe/London')",[randomUUID(),randomUUID(),randomUUID(),date]),/bookings_slot_check/);
    // Two urgent bookings cannot occupy the same extra place.
    await assert.rejects(f.db.query("INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,urgent) VALUES($1,$2,$3,'Urgent','urgent@example.com',$4,'urgent-1','Europe/London',true)",[randomUUID(),randomUUID(),randomUUID(),date]),/one_booking_per_slot/);
  } finally {await f.pg.close();}
});

test("urgent approval uses normal availability first and respects closed places", async () => {
  const f = await fixture();try {
    const first = await f.decide(await f.request());
    assert.equal((await f.db.query("SELECT slot FROM bookings WHERE id=$1",[first.bookingId])).rows[0].slot,"slot-1");
    for(const slot of ["slot-2","slot-3"])await f.db.query("INSERT INTO blocked_slots(dispatch_date,slot) VALUES($1,$2)",[date,slot]);
    const extra = await f.decide(await f.request());
    assert.equal((await f.db.query("SELECT slot FROM bookings WHERE id=$1",[extra.bookingId])).rows[0].slot,"urgent-1");
    assert.equal((await f.db.query("SELECT * FROM blocked_slots")).rows.length,2);
    await f.db.query("UPDATE bookings SET status='cancelled' WHERE id=$1",[extra.bookingId]);
    const replacement = await f.decide(await f.request());
    assert.equal((await f.db.query("SELECT slot FROM bookings WHERE id=$1",[replacement.bookingId])).rows[0].slot,"urgent-1");
  } finally {await f.pg.close();}
});

test("urgent rejection, invalid dates and failed approvals do not add overflow bookings", async () => {
  const f = await fixture();try {
    await f.fill();
    const rejected = await f.request();
    assert.equal((await f.decide(rejected,"reject")).bookingId,null);
    assert.equal((await f.db.query("SELECT status FROM urgent_requests WHERE id=$1",[rejected])).rows[0].status,"rejected");
    const pending = await f.request();
    await assert.rejects(f.decide(pending,"approve","2026-10-31"),/Choose a dispatch date/);
    const failing = {query: async (sql: string, params?: unknown[]) => {
      if (sql.startsWith("INSERT INTO notifications")) throw Error("Simulated notification outbox failure");
      return f.db.query(sql,params);
    }} as unknown as CustomerDB;
    await assert.rejects(f.decide(pending,"approve",date,failing),/outbox failure/);
    assert.equal((await f.db.query("SELECT status FROM urgent_requests WHERE id=$1",[pending])).rows[0].status,"pending");
    assert.equal((await f.db.query("SELECT * FROM bookings WHERE urgent=true")).rows.length,0);
    assert.equal((await f.db.query("SELECT * FROM notifications")).rows.length,0);
    assert.ok((await f.decide(pending)).bookingId);
  } finally {await f.pg.close();}
});

test("extra-place labels retain the full place number", () => {
  assert.equal(bookingSlotLabel("slot-3"),"Slot 3");
  assert.equal(bookingSlotLabel("urgent-12"),"Urgent extra place 12");
});
