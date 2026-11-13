import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { CustomerDB } from "../lib/customer-store.ts";
import { adminCustomerDetails } from "../lib/admin-customers.ts";
import { customerAddresses, saveCustomerAddress } from "../lib/addresses.ts";
import { createOrder, customerOrders } from "../lib/orders.ts";

async function fixture() {
  const pg = new PGlite();
  await pg.exec(await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8"));
  const db = {query: (sql: string, params?: unknown[]) => pg.query(sql, params)} as unknown as CustomerDB;
  const owner = randomUUID(), other = randomUUID();
  for (const id of [owner,other]) {
    await db.query("INSERT INTO customers(id,name,email,password_hash,email_verified) VALUES($1,'Account Name',$2,'secret-password-hash',true)",[id,`${id}@example.com`]);
  }
  async function save(customerId: string, input: Record<string, unknown>) {
    await pg.exec("BEGIN");
    try {
      const result = await saveCustomerAddress(db, customerId, input);
      await pg.exec("COMMIT");
      return result;
    } catch (error) {await pg.exec("ROLLBACK");throw error;}
  }
  return {pg,db,owner,other,save};
}

test("admin customer details report only the selected account and safe summary fields", async () => {
  const f = await fixture();
  try {
    for (const [index,customerId,email,status] of [
      [1,f.owner,"unrelated@example.com","confirmed"],
      [2,null,`${f.owner}@example.com`,"cancelled"],
      [3,f.other,`${f.owner}@example.com`,"confirmed"],
    ] as const) {
      await f.db.query(`INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone,status,customer_id)
        VALUES($1,$2,$3,'Customer',$4,'2026-11-16',$5,'Europe/London',$6,$7)`,
        [randomUUID(),randomUUID(),randomUUID(),email,`slot-${index}`,status,customerId]);
    }
    await createOrder(f.db,{customerId:f.owner,date:"2026-11-13",total:"12",itemCount:"2"});
    await createOrder(f.db,{customerId:f.other,date:"2026-11-13",total:"14",itemCount:"3"});
    const customer = await adminCustomerDetails(f.db,f.owner);
    assert.equal(customer?.name,"Account Name");
    assert.equal(customer?.booking_count,2);
    assert.equal(customer?.active_count,1);
    assert.equal(customer?.order_count,1);
    assert.deepEqual(Object.keys(customer!).sort(),[
      "active_count","booking_count","created_at","email","email_verified","id","name","order_count",
    ]);
    assert.equal(await adminCustomerDetails(f.db,randomUUID()),undefined);
    assert.equal(await adminCustomerDetails(f.db,"invalid-id"),undefined);
  } finally {await f.pg.close();}
});

test("admin address saves are visible in the customer's address book and snapshot onto new orders", async () => {
  const f = await fixture();
  try {
    const fields = {action:"add",line1:"1 Example Street",city:"Sheffield",postcode:"S6 3NF",country:"United Kingdom"};
    const first = await f.save(f.owner,{...fields,recipient:"Untrusted override"});
    assert.equal(first[0].address.recipient,"Account Name");
    assert.equal(first[0].is_default,true);
    await f.save(f.other,{...fields,line1:"Other customer's address"});
    const saved = await f.save(f.owner,{...fields,line1:"2 Example Street",makeDefault:true});
    assert.equal(saved.length,2);
    assert.equal(saved[0].is_default,true);
    assert.equal(saved[0].address.line1,"2 Example Street");
    assert.deepEqual(await customerAddresses(f.db,f.owner),saved);
    await assert.rejects(f.save(f.other,{action:"default",id:saved[0].id}),/Choose a saved address/);
    await createOrder(f.db,{customerId:f.owner,date:"2026-11-13",total:"12",itemCount:"2"});
    const order = (await customerOrders(f.db,f.owner)).orders[0];
    assert.equal(order.shipping_address?.line1,"2 Example Street");
    await f.save(f.owner,{action:"default",id:first[0].id});
    assert.equal((await customerOrders(f.db,f.owner)).orders[0].shipping_address?.line1,"2 Example Street");
    await assert.rejects(f.save(f.owner,{...fields,postcode:"not a postcode"}),/UK postcode/);
    assert.equal((await customerAddresses(f.db,f.owner)).length,2);
  } finally {await f.pg.close();}
});
