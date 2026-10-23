import type { Metadata } from "next";
import Link from "next/link";
import Brand from "../../brand";
import { getCustomer } from "../../../lib/customer-auth";
import { pool } from "../../../lib/db";
import ErasureRequestForm from "./request-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request data deletion | SNP Dispatch", robots: { index: false, follow: false } };
export default async function ErasurePage() {
  const customer = await getCustomer();
  const pending = customer ? (await pool().query("SELECT requested_at FROM gdpr_erasure_requests WHERE customer_id=$1 AND status='pending' ORDER BY requested_at DESC LIMIT 1", [customer.id])).rows[0] : null;
  return (
    <>
      <header className="header"><Brand /><Link href={customer ? "/" : "/account"} className="admin-link">{customer ? "My bookings" : "Sign in"}</Link></header>
      <main className="erasure-page">
        <div className="eyebrow">YOUR PRIVACY</div>
        <h1>Request deletion of your data</h1>
        <section className="panel">
          <p>You can ask us to delete the personal information held in your SNP Dispatch account. We review requests in line with the <a href="https://ico.org.uk/for-the-public/your-right-to-get-your-data-deleted/" target="_blank" rel="noopener noreferrer">ICO guidance on the right to erasure</a>. The right is not absolute, and we will respond to your request.</p>
          {customer ? (
            <><p>Signed in as <strong>{customer.email}</strong>. Please submit the request for your own account only.</p><ErasureRequestForm pendingAt={pending?.requested_at ? String(pending.requested_at) : null} /></>
          ) : (
            <p><Link href="/account?next=/privacy/erasure" className="primary erasure-signin">Sign in to submit a request</Link> If you cannot access your account, email <a href="mailto:support@shapesandpieces.com">support@shapesandpieces.com</a>.</p>
          )}
          <p>We will respond without undue delay and normally within one month of a valid request. If the law permits more time, we will explain why. If you have questions, contact <a href="mailto:support@shapesandpieces.com">support@shapesandpieces.com</a>.</p>
        </section>
      </main>
    </>
  );
}
