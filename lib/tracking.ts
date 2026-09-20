export function trackingNumber(value: unknown) {
  if (typeof value !== "string" || value.length > 100)
    throw Error("Enter a Royal Mail tracking number.");
  const number = value.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{8,35}$/.test(number))
    throw Error(
      "Enter a Royal Mail tracking number of 8–35 letters or numbers.",
    );
  return number;
}
export function trackingURL(number: string) {
  return `https://www.royalmail.com/portal/rm/track?trackNumber=${encodeURIComponent(number)}`;
}
