#!/usr/bin/env python3
"""
SNP Dispatch — Shipping Slot Booking Server
Hosted on Railway. Configuration is via environment variables set in the
Railway dashboard (not hardcoded here).
"""

import os

# ══════════════════════════════════════════════════════════════════════
#  CONFIGURATION — set these as Environment Variables in Railway
#  (they fall back to safe defaults for local development)
# ══════════════════════════════════════════════════════════════════════
PORT           = int(os.environ.get("PORT", 3000))        # Railway sets PORT automatically
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "changeme123")
COMPANY_NAME   = os.environ.get("COMPANY_NAME", "SNP Dispatch")
DOMAIN         = os.environ.get("DOMAIN", "snpdispatch.com")

# Railway persistent volume mounts at /data when configured.
# Falls back to the app directory for local development.
DATA_DIR       = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH",
                                os.path.dirname(os.path.abspath(__file__)))

# Monday slots (8 slots)
MONDAY_SLOTS = [
    {"number": 1},  {"number": 2},  {"number": 3},  {"number": 4},
    {"number": 5},  {"number": 6},  {"number": 7},  {"number": 8},
]

# Thursday slots (10 slots)
THURSDAY_SLOTS = [
    {"number": 1},  {"number": 2},  {"number": 3},  {"number": 4},
    {"number": 5},  {"number": 6},  {"number": 7},  {"number": 8},
    {"number": 9},  {"number": 10},
]

SLOT_CONFIG = {0: MONDAY_SLOTS, 3: THURSDAY_SLOTS}  # 0=Mon, 3=Thu in weekday()
# ══════════════════════════════════════════════════════════════════════

import json
import secrets
import sqlite3
import sys
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

DB_PATH = os.path.join(DATA_DIR, "bookings.db")

# In-memory session store {token: expiry_datetime}
SESSIONS = {}

# ── Database ──────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=DELETE")  # use standard journal (WAL needs OS support)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS bookings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            date        TEXT    NOT NULL,
            slot_number INTEGER NOT NULL,
            slot_label  TEXT    NOT NULL,
            created_at  TEXT    DEFAULT (datetime('now')),
            UNIQUE(date, slot_number)
        )
    """)
    conn.commit()
    return conn

def row_to_dict(row):
    return dict(row) if row else None

# ── Slot helpers ──────────────────────────────────────────────────────────
def get_upcoming_dates(weeks=8):
    results = []
    today = datetime.now().date()
    for i in range(weeks * 7):
        d = today + timedelta(days=i)
        wd = d.weekday()
        if wd in SLOT_CONFIG:
            results.append({
                "date":       d.isoformat(),
                "dayName":    "Monday" if wd == 0 else "Thursday",
                "totalSlots": len(SLOT_CONFIG[wd]),
            })
    return results

def get_slots_for_date(date_str):
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return None
    wd = d.weekday()
    slot_defs = SLOT_CONFIG.get(wd)
    if slot_defs is None:
        return None
    conn = get_db()
    rows = conn.execute(
        "SELECT slot_number, name FROM bookings WHERE date = ?", (date_str,)
    ).fetchall()
    conn.close()
    booked = {r["slot_number"]: r["name"] for r in rows}
    return [
        {
            "number":   s["number"],
            "booked":   s["number"] in booked,
            "bookedBy": booked.get(s["number"]),
        }
        for s in slot_defs
    ]

# ── Session helpers ───────────────────────────────────────────────────────
def create_session():
    token = secrets.token_hex(32)
    SESSIONS[token] = datetime.now() + timedelta(hours=12)
    return token

def is_valid_session(token):
    if not token or token not in SESSIONS:
        return False
    if datetime.now() > SESSIONS[token]:
        del SESSIONS[token]
        return False
    return True

# ── HTTP Handler ──────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        sys.stdout.write(f"  {self.address_string()} {fmt % args}\n")

    # ── helpers ───────────────────────────────────────────────────────
    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        origin = self.headers.get("Origin", "")
        allowed = {f"https://{DOMAIN}", f"https://www.{DOMAIN}", "http://localhost:3000"}
        cors_origin = origin if origin in allowed else f"https://{DOMAIN}"
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", cors_origin)
        self.end_headers()
        self.wfile.write(body)

    def send_err(self, msg, status=400):
        self.send_json({"error": msg}, status)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length))
        except Exception:
            return {}

    def get_token(self):
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:]
        return None

    def require_admin(self):
        if not is_valid_session(self.get_token()):
            self.send_err("Unauthorised", 401)
            return False
        return True

    def serve_html(self):
        html_path = os.path.join(os.path.dirname(__file__), "index.html")
        if not os.path.exists(html_path):
            self.send_err("index.html not found", 404)
            return
        with open(html_path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── routing ───────────────────────────────────────────────────────
    def do_OPTIONS(self):
        origin = self.headers.get("Origin", "")
        allowed = {f"https://{DOMAIN}", f"https://www.{DOMAIN}", "http://localhost:3000"}
        cors_origin = origin if origin in allowed else f"https://{DOMAIN}"
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", cors_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        p = urlparse(self.path)
        path = p.path
        qs = parse_qs(p.query)

        if path == "/api/config":
            self.send_json({"companyName": COMPANY_NAME})

        elif path == "/api/dates":
            self.send_json(get_upcoming_dates())

        elif path.startswith("/api/slots/"):
            date_str = path[len("/api/slots/"):]
            slots = get_slots_for_date(date_str)
            if slots is None:
                self.send_err("Not a Monday or Thursday", 400)
            else:
                self.send_json(slots)

        elif path == "/api/admin/bookings":
            if not self.require_admin(): return
            date_filter = qs.get("date", [None])[0]
            conn = get_db()
            if date_filter:
                rows = conn.execute(
                    "SELECT * FROM bookings WHERE date=? ORDER BY slot_number",
                    (date_filter,)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM bookings ORDER BY date, slot_number"
                ).fetchall()
            conn.close()
            self.send_json([dict(r) for r in rows])

        elif path == "/api/admin/summary":
            if not self.require_admin(): return
            dates = get_upcoming_dates()
            conn = get_db()
            counts = {}
            for row in conn.execute("SELECT date, COUNT(*) as c FROM bookings GROUP BY date").fetchall():
                counts[row["date"]] = row["c"]
            conn.close()
            summary = [
                {**d, "booked": counts.get(d["date"], 0),
                       "available": d["totalSlots"] - counts.get(d["date"], 0)}
                for d in dates
            ]
            self.send_json(summary)

        else:
            self.serve_html()

    def do_POST(self):
        path = urlparse(self.path).path
        body = self.read_body()

        if path == "/api/bookings":
            name = (body.get("name") or "").strip()
            date = body.get("date", "")
            slot_number = body.get("slot_number")

            if not name:
                return self.send_err("Name is required")
            if not date:
                return self.send_err("Date is required")
            if not isinstance(slot_number, int):
                return self.send_err("Slot number is required")

            slots = get_slots_for_date(date)
            if slots is None:
                return self.send_err("Invalid date — must be a Monday or Thursday")
            slot = next((s for s in slots if s["number"] == slot_number), None)
            if slot is None:
                return self.send_err("Slot number out of range")
            if slot["booked"]:
                return self.send_err("That slot is already taken", 409)

            conn = get_db()
            try:
                cur = conn.execute(
                    "INSERT INTO bookings (name, date, slot_number, slot_label) VALUES (?,?,?,?)",
                    (name, date, slot_number, f"Slot {slot_number}")
                )
                conn.commit()
                row = conn.execute("SELECT * FROM bookings WHERE id=?", (cur.lastrowid,)).fetchone()
                self.send_json(dict(row), 201)
            except sqlite3.IntegrityError:
                self.send_err("That slot was just taken — please pick another", 409)
            finally:
                conn.close()

        elif path == "/api/admin/login":
            if body.get("password") == ADMIN_PASSWORD:
                token = create_session()
                self.send_json({"token": token})
            else:
                self.send_err("Incorrect password", 401)

        else:
            self.send_err("Not found", 404)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if not self.require_admin(): return

        if path.startswith("/api/admin/bookings/"):
            try:
                booking_id = int(path.split("/")[-1])
            except ValueError:
                return self.send_err("Invalid booking ID")
            conn = get_db()
            result = conn.execute("DELETE FROM bookings WHERE id=?", (booking_id,))
            conn.commit()
            conn.close()
            if result.rowcount == 0:
                self.send_err("Booking not found", 404)
            else:
                self.send_json({"success": True})
        else:
            self.send_err("Not found", 404)


# ── Main ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Initialise DB
    conn = get_db()
    conn.close()

    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"\n✅  {COMPANY_NAME} — Slot Booking Server")
    print(f"    Local :  http://localhost:{PORT}")
    print(f"    Live  :  https://{DOMAIN}")
    print(f"    Admin password : {ADMIN_PASSWORD}")
    print(f"    Database       : {DB_PATH}")
    print(f"\n    Edit the CONFIG section at the top of server.py to change settings.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
