import test from "node:test";
import assert from "node:assert/strict";
import { matchesAdminBookingFilter, type BookingStatus } from "../lib/booking-status.ts";
import { today } from "../lib/schedule.ts";

test("past confirmed and packing bookings move into delayed, while today's and future bookings stay in their stages", () => {
  const currentDate = "2026-11-12";
  for (const status of ["confirmed", "being_packed"] as BookingStatus[]) {
    const booking = {status, dispatch_date: "2026-11-11", dispatched_at: null};
    const originalFilter = status === "confirmed" ? "confirmed" : "in_progress";
    assert.equal(matchesAdminBookingFilter(booking,"delayed",currentDate),true);
    assert.equal(matchesAdminBookingFilter(booking,originalFilter,currentDate),false);
    assert.equal(matchesAdminBookingFilter(booking,"all",currentDate),true);
    for (const dispatch_date of [currentDate,"2026-11-13"]) {
      const upcoming = {...booking,dispatch_date};
      assert.equal(matchesAdminBookingFilter(upcoming,"delayed",currentDate),false);
      assert.equal(matchesAdminBookingFilter(upcoming,originalFilter,currentDate),true);
    }
  }
});

test("shipped, completed, cancelled and already dispatched records are excluded from delayed bookings", () => {
  for (const status of ["shipped","completed","cancelled"] as BookingStatus[]) {
    assert.equal(matchesAdminBookingFilter({status,dispatch_date:"2026-01-01",dispatched_at:null},"delayed","2026-11-12"),false);
  }
  assert.equal(matchesAdminBookingFilter({status:"confirmed",dispatch_date:"2026-01-01",dispatched_at:"2026-01-01"},"delayed","2026-11-12"),false);
  assert.equal(matchesAdminBookingFilter({status:"completed",dispatch_date:"2026-01-01",dispatched_at:"2026-01-01"},"completed","2026-11-12"),true);
});

test("delayed cutoff uses the configured UK calendar date across summer midnight and winter dates", () => {
  const booking = {status:"confirmed" as const, dispatch_date:"2026-07-15",dispatched_at:null};
  assert.equal(matchesAdminBookingFilter(booking,"delayed",today("Europe/London",new Date("2026-07-15T22:59:00Z"))),false);
  assert.equal(matchesAdminBookingFilter(booking,"delayed",today("Europe/London",new Date("2026-07-15T23:01:00Z"))),true);
  assert.equal(today("Europe/London",new Date("2026-11-12T00:01:00Z")),"2026-11-12");
});
