import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { saveCustomerAddress } from "../lib/addresses.ts";
import { createOrder, customerOrders, validateOrder } from "../lib/orders.ts";
import type { CustomerDB } from "../lib/customer-store.ts";
test("orders validate pennies, enforce shipping, isolate ownership and cascade deletion",async()=>{
 const pg=new PGlite();
 try {
 await pg.exec(await readFile(new URL("../lib/schema.sql",import.meta.url),"utf8"));
 const db={query:(sql:string,params?:unknown[])=>pg.query(sql,params)} as unknown as CustomerDB;
 const owner=randomUUID(),other=randomUUID();
 for(const id of [owner,other]) await pg.query("INSERT INTO customers(id,name,email,password_hash) VALUES($1,'Customer',$2,'hash')",[id,`${id}@example.com`]);
 assert.equal(validateOrder({customerId:owner,date:"2026-10-28",total:"22.99",itemCount:"3"}).total,2299);
 for(const total of ["3.99","-4","4.001","NaN",4]) assert.throws(()=>validateOrder({customerId:owner,date:"2026-10-28",total,itemCount:"1"}));
 assert.throws(()=>validateOrder({customerId:owner,date:"2026-02-30",total:"4",itemCount:"1"}));
 for(let i=0;i<22;i++) await createOrder(db,{customerId:owner,date:"2026-10-28",total:"22.99",itemCount:"3"});
 await createOrder(db,{customerId:other,date:"2026-10-29",total:"4",itemCount:"1"});
 const address = { action: "add", recipient: "Customer", line1: "1 Example Street", city: "Sheffield", postcode: "s12hh", country: "United Kingdom" };
 const [original] = await saveCustomerAddress(db, owner, address);
 assert.equal(original.is_default, true);
 assert.equal(original.address.postcode, "S1 2HH");
 await assert.rejects(saveCustomerAddress(db, owner, { ...address, postcode: "90210" }), /UK postcode/);
 const orderInput = { customerId: owner, date: "2026-10-29", total: "4", itemCount: "1" };
 await createOrder(db, orderInput);
 const saved = await saveCustomerAddress(db, owner, { ...address, line1: "2 Example Street" });
 assert.equal(saved[0].id, original.id);
 await assert.rejects(saveCustomerAddress(db, other, { action: "default", id: saved[1].id }), /Choose a saved address/);
 await saveCustomerAddress(db, owner, { action: "default", id: saved[1].id });
 await createOrder(db, orderInput);
 const snapshots = (await customerOrders(db, owner)).orders.slice(0, 2);
 assert.deepEqual(snapshots.map(order => order.shipping_address?.line1), ["2 Example Street", "1 Example Street"]);
 await pg.query("DELETE FROM customer_orders WHERE customer_id=$1 AND order_date='2026-10-29'", [owner]);

 for(const itemCount of [undefined,null,"","0","-1","1.5","1000000","1e2",3]) assert.throws(()=>validateOrder({customerId:owner,date:"2026-10-28",total:"22.99",itemCount}));
 const first=await customerOrders(db,owner);assert.equal(first.orders.length,20);assert.equal(first.hasMore,true);assert.equal(first.orders[0].shipping_pence,400);assert.equal(first.orders[0].item_count,3);
 assert.equal((await customerOrders(db,owner,1)).orders.length,2);assert.equal((await customerOrders(db,other)).orders.length,1);
 await assert.rejects(()=>pg.query("UPDATE customer_orders SET shipping_pence=399"));
 await assert.rejects(()=>pg.query("UPDATE customer_orders SET item_count=0"));
 await pg.query("INSERT INTO customer_orders(id,customer_id,order_date,total_pence) VALUES($1,$2,'2026-01-01',400)",[randomUUID(),owner]);
 assert.equal((await customerOrders(db,owner,1)).orders.at(-1)?.item_count,null);
 await pg.query("DELETE FROM customers WHERE id=$1",[owner]);assert.equal((await customerOrders(db,owner)).orders.length,0);
 assert.equal((await pg.query("SELECT id FROM customer_addresses WHERE customer_id=$1", [owner])).rows.length,0);
 }finally{await pg.close();}
});
