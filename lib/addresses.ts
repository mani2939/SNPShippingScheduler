import { randomUUID } from "node:crypto";
import type { CustomerDB } from "./customer-store.ts";

import { ukPostcode, addressFields, type Address, type SavedAddress } from "./address-fields.ts";

export async function customerAddresses(db: CustomerDB, customerId: string): Promise<SavedAddress[]> {
  const { rows } = await db.query(
    "SELECT id,address,is_default FROM customer_addresses WHERE customer_id=$1 ORDER BY is_default DESC,created_at,id",
    [customerId],
  );
  return rows;
}

// The caller runs this in a transaction. The customer lock serializes default changes.
export async function saveCustomerAddress(db: CustomerDB, customerId: string, input: Record<string, unknown>) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Choose an address action.");
  const customer = await db.query("SELECT id FROM customers WHERE id=$1 FOR UPDATE", [customerId]);
  if (!customer.rows.length) throw Error("Customer account not found.");

  if (input.action === "default") {
    if (typeof input.id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.id)) {
      throw Error("Choose a saved address.");
    }
    const addresses = await customerAddresses(db, customerId);
    const selected = addresses.find(address => address.id === input.id);
    if (!selected) throw Error("Choose a saved address.");
    if (!selected.is_default) {
      await db.query("UPDATE customer_addresses SET is_default=false WHERE customer_id=$1 AND is_default", [customerId]);
      await db.query("UPDATE customer_addresses SET is_default=true WHERE customer_id=$1 AND id=$2", [customerId, input.id]);
    }
  } else if (input.action === "add") {
    const address = {} as Address;
    for (const field of addressFields) {
      const raw = input[field.key];
      const value = typeof raw === "string" ? raw.trim() : "";
      if ((field.required && !value) || value.length > 150 || /[\u0000-\u001f\u007f]/.test(value)) {
        throw Error(`Check the ${field.label.toLowerCase()} field.`);
      }
      address[field.key] = value;
    }
    const postcode = ukPostcode(address.postcode);
    if (!postcode) throw Error("Check the UK postcode field.");
    address.postcode = postcode;
    address.country = "United Kingdom";
    const addresses = await customerAddresses(db, customerId);
    if (addresses.length >= 20) throw Error("You can save up to 20 addresses.");
    const makeDefault = input.makeDefault === true || addresses.length === 0;
    if (makeDefault) {
      await db.query("UPDATE customer_addresses SET is_default=false WHERE customer_id=$1 AND is_default", [customerId]);
    }
    await db.query("INSERT INTO customer_addresses(id,customer_id,address,is_default) VALUES($1,$2,$3,$4)",
      [randomUUID(), customerId, address, makeDefault]);
  } else {
    throw Error("Choose an address action.");
  }
  return customerAddresses(db, customerId);
}
