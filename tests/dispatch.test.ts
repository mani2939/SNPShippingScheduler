import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { updateBookingStatus, saveTracking } from "../lib/dispatch.ts";
import { trackingURL } from "../lib/tracking.ts";
import { customerHistory } from "../lib/customer-history.ts";
import type { CustomerDB } from "../lib/customer-store.ts";

test("booking workflow blocks repeat active requests, requires tracking, and releases on completion", async () => {
 const pg=new PGlite();
 try {
  await pg.exec(await readFile(new URL("../lib/schema.sql",import.meta.url),"utf8"));
  const db={query:async(sql:string,params?:unknown[])=>{const r=await pg.query(sql,params);return {...r,rowCount:r.affectedRows};}} as unknown as CustomerDB;
  const owner=randomUUID(),other=randomUUID();
  for(const id of [owner,other]) await pg.query("INSERT INTO customers(id,name,email,password_hash) VALUES($1,'Owner',$2,'hash')",[id,`${id}@example.com`]);
  async function book(customer=owner,date="2026-09-21",slot="slot-1") {
   const id=randomUUID();
   await pg.query(`INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,customer_id) VALUES($1,$2,$3,'Owner','owner@example.com',$4,$5,'Europe/London',$6)`,[id,randomUUID(),id,date,slot,customer]);
   return id;
  }
  const id=await book();
  assert.equal((await customerHistory(db,owner)).bookings[0].status,"confirmed");
  await assert.rejects(book(owner,"2026-09-23"),/active booking/);
  await updateBookingStatus(db,id,"being_packed");
  await assert.rejects(book(owner,"2026-09-23"),/active booking/);
  await assert.rejects(updateBookingStatus(db,id,"completed"),/Invalid status change/);
  await assert.rejects(updateBookingStatus(db,id,"shipped"),/Invalid status change/);
  await assert.rejects(saveTracking(db,id,"https://evil.example"),/Enter a Royal Mail/);
  await saveTracking(db,id,"ab 123456789 gb");
  assert.equal((await customerHistory(db,owner)).bookings[0].status,"being_packed");
  await updateBookingStatus(db,id,"shipped");
  const shipped=(await customerHistory(db,owner)).bookings[0];
  assert.equal(shipped.status,"completed");
  assert.equal(shipped.royal_mail_tracking,"AB123456789GB");
  assert.ok(shipped.dispatched_at);
  const next=await book(owner,"2026-09-23");
  assert.deepEqual((await customerHistory(db,other)).bookings,[]);
  await book(other,"2026-09-23","slot-2");
  await saveTracking(db,id,"CD123456789GB");
  assert.deepEqual((await customerHistory(db,owner)).bookings.find(b=>b.reference===id)?.dispatched_at,shipped.dispatched_at);
  await assert.rejects(updateBookingStatus(db,id,"completed"),/Invalid status change/);
  await assert.rejects(updateBookingStatus(db,next,"completed"),/Invalid status change/);
  await assert.rejects(updateBookingStatus(db,id,"confirmed"),/Invalid status change/);
  // Database guard prevents reactivation even outside the admin API.
  await assert.rejects(pg.query("UPDATE bookings SET status='confirmed' WHERE id=$1",[id]),/active booking/);
  await updateBookingStatus(db,next,"cancelled");
  await assert.rejects(saveTracking(db,next,"AB123456789GB"),/cancelled/);
  const direct=await book(owner,"2026-09-28");
  await updateBookingStatus(db,direct,"completed","EF123456789GB");
  assert.equal((await customerHistory(db,owner)).bookings[0].status,"completed");
  assert.equal(trackingURL("AB123456789GB"),"https://www.royalmail.com/portal/rm/track?trackNumber=AB123456789GB");
 } finally {await pg.close();}
});

test("workflow migration preserves historical duplicate active bookings and tracking", async () => {
 const pg=new PGlite();
 try {
  for(const name of ["0001_initial.sql","0002_customer_history.sql","0003_royal_mail_tracking.sql"]) await pg.exec(await readFile(new URL(`../migrations/${name}`,import.meta.url),"utf8"));
  const owner=randomUUID();
  await pg.query("INSERT INTO customers(id,name,email,password_hash) VALUES($1,'Owner','owner@example.com','hash')",[owner]);
  for(const [slot,status] of [["slot-1","confirmed"],["slot-2","dispatched"]]) await pg.query(`INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,customer_id,status,royal_mail_tracking) VALUES($1,$2,$3,'Owner','owner@example.com','2026-09-21',$3,'Europe/London',$4,$5,'AB123456789GB')`,[randomUUID(),randomUUID(),slot,owner,status]);
  await pg.exec(await readFile(new URL("../migrations/0004_booking_workflow.sql",import.meta.url),"utf8"));
  const rows=(await pg.query<{status:string,royal_mail_tracking:string}>("SELECT status,royal_mail_tracking FROM bookings ORDER BY slot")).rows;
  assert.deepEqual(rows.map(r=>r.status),["confirmed","shipped"]);
  assert.ok(rows.every(r=>r.royal_mail_tracking==="AB123456789GB"));
  await pg.query("UPDATE bookings SET status='being_packed' WHERE slot='slot-1'");
  await pg.query("UPDATE bookings SET status='completed' WHERE slot='slot-2'");
  await assert.rejects(pg.query(`INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,customer_id) VALUES($1,$2,'NEW','Owner','owner@example.com','2026-09-23','slot-1','Europe/London',$3)`,[randomUUID(),randomUUID(),owner]),/active booking/);
 } finally {await pg.close();}
});
