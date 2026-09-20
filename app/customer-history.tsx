"use client";
import { useEffect, useState } from "react";
import { trackingURL } from "../lib/tracking";
import { dateLabel } from "../lib/schedule";
import type { CustomerBooking } from "../lib/customer-history";
export default function CustomerHistory({
  refreshKey,
}: {
  refreshKey: string;
}) {
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [refreshKey]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    async function load() {
      try {
        const response = await fetch(`/api/customer/bookings?page=${page}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          window.location.assign("/account");
          return;
        }
        const data = await response.json();
        if (!response.ok)
          throw Error(data.error || "Could not load booking history.");
        if (!controller.signal.aborted) {
          setBookings(data.bookings);
          setHasMore(data.hasMore);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Could not load booking history.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [page, refreshKey, retry]);
  return (
    <section
      className="panel customer-history"
      id="booking-history"
      aria-labelledby="history-heading"
    >
      <div className="history-heading">
        <div>
          <div className="eyebrow">YOUR ACCOUNT</div>
          <h2 id="history-heading">Your dispatch history</h2>
        </div>
        <button
          className="secondary"
          disabled={loading}
          onClick={() => setRetry((v) => v + 1)}
        >
          Refresh
        </button>
      </div>
      {loading ? (
        <p role="status">Loading your bookings…</p>
      ) : error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : !bookings.length ? (
        <p>
          {page === 0
            ? "You haven’t booked a dispatch yet. Your bookings will appear here."
            : "No more bookings."}
        </p>
      ) : (
        <>
          {page === 0 && (
            <p className="history-latest">
              Your latest booking was made on{" "}
              <strong>
                {new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "long",
                  timeZone: bookings[0].timezone,
                }).format(new Date(bookings[0].created_at))}
              </strong>{" "}
              for dispatch on{" "}
              <strong>{dateLabel(bookings[0].dispatch_date)}</strong>.
            </p>
          )}
          <ul className="history-list">
            {bookings.map((booking) => (
              <li key={booking.reference}>
                <div>
                  <strong>{dateLabel(booking.dispatch_date)}</strong>
                  <span>
                    {booking.reference} · {booking.timezone}
                  </span>
                  <span>
                    Booked{" "}
                    {new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: booking.timezone,
                    }).format(new Date(booking.created_at))}
                  </span>
                  {booking.royal_mail_tracking && (
                    <a
                      className="tracking-link"
                      href={trackingURL(booking.royal_mail_tracking)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Royal Mail Track Delivery · {booking.royal_mail_tracking}
                    </a>
                  )}
                  {booking.dispatched_at && (
                    <span>
                      Dispatched{" "}
                      {new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: booking.timezone,
                      }).format(new Date(booking.dispatched_at))}
                    </span>
                  )}
                </div>
                <span className={`history-status history-${booking.status}`}>
                  {
                    {
                      confirmed: "Confirmed",
                      dispatched: "Dispatched",
                      cancelled: "Cancelled",
                    }[booking.status]
                  }
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {(page > 0 || hasMore) && (
        <nav className="history-pagination" aria-label="Booking history pages">
          <button
            className="secondary"
            disabled={loading || page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Newer bookings
          </button>
          <span>Page {page + 1}</span>
          <button
            className="secondary"
            disabled={loading || !hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Older bookings
          </button>
        </nav>
      )}
    </section>
  );
}
