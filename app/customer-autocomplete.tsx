"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CustomerOption = { id: string; name: string; email: string };
type Props = {
  customers: CustomerOption[];
  value: string;
  onChange: (customerId: string) => void;
  disabled?: boolean;
};

export default function CustomerAutocomplete({ customers, value, onChange, disabled = false }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = customers.find(customer => customer.id === value);
  const search = selected ? "" : query.trim().toLowerCase();
  const matches = useMemo(() => {
    const terms = search.split(/\s+/).filter(Boolean);
    return customers.filter(customer => {
      const text = `${customer.name} ${customer.email}`.toLowerCase();
      return terms.every(term => text.includes(term));
    });
  }, [customers, search]);
  const suggestions = matches.slice(0, 8);
  const expanded = open && !disabled;
  const activeOption = expanded && suggestions[active] ? active : -1;

  useEffect(() => {
    input.current?.setCustomValidity(selected ? "" : "Select a customer from the suggestions.");
  }, [selected]);
  useEffect(() => {
    if (activeOption >= 0) list.current?.children[activeOption]?.scrollIntoView({ block: "nearest" });
  }, [activeOption]);

  function choose(customer: CustomerOption) {
    onChange(customer.id);
    setQuery("");
    setOpen(false);
    setActive(-1);
  }

  return <div className="customer-autocomplete" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
      setActive(-1);
    }
  }}>
    <label htmlFor="order-customer">Customer</label>
    <div className="customer-autocomplete-control">
    <input ref={input} id="order-customer" role="combobox" type="text" required disabled={disabled}
      autoComplete="off" spellCheck={false} placeholder="Type a customer name or email"
      value={selected ? `${selected.name} · ${selected.email}` : query}
      aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={expanded}
      aria-controls={expanded ? "order-customer-options" : undefined}
      aria-activedescendant={activeOption >= 0 ? `order-customer-option-${activeOption}` : undefined}
      aria-describedby="order-customer-help"
      onFocus={() => { setOpen(true); setActive(-1); }}
      onChange={event => { setQuery(event.target.value); onChange(""); setOpen(true); setActive(-1); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
          setActive(previous => {
            if (!suggestions.length) return -1;
            if (!expanded) return event.key === "ArrowDown" ? 0 : suggestions.length - 1;
            return event.key === "ArrowDown"
              ? Math.min(previous + 1, suggestions.length - 1)
              : previous <= 0 ? suggestions.length - 1 : previous - 1;
          });
        } else if (event.key === "Enter" && activeOption >= 0) {
          event.preventDefault();
          choose(suggestions[activeOption]);
        } else if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          setActive(-1);
        }
      }} />
    {expanded && <div className="customer-suggestions">
      <ul ref={list} id="order-customer-options" role="listbox" aria-label="Matching customers">
        {suggestions.map((customer, index) => <li key={customer.id} role="option"
          id={`order-customer-option-${index}`} aria-selected={activeOption === index}
          className={activeOption === index ? "is-active" : undefined}
          onPointerDown={event => event.preventDefault()}
          onClick={() => choose(customer)}>
          <strong>{customer.name}</strong><span>{customer.email}</span>
        </li>)}
      </ul>
      <p role="status">{!matches.length ? "No customers found. Try another name or email."
        : matches.length > 8 ? `Showing 8 of ${matches.length} customers. Keep typing to narrow your search.`
        : `${matches.length} customer${matches.length === 1 ? "" : "s"} found.`}</p>
    </div>}
    </div>
    <p id="order-customer-help" className="customer-autocomplete-help">Search by name or email, then select a customer. Use ↑ ↓ and Enter to select.</p>
  </div>;
}
