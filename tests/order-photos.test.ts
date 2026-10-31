import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { addOrderPhoto, canViewOrder, orderPhotos, readOrderPhoto, photoType, boundedFormData, maxPhotoBytes } from "../lib/order-photos.ts";
import type { PhotoBlobStorage } from "../lib/photo-blob.ts";
import type { CustomerDB } from "../lib/customer-store.ts";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5N8AAAAASUVORK5CYII=","base64");
test("photo validation rejects non-images and oversized uploads",async()=>{
 assert.equal(photoType(png),"image/png");
 assert.throws(()=>photoType(Buffer.from('<svg onload="alert(1)">')));
 assert.throws(()=>photoType(Buffer.alloc(maxPhotoBytes+1)));
 const request=new Request("http://localhost",{method:"POST",body:"small",headers:{"Content-Length":String(maxPhotoBytes+65537)}});
 await assert.rejects(()=>boundedFormData(request));
 const body=new FormData();body.append("photo",new File([png],"photo.png"));
 const form=await boundedFormData(new Request("http://localhost",{method:"POST",body}));
 assert.equal((form.get("photo") as File).name,"photo.png");
});
test("packaging photos are scoped per customer and order, limited, and erased with account",async()=>{
 const pg=new PGlite();
 try{
 await pg.exec(await readFile(new URL("../lib/schema.sql",import.meta.url),"utf8"));
 const db={query:(sql:string,params?:unknown[])=>pg.query(sql,params)} as unknown as CustomerDB;
 const blobs=new Map<string,Uint8Array>();
 const storage:PhotoBlobStorage={
   async upload(path,bytes){blobs.set(path,bytes);},
   async read(path){const bytes=blobs.get(path);return bytes?new Response(new Uint8Array(bytes)).body:null;},
   async remove(paths){for(const path of paths)blobs.delete(path);},
 };
 const transact=async <T>(fn:(tx:CustomerDB)=>Promise<T>)=>{
   await pg.exec("BEGIN");try{const result=await fn(db);await pg.exec("COMMIT");return result;}
   catch(e){await pg.exec("ROLLBACK");throw e;}
 };
 const owner=randomUUID(),other=randomUUID(),order=randomUUID(),second=randomUUID();
 for(const id of [owner,other])await pg.query("INSERT INTO customers(id,name,email,password_hash) VALUES($1,'Customer',$2,'hash')",[id,`${id}@example.com`]);
 for(const [id,customer] of [[order,owner],[second,other]])await pg.query("INSERT INTO customer_orders(id,customer_id,order_date,total_pence) VALUES($1,$2,'2026-10-29',2200)",[id,customer]);
 await addOrderPhoto(db,transact,order,"packaging.png",png,storage);
 assert.equal(await canViewOrder(db,order,owner),true);assert.equal(await canViewOrder(db,order,other),false);
 const photos=await orderPhotos(db,order,owner);assert.equal(photos.length,1);assert.equal((await orderPhotos(db,order,other)).length,0);
 assert.equal((await orderPhotos(db,order,null)).length,1);
 assert.deepEqual(Object.keys(photos[0]).sort(),["content_type","id","name"]);
 const photo=await readOrderPhoto(db,order,photos[0].id,owner,storage);assert.equal(photo?.content_type,"image/png");assert.deepEqual(Buffer.from(await new Response(photo!.stream).arrayBuffer()),png);
 assert.equal(await readOrderPhoto(db,order,photos[0].id,other,storage),undefined);
 const stored=(await pg.query("SELECT image,blob_pathname FROM order_photos")).rows[0] as {image:null;blob_pathname:string};
 assert.equal(stored.image,null);assert.ok(blobs.has(stored.blob_pathname));
 assert.equal(await readOrderPhoto(db,second,photos[0].id,null,storage),undefined);
 for(let i=1;i<12;i++)await addOrderPhoto(db,transact,order,"packaging.png",png,storage);
 await assert.rejects(()=>addOrderPhoto(db,transact,order,"extra.png",png,storage),/12 photos/);
 await pg.query("DELETE FROM customers WHERE id=$1",[owner]);
 assert.equal((await pg.query("SELECT * FROM order_photos")).rows.length,0);
 }finally{await pg.close();}
});
