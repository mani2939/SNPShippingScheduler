"use client";

import { useState } from "react";
import type { DispatchKind } from "../lib/customer-cancellation";

export default function CancelDispatch({
  reference,
  kind = "booking",
  onCancelled,
}: {
  reference: string;
  kind?: DispatchKind;
  onCancelled: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);

  async function cancel() {
    const question = kind === "urgent"
      ? `Withdraw urgent request ${reference}? You can submit another request afterwards.`
      : `Cancel dispatch ${reference}? Your reserved place will be released and you can book again.`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/customer/cancellations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, reference }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not cancel your request.");
      setCancelled(true);
      await onCancelled();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not cancel your request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="customer-cancel-dispatch">
    {cancelled ? <p role="status">Request {reference} cancelled. You can book another dispatch.</p> :
      <button type="button" className="secondary" disabled={busy}
        aria-label={`${kind === "urgent" ? "Withdraw urgent request" : "Cancel dispatch"} ${reference}`}
        onClick={() => void cancel()}>
        {busy ? "Cancelling…" : kind === "urgent" ? "Withdraw request" : "Cancel dispatch"}
      </button>}
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}
