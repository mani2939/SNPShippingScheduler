"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Brand from "./brand";
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
  History,
  KeyRound,
  LogOut,
  Zap,
  ChevronDown,
} from "lucide-react";
import { addDays, dateLabel, today, type Settings } from "../lib/schedule";
type Day = { date: string; available: boolean };
export default function BookingPage({
  customer,
}: {
  customer: { name: string; email: string };
}) {
  const { name, email } = customer;
  const [activeBooking, setActiveBooking] = useState<string | null>(null);
  const [deletionRequested, setDeletionRequested] = useState(false);
  const [latestRejectedUrgent, setLatestRejectedUrgent] = useState<string | null>(null);
  const [pendingUrgent, setPendingUrgent] = useState<{ reference: string; preferred_date: string | null } | null>(null);
  const [urgentMode, setUrgentMode] = useState(false);
  const [urgentError, setUrgentError] = useState("");
  const [urgentReason, setUrgentReason] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
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
      setActiveBooking(d.activeBooking);
      setDeletionRequested(d.deletionRequested);
      setPendingUrgent(d.pendingUrgent);
      setLatestRejectedUrgent(d.latestRejectedUrgent);
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
      setActiveBooking(data.reference);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      void load();
    } finally {
      setBusy(false);
    }
  }
  async function submitUrgent(e: React.FormEvent) {
    e.preventDefault();
    setUrgentError("");
    setBusy(true);
    try {
      const r = await fetch("/api/urgent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, reason: urgentReason, preferredDate }) });
      if (r.status === 401) { window.location.assign("/account"); return; }
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Could not submit urgent request.");
      setPendingUrgent({ reference: data.reference, preferred_date: preferredDate || null });
      setUrgentMode(false);
      void load();
    } catch (e) { setUrgentError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return (
    <>
      <header className="header customer-header">
        <Brand />
        <nav className="customer-header-nav" aria-label="Account actions">
          <a href="#booking-history" className="customer-nav-link">
            <History size={16} aria-hidden="true" /> My bookings
          </a>
          <Link href="/privacy/erasure" className="customer-nav-link">
            <ShieldCheck size={16} aria-hidden="true" /> Data deletion
          </Link>
          <Link href="/account?mode=forgot" className="customer-nav-link">
            <KeyRound size={16} aria-hidden="true" /> Reset password
          </Link>
          <button type="button" className="customer-nav-link customer-nav-signout" disabled={busy} onClick={() => void logout()}>
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </nav>
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
        {latestRejectedUrgent && !pendingUrgent && !activeBooking && !receipt && <div className="notice" role="status">Urgent request {latestRejectedUrgent} was declined. You can choose a standard dispatch date below or submit another urgent request.</div>}
        {deletionRequested ? (
          <section className="panel active-booking" role="status"><h2>Data deletion request under review</h2><p>Your request has been sent to SNP Dispatch. New dispatch bookings are paused while an admin reviews it.</p><Link className="tracking-link" href="/privacy/erasure">View request information</Link></section>
        ) : receipt ? (
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
              View booking status <ArrowRight size={18} />
            </button>
          </section>
        ) : pendingUrgent ? (
          <section className="panel active-booking" role="status">
            <h2>Urgent request received</h2>
            <p>Request <strong>{pendingUrgent.reference}</strong> is awaiting admin review. We’ll email you when it is approved with a dispatch date, or if it is declined.</p>
            {pendingUrgent.preferred_date && <p>Requested date: {dateLabel(pendingUrgent.preferred_date)}</p>}
            <button className="secondary" onClick={() => void load()}>Refresh request status</button>
          </section>
        ) : activeBooking ? (
          <section className="panel active-booking" role="status"><h2>You have an active booking</h2><p>Booking <strong>{activeBooking}</strong> is in progress. You can book again once SNP Dispatch marks it Completed or Cancelled.</p><a className="tracking-link" href="#booking-history">View your booking and tracking</a><button className="secondary" onClick={() => void load()}>Refresh booking status</button></section>
        ) : (
          <>
          <section className={"panel urgent-dispatch-card" + (urgentMode ? " is-expanded" : "")} aria-labelledby="urgent-dispatch-heading">
            <div className="urgent-card-top">
              <span className="urgent-card-icon" aria-hidden="true"><Zap size={22} /></span>
              <div className="urgent-card-copy">
                <span className="urgent-card-kicker">PRIORITY REQUEST</span>
                <h2 id="urgent-dispatch-heading">Need an urgent dispatch?</h2>
                <p>Ask us to review an earlier date. We’ll email you after an admin makes a decision.</p>
              </div>
              <button type="button" className="urgent-card-toggle" aria-expanded={urgentMode} aria-controls="urgent-request-form" disabled={busy} onClick={() => {
                setUrgentMode(open => !open);
                setUrgentError("");
                if (!urgentMode) setRequestId(crypto.randomUUID());
              }}>
                {urgentMode ? "Close request" : "Request urgent dispatch"}<ChevronDown size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="urgent-card-body" id="urgent-request-form" hidden={!urgentMode}>
              <form onSubmit={submitUrgent} className="urgent-form">
                <div className="urgent-field"><label htmlFor="urgent-preferred">Preferred date <span>(optional)</span></label><input id="urgent-preferred" type="date" min={today(settings.timezone)} max={addDays(today(settings.timezone), 90)} value={preferredDate} onChange={e => setPreferredDate(e.target.value)} disabled={busy} /></div>
                <div className="urgent-field"><label htmlFor="urgent-reason">Why do you need an urgent dispatch?</label><textarea id="urgent-reason" required minLength={10} maxLength={500} rows={4} value={urgentReason} onChange={e => setUrgentReason(e.target.value)} disabled={busy} placeholder="Tell us when and why you need this dispatch." /></div>
                {urgentError && <p role="alert" className="error">{urgentError}</p>}
                <div className="urgent-form-actions"><button className="primary" disabled={busy}>{busy ? "Sending…" : "Send urgent request"}<ArrowRight size={18} /></button></div>
              </form>
            </div>
          </section>
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
          </>
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
