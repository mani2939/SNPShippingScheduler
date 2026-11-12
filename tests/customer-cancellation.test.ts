import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { CustomerDB } from "../lib/customer-store.ts";
import { cancelCustomerDispatch } from "../lib/customer-cancellation.ts";
import { customerHistory } from "../lib/customer-history.ts";
import { canCustomerCancelBooking } from "../lib/booking-status.ts";
import { defaults, nextAvailableSlot } from "../lib/schedule.ts";

async function fixture() {
  const pg = new PGlite();
  await pg.exec(await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8"));
  const db = {query: (sql: string, params?: unknown[]) => pg.query(sql, params)} as unknown as CustomerDB;
  async function customer() {
    const id = randomUUID();
    await db.query("INSERT INTO customers(id,name,email,password_hash) VALUES($1,'Customer',$2,'hash')", [id,`${id}@example.com`]);
    return id;
  }
  async function booking(owner: string | null, status = "confirmed", slot = "slot-1") {
    const id = randomUUID(), reference = `SNP-${id}`;
    await db.query(
      `INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,status,customer_id,urgent)
       VALUES($1,$2,$3,'Customer','customer@example.com','2026-11-16',$4,'Europe/London',$5,$6,$7)`,
      [id,randomUUID(),reference,slot,status,owner,slot.startsWith("urgent-")],
    );
    return {id,reference};
  }
  async function urgent(owner: string) {
    const id = randomUUID(), reference = `URG-${id}`;
    await db.query("INSERT INTO urgent_requests(id,request_id,reference,customer_id,reason) VALUES($1,$2,$3,$4,'Please dispatch my parcel urgently')",
      [id,randomUUID(),reference,owner]);
    return {id,reference};
  }
  async function cancel(owner: string, kind: "booking" | "urgent", reference: unknown, adapter = db) {
    await pg.exec("BEGIN");
    try {
      const result = await cancelCustomerDispatch(adapter,owner,kind,reference);
      await pg.exec("COMMIT");
      return result.outcome;
    } catch (error) {await pg.exec("ROLLBACK");throw error;}
  }
  return {pg,db,customer,booking,urgent,cancel};
}

test("customers cancel only their own confirmed dispatch, releasing the place and allowing another booking", async () => {
  const f = await fixture();
  try {
    const owner = await f.customer(), other = await f.customer();
    const requested = await f.booking(owner);
    assert.equal(await f.cancel(other,"booking",requested.reference),"not_found");
    assert.equal((await customerHistory(f.db,owner)).bookings[0].status,"confirmed");
    assert.equal(await f.cancel(owner,"booking",requested.reference),"cancelled");
    assert.equal(await f.cancel(owner,"booking",requested.reference),"cancelled","repeated cancellation is safe");
    assert.equal((await customerHistory(f.db,owner)).bookings[0].status,"cancelled");
    const occupied = (await f.db.query("SELECT slot FROM bookings WHERE dispatch_date='2026-11-16' AND status<>'cancelled'")).rows;
    assert.equal(nextAvailableSlot(defaults,occupied),"slot-1");
    const replacement = await f.booking(owner);
    // A retry for the old booking must preserve a newer booking.
    assert.equal(await f.cancel(owner,"booking",requested.reference),"cancelled");
    assert.equal((await f.db.query("SELECT status FROM bookings WHERE id=$1",[replacement.id])).rows[0].status,"confirmed");
  } finally {await f.pg.close();}
});

test("packing, shipped, completed and previously dispatched bookings cannot be cancelled by customers", async () => {
  const f = await fixture();
  try {
    for (const [index,status] of ["being_packed","shipped","completed"].entries()) {
      const owner = await f.customer();
      const requested = await f.booking(owner,status,`slot-${index+1}`);
      assert.equal(await f.cancel(owner,"booking",requested.reference),"packing_started");
      assert.equal((await f.db.query("SELECT status FROM bookings WHERE id=$1",[requested.id])).rows[0].status,status);
    }
    const owner = await f.customer();
    const requested = await f.booking(owner,"confirmed","urgent-1");
    await f.db.query("UPDATE bookings SET dispatched_at=now() WHERE id=$1",[requested.id]);
    assert.equal(await f.cancel(owner,"booking",requested.reference),"packing_started");
    assert.equal(canCustomerCancelBooking({status:"confirmed",dispatched_at:null}),true);
    assert.equal(canCustomerCancelBooking({status:"confirmed",dispatched_at:"2026-11-12"}),false);
  } finally {await f.pg.close();}
});

test("withdrawing a pending urgent request releases the account and does not affect another customer's request", async () => {
  const f = await fixture();
  try {
    const owner = await f.customer(), other = await f.customer();
    const pending = await f.urgent(owner);
    assert.equal(await f.cancel(other,"urgent",pending.reference),"not_found");
    assert.equal(await f.cancel(owner,"urgent",pending.reference),"cancelled");
    assert.equal(await f.cancel(owner,"urgent",pending.reference),"cancelled");
    assert.equal((await f.db.query("SELECT status FROM urgent_requests WHERE id=$1",[pending.id])).rows[0].status,"cancelled");
    const replacement = await f.urgent(owner);
    assert.ok(replacement.id);
    assert.equal(await f.cancel(owner,"urgent",pending.reference),"cancelled");
    assert.equal((await f.db.query("SELECT status FROM urgent_requests WHERE id=$1",[replacement.id])).rows[0].status,"pending");
  } finally {await f.pg.close();}
});

test("cancelling an approved urgent booking updates both records and releases only its urgent extra place", async () => {
  const f = await fixture();
  try {
    const owner = await f.customer();
    for (const slot of ["slot-1","slot-2","slot-3"]) await f.booking(null,"confirmed",slot);
    const urgent = await f.urgent(owner);
    await f.db.query("UPDATE urgent_requests SET status='approved' WHERE id=$1",[urgent.id]);
    const requested = await f.booking(owner,"confirmed","urgent-1");
    await f.db.query("UPDATE urgent_requests SET booking_id=$2 WHERE id=$1",[urgent.id,requested.id]);
    assert.equal(await f.cancel(owner,"urgent",urgent.reference),"already_decided");
    assert.equal(await f.cancel(owner,"booking",requested.reference),"cancelled");
    assert.equal((await f.db.query("SELECT status FROM urgent_requests WHERE id=$1",[urgent.id])).rows[0].status,"cancelled");
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM bookings WHERE status='confirmed'")).rows[0].n,3);
    assert.equal(nextAvailableSlot(defaults,(await f.db.query("SELECT slot FROM bookings WHERE status<>'cancelled'")).rows),undefined);
    await f.booking(owner,"confirmed","urgent-1");
  } finally {await f.pg.close();}
});

test("a partially failed cancellation rolls back and legacy unowned bookings remain inaccessible", async () => {
  const f = await fixture();
  try {
    const owner = await f.customer();
    const requested = await f.booking(owner);
    const failure = {query: (sql: string, params?: unknown[]) => {
      if (sql.startsWith("UPDATE urgent_requests")) throw Error("Simulated database error");
      return f.db.query(sql,params);
    }} as unknown as CustomerDB;
    await assert.rejects(f.cancel(owner,"booking",requested.reference,failure),/Simulated/);
    assert.equal((await f.db.query("SELECT status FROM bookings WHERE id=$1",[requested.id])).rows[0].status,"confirmed");
    const legacy = await f.booking(null,"confirmed","slot-2");
    assert.equal(await f.cancel(owner,"booking",legacy.reference),"not_found");
    for (const reference of [null,"",{},123]) {
      await assert.rejects(f.cancel(owner,"booking",reference),/valid dispatch request/);
    }
  } finally {await f.pg.close();}
});
