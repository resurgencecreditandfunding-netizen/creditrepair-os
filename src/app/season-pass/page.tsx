import type { Metadata } from "next";
import Link from "next/link";
import { ConsoleBrand } from "@/components/ui";
import { LegalLinks } from "@/components/LegalLinks";
import { MetaPixel } from "@/components/MetaPixel";
import { PlanCards } from "@/components/PlanCards";

/** Private offer page shared on the webinar. Not linked from the site and kept out of search engines. */
export const metadata: Metadata = { title: "Season Pass", robots: { index: false, follow: false } };

const INCLUDED = [
  "Your logo and brand colors on everything your clients see, set up for you",
  "Your own client sign-up link and bulk client invites",
  "Three-bureau audits and law-based dispute letters in rounds, written by the platform",
  "Built-in CROA disclosures, e-signatures and the 3-day cancellation period",
  "Work queue, client files, deadline tracking and reading of bureau replies",
  "Automatic client reminders and follow-up emails",
  "Funding pipeline with revenue share on funded clients",
  "Priority support and community access",
];

export default function SeasonPass() {
  return (
    <>
      <header className="topbar"><div className="topbar-in"><ConsoleBrand /></div></header>
      <MetaPixel audience="operator" />
      <main className="wrap" style={{ maxWidth: 980 }}>
        <h1>The Leverage IQ Season Pass</h1>
        <p className="muted" style={{ maxWidth: 680 }}>Credit repair and business funding for your tax clients, under your brand. Choose how you want to start. Your clients are never charged by Leverage IQ.</p>
        <PlanCards href={(k) => `/console/signup?plan=${k}`} />
        <div className="card" style={{ marginTop: 24 }}>
          <h2>Every plan includes</h2>
          <ul>{INCLUDED.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <p className="fine">Season Pass: the setup fee is charged today and covers the full term. When the term ends, the $147/month support and community plan starts automatically unless you cancel before then, from your Billing page. Monthly plan: billed every month until you cancel. Setup fees are not refundable except where the law requires. Payments are handled by Stripe.</p>
        <p className="small muted">Already have a login? <Link href="/console/login">Sign in</Link> · <LegalLinks dark={false} /></p>
      </main>
    </>
  );
}
