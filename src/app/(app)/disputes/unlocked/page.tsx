import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/ui";
import { brandBarFor } from "@/lib/branding";
import { confirmSession } from "@/lib/paywall";
import { requireClient } from "@/lib/session";

/** Stripe sends the client back here. Payment is confirmed directly with Stripe, so the webhook can arrive later. */
export default async function Unlocked({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const c = await requireClient();
  const { session_id } = await searchParams;
  let ok = false;
  try { ok = await confirmSession(c.id, session_id ?? ""); } catch { ok = false; }
  if (ok) redirect(`/disputes?ok=${encodeURIComponent("Payment received. Your letters are unlocked: open each one, read it, and approve it.")}`);
  return (
    <>
      <TopBar {...brandBarFor(c)} active="disputes" />
      <main className="wrap narrow">
        <meta httpEquiv="refresh" content="4" />
        <h1>Confirming your payment</h1>
        <div className="card">
          <p>This usually takes a few seconds. This page refreshes on its own.</p>
          <p className="small muted" style={{ margin: 0 }}>If it does not clear within a minute, <Link href="/disputes">go back to your disputes</Link>. You are not charged twice.</p>
        </div>
      </main>
    </>
  );
}
