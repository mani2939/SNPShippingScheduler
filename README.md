# SNP Dispatch — Shipping Slot Booking
### snpdispatch.com · Hosted on Railway

**Monday** — 8 slots &nbsp;|&nbsp; **Thursday** — 10 slots

---

## Deploying to Railway

### What you need
- A [Railway account](https://railway.app) (free tier works)
- A [GitHub account](https://github.com) (Railway deploys from GitHub)
- Your domain `snpdispatch.com` already bought ✅

---

### Step 1 — Push the code to GitHub

On your computer, open a terminal in the `shipping-slots-v2` folder:

```bash
git init
git add .
git commit -m "Initial deploy"
```

Go to [github.com/new](https://github.com/new), create a **private** repository called `snpdispatch`, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/snpdispatch.git
git branch -M main
git push -u origin main
```

---

### Step 2 — Create a Railway project

1. Go to [railway.app](https://railway.app) and log in
2. Click **New Project**
3. Choose **Deploy from GitHub repo**
4. Select your `snpdispatch` repository
5. Railway will detect it's a Python app and deploy automatically

After a minute you'll see a green **Active** status and a temporary URL like `snpdispatch-production.up.railway.app`. The app is live — but using Railway's URL, not your domain yet.

---

### Step 3 — Add a persistent Volume (critical — keeps bookings safe)

Without this, your `bookings.db` database is wiped every time you redeploy.

1. In your Railway project, click on your **service** (the Python app)
2. Go to the **Volumes** tab
3. Click **Add Volume**
4. Set **Mount Path** to `/data`
5. Click **Create**

Railway will redeploy automatically. Your database now survives all future deploys.

---

### Step 4 — Set environment variables

1. In your Railway service, go to the **Variables** tab
2. Click **New Variable** and add each of these:

| Variable | Value |
|----------|-------|
| `ADMIN_PASSWORD` | `YourStrongPasswordHere` |
| `COMPANY_NAME` | `SNP Dispatch` |
| `DOMAIN` | `snpdispatch.com` |

> **Do not add `PORT`** — Railway sets this automatically.

Railway will redeploy once more after you save variables.

---

### Step 5 — Connect your custom domain

1. In your Railway service, go to the **Settings** tab
2. Scroll to **Networking → Custom Domain**
3. Click **Add Custom Domain**
4. Type `snpdispatch.com` → click **Add**
5. Railway shows you a CNAME target, something like:
   ```
   CNAME → snpdispatch.up.railway.app
   ```
6. Also add `www.snpdispatch.com` as a second custom domain

---

### Step 6 — Update your DNS at your registrar

Log in to where you bought `snpdispatch.com` and update the DNS records:

| Type  | Name  | Value                              | TTL  |
|-------|-------|------------------------------------|------|
| CNAME | `@`   | `snpdispatch.up.railway.app`       | 3600 |
| CNAME | `www` | `snpdispatch.up.railway.app`       | 3600 |

> **Note:** Some registrars don't allow a CNAME on `@` (the root domain). If yours doesn't, look for an **ALIAS** or **ANAME** record type instead — it does the same thing. Namecheap calls it `ALIAS`, Cloudflare supports `CNAME` on root.

DNS changes take 15 minutes to a few hours. Check progress at [dnschecker.org](https://dnschecker.org).

---

### Step 7 — HTTPS (automatic — nothing to do)

Railway provisions a free SSL certificate via Let's Encrypt automatically as soon as your DNS points to them. Once DNS propagates, `https://snpdispatch.com` will just work.

---

### Step 8 — Verify everything

| Check | Expected |
|-------|----------|
| `https://snpdispatch.com` | Booking app loads |
| `https://www.snpdispatch.com` | Same app |
| Click **Admin** in nav | Login screen |
| Login with your password | Dashboard with bookings |
| Book a slot, redeploy, check again | Booking still there (Volume working) |

---

## Making changes after deploy

Edit any file locally, then:

```bash
git add .
git commit -m "describe your change"
git push
```

Railway detects the push and redeploys automatically. Zero downtime during redeploy.

---

## Day-to-day management

**View logs** — Railway dashboard → your service → **Logs** tab (live streaming)

**View/edit bookings directly** — Railway dashboard → your service → **Volumes** tab → click the volume → you can browse files. Or use the Railway CLI:

```bash
# Install Railway CLI
npm install -g @railway/cli   # or: brew install railway

# Connect
railway login
railway link    # select your project

# Open a shell on your running service
railway run bash

# Then inside the shell:
sqlite3 /data/bookings.db "SELECT * FROM bookings ORDER BY date, slot_number;"
```

**Change admin password** — Railway dashboard → Variables tab → update `ADMIN_PASSWORD` → Railway redeploys automatically.

---

## Troubleshooting

**App not starting after deploy:**
- Check the **Logs** tab in Railway for the exact error
- Make sure `railway.toml` is in the root of your repo

**Bookings disappearing after redeploy:**
- Volume is not set up → go back to Step 3
- Check that `RAILWAY_VOLUME_MOUNT_PATH` shows `/data` in your service logs on startup

**Domain not loading:**
- DNS hasn't propagated yet — wait and check [dnschecker.org](https://dnschecker.org)
- Make sure you used CNAME (not A record) in your DNS settings

**`www` not working:**
- Add `www.snpdispatch.com` as a separate custom domain in Railway (Step 5)

---

## File structure

```
shipping-slots-v2/
├── server.py       ← Python backend
├── index.html      ← React frontend (served by Python)
├── railway.toml    ← Railway deploy config
├── .gitignore      ← keeps bookings.db out of git
└── README.md
```

The `bookings.db` database lives at `/data/bookings.db` on Railway (persistent volume) and in the same folder as `server.py` when running locally.
