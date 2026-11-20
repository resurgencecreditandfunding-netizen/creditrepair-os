import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ConsoleBrand } from "@/components/ui";
import { LegalLinks } from "@/components/LegalLinks";
import { MetaPixel } from "@/components/MetaPixel";
import { PlanCards } from "@/components/PlanCards";
import { Vsl } from "@/components/Vsl";
import { DEMO_COOKIE, getLead, revealAt } from "@/lib/demo";

export const metadata: Metadata = { title: "Leverage IQ demo", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STACK = [
  ["Your own branded platform", "Your logo and colors on everything your clients see, set up for you."],
  ["The audit and the letters, done by the platform", "Three-bureau audits and law-based dispute letters in rounds, in the right order."],
  ["Compliance built in", "CROA disclosures, e-signatures, the 3-day cancellation period and a full activity record."],
  ["Your clients do the legwork", "They upload reports, approve and mail letters. Automatic reminders keep them moving."],
  ["A path to funding", "When scores improve, clients move into the funding pipeline, with revenue share for you."],
  ["Priority support and community", "Help when you need it during the season, and a room full of pros doing the same work."],
];

/** The demo video. The offer appears under it once the viewer reaches the reveal point. */
export default async function Watch() {
  const lead = getLead((await cookies()).get(DEMO_COOKIE)?.value);
  if (!lead) redirect("/demo");
  const url = process.env.VSL_URL?.trim();
  const offer = (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ textAlign: "center" }}>Everything you get</h2>
      <div className="card">
        {STACK.map(([h, p]) => <div key={h} style={{ padding: "8px 0", borderBottom: "1px solid var(--gray-2)" }}><strong>✓ {h}</strong><div className="small muted">{p}</div></div>)}
      </div>
      <h2 style={{ textAlign: "center", marginTop: 24 }}>Choose how you start</h2>
      <PlanCards href={(k) => `/console/signup?plan=${k}`} />
      <p className="fine" style={{ marginTop: 14 }}>Season Pass: the setup fee is charged today and covers the full term. When the term ends, the $147/month support and community plan starts automatically unless you cancel before then. Monthly plan: billed every month until you cancel. Setup fees are not refundable except where the law requires. Your clients are never charged by Leverage IQ.</p>
    </section>
  );
  return (
    <>
      <header className="topbar"><div className="topbar-in"><ConsoleBrand /></div></header>
      <MetaPixel audience="operator" />
      <main className="wrap" style={{ maxWidth: 900 }}>
        <h1 style={{ textAlign: "center" }}>{lead.name.split(" ")[0]}, here&apos;s the full demo</h1>
        <p className="muted" style={{ textAlign: "center" }}>Turn your sound on. Watch how a client goes from credit report to dispute letters to funding, with your name on it.</p>
        {url ? <Vsl url={url} revealAt={revealAt()}>{offer}</Vsl> : (<><div className="notice">The demo video is being uploaded. In the meantime, here are the options.</div>{offer}</>)}
        <p className="small muted" style={{ marginTop: 24 }}><LegalLinks dark={false} /></p>
      </main>
    </>
  );
}
