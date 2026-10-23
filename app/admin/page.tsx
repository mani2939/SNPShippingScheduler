"use client";
import Link from "next/link";
import Brand from "../brand";
import { bookingStatuses, activeBookingStatuses, type BookingStatus } from "../../lib/booking-status";
import { trackingURL } from "../../lib/tracking";
import { useEffect, useState } from "react";
import { Package, ArrowUpRight, LogOut, RefreshCw } from "lucide-react";
import { dateLabel, type Settings } from "../../lib/schedule";
type Booking = {
  id: string;
  reference: string;
  name: string;
  email: string;
  dispatch_date: string;
  slot: string;
  status: BookingStatus;
  royal_mail_tracking: string | null;
  notifications: Record<string, { status: string; error: string | null }>;
};
type Data = {
  demo: boolean;
  settings: Settings;
  bookings: Booking[];
  blocked: { dispatch_date: string; slot: string }[];
  schedule: { date: string; slots: { id: string; remaining: number }[] }[];
  connections: { email: boolean; whatsapp: boolean };
};
export default function AdminPage() {
  const [statusDraft, setStatusDraft] = useState<Record<string, BookingStatus>>({});
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [data, setData] = useState<Data | null>(null),
    [login, setLogin] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState("bookings"),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState<BookingStatus | "all">("confirmed"),
    [settings, setSettings] = useState<Settings | null>(null);
  async function load() {
    try {
      const r = await fetch("/api/admin", { cache: "no-store" });
      if (r.status === 401) {
        setLogin(true);
        setData(null);
        return;
      }
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setData(d);
      setSettings(d.settings);
      setLogin(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load admin.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function act(body: object, success = "Changes saved.") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 401) {
          setData(null);
          setLogin(true);
        }
        throw Error(d.error);
      }
      setPassword("");
      setMessage(success);
      await load();
      setStatusDraft({});
      setTracking({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const upcoming =
    data?.bookings.filter(
      (b) => activeBookingStatuses.includes(b.status),
    ) || [];
  const shown =
    data?.bookings.filter((b) => filter === "all" || b.status === filter) || [];
  const statusTabs: { key: BookingStatus | "all"; label: string }[] = [
    { key: "confirmed", label: "Confirmed" },
    { key: "being_packed", label: "Being Packed" },
    { key: "shipped", label: "Shipped" },
    { key: "completed", label: "Completed" },
    { key: "cancelled", label: "Cancelled" },
    { key: "all", label: "All" },
  ];
  const failed =
    data?.bookings.filter(
      (b) =>
        b.status !== "cancelled" &&
        Object.values(b.notifications).some((n) =>
          ["failed", "pending", "unknown", "sending"].includes(n.status),
        ),
    ).length || 0;
  return (
    <>
      <header className="header">
        <Brand />
        <Link href="/" className="admin-link">
          Customer view <ArrowUpRight size={16} />
        </Link>
      </header>
      <main className="admin-main">
        {login ? (
          <form
            className="panel login"
            onSubmit={(e) => {
              e.preventDefault();
              void act({ action: "login", username, password }, "");
            }}
          >
            <div className="eyebrow">ADMIN PORTAL</div>
            <h1>Welcome back.</h1>
            <p className="muted">Sign in to manage your dispatch schedule.</p>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              required
              maxLength={100}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button disabled={busy} className="primary">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : data ? (
          <>
            <div className="admin-intro">
              <div>
                <div className="eyebrow">OPERATIONS / ADMIN</div>
                <h1>Dispatch overview</h1>
                <p className="muted">
                  Three slots. Monday, Wednesday and Friday.
                </p>
              </div>
              <div className="action-row">
                <button
                  className="secondary"
                  onClick={() => void load()}
                  aria-label="Refresh dispatches"
                >
                  <RefreshCw size={17} />
                </button>
                {!data.demo && (
                  <button
                    className="secondary"
                    onClick={() => void act({ action: "logout" }, "")}
                    aria-label="Sign out"
                  >
                    <LogOut size={17} />
                  </button>
                )}
              </div>
            </div>
            {data.demo && (
              <div className="notice">
                Admin preview · Connect the database and configure admin sign-in
                to manage real bookings.
              </div>
            )}
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            {message && (
              <div role="status" className="status-message">
                {message}
              </div>
            )}
            <div className="stats">
              <div className="panel stat">
                <span>Active bookings</span>
                <strong>{upcoming.length.toString().padStart(2, "0")}</strong>
              </div>
              <div className="panel stat">
                <span>Places per dispatch day</span>
                <strong>03</strong>
              </div>
              <div className="panel stat">
                <span>Notifications to check</span>
                <strong>{failed.toString().padStart(2, "0")}</strong>
              </div>
            </div>
            <nav className="admin-tabs" aria-label="Admin sections">
              {["bookings", "availability", "settings"].map((t) => (
                <button
                  className="secondary"
                  key={t}
                  aria-pressed={tab === t}
                  onClick={() => setTab(t)}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </nav>
            {tab === "bookings" && (
              <>
                <nav className="booking-status-tabs" aria-label="Filter bookings by status">
                  {statusTabs.map(({ key, label }) => (
                    <button
                      type="button"
                      key={key}
                      aria-current={filter === key ? "page" : undefined}
                      onClick={() => setFilter(key)}
                    >
                      <span>{label}</span>
                      <span className="status-tab-count">
                        {key === "all" ? data.bookings.length : data.bookings.filter((b) => b.status === key).length}
                      </span>
                    </button>
                  ))}
                </nav>
                <p className="notifications-note">
                  “Sent” means the provider accepted the notification. For an
                  unknown result, check the provider’s delivery log before
                  resending. Up to 500 recent bookings are shown.
                </p>
                <section className="panel table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Dispatch</th>
                        <th>Status</th>
                        <th>Notifications</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((b) => (
                        <tr key={b.id}>
                          <td>
                            <strong>{b.name}</strong>
                            <small>{b.email}</small>
                            <small>{b.reference}</small>
                          </td>
                          <td>
                            {dateLabel(b.dispatch_date)}
                            <small>Slot {b.slot.slice(-1)}</small>
                          </td>
                          <td>
                            <span className={"badge " + b.status}>
                              {bookingStatuses[b.status]}
                            </span>
                            {b.royal_mail_tracking && (
                              <small>
                                <a
                                  className="tracking-link"
                                  href={trackingURL(b.royal_mail_tracking)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Royal Mail: {b.royal_mail_tracking}
                                </a>
                              </small>
                            )}
                          </td>
                          <td>
                            {["email", "whatsapp"].map((c) => (
                              <small
                                title={b.notifications[c]?.error || ""}
                                key={c}
                              >
                                {c === "email" ? "Email" : "WhatsApp"}:{" "}
                                {b.notifications[c]?.status || "pending"}
                              </small>
                            ))}
                          </td>
                          <td>
                            <div className="admin-table-actions">
                              {b.status !== "cancelled" && (
                                <form className="tracking-form" onSubmit={e => {
                                  e.preventDefault();
                                  void act({ action: "tracking", id: b.id, tracking: tracking[b.id] ?? b.royal_mail_tracking ?? "" }, "Royal Mail tracking saved.");
                                }}>
                                  <label htmlFor={`tracking-${b.id}`}>Royal Mail tracking number</label>
                                  <input id={`tracking-${b.id}`} required maxLength={100} disabled={busy} value={tracking[b.id] ?? b.royal_mail_tracking ?? ""} onChange={e => setTracking(v => ({ ...v, [b.id]: e.target.value }))} placeholder="e.g. AB123456789GB" />
                                  <button className="secondary" disabled={busy}>Save tracking</button>
                                </form>
                              )}
                              {activeBookingStatuses.includes(b.status) && (
                                <form className="tracking-form" onSubmit={e => {
                                  e.preventDefault();
                                  const status = statusDraft[b.id] ?? b.status;
                                  if (status === "cancelled" && !confirm("Cancel this booking and release its slot? Tell the customer directly; no cancellation email is sent.")) return;
                                  const number = tracking[b.id] ?? b.royal_mail_tracking;
                                  void act(
                                    { action: "status", id: b.id, status,
                                      ...(["shipped", "completed"].includes(status) && number ? { tracking: number } : {}) },
                                    status === "shipped" ? "Marked Completed and Royal Mail tracking saved." : "Booking status updated.",
                                  );
                                }}>
                                  <label htmlFor={`status-${b.id}`}>Booking status</label>
                                  <select id={`status-${b.id}`} value={statusDraft[b.id] ?? b.status} disabled={busy} onChange={e => setStatusDraft(v => ({ ...v, [b.id]: e.target.value as BookingStatus }))}>
                                    {Object.entries(bookingStatuses)
                                      .filter(([status]) => b.status === "shipped"
                                        ? ["shipped", "completed", "cancelled"].includes(status)
                                        : true)
                                      .map(([status, label]) => (
                                        <option key={status} value={status}>
                                          {status === "shipped" && b.status !== "shipped" ? "Shipped → Completed" : label}
                                        </option>
                                      ))}
                                  </select>
                                  <button className="secondary" disabled={busy}>Update status</button>
                                </form>
                              )}
                              {b.status !== "cancelled" &&
                                Object.values(b.notifications).some((n) =>
                                  ["failed", "pending"].includes(n.status),
                                ) && (
                                  <button
                                    className="secondary"
                                    disabled={busy || data.demo}
                                    onClick={() =>
                                      void act(
                                        { action: "retry", id: b.id },
                                        "Notification attempt completed. Check the status below.",
                                      )
                                    }
                                  >
                                    Retry alerts
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {shown.length === 0 && (
                    <div className="empty">
                      <Package size={32} style={{ marginBottom: 12 }} />
                      <p>
                        No {filter === "all" ? "" : `${bookingStatuses[filter].toLowerCase()} `}bookings yet.
                      </p>
                      <p className="muted">
                        Customer bookings will appear here.
                      </p>
                    </div>
                  )}
                </section>
              </>
            )}
            {tab === "availability" && (
              <>
                <p className="notifications-note">
                  Close individual slots when dispatch is unavailable. Close all
                  three to make a day unavailable.
                </p>
                <section className="panel">
                  {data.schedule.map((d) => (
                    <div key={d.date} className="day-control">
                      <strong>{dateLabel(d.date)}</strong>
                      <div>
                        {d.slots.map((s) => {
                          const blocked = data.blocked.some(
                            (b) =>
                              b.dispatch_date === d.date && b.slot === s.id,
                          );
                          const booked = !s.remaining && !blocked;
                          return (
                            <button
                              key={s.id}
                              className={
                                "secondary " + (blocked ? "blocked" : "")
                              }
                              disabled={busy || data.demo || booked}
                              onClick={() =>
                                void act({
                                  action: "block",
                                  date: d.date,
                                  slot: s.id,
                                  blocked: !blocked,
                                })
                              }
                            >
                              Slot {s.id.slice(-1)} ·{" "}
                              {booked ? "Booked" : blocked ? "Closed" : "Open"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </section>
              </>
            )}
            {tab === "settings" && settings && (
              <form
                className="panel admin-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act({ action: "settings", settings });
                }}
              >
                <h2>Booking settings</h2>
                <p className="muted">
                  Each Monday, Wednesday and Friday has exactly three places.
                  Bookings close at midnight before dispatch.
                </p>
                <label htmlFor="timezone">Dispatch timezone</label>
                <select
                  id="timezone"
                  value={settings.timezone}
                  onChange={(e) =>
                    setSettings({ ...settings, timezone: e.target.value })
                  }
                >
                  {[
                    "Europe/London",
                    "Europe/Paris",
                    "Asia/Kolkata",
                    "America/New_York",
                    "America/Los_Angeles",
                    "Australia/Sydney",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <label htmlFor="horizon">
                  How many days ahead can customers book?
                </label>
                <input
                  id="horizon"
                  type="number"
                  min={7}
                  max={90}
                  required
                  value={settings.horizon}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      horizon: Number(e.target.value),
                    })
                  }
                />
                <button disabled={busy || data.demo} className="primary">
                  Save settings
                </button>
                <h3 style={{ marginTop: 30, fontSize: 16 }}>
                  Notification connections
                </h3>
                <p className="muted" style={{ marginTop: 10 }}>
                  Email:{" "}
                  {data.connections.email ? "Configured" : "Not configured"}
                  <br />
                  WhatsApp:{" "}
                  {data.connections.whatsapp ? "Configured" : "Not configured"}
                </p>
                <p className="notifications-note" style={{ marginTop: 10 }}>
                  Sending credentials are managed securely in your hosting
                  settings.
                </p>
              </form>
            )}
          </>
        ) : (
          <>
            <p>Loading dispatch admin…</p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}
