import Link from "next/link";
import { TopBar } from "@/components/ui";
import { PRODUCT, TAGLINE } from "@/lib/brand";
import { brandBar, tenantForVisit } from "@/lib/branding";
import { priceLabel } from "@/lib/paywall";
import { priceAtSigning } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const tenant = await tenantForVisit(t);
  const price = priceAtSigning(tenant.id);
  const paid = price > 0;
  const start = tenant.id !== "tenant_default" ? `/start?t=${encodeURIComponent(tenant.slug)}` : "/start";
  return (
    <>
      {tenant.id !== "tenant_default" && <TopBar {...brandBar(tenant)} nav={false} />}
      <section className="hero">
        <div className="hero-in">
          {tenant.id === "tenant_default" && <img className="hero-logo" src="/logo.png" alt={`${PRODUCT}. ${TAGLINE}.`} width={1200} height={247} />}
          <h1>Fix what is wrong on your credit. <em>Then get funded.</em></h1>
          <p>{paid
            ? <>We find the errors on your credit reports, write each dispute in your name, and track every deadline. <strong style={{ color: "#fff" }}>Free to start:</strong> your audit, your list of errors and a preview of your letters cost nothing. When your letters are ready, unlock them once for {priceLabel(price)}. When your score improves, your business funding options open.</>
            : "We find the errors on your credit reports, prepare each dispute in your name, and track every deadline. It costs you nothing. When your score improves, your business funding options open."}</p>
          <div className="row"><Link href={start} className="btn accent big">Start free</Link><Link href="/login" className="btn big" style={{ background: "transparent", color: "#fff", borderColor: "#52525b" }}>Sign in</Link></div>
          <p className="fine">{paid ? `Free to start. Your dispute letters cost ${priceLabel(price)}, paid once when they are complete, with every later round included. We may also be paid by lenders if you later choose funding through us, and you never have to.` : "The credit service is free. We are paid by lenders only if you later choose funding through us, and you never have to."} We dispute only information that is inaccurate, incomplete, or unverifiable; accurate information cannot be removed. No result, score change, or loan approval is guaranteed. You can dispute errors with the credit bureaus yourself at no cost.</p>
        </div>
      </section>
      <main className="wrap">
        <div className="grid g3">
          {[
            ["1. Sign in one click", "Read your rights, then sign every document with a single click. Cancel any time."],
            ["2. We audit your reports", "Each account is checked against fixed rules drawn from the Fair Credit Reporting Act. You see the exact reason for every finding."],
            ["3. Disputes go out in rounds", paid ? `Preview your letters free. Unlock them once for ${priceLabel(price)}, then approve, print and mail. Later rounds are included.` : "Round one asks each bureau to verify. Later rounds depend on how they answer. You approve every letter."],
            ["4. Funding opens", "When your score improves, we match you with funding for your business."],
          ].map(([h, p]) => <div className="card" key={h}><h3>{h}</h3><p className="muted" style={{ margin: 0 }}>{p}</p></div>)}
        </div>
      </main>
    </>
  );
}
