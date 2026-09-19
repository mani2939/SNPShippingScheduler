import { redirect } from "next/navigation";
import { getCustomer } from "../lib/customer-auth";
import BookingPage from "./booking";
export const dynamic = "force-dynamic";
export default async function Page() {
  const customer = await getCustomer();
  if (!customer) redirect("/account");
  return (
    <BookingPage customer={{ name: customer.name, email: customer.email }} />
  );
}
