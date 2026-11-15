"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Package } from "lucide-react";
import TikTokProfile from "../tiktok-profile";
import CustomerAddresses from "../addresses";
import type { AdminCustomerDetails } from "../../lib/admin-customers";

export default function CustomerDetails({
  customerId,
  onBack,
  onOrders,
}: {
  customerId: string;
  onBack: () => void;
  onOrders: (customer: AdminCustomerDetails) => void;
}) {
  const [customer, setCustomer] = useState<AdminCustomerDetails | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const endpoint = `/api/admin/customers/${customerId}`;

  useEffect(() => {
    const controller = new AbortController();
    setCustomer(null);
    setError("");
    async function load() {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "Could not load customer details.");
        if (!controller.signal.aborted) setCustomer(data.customer);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load customer details.");
      }
    }
    void load();
    return () => controller.abort();
  }, [endpoint, retry]);

  return <div className="admin-customer-details">
    <button type="button" className="secondary" onClick={onBack}><ArrowLeft size={16}/> Back to customers</button>
    {error ? <div role="alert" className="error">{error} <button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></div>
      : !customer ? <p role="status">Loading customer details…</p>
      : <>
        <section className="panel order-summary customer-profile">
          <div className="history-heading">
            <div><h2>{customer.name}</h2><a href={`mailto:${customer.email}`}>{customer.email}</a></div>
            <button type="button" className="secondary" onClick={() => onOrders(customer)}><Package size={16}/> View orders</button>
          </div>
          <dl>
            <div><dt>Verification</dt><dd><span className={`badge ${customer.email_verified ? "confirmed" : "being_packed"}`}>{customer.email_verified ? "Verified" : "Not verified"}</span></dd></div>
            <div><dt>Joined</dt><dd>{new Date(customer.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</dd></div>
            <div><dt>Total bookings</dt><dd>{customer.booking_count}</dd></div>
            <div><dt>Active bookings</dt><dd>{customer.active_count}</dd></div>
            <div><dt>Orders</dt><dd>{customer.order_count}</dd></div>
          </dl>
        </section>
        <TikTokProfile key={`tiktok-${customer.id}`} endpoint={endpoint} initialValue={customer.tiktok_id} admin />
        <CustomerAddresses key={customer.id} endpoint={`${endpoint}/addresses`} admin />
      </>}
  </div>;
}
