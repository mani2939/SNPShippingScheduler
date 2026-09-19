# SNP Dispatch

Customer booking site and username-and-password-protected admin portal, prepared for Vercel and `snpdispatch.com`.

- Mondays, Wednesdays and Fridays only.
- Exactly three places per day. Verified customers select only an available date; capacity counts are private and the server assigns an internal slot automatically. No appointment times.
- Customer name and email, on-page confirmation and a booking reference.
- PostgreSQL transactions and a unique index prevent overbooking, including simultaneous requests.
- Email confirmations through Resend; business WhatsApp alerts through Twilio.
- Admin: upcoming/recent bookings, cancellation, mark dispatched, close/reopen slots, notification status/retry, timezone and booking horizon.

## Current state

The code builds and can run locally. It has **not been deployed**. No database, admin password, email sender or WhatsApp API credentials have been connected. Without a database the account screens remain visible, but accounts and bookings are unavailable. The admin portal always requires authentication and never exposes a public preview. No real email or WhatsApp messages have been sent.

Default operational choices: Europe/London timezone, 42-day booking window, no same-day bookings. Admin can change timezone and booking horizon. Cancellation releases the slot but does not email the customer; the confirmation prompt tells the administrator to contact them directly.

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
2. Add a PostgreSQL database, such as Neon from Vercel Marketplace. Copy its pooled connection string to **SNP_DATABASE_URL**, with TLS enabled. Add it locally to `.env.local` and run `npm run db:setup` once to apply `lib/schema.sql`. The setup is repeatable and does not erase bookings.
3. Run `node scripts/admin-secret.mjs` locally. Save the generated admin password in your password manager. Set **ADMIN_USERNAME** (for example `admin`), **ADMIN_PASSWORD_HASH** and **SESSION_SECRET** in Vercel environment variables; do not commit these values or send them in chat. The `/admin` session expires after eight hours.
4. Set **APP_URL** to `https://snpdispatch.com` in Production. Use the exact preview origin for a separately configured Preview environment. Keep Preview and Production databases separate.
5. Configure Resend and Twilio using the instructions below. Add their values from `.env.example` to Vercel's environment variables, then redeploy.
6. Deploy with `npx vercel --prod` from this folder, or use Vercel's Git integration. Sign in if prompted. The lockfile fixes tested dependency versions; Vercel detects the Next.js build automatically.
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
2. **Run `npm run db:setup` against your production database before deployment.** The repeatable schema creates customer, session and email-token tables and adds nullable `customer_id` to bookings without deleting existing records. Set `SNP_DATABASE_URL` locally using `.env.local`; never commit it.
3. In Vercel Production, configure `SNP_DATABASE_URL`, `APP_URL=https://snpdispatch.com`, `RESEND_API_KEY`, `EMAIL_FROM` (using a Resend-verified domain), and the existing admin variables. APP_URL must be the public HTTPS address where customers can open email links. Do not use the localhost preview address for production emails.
4. Redeploy. Register using an email you own, verify it, sign in and book. Then test forgot-password, confirm that the old password stops working and old sessions are signed out. These live email checks require your configured services; they have not been run against your production account here.

The local account forms render without credentials, but submitting them requires the configured database and email service. There is no public booking or admin demo bypass.
