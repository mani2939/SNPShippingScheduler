"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { addressFields, type Address, type SavedAddress } from "../lib/address-fields";

export function AddressBlock({ address }: { address: Address }) {
  return <address style={{ fontStyle: "normal" }}>
    {addressFields.map(({ key }) => address[key] && <div key={key}>{address[key]}</div>)}
  </address>;
}

const endpoint = "/api/customer/addresses";

export default function CustomerAddresses() {
  const addressForm = useRef<HTMLFormElement>(null);
  const [postcode, setPostcode] = useState("");
  const [suggestions, setSuggestions] = useState<Omit<Address, "recipient" | "country">[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
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

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLookupBusy(true);
    setSuggestions([]);
    setLookupMessage("");
    try {
      const response = await fetch(`${endpoint}/lookup?postcode=${encodeURIComponent(postcode)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setSuggestions(data.suggestions);
      if (!data.suggestions.length) setLookupMessage("No addresses found. Enter the address below.");
    } catch (error) {
      setLookupMessage(error instanceof Error ? error.message : "Lookup failed. Enter the address below.");
    } finally {
      setLookupBusy(false);
    }
  }

  function chooseAddress(index: number) {
    const suggestion = suggestions[index];
    if (!suggestion) return;
    for (const [key, value] of Object.entries(suggestion)) {
      const input = addressForm.current?.elements.namedItem(key);
      if (input instanceof HTMLInputElement) input.value = value;
    }
    setSuggestions([]);
    setLookupMessage("Address filled in. Check the details before saving.");
    const line1 = addressForm.current?.elements.namedItem("line1");
    if (line1 instanceof HTMLInputElement) line1.focus();
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
      <form className="panel order-create" onSubmit={lookup}>
        <h2>Find a UK address</h2>
        <label htmlFor="postcode-lookup">UK postcode</label>
        <input id="postcode-lookup" value={postcode} maxLength={12} required disabled={lookupBusy || busy}
          placeholder="e.g. S1 2HH" onChange={event => {
            setPostcode(event.target.value);
            setSuggestions([]);
            setLookupMessage("");
          }} />
        <button className="secondary" disabled={lookupBusy || busy}>{lookupBusy ? "Searching…" : "Find address"}</button>
        {suggestions.length > 0 && <div>
          <label htmlFor="address-results">Select your address</label>
          <select id="address-results" value="" disabled={busy} onChange={event => chooseAddress(Number(event.target.value))}>
            <option value="" disabled>Choose from {suggestions.length} results</option>
            {suggestions.map((address, index) => <option key={index} value={index}>
              {[address.line1, address.line2, address.city].filter(Boolean).join(", ")}
            </option>)}
          </select>
        </div>}
        {lookupMessage && <p role="status">{lookupMessage}</p>}
      </form>
      <form ref={addressForm} className="panel order-create" onSubmit={add}>
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
