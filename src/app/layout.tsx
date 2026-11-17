import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Leverage IQ", description: "Funding the smart way. Fix what is wrong on your credit, then get funded." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
