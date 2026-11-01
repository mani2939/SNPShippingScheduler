import test from "node:test";
import assert from "node:assert/strict";
import { groupBookingsByWeek } from "../lib/booking-weeks.ts";

test("confirmed dispatch weeks are chronological, grouped Monday–Friday and preserve booking data", () => {
  const bookings = [
    {id:"later",dispatch_date:"2026-11-09"},
    {id:"friday",dispatch_date:"2026-11-06"},
    {id:"monday",dispatch_date:"2026-11-02"},
    {id:"wednesday",dispatch_date:"2026-11-04"},
  ];
  const original = [...bookings];
  const groups = groupBookingsByWeek(bookings);
  assert.equal(groups.length,2);
  assert.equal(groups[0].label,"Week 2 Nov – 6 Nov");
  assert.equal(groups[0].year,"2026");
  assert.deepEqual(groups[0].bookings.map(b=>b.id),["monday","wednesday","friday"]);
  assert.equal(groups[1].label,"Week 9 Nov – 13 Nov");
  assert.deepEqual(bookings,original,"grouping must not reorder the shared bookings array");
});

test("urgent weekend dispatches stay in the correct Monday week and extend the heading", () => {
  const groups = groupBookingsByWeek([
    {dispatch_date:"2026-11-08"}, {dispatch_date:"2026-11-06"},
    {dispatch_date:"2026-11-07"}, {dispatch_date:"2026-11-09"},
  ]);
  assert.equal(groups[0].label,"Week 2 Nov – 8 Nov");
  assert.equal(groups[0].bookings.length,3);
  assert.equal(groups[1].start,"2026-11-09");
});

test("week grouping handles UK clock changes, month boundaries, and year boundaries", () => {
  assert.equal(groupBookingsByWeek([{dispatch_date:"2026-10-25"}])[0].start,"2026-10-19");
  assert.equal(groupBookingsByWeek([{dispatch_date:"2026-10-26"}])[0].start,"2026-10-26");
  assert.equal(groupBookingsByWeek([{dispatch_date:"2026-03-29"}])[0].label,"Week 23 Mar – 29 Mar");
  const crossYear = groupBookingsByWeek([{dispatch_date:"2027-01-01"}])[0];
  assert.equal(crossYear.label,"Week 28 Dec – 1 Jan");
  assert.equal(crossYear.year,"2026–2027");
  assert.deepEqual(groupBookingsByWeek([]),[]);
});
