import Link from "next/link";
import { MetaPixel } from "@/components/MetaPixel";
import { LegalLinks } from "@/components/LegalLinks";
import { registerCompany } from "@/app/console/actions";
import { Flash, ConsoleBrand } from "@/components/ui";
import { billingConfigured, isPlan, PLANS } from "@/lib/billing";
import { cookies } from "next/headers";
import { DEMO_COOKIE, getLead } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string; plan?: string }> }) {
  const { error, plan } = await searchParams;
  const chosen = isPlan(plan) ? PLANS[plan] : null;
  const lead = getLead((await cookies()).get(DEMO_COOKIE)?.value);
  const open = billingConfigured();
  return (
    <>
      <header className="topbar"><div className="topbar-in"><ConsoleBrand /></div></header>
      <MetaPixel audience="operator" />
      <main className="wrap narrow">
        <h1>Offer credit repair and funding to your clients</h1>
        <p className="muted">For tax professionals, funding professionals, and credit repair firms. Your clients are never charged by us.</p>
        <Flash error={error} />
        {!open ? <div className="notice">Sign-up is not open yet.</div> : (
          <form action={registerCompany} className="card">
            {chosen && <><input type="hidden" name="plan" value={plan} /><div className="notice">Your plan: <strong>{chosen.name}</strong>, {chosen.price}. You pay on the next page.</div></>}
            <h2>Your company</h2>
            <div className="field"><label htmlFor="company">Name your clients will see</label><input id="company" name="company" type="text" required /></div>
            <div className="field"><label htmlFor="legalName">Legal company name</label><input id="legalName" name="legalName" type="text" required /></div>
            <div className="field"><label htmlFor="address">Principal business address</label><input id="address" name="address" type="text" required /></div>
            <p className="fine">The legal name and address are printed on the agreement your clients sign. Federal law requires them.</p>
            <div className="field"><label htmlFor="kind">Type of business</label>
              <select id="kind" name="kind" defaultValue={lead?.kind ?? (chosen ? "tax_pro" : "credit_repair")}><option value="credit_repair">Credit repair firm</option><option value="tax_pro">Tax professional</option><option value="funding_pro">Funding professional</option></select></div>
            <h2 style={{ marginTop: 20 }}>Your login</h2>
            <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" type="text" required autoComplete="name" defaultValue={lead?.name} /></div>
            <div className="field"><label htmlFor="email">Work email</label><input id="email" name="email" type="email" required autoComplete="username" defaultValue={lead?.email} /></div>
            <div className="field"><label htmlFor="password">Password (10 or more characters)</label><input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
            <label className="check"><input type="checkbox" name="terms" required /><span>My company will follow the laws that apply to it, including the Credit Repair Organizations Act and my state's rules. We will not charge a client before services are fully performed, and we will dispute only information the client believes is inaccurate.</span></label>
            <p className="small muted" style={{ margin: "4px 0 14px" }}>By continuing, you agree to our <Link href="/terms">Terms of use</Link>, including the operator terms in section 5, and acknowledge our <Link href="/privacy">Privacy policy</Link>.</p>
            <button className="btn accent big" type="submit">Continue to payment</button>
          </form>
        )}
        <p className="small muted">Already have a login? <Link href="/console/login">Sign in</Link> · <Link href="/partners">See how Leverage IQ works</Link> · <LegalLinks dark={false} /></p>
      </main>
    </>
  );
}
