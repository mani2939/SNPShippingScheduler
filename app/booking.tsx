"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import CustomerHistory from "./customer-history";
import {
  Package,
  ArrowRight,
  ArrowLeft,
  CalendarDays,
  Check,
  ShieldCheck,
  Mail,
  LoaderCircle,
} from "lucide-react";
import { dateLabel, type Settings } from "../lib/schedule";
type Day = { date: string; available: boolean };
export default function BookingPage({
  customer,
}: {
  customer: { name: string; email: string };
}) {
  const { name, email } = customer;
  const [settings, setSettings] = useState<
      Pick<Settings, "timezone" | "horizon">
    >({ timezone: "Europe/London", horizon: 42 }),
    [days, setDays] = useState<Day[]>([]),
    [date, setDate] = useState(""),
    [week, setWeek] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [requestId, setRequestId] = useState(""),
    [receipt, setReceipt] = useState<{
      reference: string;
      emailStatus: string;
    } | null>(null);
  async function load() {
    try {
      const r = await fetch("/api/availability", { cache: "no-store" });
      if (r.status === 401) {
        window.location.assign("/account");
        return;
      }
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setSettings(d.settings);
      setDays(d.days);
      setDate(
        (prev) => prev || d.days.find((day: Day) => day.available)?.date || "",
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
            "Read available dispatch dates. Does not make a booking.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              Array.isArray(input) ||
              Object.keys(input).length
            )
              throw new Error("This tool takes an empty object.");
            const r = await fetch("/api/availability", { cache: "no-store" });
            return r.json();
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, []);
  const visible = days.slice(week * 3, week * 3 + 3);
  const day = days.find((d) => d.date === date);
  const available = day?.available || false;
  async function logout() {
    setBusy(true);
    try {
      const r = await fetch("/api/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!r.ok) throw Error("Could not sign out. Please try again.");
      window.location.assign("/account");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, requestId }),
      });
      if (r.status === 401) {
        window.location.assign("/account");
        return;
      }
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Unable to book this date.");
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
        <div className="action-row">
          <a href="#booking-history" className="admin-link">
            My bookings
          </a>
          <Link href="/account?mode=forgot" className="admin-link">
            Reset password
          </Link>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void logout()}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="booking-main">
        <div className="eyebrow">SHIPMENT SCHEDULING</div>
        <div className="page-intro">
          <div>
            <h1>Book your dispatch.</h1>
            <p>Choose your dispatch date. We’ll reserve a place for you.</p>
          </div>
          <div className="dispatch-note">
            <CalendarDays size={19} />
            <div>
              <strong>Dispatch days</strong>
              <span>Monday · Wednesday · Friday</span>
            </div>
          </div>
        </div>
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
              {settings.timezone}.
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
                      full = !d.available;
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
                          {full
                            ? "Unavailable"
                            : date === d.date
                              ? "Selected"
                              : "Available"}
                        </span>
                      </button>
                    );
                  })
                )}
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
                <div className="customer-identity">
                  <strong>{name}</strong>
                  <span>{email}</span>
                  <p>We’ll send your dispatch confirmation to this email.</p>
                </div>
                <div className="booking-summary">
                  <span className="eyebrow">YOUR DISPATCH</span>
                  <strong>
                    {date
                      ? dateLabel(date).replace(/,? \d{4}$/, "")
                      : "Choose a day"}
                  </strong>
                  <span>
                    {date
                      ? "One dispatch reservation"
                      : "Choose a date to continue"}
                  </span>
                </div>
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <button
                  className="primary"
                  disabled={busy || !date || !available}
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
                  <strong>Dispatch confirmation</strong>
                  <p>
                    Your reservation is confirmed on screen and by email.
                    <br />
                    No time window needed.
                  </p>
                </div>
              </div>
            </aside>
          </form>
        )}
        <CustomerHistory refreshKey={receipt?.reference || ""} />
        <footer>
          <span>© {new Date().getFullYear()} SNP Dispatch</span>
          <span>Monday · Wednesday · Friday</span>
        </footer>
      </main>
    </>
  );
}
