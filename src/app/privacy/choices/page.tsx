import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { optOutBrowser, optOutEmail } from "@/app/actions";
import { LegalPage } from "@/components/LegalPage";
import { Flash } from "@/components/ui";
import { OPTOUT_COOKIE } from "@/lib/meta-request";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your privacy choices | Leverage IQ" };

export default async function Choices({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const optedOut = (await cookies()).get(OPTOUT_COOKIE)?.value === "1";
  const gpc = (await headers()).get("sec-gpc") === "1";
  return (
    <LegalPage title="Your privacy choices">
      <p>We do not sell your personal information for money. We do share limited information with Meta to measure and improve our advertising, which some state laws treat as &ldquo;sharing&rdquo; or &ldquo;targeted advertising.&rdquo; You can opt out here. Our <Link href="/privacy">privacy policy</Link> explains exactly what is shared.</p>
      <Flash {...sp} />
      {gpc && <div className="notice gray">Your browser is sending the Global Privacy Control signal, so you are already opted out on this browser.</div>}

      <h2>Opt out on this browser</h2>
      <p>We will stop loading the Meta Pixel in this browser and, if you are signed in, stop sending events about your account to Meta.</p>
      {optedOut ? <p><span className="pill dark">You are opted out on this browser</span></p> : (
        <form action={optOutBrowser}><button className="btn dark" type="submit">Opt out on this browser</button></form>
      )}

      <h2>Opt out for your account</h2>
      <p>Enter the email address on your account and we will stop sending events about you to Meta, whichever device you use.</p>
      <form action={optOutEmail} className="row" style={{ alignItems: "flex-end", maxWidth: 560 }}>
        <div style={{ flex: "1 1 260px" }}><label htmlFor="email">Email address</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
        <button className="btn dark" type="submit">Opt out</button>
      </form>

      <h2>Other choices</h2>
      <ul>
        <li>Turn reminders and texts off on the Documents page of your account, or reply STOP to any text.</li>
        <li>To see, correct or delete your information, follow the steps under &ldquo;Your rights&rdquo; in our <Link href="/privacy">privacy policy</Link>.</li>
      </ul>
    </LegalPage>
  );
}
