// Dispatch dates are date-only values. UTC arithmetic avoids UK DST shifts.
function shift(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const labelDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
function dateLabel(date: string) { return labelDate.format(new Date(`${date}T12:00:00Z`)); }

export function groupBookingsByWeek<T extends { dispatch_date: string }>(bookings: T[]) {
  const groups = new Map<string, {start: string; end: string; bookings: T[]}>();
  for (const booking of [...bookings].sort((a, b) => a.dispatch_date.localeCompare(b.dispatch_date))) {
    const day = new Date(`${booking.dispatch_date}T12:00:00Z`).getUTCDay();
    const start = shift(booking.dispatch_date, -((day + 6) % 7));
    let group = groups.get(start);
    if (!group) {
      group = {start, end: shift(start, 4), bookings: []};
      groups.set(start, group);
    }
    // Urgent bookings may be on Saturday/Sunday; keep them in their Monday week.
    if (booking.dispatch_date > group.end) group.end = booking.dispatch_date;
    group.bookings.push(booking);
  }
  return [...groups.values()].map(group => ({
    ...group,
    label: `Week ${dateLabel(group.start)} – ${dateLabel(group.end)}`,
    year: group.start.slice(0, 4) === group.end.slice(0, 4)
      ? group.start.slice(0, 4) : `${group.start.slice(0, 4)}–${group.end.slice(0, 4)}`,
  }));
}
