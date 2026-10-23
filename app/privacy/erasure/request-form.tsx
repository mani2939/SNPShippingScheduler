"use client";
import { useState } from "react";

export default function ErasureRequestForm({ pendingAt }: { pendingAt: string | null }) {
  const [requestedAt, setRequestedAt] = useState(pendingAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/gdpr", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json();
      if (response.status === 401) { window.location.assign("/account?next=/privacy/erasure"); return; }
      if (!response.ok) throw Error(data.error || "Could not submit your request.");
      setRequestedAt(data.requestedAt);
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return requestedAt ? (
    <div className="status-message" role="status">Your deletion request was received on {new Date(requestedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. An admin will review it and respond. Your account remains active until a decision is made.</div>
  ) : (
    <div>
      <p>Submitting this form asks SNP Dispatch to review erasure of your account and associated booking details. It does not delete your account immediately.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="primary" disabled={busy} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit deletion request"}</button>
    </div>
  );
}
