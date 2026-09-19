import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  hashPassword,
  checkPassword,
  normalEmail,
  validPassword,
  tokenHash,
} from "../lib/customer-password.ts";
import {
  registerCustomer,
  issueCustomerToken,
  consumeCustomerToken,
  createCustomerSession,
  customerFromSession,
  type CustomerDB,
} from "../lib/customer-store.ts";
test("customer passwords and input validation", async () => {
  const hash = await hashPassword("a unique passphrase");
  assert.notEqual(hash, "a unique passphrase");
  assert.equal(await checkPassword("a unique passphrase", hash), true);
  assert.equal(await checkPassword("wrong passphrase", hash), false);
  assert.equal(validPassword("short"), false);
  assert.equal(validPassword("x".repeat(129)), false);
  assert.equal(normalEmail("  TEST@example.com "), "test@example.com");
  assert.throws(() => normalEmail("not-an-email"));
});
test("customer verification, reset, token expiry and session invalidation", async () => {
  const pg = new PGlite();
  const db = {
    query: async (text: string, params?: unknown[]) => {
      const result = await pg.query(text, params);
      return { ...result, rowCount: result.affectedRows };
    },
  } as unknown as CustomerDB;
  try {
    await pg.exec(
      await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8"),
    );
    await pg.exec(
      await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8"),
    ); // repeatable migration
    const originalHash = await hashPassword("initial customer password");
    const c = await registerCustomer(db, {
      name: "Test Customer",
      email: "customer@example.com",
      passwordHash: originalHash,
    });
    const duplicate = await registerCustomer(db, {
      name: "An Attacker",
      email: "customer@example.com",
      passwordHash: "invalid",
    });
    assert.equal(c.id, duplicate.id);
    assert.equal(duplicate.name, "Test Customer");
    assert.equal(
      (
        await db.query("SELECT password_hash FROM customers WHERE id=$1", [
          c.id,
        ])
      ).rows[0].password_hash,
      originalHash,
    );
    const unverifiedSession = await createCustomerSession(db, c.id);
    assert.equal(await customerFromSession(db, unverifiedSession), null);
    const verify = await issueCustomerToken(db, c.id, "verify");
    assert.equal(
      (await db.query("SELECT token_hash FROM customer_tokens")).rows[0]
        .token_hash,
      tokenHash(verify),
    );
    assert.equal(
      await consumeCustomerToken(db, verify, "reset", "invalid"),
      false,
    );
    assert.equal(await consumeCustomerToken(db, verify, "verify"), true);
    assert.equal(await consumeCustomerToken(db, verify, "verify"), false);
    assert.equal(await customerFromSession(db, unverifiedSession), null);
    const session = await createCustomerSession(db, c.id);
    assert.equal(
      (await customerFromSession(db, session))?.email,
      "customer@example.com",
    );
    assert.equal(await customerFromSession(db, "forged"), null);
    const replaced = await issueCustomerToken(db, c.id, "reset");
    const reset = await issueCustomerToken(db, c.id, "reset");
    assert.equal(
      await consumeCustomerToken(db, replaced, "reset", "invalid"),
      false,
    );
    const newHash = await hashPassword("a different customer password");
    assert.equal(await consumeCustomerToken(db, reset, "reset", newHash), true);
    assert.equal(
      await consumeCustomerToken(db, reset, "reset", newHash),
      false,
    );
    assert.equal(await customerFromSession(db, session), null);
    assert.equal(
      await checkPassword(
        "initial customer password",
        (
          await db.query("SELECT password_hash FROM customers WHERE id=$1", [
            c.id,
          ])
        ).rows[0].password_hash,
      ),
      false,
    );
    const expired = await issueCustomerToken(db, c.id, "reset");
    await db.query(
      "UPDATE customer_tokens SET expires_at=now()-interval '1 minute'",
    );
    assert.equal(
      await consumeCustomerToken(db, expired, "reset", newHash),
      false,
    );
    const expiredSession = await createCustomerSession(db, c.id);
    await db.query(
      "UPDATE customer_sessions SET expires_at=now()-interval '1 minute'",
    );
    assert.equal(await customerFromSession(db, expiredSession), null);
  } finally {
    await pg.close();
  }
});
