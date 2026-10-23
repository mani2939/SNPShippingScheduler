import type { Metadata } from "next";
import Link from "next/link";
import Brand from "../brand";

export const metadata: Metadata = {
  title: "Cookies & privacy | SNP Dispatch",
  description: "How SNP Dispatch uses sign-in cookies and optional fonts.",
};

export default function CookiesPage() {
  return (
    <>
      <header className="header"><Brand /><Link href="/account" className="admin-link">Customer sign in</Link></header>
      <main className="cookie-page">
        <div className="eyebrow">SNP DISPATCH</div>
        <h1>Cookies & privacy</h1>
        <p>We use the cookies and browser storage listed below. Essential sign-in cookies work whether you accept or decline optional fonts. You can change your choice at any time using the Cookie settings button.</p>
        <section className="panel">
          <h2>Essential sign-in cookies</h2>
          <p>These first-party cookies are set when you sign in. They keep your session secure and are needed for the account or admin portal you request.</p>
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Purpose</th><th>Duration</th></tr></thead>
            <tbody>
              <tr><td><code>snp_customer</code></td><td>Customer sign-in session</td><td>Up to 7 days, or until sign-out</td></tr>
              <tr><td><code>snp_admin</code></td><td>Admin sign-in session</td><td>Up to 8 hours, or until sign-out</td></tr>
            </tbody>
          </table></div>
        </section>
        <section className="panel">
          <h2>Your choice and optional fonts</h2>
          <p>We save your Accept or Decline choice in this browser&apos;s local storage as <code>snp_cookie_choice_v1</code> for up to 180 days. This remembers your preference; it is not used to track you. If you accept, your browser requests fonts from Google Fonts. This shares your IP address and browser request details with Google. If you decline, the site uses system fonts and does not request Google Fonts. You can withdraw your choice at any time with Cookie settings.</p>
          <p>We do not currently use analytics or advertising cookies. If we add optional tracking in future, we will ask for a separate choice before it loads.</p>
          <p>For questions about this site&apos;s data use, contact <a href="mailto:support@shapesandpieces.com">support@shapesandpieces.com</a>. Google&apos;s handling of font requests is described in its <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>.</p>
        </section>
      </main>
    </>
  );
}
