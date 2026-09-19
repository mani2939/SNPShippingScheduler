import type { Metadata } from "next";
import AccountForm from "./account-form";
export const metadata: Metadata = {
  title: "Your account | SNP Dispatch",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; token?: string }>;
}) {
  const query = await searchParams;
  return (
    <AccountForm
      initialMode={query.mode || "login"}
      initialToken={typeof query.token === "string" ? query.token : ""}
    />
  );
}
