"use client";
import { useEffect, useState } from "react";

export default function TikTokProfile({ endpoint = "/api/customer/profile", initialValue, admin = false }: { endpoint?: string; initialValue?: string | null; admin?: boolean }) {
  const [value, setValue] = useState(initialValue || "");
  const [loading, setLoading] = useState(initialValue === undefined);
  const [loaded, setLoaded] = useState(initialValue !== undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (initialValue !== undefined) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    void (async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "Could not load your profile.");
        if (!controller.signal.aborted) {setValue(data.customer.tiktok_id || ""); setLoaded(true);}
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load your profile."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [endpoint, initialValue, retry]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tiktokId: value }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not save TikTok ID.");
      setValue(data.customer.tiktok_id || ""); setSaved(true);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save TikTok ID."); }
    finally { setBusy(false); }
  }
  return <section className="panel order-summary">
    <h2>{admin ? "Customer TikTok ID" : "My profile"}</h2>
    <p className="muted">Add a TikTok username, with or without @. This is optional. Leave it blank to remove it.</p>
    {loading ? <p role="status">Loading profile…</p> : <form onSubmit={save}>
      <fieldset className="account-fields" disabled={busy || !loaded}>
        <label htmlFor="profile-tiktok">TikTok ID (optional)</label>
        <input id="profile-tiktok" value={value} onChange={event => {setValue(event.target.value); setSaved(false);}} maxLength={101} placeholder="@yourusername" autoCapitalize="none" spellCheck={false} />
        <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save TikTok ID"}</button>
      </fieldset>
    </form>}
    {error && <div role="alert" className="error">{error} <button type="button" className="secondary" onClick={() => {setError(""); setRetry(n => n + 1);}}>Try again</button></div>}
    {saved && <p role="status">TikTok ID saved.</p>}
  </section>;
}
