export const addressFields = [
  { key: "recipient", label: "Recipient name", autoComplete: "shipping name", required: true },
  { key: "line1", label: "Address line 1", autoComplete: "shipping address-line1", required: true },
  { key: "line2", label: "Address line 2 (optional)", autoComplete: "shipping address-line2", required: false },
  { key: "city", label: "Town or city", autoComplete: "shipping address-level2", required: true },
  { key: "region", label: "County or region (optional)", autoComplete: "shipping address-level1", required: false },
  { key: "postcode", label: "UK postcode", autoComplete: "shipping postal-code", required: true },
  { key: "country", label: "Country", autoComplete: "shipping country-name", required: true },
] as const;

export type Address = Record<(typeof addressFields)[number]["key"], string>;
export type SavedAddress = { id: string; address: Address; is_default: boolean };

export function ukPostcode(value: string) {
  const compact = value.toUpperCase().replace(/\s/g, "");
  if (!/^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/.test(compact)) return null;
  return compact.slice(0, -3) + " " + compact.slice(-3);
}
