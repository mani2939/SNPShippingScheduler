import { databaseURL } from "./database-url.mjs";
import { Pool, type PoolClient } from "pg";
import { defaults, dispatchDates, type Settings } from "./schedule";
const globalDB = globalThis as unknown as { snpPool?: Pool };
export function pool() {
  if (!process.env.SNP_DATABASE_URL) throw new Error("Database is not configured.");
  return (globalDB.snpPool ??= new Pool({
    connectionString: databaseURL(process.env.SNP_DATABASE_URL),
    max: 3,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
  }));
}
export async function transaction<T>(fn: (db: PoolClient) => Promise<T>) {
  const db = await pool().connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function getSettings() {
  const result = await pool().query("SELECT value FROM settings WHERE id=1");
  return (result.rows[0]?.value || defaults) as Settings;
}
export async function availability() {
  const demo = !process.env.SNP_DATABASE_URL;
  const settings = demo ? defaults : await getSettings();
  const dates = dispatchDates(settings);
  let taken: { dispatch_date: string; slot: string }[] = [];
  if (!demo) {
    const r = await pool().query(
      "SELECT dispatch_date,slot FROM bookings WHERE status <> 'cancelled' AND dispatch_date >= $1 UNION SELECT dispatch_date,slot FROM blocked_slots WHERE dispatch_date >= $1",
      [dates[0]],
    );
    taken = r.rows;
  }
  return {
    demo,
    settings,
    days: dates.map((date) => ({
      date,
      slots: settings.slots.map((s) => ({
        id: s.id,
        remaining: taken.some(
          (t) => t.dispatch_date === date && t.slot === s.id,
        )
          ? 0
          : 1,
      })),
    })),
  };
}
export async function rateLimit(key: string, max: number, seconds: number) {
  const r = await pool().query(
    `INSERT INTO rate_limits(key,hits,expires_at) VALUES($1,1,now()+($2 * interval '1 second')) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+($2 * interval '1 second') ELSE rate_limits.expires_at END RETURNING hits`,
    [key, seconds],
  );
  return r.rows[0].hits <= max;
}
