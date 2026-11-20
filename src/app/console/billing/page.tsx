import { manageBilling, signOutOperator, subscribe } from "@/app/console/actions";
import { ConsoleBar, Flash, ConsoleBrand } from "@/components/ui";
import { billingConfigured, goodStanding, isPlan, PLANS } from "@/lib/billing";
import { PlanCards } from "@/components/PlanCards";
import { fmt } from "@/lib/dates";
import { canManage, isPlatform } from "@/lib/console";
import { requireOperator } from "@/lib/opsession";
import { getTenant } from "@/lib/store";

export const dynamic = "force-dynamic";

const STATUS: Record<string, [string, string]> = {
  exempt: ["No charge", "Your company is not billed for this platform."],
  pending: ["Not started", "Choose your plan to open the console and your client sign-up link."],
  active: ["Subscribed", "Your subscription is active."],
  trialing: ["Season Pass", "Your Season Pass is active."],
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
      {ok ? <ConsoleBar active="billing" owner={op.role === "platform"} name={op.name} signOut={signOutOperator} /> : (
        <header className="topbar"><div className="topbar-in"><span style={{ flex: 1 }}><ConsoleBrand /></span>
          <form action={signOutOperator}><button className="btn link" type="submit" style={{ color: "#fff" }}>Sign out</button></form></div></header>
      )}
      <main className="wrap narrow">
        <div className="row between"><h1>Billing</h1><span className={`pill ${ok && t.sub_status !== "past_due" ? "dark" : "accent"}`}>{label}</span></div>
        <p className="muted">{t.name}{isPlan(t.plan) ? ` · ${PLANS[t.plan as keyof typeof PLANS].name}` : ""}</p>
        <Flash {...sp} />
        <div className="card">
          <p>{isPlatform(op) ? "You are the platform owner. Operator subscriptions are listed under Companies and logins." : text}</p>
          {t.sub_status === "trialing" && t.plan_ends_at && <p className="small muted">Full access through {fmt(t.plan_ends_at.slice(0, 10))}. After that, $147/month for priority support and community access starts automatically unless you cancel before then.</p>}
          {!isPlatform(op) && t.sub_status !== "exempt" && (
            !billingConfigured() ? <div className="notice">Billing is not set up yet.</div>
            : needsCheckout ? (
              canManage(op) ? <PlanCards chosen={t.plan} action={subscribe} />
                : <p className="muted">Ask your company admin to start the subscription.</p>
            ) : (
              <form action={manageBilling}><button className="btn" type="submit">Update card, see invoices, or cancel</button></form>
            )
          )}
          <p className="fine" style={{ margin: "14px 0 0" }}>Payments are handled by Stripe. We never see or store your card number. Your plan is for your company's use of the software; your clients are not charged by us.</p>
        </div>
      </main>
    </>
  );
}
