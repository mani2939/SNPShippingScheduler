export type Settings = {
  timezone: string;
  slots: { id: string; label: string }[];
  capacity: number;
  horizon: number;
};
export const defaults: Settings = {
  timezone: "Europe/London",
  slots: [
    { id: "slot-1", label: "Slot 1" },
    { id: "slot-2", label: "Slot 2" },
    { id: "slot-3", label: "Slot 3" },
  ],
  capacity: 1,
  horizon: 42,
};
export function today(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !isNaN(Date.parse(date + "T12:00:00Z")) &&
    new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date
  );
}
export function eligible(date: string, settings: Settings, now = new Date()) {
  const current = today(settings.timezone, now);
  return (
    validDate(date) &&
    [1, 3, 5].includes(new Date(date + "T12:00:00Z").getUTCDay()) &&
    date > current &&
    date <= addDays(current, settings.horizon)
  );
}
export function dispatchDates(settings: Settings, now = new Date()) {
  const current = today(settings.timezone, now);
  return Array.from({ length: settings.horizon }, (_, i) =>
    addDays(current, i + 1),
  ).filter((d) => eligible(d, settings, now));
}
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}
export function validateSettings(value: Settings) {
  if (
    !value ||
    !Number.isInteger(value.horizon) ||
    value.horizon < 7 ||
    value.horizon > 90 ||
    typeof value.timezone !== "string"
  )
    throw new Error("Choose a valid timezone and booking window of 7–90 days.");
  new Intl.DateTimeFormat("en", { timeZone: value.timezone });
  return { ...defaults, timezone: value.timezone, horizon: value.horizon };
}
export function validateBooking(value: unknown, settings: Settings) {
  const v = value as Record<string, unknown>;
  if (
    !v ||
    typeof v.name !== "string" ||
    v.name.trim().length < 2 ||
    v.name.trim().length > 100 ||
    typeof v.email !== "string" ||
    v.email.length > 254 ||
    !/^\S+@[^\s@]+\.[^\s@]+$/.test(v.email) ||
    typeof v.date !== "string" ||
    !eligible(v.date, settings) ||
    typeof v.requestId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(v.requestId)
  )
    throw new Error("Please enter a valid name, email, dispatch day.");
  return {
    name: v.name.trim(),
    email: v.email.trim().toLowerCase(),
    date: v.date,
    requestId: v.requestId,
  };
}

export function nextAvailableSlot(
  settings: Settings,
  occupied: { slot: string }[],
) {
  return settings.slots.find((s) => !occupied.some((o) => o.slot === s.id))?.id;
}
