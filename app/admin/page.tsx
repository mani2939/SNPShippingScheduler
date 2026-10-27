"use client";
import Link from "next/link";
import Brand from "../brand";
import { bookingStatuses, activeBookingStatuses, type BookingStatus } from "../../lib/booking-status";
import { trackingURL } from "../../lib/tracking";
import { useEffect, useState } from "react";
import { Package, ArrowUpRight, LogOut, RefreshCw, ClipboardList, Zap, Users, ShieldCheck, CalendarDays, Settings2, CheckCircle2 } from "lucide-react";
import { dateLabel, type Settings } from "../../lib/schedule";
type BookingFilter = "all" | "confirmed" | "in_progress" | "completed";
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
type UrgentRequest = { id: string; reference: string; name: string; email: string; reason: string; preferred_date: string | null; assigned_date: string | null; status: "pending" | "approved" | "rejected"; notification_status: string; notification_error: string | null; created_at: string };
type Customer = { id: string; name: string; email: string; email_verified: boolean; created_at: string; booking_count: number };
type GDPRRequest = { id: string; status: "pending" | "completed"; requested_at: string; completed_at: string | null; name: string | null; email: string | null; booking_count: number; active_count: number };
type Data = {
  gdprRequests: GDPRRequest[];
  customers: Customer[];
  urgentRequests: UrgentRequest[];
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
  const [urgentDates, setUrgentDates] = useState<Record<string, string>>({});
  const [customerSearch, setCustomerSearch] = useState("");
  const [deletionConfirm, setDeletionConfirm] = useState<Record<string, string>>({});
  const [customerFilter, setCustomerFilter] = useState<"all" | "verified" | "unverified">("all");
  const [data, setData] = useState<Data | null>(null),
    [login, setLogin] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState("bookings"),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState<BookingFilter>("confirmed"),
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
      setMessage(d.contactEmail ? `${success} Confirmation email was ${d.emailStatus}; contact ${d.contactEmail} separately.` : d.emailStatus && d.emailStatus !== "sent" ? `${success} Customer email: ${d.emailStatus}. Check notification settings and retry where available.` : success);
      await load();
      setStatusDraft({});
      setTracking({});
      setUrgentDates({});
      setDeletionConfirm({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const stageCount = (stage: BookingFilter) => data?.bookings.filter((booking) =>
    stage === "all" || (stage === "in_progress"
      ? booking.status === "being_packed" || booking.status === "shipped"
      : booking.status === stage)).length || 0;
  const shown = data?.bookings.filter((booking) => {
    if (filter === "all") return true;
    if (filter === "in_progress") return booking.status === "being_packed" || booking.status === "shipped";
    return booking.status === filter;
  }) || [];
  const stageLabel: Record<BookingFilter, string> = { all: "All bookings", confirmed: "Confirmed", in_progress: "In progress", completed: "Completed" };
  function showBookings(stage: BookingFilter) {
    setTab("bookings");
    setFilter(stage);
  }
  const pageTitles: Record<string, string> = {
    bookings: "Dispatch overview", urgent: "Urgent requests", customers: "Customers",
    gdpr: "GDPR requests", availability: "Availability", settings: "Settings",
  };
  const pageDescriptions: Record<string, string> = {
    bookings: "Track and progress every dispatch from confirmation to completion.",
    urgent: "Review urgent requests and assign a confirmed dispatch date.",
    customers: "Manage your registered customer directory.",
    gdpr: "Review and process customer data deletion requests.",
    availability: "Manage the dispatch calendar and closed places.",
    settings: "Configure dispatch dates and notification connections.",
  };
  const pageGroup = ["customers", "gdpr"].includes(tab) ? "PEOPLE & PRIVACY" : tab === "settings" ? "SYSTEM" : "OPERATIONS";
  const shownCustomers = data?.customers.filter((customer) => {
    const matchesSearch = `${customer.name} ${customer.email}`.toLowerCase().includes(customerSearch.trim().toLowerCase());
    const matchesFilter = customerFilter === "all" || customer.email_verified === (customerFilter === "verified");
    return matchesSearch && matchesFilter;
  }) || [];
  const urgentCount = data?.urgentRequests.filter(r => r.status === "pending").length || 0;
  const gdprCount = data?.gdprRequests.filter(r => r.status === "pending").length || 0;
  return (
    <>
      <header className="header admin-topbar">
        <Brand />
        <Link href="/" className="admin-link">
          Customer view <ArrowUpRight size={16} />
        </Link>
      </header>
      <main className={data && !login ? "admin-main admin-dashboard" : "admin-main"}>
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
          <div className="admin-shell">
            <aside className="admin-sidebar" aria-label="Dashboard navigation">
              <div className="admin-sidebar-heading">SNP DISPATCH <span>WORKSPACE</span></div>
              <nav className="admin-side-nav" aria-label="Admin sections">
                <div className="admin-side-group">
                  <span className="admin-side-label">OPERATIONS</span>
                  <button type="button" aria-pressed={tab === "bookings"} onClick={() => showBookings("all")}><ClipboardList size={18} /><span>Bookings</span><em>{data.bookings.length}</em></button>
                  <div className="admin-booking-subnav" aria-label="Booking stages">
                    {(["confirmed", "in_progress", "completed"] as const).map((stage) => (
                      <button key={stage} type="button" aria-pressed={tab === "bookings" && filter === stage} onClick={() => showBookings(stage)}>
                        <span>{stageLabel[stage]}</span><em>{stageCount(stage)}</em>
                      </button>
                    ))}
                  </div>
                  <button type="button" aria-pressed={tab === "urgent"} onClick={() => setTab("urgent")}><Zap size={18} /><span>Urgent requests</span>{urgentCount > 0 && <em className="admin-nav-alert">{urgentCount}</em>}</button>
                  <button type="button" aria-pressed={tab === "availability"} onClick={() => setTab("availability")}><CalendarDays size={18} /><span>Availability</span></button>
                </div>
                <div className="admin-side-group">
                  <span className="admin-side-label">PEOPLE & PRIVACY</span>
                  <button type="button" aria-pressed={tab === "customers"} onClick={() => setTab("customers")}><Users size={18} /><span>Customers</span><em>{data.customers.length}</em></button>
                  <button type="button" aria-pressed={tab === "gdpr"} onClick={() => setTab("gdpr")}><ShieldCheck size={18} /><span>GDPR requests</span>{gdprCount > 0 && <em className="admin-nav-alert">{gdprCount}</em>}</button>
                </div>
                <div className="admin-side-group">
                  <span className="admin-side-label">SYSTEM</span>
                  <button type="button" aria-pressed={tab === "settings"} onClick={() => setTab("settings")}><Settings2 size={18} /><span>Settings</span></button>
                </div>
              </nav>
              <p className="admin-sidebar-foot">Monday · Wednesday · Friday<br />3 places per dispatch day</p>
            </aside>
            <div className="admin-workspace">
              <div className="admin-intro">
                <div>
                  <div className="eyebrow">{pageGroup} / {tab.toUpperCase()}</div>
                  <h1>{pageTitles[tab]}</h1>
                  <p className="muted">{pageDescriptions[tab]}</p>
                </div>
                <div className="admin-intro-actions">
                  <button type="button" className="secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button>
                  {!data.demo && <button type="button" className="secondary" onClick={() => void act({ action: "logout" }, "")}><LogOut size={16} /> Sign out</button>}
                </div>
              </div>
              {data.demo && <div className="notice">Admin preview · Connect the database and configure admin sign-in to manage real bookings.</div>}
              {error && <div role="alert" className="error">{error}</div>}
              {message && <div role="status" className="status-message">{message}</div>}
              {tab === "bookings" && <div className="admin-metrics">
                <button type="button" className="admin-metric" aria-pressed={filter === "confirmed"} onClick={() => showBookings("confirmed")}>
                  <span className="admin-metric-top"><span>Confirmed</span><ClipboardList size={19} /></span>
                  <strong>{stageCount("confirmed").toString().padStart(2, "0")}</strong>
                  <small>Ready to start packing</small>
                </button>
                <button type="button" className="admin-metric" aria-pressed={filter === "in_progress"} onClick={() => showBookings("in_progress")}>
                  <span className="admin-metric-top"><span>In progress</span><Package size={19} /></span>
                  <strong>{stageCount("in_progress").toString().padStart(2, "0")}</strong>
                  <small>Being packed or shipped</small>
                </button>
                <button type="button" className="admin-metric" aria-pressed={filter === "completed"} onClick={() => showBookings("completed")}>
                  <span className="admin-metric-top"><span>Completed</span><CheckCircle2 size={19} /></span>
                  <strong>{stageCount("completed").toString().padStart(2, "0")}</strong>
                  <small>Finished dispatches</small>
                </button>
              </div>}
            {tab === "bookings" && (
              <>
                <div className="booking-toolbar">
                  <div><h2>{stageLabel[filter]}</h2><p>{shown.length} {shown.length === 1 ? "booking" : "bookings"} in this view</p></div>
                  <button type="button" className="secondary booking-all-button" onClick={() => showBookings(filter === "all" ? "confirmed" : "all")}>{filter === "all" ? "Show confirmed" : `View all bookings · ${stageCount("all")}`}</button>
                </div>
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
                  <details className="admin-delivery-help"><summary>Notification delivery help</summary><p>“Sent” means the provider accepted the notification. For an unknown result, check the provider’s delivery log before resending. Up to 500 recent bookings are shown.</p></details>
                  {shown.length === 0 && (
                    <div className="empty">
                      <Package size={32} style={{ marginBottom: 12 }} />
                      <p>
                        {filter === "all" ? "No bookings yet." : `No ${stageLabel[filter].toLowerCase()} bookings yet.`}
                      </p>
                      <p className="muted">
                        Customer bookings will appear here.
                      </p>
                    </div>
                  )}
                </section>
              </>
            )}
            {tab === "urgent" && (
              <section className="panel table-wrap">
                <h2>Urgent requests</h2>
                <p className="muted">Review each request and choose a dispatch date. Approval creates a Confirmed booking; rejection emails the customer.</p>
                <table>
                  <thead><tr><th>Customer</th><th>Request</th><th>Status</th><th>Decision</th></tr></thead>
                  <tbody>{data.urgentRequests.map(u => (
                    <tr key={u.id}>
                      <td><strong>{u.name}</strong><small>{u.email}</small><small>{u.reference}</small></td>
                      <td><strong>{u.reason}</strong><small>Requested {new Date(u.created_at).toLocaleString("en-GB")}</small>{u.preferred_date && <small>Preferred: {dateLabel(u.preferred_date)}</small>}</td>
                      <td><span className={"badge " + (u.status === "approved" ? "confirmed" : u.status === "rejected" ? "cancelled" : "being_packed")}>{u.status === "approved" ? "Confirmed" : u.status === "pending" ? "Pending review" : "Rejected"}</span>{u.assigned_date && <small>Dispatch: {dateLabel(u.assigned_date)}</small>}{u.status === "rejected" && <small title={u.notification_error || ""}>Email: {u.notification_status}</small>}</td>
                      <td>{u.status === "pending" ? (
                        <div className="admin-table-actions urgent-actions">
                          <form className="tracking-form" onSubmit={e => { e.preventDefault(); void act({ action: "urgent_approve", id: u.id, date: urgentDates[u.id] ?? u.preferred_date ?? "" }, "Urgent request approved and booking confirmed."); }}>
                            <label htmlFor={`urgent-date-${u.id}`}>Confirmed dispatch date</label>
                            <input id={`urgent-date-${u.id}`} type="date" required min={new Date().toLocaleDateString("en-CA", { timeZone: data.settings.timezone })} value={urgentDates[u.id] ?? u.preferred_date ?? ""} onChange={e => setUrgentDates(v => ({ ...v, [u.id]: e.target.value }))} disabled={busy} />
                            <button className="primary" disabled={busy}>Approve & confirm</button>
                          </form>
                          <button className="secondary" disabled={busy} onClick={() => { if (confirm(`Reject urgent request ${u.reference}? The customer will be emailed.`)) void act({ action: "urgent_reject", id: u.id }, "Urgent request rejected."); }}>Reject</button>
                        </div>
                      ) : u.status === "rejected" && ["failed", "pending"].includes(u.notification_status) ? <button className="secondary" disabled={busy} onClick={() => void act({ action: "urgent_retry", id: u.id }, "Customer email retried.")}>Retry email</button> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {data.urgentRequests.length === 0 && <div className="empty">No urgent requests yet.</div>}
              </section>
            )}
            {tab === "customers" && (
              <section className="panel table-wrap customers-panel">
                <div className="customers-heading">
                  <div>
                    <h2>Registered customers</h2>
                    <p className="muted">Accounts created through customer registration.</p>
                  </div>
                  <span className="customers-total">{data.customers.length} total</span>
                </div>
                <div className="customers-tools">
                  <label htmlFor="customer-search" className="sr-only">Search customers</label>
                  <input id="customer-search" type="search" placeholder="Search name or email" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                  <label htmlFor="customer-filter" className="sr-only">Filter by verification</label>
                  <select id="customer-filter" value={customerFilter} onChange={e => setCustomerFilter(e.target.value as "all" | "verified" | "unverified")}>
                    <option value="all">All accounts</option>
                    <option value="verified">Verified</option>
                    <option value="unverified">Unverified</option>
                  </select>
                </div>
                <table>
                  <thead><tr><th>Customer</th><th>Email</th><th>Joined</th><th>Verification</th><th>Bookings</th></tr></thead>
                  <tbody>{shownCustomers.map(customer => (
                    <tr key={customer.id}>
                      <td><strong>{customer.name}</strong></td>
                      <td><a href={`mailto:${customer.email}`}>{customer.email}</a></td>
                      <td>{new Date(customer.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td><span className={"badge " + (customer.email_verified ? "confirmed" : "being_packed")}>{customer.email_verified ? "Verified" : "Not verified"}</span></td>
                      <td>{customer.booking_count}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {shownCustomers.length === 0 && <div className="empty">{data.customers.length === 0 ? "No customers have registered yet." : "No customers match this search."}</div>}
              </section>
            )}
            {tab === "gdpr" && (
              <section className="panel table-wrap gdpr-panel">
                <h2>GDPR Requests</h2>
                <p className="muted">Review each erasure request before deleting. The action permanently removes the customer account, sessions, urgent requests, bookings, Royal Mail tracking, and notification records from this database. Check legal retention obligations, external email/WhatsApp providers, and backups separately.</p>
                <table>
                  <thead><tr><th>Customer</th><th>Requested</th><th>Records</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>{data.gdprRequests.map(request => (
                    <tr key={request.id}>
                      <td>{request.status === "pending" ? <><strong>{request.name}</strong><small>{request.email}</small></> : <span className="muted">Account deleted</span>}</td>
                      <td>{new Date(request.requested_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td>{request.status === "pending" ? <>{request.booking_count} booking{request.booking_count === 1 ? "" : "s"}{request.active_count > 0 && <small className="gdpr-warning">{request.active_count} active booking{request.active_count === 1 ? "" : "s"}</small>}</> : "Removed"}</td>
                      <td><span className={"badge " + (request.status === "pending" ? "being_packed" : "completed")}>{request.status === "pending" ? "Pending review" : "Completed"}</span>{request.completed_at && <small>{new Date(request.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</small>}</td>
                      <td>{request.status === "pending" ? <div className="gdpr-delete-control"><label htmlFor={`delete-${request.id}`}>Type DELETE to confirm</label><input id={`delete-${request.id}`} value={deletionConfirm[request.id] || ""} onChange={e => setDeletionConfirm(v => ({ ...v, [request.id]: e.target.value }))} autoComplete="off" disabled={busy} /><button type="button" className="secondary gdpr-delete-button" disabled={busy || deletionConfirm[request.id] !== "DELETE"} onClick={() => { if (confirm(`Permanently delete ${request.name}'s account and ${request.booking_count} booking(s)? This cannot be undone.`)) void act({ action: "gdpr_delete", id: request.id }, "Account and linked records deleted."); }}>Delete account & data</button></div> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {data.gdprRequests.length === 0 && <div className="empty">No data deletion requests yet.</div>}
              </section>
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
                  Customer bookings require at least two calendar days’ notice.
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
            </div>
          </div>
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
