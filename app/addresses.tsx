"use client";

import { useEffect, useState, type FormEvent } from "react";
import { addressFields, type Address, type SavedAddress } from "../lib/address-fields";

export function AddressBlock({ address }: { address: Address }) {
  return <address style={{ fontStyle: "normal" }}>
    {addressFields.map(({ key }) => address[key] && <div key={key}>{address[key]}</div>)}
  </address>;
}

const endpoint = "/api/customer/addresses";

export default function CustomerAddresses() {
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        setAddresses(data.addresses);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load addresses.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  async function save(input: object, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setAddresses(data.addresses);
      setMessage(success);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the address.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const input = Object.fromEntries(fields);
    if (await save({ ...input, action: "add", makeDefault: fields.has("makeDefault") }, "Address saved.")) form.reset();
  }

  return <>
    <div className="page-intro">
      <div><div className="eyebrow">YOUR ACCOUNT</div><h1>Addresses</h1><p>Your default address is used when SNP Dispatch records a new order.</p></div>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="status-message" role="status">{message}</p>}
    {addresses === null && !error && <p role="status">Loading addresses…</p>}
    {addresses !== null && <>
      {addresses.length === 0 && <p>No saved addresses yet. Your first address will become the default.</p>}
      <div className="address-list">
        {addresses.map(({ id, address, is_default }) => <section className="panel order-summary" key={id}>
          {is_default && <p><span className="badge confirmed">Default address</span></p>}
          <AddressBlock address={address} />
          {!is_default && <button type="button" className="secondary" disabled={busy}
            aria-label={`Make ${address.line1}, ${address.city} the default address`}
            onClick={() => void save({ action: "default", id }, "Default address updated.")}>Make default</button>}
        </section>)}
      </div>
      <form className="panel order-create" onSubmit={add}>
        <h2>Add an address</h2>
        <div className="address-fields">
          {addressFields.filter(({ key }) => key !== "recipient").map(({ key, label, autoComplete, required }) => <div key={key}>
            <label htmlFor={`address-${key}`}>{label}</label>
            <input id={`address-${key}`} name={key} autoComplete={autoComplete} maxLength={150}
              required={required} disabled={busy} readOnly={key === "country"} defaultValue={key === "country" ? "United Kingdom" : undefined} />
          </div>)}
        </div>
        {addresses.length > 0 && <p><label><input type="checkbox" name="makeDefault" disabled={busy} /> Make this my default address</label></p>}
        <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save address"}</button>
      </form>
    </>}
  </>;
}
