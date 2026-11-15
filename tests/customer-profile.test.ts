import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { normalTikTokId, updateCustomerTikTok } from "../lib/customer-profile.ts";
import type { CustomerDB } from "../lib/customer-store.ts";

test("TikTok IDs are optional, normalized and validated", () => {
  for (const value of [null, undefined, "", "  "]) assert.equal(normalTikTokId(value), null);
  assert.equal(normalTikTokId(" @Shop.name_123 "), "Shop.name_123");
  for (const value of [123, {}, "@", "@@name", "name with spaces", "https://tiktok.com/@name", "x".repeat(101)]) assert.throws(() => normalTikTokId(value), /Enter a valid TikTok ID/);
});

test("profile updates persist only to the selected customer and can clear the ID", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8"));
    const db = {query: (sql: string, params?: unknown[]) => pg.query(sql, params)} as unknown as CustomerDB;
    const owner = randomUUID(), other = randomUUID();
    for (const id of [owner, other]) await db.query("INSERT INTO customers(id,name,email,password_hash) VALUES($1,'Customer',$2,'private')", [id,`${id}@example.com`]);
    const updated = await updateCustomerTikTok(db,owner," @my_shop ");
    assert.equal(updated.tiktok_id,"my_shop");
    assert.equal(updated.password_hash,undefined);
    assert.equal((await db.query("SELECT tiktok_id FROM customers WHERE id=$1",[other])).rows[0].tiktok_id,null);
    await assert.rejects(updateCustomerTikTok(db,owner,"invalid id"), /Enter a valid TikTok ID/);
    assert.equal((await db.query("SELECT tiktok_id FROM customers WHERE id=$1",[owner])).rows[0].tiktok_id,"my_shop");
    assert.equal((await updateCustomerTikTok(db,owner,"")).tiktok_id,null);
    assert.equal(await updateCustomerTikTok(db,randomUUID(),"absent"),undefined);
  } finally {await pg.close();}
});
