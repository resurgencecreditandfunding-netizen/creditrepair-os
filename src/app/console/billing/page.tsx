import { manageBilling, signOutOperator, subscribe } from "@/app/console/actions";
import { ConsoleBar, Flash } from "@/components/ui";
import { billingConfigured, goodStanding, PLAN_LABEL } from "@/lib/billing";
import { canManage, isPlatform } from "@/lib/console";
import { requireOperator } from "@/lib/opsession";
import { getTenant } from "@/lib/store";

export const dynamic = "force-dynamic";

const STATUS: Record<string, [string, string]> = {
  exempt: ["No charge", "Your company is not billed for this platform."],
  pending: ["Not subscribed", "Start your subscription to open the console and your client sign-up link."],
  active: ["Subscribed", "Your subscription is active."],
  trialing: ["Trial", "Your trial is running."],
  past_due: ["Payment overdue", "Your last payment did not go through. Update your card to keep your access."],
  canceled: ["Cancelled", "Your subscription has ended. Your clients keep access to their own accounts, but you cannot take new clients or use the console."],
  unpaid: ["Unpaid", "Your subscription is unpaid. Update your card to restore access."],
};

export default async function Billing({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const op = await requireOperator({ allowUnpaid: true });
  const sp = await searchParams;
  const t = getTenant(op.tenant_id);
  const [label, text] = STATUS[t.sub_status] ?? [t.sub_status, ""];
  const ok = goodStanding(t);
  const needsCheckout = ["pending", "canceled"].includes(t.sub_status);
  return (
    <>
      {ok ? <ConsoleBar active="billing" name={op.name} signOut={signOutOperator} /> : (
        <header className="topbar"><div className="topbar-in"><span className="brand" style={{ flex: 1 }}><i />Operator console</span>
          <form action={signOutOperator}><button className="btn link" type="submit" style={{ color: "#fff" }}>Sign out</button></form></div></header>
      )}
      <main className="wrap narrow">
        <div className="row between"><h1>Billing</h1><span className={`pill ${ok && t.sub_status !== "past_due" ? "dark" : "red"}`}>{label}</span></div>
        <p className="muted">{t.name} · {PLAN_LABEL}</p>
        <Flash {...sp} />
        <div className="card">
          <p>{isPlatform(op) ? "You are the platform owner. Operator subscriptions are listed under Companies and logins." : text}</p>
          {!isPlatform(op) && t.sub_status !== "exempt" && (
            !billingConfigured() ? <div className="notice">Billing is not set up yet.</div>
            : needsCheckout ? (
              canManage(op) ? <form action={subscribe}><button className="btn red big" type="submit">Subscribe for {PLAN_LABEL}</button></form>
                : <p className="muted">Ask your company admin to start the subscription.</p>
            ) : (
              <form action={manageBilling}><button className="btn" type="submit">Update card, see invoices, or cancel</button></form>
            )
          )}
          <p className="fine" style={{ margin: "14px 0 0" }}>Payments are handled by Stripe. We never see or store your card number. This subscription is for your company's use of the software; your clients are not charged by us.</p>
        </div>
      </main>
    </>
  );
}
