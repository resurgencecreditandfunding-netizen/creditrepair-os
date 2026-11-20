import type { Metadata } from "next";
import { optInDemo } from "@/app/actions";
import { ConsoleBrand, Flash } from "@/components/ui";
import { LegalLinks } from "@/components/LegalLinks";
import { MetaPixel } from "@/components/MetaPixel";
import { SubmitButton } from "@/components/SubmitButton";
import { KINDS } from "@/lib/demo";

export const metadata: Metadata = { title: "Watch the demo", robots: { index: false, follow: false } };

/** Ad landing page for professionals: a short opt-in, then the demo video. */
export default async function Demo({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <header className="topbar"><div className="topbar-in"><ConsoleBrand /></div></header>
      <MetaPixel audience="operator" />
      <main className="wrap" style={{ maxWidth: 560 }}>
        <p className="label" style={{ color: "var(--accent)" }}>For tax professionals</p>
        <h1>See how tax pros add credit repair and business funding, under their own brand</h1>
        <p className="muted">Watch the full platform demo: your clients upload their credit report, the platform audits it and writes the dispute letters, and you guide them to funding. Tell us where to send it.</p>
        <Flash error={error} />
        <form action={optInDemo} className="card">
          <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" type="text" required autoComplete="name" /></div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
          <div className="field"><label htmlFor="phone">Mobile <span className="muted">(optional)</span></label><input id="phone" name="phone" type="tel" autoComplete="tel" /></div>
          <div className="field"><label htmlFor="kind">Your business</label>
            <select id="kind" name="kind" defaultValue="tax_pro">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <SubmitButton pending="Opening the demo…" className="btn accent big" style={{ width: "100%" }}>Watch the demo now</SubmitButton>
          <p className="fine" style={{ margin: "10px 0 0" }}>We&apos;ll email you about the demo and Leverage IQ. Unsubscribe any time. We never sell your information.</p>
        </form>
        <p className="small muted"><LegalLinks dark={false} /></p>
      </main>
    </>
  );
}
