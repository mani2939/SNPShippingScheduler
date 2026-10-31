import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { CustomerDB } from "../lib/customer-store.ts";
import type { PhotoBlobStorage } from "../lib/photo-blob.ts";
import { addOrderPhoto, orderPhotos, readOrderPhoto } from "../lib/order-photos.ts";
import { authorizedPhotoCleanup, cleanupOrderPhotos, migrateLegacyOrderPhotos, purgeQueuedPhotoBlobs } from "../lib/photo-retention.ts";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5N8AAAAASUVORK5CYII=","base64");
async function fixture() {
  const pg=new PGlite();
  await pg.exec(await readFile(new URL("../lib/schema.sql",import.meta.url),"utf8"));
  const db={query:(sql:string,params?:unknown[])=>pg.query(sql,params)} as unknown as CustomerDB;
  const owner=randomUUID(),order=randomUUID();
  await db.query("INSERT INTO customers(id,name,email,password_hash) VALUES($1,'Customer','test@example.com','hash')",[owner]);
  await db.query("INSERT INTO customer_orders(id,customer_id,order_date,total_pence) VALUES($1,$2,'2026-10-29',2200)",[order,owner]);
  const blobs=new Map<string,Uint8Array>();
  const state={failUpload:false,failRemove:false,reads:0,uploads:0};
  const storage:PhotoBlobStorage={
    async upload(path,bytes){state.uploads++;blobs.set(path,bytes);if(state.failUpload)throw Error("Lost upload acknowledgement");},
    async read(path){state.reads++;const bytes=blobs.get(path);return bytes?new Response(new Uint8Array(bytes)).body:null;},
    async remove(paths){if(state.failRemove&&paths.length)throw Error("Blob temporarily unavailable");for(const path of paths)blobs.delete(path);},
  };
  const transact=async <T>(fn:(tx:CustomerDB)=>Promise<T>)=>{
    await pg.exec("BEGIN");try{const result=await fn(db);await pg.exec("COMMIT");return result;}
    catch(e){await pg.exec("ROLLBACK");throw e;}
  };
  return {pg,db,owner,order,blobs,storage,state,transact};
}

test("photo cron authentication fails closed and accepts only the exact Bearer secret",()=>{
  assert.equal(authorizedPhotoCleanup(null,undefined),false);
  assert.equal(authorizedPhotoCleanup("Bearer undefined",undefined),false);
  assert.equal(authorizedPhotoCleanup("Bearer ",""),false);
  assert.equal(authorizedPhotoCleanup("Bearer wrong","secret"),false);
  assert.equal(authorizedPhotoCleanup("secret","secret"),false);
  assert.equal(authorizedPhotoCleanup("Bearer secret","secret"),true);
});

test("30-day cutoff protects listing and Blob reads even before scheduled physical cleanup",async()=>{
  const f=await fixture();try {
    await addOrderPhoto(f.db,f.transact,f.order,"package.png",png,f.storage);
    const photo=(await orderPhotos(f.db,f.order,f.owner))[0];
    assert.equal((await f.db.query("SELECT * FROM photo_blob_deletions")).rows.length,0);
    assert.ok(await readOrderPhoto(f.db,f.order,photo.id,f.owner,f.storage));
    await f.db.query("UPDATE order_photos SET created_at=now()-interval '30 days' WHERE id=$1",[photo.id]);
    assert.equal((await orderPhotos(f.db,f.order,f.owner)).length,0);
    const before=f.state.reads;
    assert.equal(await readOrderPhoto(f.db,f.order,photo.id,f.owner,f.storage),undefined);
    assert.equal(await readOrderPhoto(f.db,f.order,photo.id,null,f.storage),undefined);
    assert.equal(f.state.reads,before,"expired photos must not even request Blob bytes");
    assert.equal(f.blobs.size,1);
    assert.deepEqual(await cleanupOrderPhotos(f.db,f.storage),{expired:1,deleted:1});
    assert.equal(f.blobs.size,0);
    assert.deepEqual(await cleanupOrderPhotos(f.db,f.storage),{expired:0,deleted:0});
  }finally{await f.pg.close();}
});

test("failed physical deletion remains queued and succeeds on retry; active photos survive",async()=>{
  const f=await fixture();try {
    for(let i=0;i<2;i++)await addOrderPhoto(f.db,f.transact,f.order,"package.png",png,f.storage);
    const photos=await orderPhotos(f.db,f.order,f.owner);
    await f.db.query("UPDATE order_photos SET created_at=now()-interval '31 days' WHERE id=$1",[photos[0].id]);
    f.state.failRemove=true;
    await assert.rejects(()=>cleanupOrderPhotos(f.db,f.storage),/unavailable/);
    assert.equal((await orderPhotos(f.db,f.order,f.owner)).length,1);
    assert.equal((await f.db.query("SELECT * FROM photo_blob_deletions")).rows.length,1);
    f.state.failRemove=false;
    assert.equal((await cleanupOrderPhotos(f.db,f.storage)).deleted,1);
    assert.equal(f.blobs.size,1);
    assert.ok(await readOrderPhoto(f.db,f.order,photos[1].id,f.owner,f.storage));
    await f.db.query("DELETE FROM customers WHERE id=$1",[f.owner]);
    assert.equal((await f.db.query("SELECT * FROM photo_blob_deletions")).rows.length,1,"cascade must retain the Blob deletion intent");
    assert.equal(await purgeQueuedPhotoBlobs(f.db,f.storage),1);
    assert.equal(f.blobs.size,0);
  }finally{await f.pg.close();}
});

test("upload acknowledgement and transaction failures leave recoverable orphans, with a grace period",async()=>{
  const f=await fixture();try {
    f.state.failUpload=true;
    await assert.rejects(()=>addOrderPhoto(f.db,f.transact,f.order,"package.png",png,f.storage),/acknowledgement/);
    assert.equal((await orderPhotos(f.db,f.order,f.owner)).length,0);
    assert.equal(await purgeQueuedPhotoBlobs(f.db,f.storage),0,"do not race an upload still in flight");
    f.state.failUpload=false;
    const rollback=async <T>(fn:(tx:CustomerDB)=>Promise<T>)=>f.transact(async tx=>{await fn(tx);throw Error("Commit failed");});
    await assert.rejects(()=>addOrderPhoto(f.db,rollback,f.order,"package.png",png,f.storage),/Commit failed/);
    assert.equal((await orderPhotos(f.db,f.order,f.owner)).length,0);
    assert.equal((await f.db.query("SELECT * FROM photo_blob_deletions")).rows.length,2);
    await f.db.query("UPDATE photo_blob_deletions SET not_before=now()-interval '1 second'");
    assert.equal(await purgeQueuedPhotoBlobs(f.db,f.storage),2);
    assert.equal(f.blobs.size,0);
  }finally{await f.pg.close();}
});

test("legacy photos migrate on read without extending retention; expired bytes are never uploaded",async()=>{
  const f=await fixture();try {
    const fresh=randomUUID(),expired=randomUUID();
    for(const [id,age] of [[fresh,29],[expired,31]] as const)await f.db.query(
      "INSERT INTO order_photos(id,order_id,name,content_type,image,created_at) VALUES($1,$2,'legacy','image/png',$3,now()-$4*interval '1 day')",
      [id,f.order,png,age]);
    const created=(await f.db.query("SELECT created_at FROM order_photos WHERE id=$1",[fresh])).rows[0].created_at;
    assert.equal(await readOrderPhoto(f.db,f.order,fresh,randomUUID(),f.storage),undefined);
    assert.equal(f.state.uploads,0,"foreign customers cannot trigger a migration or Blob access");
    const photo=await readOrderPhoto(f.db,f.order,fresh,f.owner,f.storage);
    assert.deepEqual(Buffer.from(await new Response(photo!.stream).arrayBuffer()),png);
    const migrated=(await f.db.query("SELECT image,blob_pathname,created_at FROM order_photos WHERE id=$1",[fresh])).rows[0];
    assert.equal(migrated.image,null);assert.ok(migrated.blob_pathname);assert.deepEqual(migrated.created_at,created);
    await cleanupOrderPhotos(f.db,f.storage);
    assert.equal(f.state.uploads,1);
    assert.equal(await readOrderPhoto(f.db,f.order,expired,f.owner,f.storage),undefined);
    assert.equal(await migrateLegacyOrderPhotos(f.db,f.storage),0);
  }finally{await f.pg.close();}
});

test("failed legacy migration preserves original bytes and maintenance backfills successfully",async()=>{
  const f=await fixture();try {
    const id=randomUUID();
    await f.db.query("INSERT INTO order_photos(id,order_id,name,content_type,image) VALUES($1,$2,'legacy','image/png',$3)",[id,f.order,png]);
    f.state.failUpload=true;
    await assert.rejects(()=>readOrderPhoto(f.db,f.order,id,f.owner,f.storage),/acknowledgement/);
    assert.ok((await f.db.query("SELECT image FROM order_photos WHERE id=$1",[id])).rows[0].image);
    f.state.failUpload=false;
    assert.equal(await migrateLegacyOrderPhotos(f.db,f.storage),1);
    assert.equal((await f.db.query("SELECT image FROM order_photos WHERE id=$1",[id])).rows[0].image,null);
    const path=(await f.db.query("SELECT blob_pathname FROM order_photos WHERE id=$1",[id])).rows[0].blob_pathname;
    await f.db.query("INSERT INTO photo_blob_deletions(pathname,not_before) VALUES($1,now())",[path]);
    await f.db.query("UPDATE photo_blob_deletions SET not_before=now()-interval '1 second'");
    assert.equal(await purgeQueuedPhotoBlobs(f.db,f.storage),1,"remove only the orphan from the failed migration");
    assert.ok(f.blobs.has(path),"referenced photos are protected even if an intent remains queued");
  }finally{await f.pg.close();}
});
