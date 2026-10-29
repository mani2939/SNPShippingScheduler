import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
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
 for(const itemCount of [undefined,null,"","0","-1","1.5","1000000","1e2",3]) assert.throws(()=>validateOrder({customerId:owner,date:"2026-10-28",total:"22.99",itemCount}));
 const first=await customerOrders(db,owner);assert.equal(first.orders.length,20);assert.equal(first.hasMore,true);assert.equal(first.orders[0].shipping_pence,400);assert.equal(first.orders[0].item_count,3);
 assert.equal((await customerOrders(db,owner,1)).orders.length,2);assert.equal((await customerOrders(db,other)).orders.length,1);
 await assert.rejects(()=>pg.query("UPDATE customer_orders SET shipping_pence=399"));
 await assert.rejects(()=>pg.query("UPDATE customer_orders SET item_count=0"));
 await pg.query("INSERT INTO customer_orders(id,customer_id,order_date,total_pence) VALUES($1,$2,'2026-01-01',400)",[randomUUID(),owner]);
 assert.equal((await customerOrders(db,owner,1)).orders.at(-1)?.item_count,null);
 await pg.query("DELETE FROM customers WHERE id=$1",[owner]);assert.equal((await customerOrders(db,owner)).orders.length,0);
 }finally{await pg.close();}
});
