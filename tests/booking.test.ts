import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  defaults,
  dispatchDates,
  eligible,
  today,
  validateSettings,
  validateBooking,
  validDate,
  nextAvailableSlot,
} from "../lib/schedule.ts";
const now = new Date("2026-09-17T10:00:00Z");
test("schedule exposes only future Mon/Wed/Fri, with a bounded horizon", () => {
  const dates = dispatchDates(defaults, now);
  assert.equal(dates.length, 18);
  assert.equal(dates[0], "2026-09-18");
  assert.ok(
    dates.every((d) =>
      [1, 3, 5].includes(new Date(d + "T12:00:00Z").getUTCDay()),
    ),
  );
  assert.ok(dates.every((d) => d <= "2026-10-29"));
});
test("same-day and invalid weekdays cannot be booked", () => {
  assert.equal(
    eligible("2026-09-18", defaults, new Date("2026-09-18T00:00:00Z")),
    false,
  );
  assert.equal(eligible("2026-09-19", defaults, now), false);
  assert.equal(eligible("2026-11-02", defaults, now), false);
  assert.equal(validDate("2026-02-30"), false);
});
test("UK timezone handles daylight saving and date rollover", () => {
  assert.equal(
    today("Europe/London", new Date("2026-06-01T23:30:00Z")),
    "2026-06-02",
  );
  assert.equal(
    today("Europe/London", new Date("2026-12-01T23:30:00Z")),
    "2026-12-01",
  );
});
test("settings always preserve exactly three slots of capacity one", () => {
  const s = validateSettings({ ...defaults, capacity: 20, slots: [] });
  assert.equal(s.capacity, 1);
  assert.equal(s.slots.length, 3);
  assert.throws(() => validateSettings({ ...defaults, horizon: 1000 }));
  assert.throws(() => validateSettings({ ...defaults, timezone: "invalid" }));
});
test("date-only booking validates customer details and ignores client slot selection", () => {
  const date = dispatchDates(defaults)[0];
  const input = {
    name: " Alex Test ",
    email: "ALEX@example.com",
    date,
    requestId: randomUUID(),
  };
  assert.equal(validateBooking(input, defaults).email, "alex@example.com");
  assert.equal(
    "slot" in validateBooking({ ...input, slot: "slot-4" }, defaults),
    false,
  );
  assert.throws(() =>
    validateBooking({ ...input, email: "invalid" }, defaults),
  );
  assert.throws(() => validateBooking({ ...input, name: "A" }, defaults));
});
test("database enforces capacity, cancellation release, idempotency and weekdays", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8"),
    );
    const insert = (
      slot: string,
      date = "2026-09-18",
      request = randomUUID(),
    ) =>
      db.query(
        "INSERT INTO bookings(id,request_id,reference,name,email,dispatch_date,slot,timezone) VALUES($1,$2,$3,'Test Customer','test@example.com',$4,$5,'Europe/London') RETURNING id",
        [randomUUID(), request, randomUUID(), date, slot],
      );
    const result = await insert("slot-1");
    await assert.rejects(insert("slot-1"), { code: "23505" });
    await insert("slot-2");
    await insert("slot-3");
    assert.equal((await db.query("SELECT * FROM bookings")).rows.length, 3);
    await assert.rejects(insert("slot-4"), { code: "23514" });
    await assert.rejects(insert("slot-1", "2026-09-19"), { code: "23514" });
    await db.query("UPDATE bookings SET status='cancelled' WHERE id=$1", [
      (result.rows[0] as { id: string }).id,
    ]);
    await insert("slot-1");
    const requestId = randomUUID();
    await insert("slot-1", "2026-09-21", requestId);
    await assert.rejects(insert("slot-2", "2026-09-21", requestId), {
      code: "23505",
    });
    await db.exec("BEGIN");
    const b = await insert("slot-2", "2026-09-21");
    await db.query(
      "INSERT INTO notifications(booking_id,channel) VALUES($1,'email'),($1,'whatsapp')",
      [(b.rows[0] as { id: string }).id],
    );
    await db.exec("ROLLBACK");
    assert.equal(
      (await db.query("SELECT * FROM notifications")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM bookings WHERE dispatch_date='2026-09-21' AND slot='slot-2'",
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

test("automatic assignment accounts for booked and closed places", () => {
  assert.equal(nextAvailableSlot(defaults, []), "slot-1");
  assert.equal(nextAvailableSlot(defaults, [{ slot: "slot-1" }]), "slot-2");
  assert.equal(
    nextAvailableSlot(defaults, [{ slot: "slot-1" }, { slot: "slot-2" }]),
    "slot-3",
  );
  assert.equal(
    nextAvailableSlot(
      defaults,
      defaults.slots.map((s) => ({ slot: s.id })),
    ),
    undefined,
  );
  assert.equal(
    nextAvailableSlot(defaults, [{ slot: "slot-1" }, { slot: "slot-3" }]),
    "slot-2",
  );
});
