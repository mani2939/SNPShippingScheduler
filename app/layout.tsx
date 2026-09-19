import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SNP Dispatch | Book your dispatch",
  description:
    "Choose an available shipment dispatch slot on Monday, Wednesday or Friday.",
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
