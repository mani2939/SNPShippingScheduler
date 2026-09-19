import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SNP Dispatch | Book your dispatch",
  description:
    "Sign in to book your shipment dispatch date on Monday, Wednesday or Friday.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
