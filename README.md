# SNP Dispatch

Customer booking site and username-and-password-protected admin portal, prepared for Vercel and `snpdispatch.com`.

- Mondays, Wednesdays and Fridays only.
- Standard customer bookings require at least two calendar days' notice in the configured dispatch timezone. Urgent dates need admin approval.
- Exactly three places per day. Verified customers select only an available date; capacity counts are private and the server assigns an internal slot automatically. No appointment times.
- Customer name and email, on-page confirmation and a booking reference.
- PostgreSQL transactions and a unique index prevent overbooking, including simultaneous requests.
- Email confirmations through Resend; business WhatsApp alerts through Twilio.
- Admin: upcoming/recent bookings, cancellation, mark dispatched, close/reopen slots, notification status/retry, timezone and booking horizon.

## Current state

The code builds and can run locally. The owner has configured Neon and Resend in Vercel; production connectivity and deployment have not been verified from this workspace. Without a database the account screens remain visible, but accounts and bookings are unavailable. The admin portal always requires authentication and never exposes a public preview. No real email or WhatsApp messages have been sent.

Default operational choices: Europe/London timezone, 42-day booking window, and a fixed two-calendar-day notice period for standard bookings. Admin can change timezone and booking horizon. Admin slot controls still show tomorrow's dispatch day. Cancellation releases the slot but does not email the customer; the confirmation prompt tells the administrator to contact them directly.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:3000`, or `/admin` for the admin view. Leave SNP_DATABASE_URL empty to preview the account screens only. To enable bookings, supply a PostgreSQL connection and run `npm run db:setup`.

## Connect services and deploy

1. Sign in to your Vercel account. Create a project for this folder (CLI or a Git repository import), framework **Next.js**.
2. Add a PostgreSQL database, such as Neon from Vercel Marketplace. Copy its pooled connection string to **SNP_DATABASE_URL**, with TLS enabled. Vercel automatically runs the versioned database migrations before building the app. No local database setup is needed for deployment. For local development, add the URL to `.env.local` and run `npm run db:migrate`.
3. Run `node scripts/admin-secret.mjs` locally. Save the generated admin password in your password manager. Set **ADMIN_USERNAME** (for example `admin`), **ADMIN_PASSWORD_HASH** and **SESSION_SECRET** in Vercel environment variables; do not commit these values or send them in chat. The `/admin` session expires after eight hours.
4. Set **APP_URL** to `https://snpdispatch.com` in Production. Use the exact preview origin for a separately configured Preview environment. Keep Preview and Production databases separate.
5. Configure Resend and Twilio using the instructions below. Add their values from `.env.example` to Vercel's environment variables, then redeploy.
6. Deploy with `npx vercel --prod` from this folder, or use Vercel's Git integration. Sign in if prompted. The lockfile fixes tested dependency versions; `vercel.json` runs `npm run vercel-build`, which applies migrations before the Next.js build.
7. In Vercel → Project → Settings → Domains, add `snpdispatch.com`. At your domain's DNS provider, apply the **exact records Vercel shows**. Add `www.snpdispatch.com` only if you want that alias. Preserve unrelated MX/TXT/email records. Wait for Vercel to verify DNS and issue HTTPS.
8. Make one real booking with an email you control. Verify that it appears in admin, that the slot is unavailable to a second customer, and that email and WhatsApp arrive. Cancel this test booking afterward if it is not an actual shipment.

Official references: [Vercel deployments](https://vercel.com/docs/cli/deploy), [Vercel domains](https://vercel.com/docs/projects/domains), [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).

## Email: Resend

Verify a sending domain in Resend by adding its required DNS records. Create an API key and set **RESEND_API_KEY**. Set **EMAIL_FROM** to a sender on that verified domain, e.g. `SNP Dispatch <dispatch@snpdispatch.com>`.

The email includes the customer name, dispatch date, timezone and reference, without exposing internal slot numbers. Resend receives an idempotency key tied to the booking. “Sent” in admin means the provider accepted the email; it is not a guarantee of inbox delivery. Check the provider's dashboard for bounces/delivery results.

Reference: [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email).

## WhatsApp: Twilio

Recipient: **+44 7721 352176**, supplied by the owner. Set **BUSINESS_WHATSAPP_TO** to `whatsapp:+447721352176`. This recipient number is not automatically the API sender. You also need a Twilio-approved WhatsApp sender, normally a separate number, plus the account SID, auth token and an approved message template. Confirm the recipient has opted in to receive these business alerts. A Twilio sandbox is for development, not production.

Create a WhatsApp text template such as:

> New SNP dispatch request: {{1}} has booked dispatch on {{2}}, {{3}}. Reference: {{4}}.

Submit the template for WhatsApp approval. Set **TWILIO_CONTENT_SID** to its Content SID. Variables map to customer name, full dispatch date, slot label and booking reference. Set **TWILIO_WHATSAPP_FROM** to the approved sender with the `whatsapp:` prefix.

Reference: [Twilio WhatsApp notification templates](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates).

## Reliability and administration

The booking and two notification jobs commit together before the sending services are called. Missing services and explicit provider rejection are visible in admin. Use **Retry alerts** for pending/failed notifications after fixing the service. Unknown outcomes and interrupted sends are not retried automatically, because the provider may already have accepted the message. Check the provider console before deciding whether to resend manually. There is no automatic background retry scheduler in this version.

Admin mutations require a signed, HttpOnly, SameSite cookie plus an origin check. Login and booking endpoints have database-backed rate limits. Credentials remain server-side. Availability never returns customer records. The bookings table retains records until you remove them; choose an operational retention policy before launch.

## Validation

```sh
npm test
npm run build
```

Tests cover allowed dates, UK daylight saving/date boundaries, booking validation, fixed capacity, PostgreSQL unique constraints, releasing cancelled slots, duplicate request IDs, and transaction rollback. Provider deliveries and custom-domain deployment require connected accounts and must be checked after configuration.

## Customer accounts and private capacity

- `/` is the customer entry point. Signed-out visitors go to `/account` to sign in or register; signed-in, verified customers see the booking calendar.
- Registration collects name, email and a password of 12–128 characters. A Resend email asks the customer to verify their email and confirm the password they chose. Access is automatically approved after verification; no manual admin approval is required.
- Forgot-password and resend-verification links are on the sign-in page. Reset links expire after 30 minutes; verification links expire after 24 hours. Tokens are hashed in the database and usable once. Resetting a password invalidates all customer sessions. Sessions use secure, HttpOnly cookies and expire after seven days.
- Bookings use the authenticated customer's saved name/email, ignoring any name/email supplied by the browser. Guest and unverified bookings are rejected by the server. Existing bookings remain intact; new bookings include a customer ID.
- Customers see only date availability (Available/Unavailable), never capacity counts or internal slot IDs. The backend still enforces three dispatch reservations per eligible day. Admin capacity controls remain private.
- Admin login remains separate at `/admin`, using `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`. Registering a customer never grants admin access.

### Deploy this account update

1. Upload the complete updated source, including the `lib` folder and the new account pages. Keep `lib/` out of `.gitignore`.
2. Include `vercel.json`, `scripts/` and `migrations/` in the upload. The Vercel build automatically creates customer, session and email-token tables and adds nullable `customer_id` to bookings without deleting existing records.
3. In Vercel Production, configure `SNP_DATABASE_URL`, `APP_URL=https://snpdispatch.com`, `RESEND_API_KEY`, `EMAIL_FROM` (using a Resend-verified domain), and the existing admin variables. APP_URL must be the public HTTPS address where customers can open email links. Do not use the localhost preview address for production emails.
4. Redeploy. Register using an email you own, verify it, sign in and book. Then test forgot-password, confirm that the old password stops working and old sessions are signed out. These live email checks require your configured services; they have not been run against your production account here.

The local account forms render without credentials, but submitting them requires the configured database and email service. There is no public booking or admin demo bypass.

## Automatic Neon migrations

Vercel runs `npm run vercel-build`: `npm run db:migrate` followed by `npm run build`. It uses **SNP_DATABASE_URL** from the deployment's environment. Ensure that variable is enabled for Production, and separately for Preview if using preview deployments. Use a separate Neon branch/database for Preview. The database role must be allowed to create/alter tables and indexes.

The first migration adopts existing installations and preserves bookings and settings. Applied filenames and SHA-256 checksums are stored in `snp_schema_migrations`. Redeploying skips completed migrations. A transaction advisory lock serializes overlapping migration runs, including on pooled connections. All pending changes commit together; errors roll back the transaction and stop deployment. A missing database URL also stops deployment.

For future database changes, add a new numbered SQL file such as `migrations/0002_add_column.sql`. Never edit an applied migration. Keep migrations compatible with the currently deployed app, because schema changes commit before the new app finishes building. Use transactional SQL; do not include `BEGIN`, `COMMIT`, or `CREATE INDEX CONCURRENTLY` in migration files. `lib/schema.sql` is the initial schema reference used by application tests; editing it alone does not deploy a database change.

Manual execution remains available with `npm run db:migrate` (`npm run db:setup` is an alias). Successful Vercel logs show `Database ready: N migration(s) applied.` No connection strings are printed. Tests cover fresh installation, adoption of existing bookings, repeat deployments, checksum mismatch, rollback and missing configuration. Live Neon execution still needs a deployment in your connected Vercel project.

### PostgreSQL SSL mode

Use `sslmode=verify-full` in `SNP_DATABASE_URL` to explicitly verify the server certificate and hostname. Both the app and migration runner normalize the legacy `prefer`, `require`, and `verify-ca` URL modes to `verify-full`, preserving pg 8’s existing verification behavior and avoiding its SSL-mode warning. Other connection parameters remain unchanged.

## Customer booking history

Signed-in customers can select **My bookings** or scroll to **Your dispatch history** below the calendar. The view highlights their latest booking and lists dispatch dates, references, booking timestamps, timezone and confirmed/dispatched/cancelled status, newest bookings first, 20 per page. It refreshes after booking and includes a manual Refresh control for admin status changes. Capacity and slot IDs remain private.

The history endpoint derives ownership from the verified customer session and returns only that account's records with private/no-store caching. Legacy bookings without a customer ID remain admin-only; they are not claimed by matching an unverified, historically entered email. Migration `0002_customer_history.sql` adds the history lookup index automatically during Vercel deployment.

## Booking workflow and Royal Mail tracking

Customers can have one active booking at a time. **Confirmed**, **Being Packed**, and **Shipped** are active; **Completed** and **Cancelled** permit a new booking. New requests default to Confirmed. The customer page displays the existing request instead of the booking form while it is active. The booking API locks the customer row inside its transaction before checking for an active request, preserving retries of the same request ID. A database trigger also guards against new duplicate active requests.

Admin can save tracking separately without changing status and mark a request Being Packed. Selecting **Shipped → Completed** saves tracking, records the shipping timestamp, and completes the request in one database update. **Completed** is also present in the status dropdown; closing a request directly requires tracking. Admin can cancel an active request. Completed and Cancelled requests cannot be reopened through the admin API. Tracking can be corrected on any non-cancelled request, including completed ones. The admin Bookings sidebar groups records into Confirmed, In progress (Being Packed or Shipped), and Completed. View all bookings includes cancelled records.

Customers see their status, Royal Mail reference and tracking link in My bookings. Refresh history for updated status. These are admin-managed fulfilment statuses; live carrier status is not fetched, and status changes do not send an additional email. Shipping records the dispatch timestamp; tracking corrections preserve it.

### Database migration

`0004_booking_workflow.sql` runs automatically during the Vercel build using **SNP_DATABASE_URL**. It converts Dispatched to Shipped, expands the allowed statuses, and installs the active-booking guard. Existing duplicate active requests are preserved for the admin to resolve: no new requests are permitted until all active requests for that customer are completed or cancelled. Legacy bookings without a customer ID remain admin-only and cannot be attributed to an account safely by email alone.

Deploy the entire source folder, including `migrations/`, `scripts/`, `lib/`, and `vercel.json`. Database changes have not been run against production from this workspace.

## Registration confirmation and brand theme

Successful registration now replaces the entire form and tabs with a Check your inbox confirmation, sign-in link and option to request another email. Password reset and verification email requests use the same confirmation pattern. Errors leave the form available for correction. Account existence remains private and no delivery guarantee is displayed.

The customer and admin portal use Shapes and Pieces styling: Playfair Display headings, Poppins body text, black buttons, warm white surfaces, and a pink/gold accent. Google Fonts are requested by the browser with system fallbacks, so the build does not depend on downloading fonts. This update requires no additional database migration.

## Urgent dispatch requests

Verified customers can submit an urgent request with a reason and optional preferred date. It stays pending without reserving a slot; while pending, that customer cannot make a regular booking or another urgent request. Admins review requests in **Urgent Requests**, assign a date from today through the next 90 days, and approve or reject them. Approval checks the three-place daily capacity, creates a Confirmed booking, and sends the normal customer email and business WhatsApp alert. Exceptional dates outside Monday/Wednesday/Friday are allowed only through admin approval. Rejection sends the customer an email and releases the customer to book again. Failed rejection emails can be retried in the admin tab; unknown provider outcomes require checking Resend before retrying. The customer page also shows a pending request and the latest rejected request.

Migration `0005_urgent_requests.sql` runs automatically via `npm run vercel-build` against `SNP_DATABASE_URL` on the next deployment. It creates the urgent queue and safeguards the one-active-request rule at database level. Deploy the entire source folder, including this migration. Production email and WhatsApp delivery still require their configured Vercel environment variables and a live end-to-end check.

## Admin customer directory

The protected **Customers** tab lists registered customer names and email addresses, sign-up dates, verification status, and booking totals. Admins can search by name or email and filter verified or unverified accounts. Each row has a Delete action with typed confirmation; deleting an account also removes its sessions, tokens, urgent requests, bookings (including matching legacy records), tracking, and notification records. Any pending GDPR erasure request is marked completed anonymously, and a deletion confirmation email is attempted. This action cannot be undone. The response only selects directory fields and booking totals; password hashes and session tokens are not returned. This uses the existing database schema and needs no new migration.

## Cookie choices and privacy review

The site-wide cookie notice offers equal Accept and Decline controls. The choice is kept in browser local storage for up to 180 days and can be changed with the persistent Cookie settings button. The essential `snp_customer` and `snp_admin` session cookies remain available after either choice. Google Fonts are no longer loaded automatically; they are requested only after Accept. The `/cookies` page explains the current storage and third-party font request. No analytics or advertising cookies are added by this application.

A cookie banner alone does not establish full UK GDPR compliance. Before production launch, the business should verify the live domain's actual cookies and third-party services, publish a complete privacy notice with its legal identity and lawful bases, set account and booking retention/deletion periods, and document how it handles access and erasure requests. Current application bookings and customer accounts do not have an automatic deletion schedule.

## Right-to-erasure requests

The customer sign-in screen links to the ICO's right-to-erasure guidance and to `/privacy/erasure`. Verified signed-in customers can submit a request for their own account; customers who cannot sign in can contact `support@shapesandpieces.com`. A pending request is shown on the customer page and pauses new bookings. The admin **GDPR Requests** tab shows pending requests and record counts. After reviewing any legal retention obligations, an admin must type `DELETE` and confirm before the application removes that customer's account, sessions, tokens, urgent requests, linked and same-email legacy bookings, tracking values, and notification records in one database transaction. The completed request retains only an anonymous request ID and timestamps. The app then attempts a confirmation email and reports a failure to the admin.

Migration `0006_gdpr_erasure.sql` is applied automatically by Vercel's `vercel-build` through `SNP_DATABASE_URL`. This action removes data from the active application database. It cannot erase copies already held by Resend, Twilio, Royal Mail, Vercel/Neon backups, or other external systems. The business must review those services and any lawful retention exception, and respond to the individual appropriately. Admins should not click Delete until that review is complete.

### Manual customer orders

Customers have a left workspace menu for dispatch booking, booking history and order history. Admins can add a historical order under **Orders**, or open **Orders** from a customer row. Enter the order date and the final total including shipping; standard shipping is fixed at £4 and the subtotal is calculated from that total. No payment or fulfilment status is inferred. Customers can read only their own orders, with 20 per page. Account erasure also removes its order history.

Run `npm run db:migrate` against the target database before starting this version. Migration `0007_customer_orders.sql` adds the order table; the Vercel build command already runs migrations.
