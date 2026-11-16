import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Credit and Funding OS", description: "Free credit repair that leads to business funding." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
