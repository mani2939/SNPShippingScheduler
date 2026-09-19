"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  CalendarDays,
  Clock3,
  Check,
  ShieldCheck,
  Mail,
  LoaderCircle,
} from "lucide-react";
import { defaults, dateLabel, type Settings } from "@/lib/schedule";
type Day = { date: string; slots: { id: string; remaining: number }[] };
export default function BookingPage() {
  const [settings, setSettings] = useState<Settings>(defaults),
    [days, setDays] = useState<Day[]>([]),
    [date, setDate] = useState(""),
    [slot, setSlot] = useState(""),
    [week, setWeek] = useState(0),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [demo, setDemo] = useState(false),
    [requestId, setRequestId] = useState(""),
    [receipt, setReceipt] = useState<{
      reference: string;
      emailStatus: string;
    } | null>(null);
  async function load() {
    try {
      const r = await fetch("/api/availability", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setSettings(d.settings);
      setDays(d.days);
      setDemo(d.demo);
      setDate(
        (prev) =>
          prev ||
          d.days.find((day: Day) => day.slots.some((s) => s.remaining > 0))
            ?.date ||
          "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load availability.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setRequestId(crypto.randomUUID());
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: "get_dispatch_availability",
          description:
            "Read available dispatch days and slots. Does not make a booking.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async (input: unknown) => {
            if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw new Error("This tool takes an empty object.");
            const r = await fetch("/api/availability", { cache: "no-store" });
            return r.json();
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, []);
  const selected = settings.slots.find((s) => s.id === slot);
  const visible = days.slice(week * 3, week * 3 + 3);
  const day = days.find((d) => d.date === date);
  const available = day?.slots.find((s) => s.id === slot)?.remaining || 0;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, date, slot, requestId }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Unable to book this slot.");
      setReceipt(data);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      void load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="header">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Package size={23} />
          </span>
          <span>
            SNP<span className="brand-light">dispatch</span>
          </span>
        </Link>
        <Link href="/admin" className="admin-link">
          Admin portal <ArrowUpRight size={16} />
        </Link>
      </header>
      <main className="booking-main">
        <div className="eyebrow">SHIPMENT SCHEDULING</div>
        <div className="page-intro">
          <div>
            <h1>Book your dispatch.</h1>
            <p>Choose a day and one of three available slots.</p>
          </div>
          <div className="dispatch-note">
            <CalendarDays size={19} />
            <div>
              <strong>Three slots per dispatch day.</strong>
              <span>Monday · Wednesday · Friday</span>
            </div>
          </div>
        </div>
        {demo && (
          <div className="notice">
            Preview mode · Explore the schedule. Booking opens once the service
            is connected.
          </div>
        )}
        {receipt ? (
          <section className="success panel" aria-live="polite">
            <span className="success-icon">
              <Check size={34} />
            </span>
            <div className="eyebrow">YOU’RE ON THE SCHEDULE</div>
            <h2>Dispatch booked, {name.split(" ")[0]}.</h2>
            <p>
              Your shipment is scheduled for <strong>{dateLabel(date)}</strong>
              <br />
              {selected?.label} · {settings.timezone}.
            </p>
            <div className="reference">
              Booking reference <strong>{receipt.reference}</strong>
            </div>
            <p>
              {receipt.emailStatus === "sent"
                ? `Your confirmation email has been submitted for delivery to ${email}.`
                : "Your booking is saved. Email confirmation is pending; please keep your reference."}
            </p>
            <button
              className="primary"
              onClick={() => {
                setReceipt(null);
                setSlot("");
                setRequestId(crypto.randomUUID());
              }}
            >
              Book another dispatch <ArrowRight size={18} />
            </button>
          </section>
        ) : (
          <form onSubmit={submit} className="booking-grid">
            <section className="panel selection">
              <div className="section-title">
                <span className="step">01</span>
                <h2>Choose your dispatch</h2>
              </div>
              <div className="calendar-toolbar">
                <span>
                  {visible[0]
                    ? new Intl.DateTimeFormat("en-GB", {
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      }).format(new Date(visible[0].date + "T12:00:00Z"))
                    : "Loading schedule…"}
                </span>
                <div className="arrows">
                  <button
                    aria-label="Earlier dates"
                    type="button"
                    disabled={busy || week === 0}
                    onClick={() => setWeek((w) => w - 1)}
                  >
                    <ArrowLeft size={17} />
                  </button>
                  <button
                    aria-label="Later dates"
                    type="button"
                    disabled={busy || (week + 1) * 3 >= days.length}
                    onClick={() => setWeek((w) => w + 1)}
                  >
                    <ArrowRight size={17} />
                  </button>
                </div>
              </div>
              <div className="date-grid">
                {loading ? (
                  <p>Loading available dates…</p>
                ) : (
                  visible.map((d) => {
                    const dt = new Date(d.date + "T12:00:00Z"),
                      full = d.slots.every((s) => s.remaining === 0);
                    return (
                      <button
                        type="button"
                        key={d.date}
                        disabled={busy || full}
                        aria-pressed={date === d.date}
                        className={
                          "date-card " + (date === d.date ? "selected" : "")
                        }
                        onClick={() => {
                          setDate(d.date);
                          setSlot("");
                          setRequestId(crypto.randomUUID());
                        }}
                      >
                        <span className="weekday">
                          {dt.toLocaleDateString("en-GB", {
                            weekday: "short",
                            timeZone: "UTC",
                          })}
                        </span>
                        <strong>
                          {dt.getUTCDate().toString().padStart(2, "0")}
                        </strong>
                        <span>
                          {dt.toLocaleDateString("en-GB", {
                            month: "short",
                            timeZone: "UTC",
                          })}
                        </span>
                        <span className="date-status">
                          {full ? (
                            "Fully booked"
                          ) : date === d.date ? (
                            <>
                              <Check size={13} /> Selected
                            </>
                          ) : (
                            "Available"
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="slot-heading">
                <h3>Pick a slot</h3>
                <span>{settings.timezone.replace("_", " ")}</span>
              </div>
              <div className="slots">
                {settings.slots.map((s, i) => {
                  const remaining =
                    day?.slots.find((x) => x.id === s.id)?.remaining || 0;
                  return (
                    <button
                      type="button"
                      disabled={busy || !remaining}
                      aria-pressed={slot === s.id}
                      className={"slot " + (slot === s.id ? "active" : "")}
                      key={s.id}
                      onClick={() => {
                        setSlot(s.id);
                        setRequestId(crypto.randomUUID());
                      }}
                    >
                      <Package size={20} />
                      <span className="slot-description">
                        <strong>{s.label}</strong>
                        <span>One shipment dispatch</span>
                      </span>
                      <span className="slot-availability">
                        {remaining
                          ? `${remaining} ${remaining === 1 ? "space" : "spaces"} left`
                          : "Unavailable"}
                      </span>
                      <span className="radio">{slot === s.id && <span />}</span>
                    </button>
                  );
                })}
              </div>
              <div className="small-note">
                <ShieldCheck size={17} />
                <span>
                  Availability is checked again when you book.
                  <br />
                  Bookings close at midnight before the dispatch day.
                </span>
              </div>
            </section>
            <aside>
              <section className="panel details">
                <div className="section-title">
                  <span className="step">02</span>
                  <h2>Your details</h2>
                </div>
                <p className="muted">Where should we send your confirmation?</p>
                <label htmlFor="name">Full name</label>
                <input
                  id="name"
                  disabled={busy}
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="e.g. Alex Morgan"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setRequestId(crypto.randomUUID());
                  }}
                />
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  disabled={busy}
                  type="email"
                  name="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setRequestId(crypto.randomUUID());
                  }}
                />
                <div className="booking-summary">
                  <span className="eyebrow">YOUR DISPATCH</span>
                  <strong>
                    {date
                      ? dateLabel(date).replace(/,? \d{4}$/, "")
                      : "Choose a day"}
                  </strong>
                  <span>
                    {selected ? selected.label : "Choose a slot to continue"}
                  </span>
                </div>
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <button
                  className="primary"
                  disabled={busy || !date || !slot || !available || demo}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <>
                      Confirm dispatch <ArrowRight size={18} />
                    </>
                  )}
                </button>
                <p className="form-footnote">
                  <Mail size={15} /> Confirmation on screen and by email
                </p>
              </section>
              <div className="dispatch-explainer">
                <Package size={23} />
                <div>
                  <strong>A dispatch slot, made simple.</strong>
                  <p>
                    Three places per dispatch day.
                    <br />
                    Choose a slot. No time window needed.
                  </p>
                </div>
              </div>
            </aside>
          </form>
        )}
        <footer>
          <span>© {new Date().getFullYear()} SNP Dispatch</span>
          <span>Monday · Wednesday · Friday</span>
        </footer>
      </main>
    </>
  );
}
