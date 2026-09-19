import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { databaseURL } from "../lib/database-url.mjs";

test("legacy SSL modes keep certificate validation without changing connection details", async () => {
  for (const mode of ["prefer", "require", "verify-ca"]) {
    const original = `postgresql://user:p%40ss@db.example.com/app?sslmode=${mode}&channel_binding=require`;
    const normalized = databaseURL(original);
    assert.equal(normalized, "postgresql://user:p%40ss@db.example.com/app?sslmode=verify-full&channel_binding=require");
    const pool = new Pool({ connectionString: normalized });
    const connection = new pool.Client(pool.options);
    assert.notEqual(connection.connectionParameters.ssl, false);
    assert.notEqual(connection.connectionParameters.ssl.rejectUnauthorized, false);
    assert.equal(connection.connectionParameters.password, "p@ss");
    await pool.end();
  }
  for (const suffix of ["", "?sslmode=disable", "?sslmode=verify-full"]) {
    const url = `postgresql://localhost/app${suffix}`;
    assert.equal(databaseURL(url), url);
  }
  assert.equal(databaseURL("postgresql://localhost/app?application_name=snp&sslmode=require"), "postgresql://localhost/app?application_name=snp&sslmode=verify-full");
});
