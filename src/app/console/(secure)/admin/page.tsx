import Link from "next/link";
import { redirect } from "next/navigation";
import { compCompany, editCompany, opFundingHandled, runRemindersNow, saveDirectPrice, signOutOperator, suspendCompany } from "@/app/console/actions";
import { ConsoleBar, Flash } from "@/components/ui";
import { businessOverview } from "@/lib/admin";
import { billingConfigured, PLAN_MONTHLY } from "@/lib/billing";
import { isPlatform } from "@/lib/console";
import { fmt } from "@/lib/dates";
import { requireOperator } from "@/lib/opsession";
import { aiEnabled } from "@/lib/ai";
import { DEMO } from "@/lib/store";
import { emailConfigured, explainSendError, smsConfigured } from "@/lib/notify";

const SUB: Record<string, [string, string]> = {
  active: ["Paying", "dark"], trialing: ["Trial", ""], past_due: ["Payment overdue", "accent"], pending: ["Signed up, not paid", "accent"],
  canceled: ["Cancelled", ""], unpaid: ["Unpaid", "accent"], exempt: ["Free access", ""],
};
const KIND: Record<string, string> = { credit_repair: "Credit repair", tax_pro: "Tax professional", funding_pro: "Funding professional" };
const usd = (v: number) => `$${v.toLocaleString("en-US")}`;

export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const op = await requireOperator();
  if (!isPlatform(op)) redirect("/console");
  const sp = await searchParams;
  const b = businessOverview(op);
  const Stat = ({ label, value, sub, hot }: { label: string; value: string | number; sub?: string; hot?: boolean }) => (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="label">{label}</div>
      <div className="stat" style={hot ? { color: "var(--accent)" } : undefined}>{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
  const setup = [
    ["Operator payments (Stripe)", billingConfigured() && !!process.env.STRIPE_WEBHOOK_SECRET],
    ["Report reading (AI key)", aiEnabled()],
    ["Sign-up alerts (email or text)", emailConfigured() || smsConfigured()],
    ["Demo mode off", !DEMO],
  ] as const;

  return (
    <>
      <ConsoleBar active="admin" owner name={op.name} signOut={signOutOperator} />
      <main className="wrap" style={{ maxWidth: 1240 }}>
        <h1>Business</h1>
        <p className="muted">Your platform across every operator. Only you can see this page.</p>
        <Flash {...sp} />

        {setup.some(([, ok]) => !ok) && (
          <div className="notice">
            <strong>Not ready for customers yet.</strong>{" "}
            {setup.map(([label, ok]) => <span key={label} className={`pill ${ok ? "dark" : "accent"}`} style={{ marginRight: 6 }}>{ok ? "✓" : "✗"} {label}</span>)}
          </div>
        )}

        <form action={runRemindersNow} className="row small muted" style={{ marginBottom: 16 }}>
          <span>Client reminders run every hour between noon and 8pm Eastern.</span>
          <button className="btn link" type="submit">Run reminders now</button>
        </form>

        <h2>Revenue</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <Stat label="Monthly revenue" value={usd(b.revenue.mrr)} sub={`${b.revenue.paying} paying × ${usd(PLAN_MONTHLY)}`} />
          <Stat label="Paying operators" value={b.revenue.paying} />
          <Stat label="Payment overdue" value={b.revenue.pastDue} hot={b.revenue.pastDue > 0} sub="Stripe is retrying" />
          <Stat label="Signed up, not paid" value={b.revenue.pending} hot={b.revenue.pending > 0} sub="Worth a follow-up" />
          <Stat label="Cancelled" value={b.revenue.canceled} />
          <Stat label="Free access" value={b.revenue.comped} />
        </div>
        <p className="fine" style={{ marginTop: 8 }}>Monthly revenue is estimated from subscription status. Stripe is the record of what was actually collected.</p>

        <h2 style={{ marginTop: 24 }}>Direct letter sales</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <Stat label="Letter sales" value={usd(b.letters.revenue)} sub={`${b.letters.paid} paid · ${b.letters.paid30} in 30 days`} />
          <Stat label="Previewing, not paid" value={b.letters.waiting} sub="Letters ready, waiting to unlock" hot={b.letters.waiting > 0} />
          <form action={saveDirectPrice} className="card" style={{ marginBottom: 0 }}>
            <div className="label">Price for direct clients</div>
            <div className="row" style={{ marginTop: 8 }}>
              <input type="text" name="price" inputMode="decimal" defaultValue={(Number(b.letters.price) / 100).toString()} aria-label="Price in dollars" style={{ width: 90 }} />
              <button className="btn dark" type="submit">Save</button>
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>Applies to new sign-ups. 0 makes it free. Operators' clients are never charged.</div>
          </form>
        </div>
        <p className="fine" style={{ marginTop: 8 }}>For community members, create a 100%-off promotion code in Stripe (Products, Coupons) and share it in the community; they enter it at checkout.</p>

        <h2 style={{ marginTop: 24 }}>Clients and results</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <Stat label="Clients" value={b.clients.total} sub={`${b.clients.new7} new this week · ${b.clients.new30} in 30 days`} />
          <Stat label="Signed" value={b.clients.signed} sub={`${b.clients.withReport} with a report`} />
          <Stat label="In dispute" value={b.clients.inDispute} />
          <Stat label="Letters mailed" value={b.work.mailed} sub={`${b.work.mailed30} in 30 days`} />
          <Stat label="Items resolved" value={b.work.resolved} sub={`${b.work.deleted} deleted`} />
          <Stat label="Funding open" value={b.funding.open} sub={`${b.funding.requests.length} asked for a review`} hot={b.funding.requests.length > 0} />
        </div>

        <h2 style={{ marginTop: 24 }}>Funding requests ({b.funding.requests.length})</h2>
        <div className="card tablewrap">
          {b.funding.requests.length === 0 ? <span className="muted">No open requests. Clients appear here when their score unlocks funding and they ask for a review.</span> : (
            <table>
              <thead><tr><th>Client</th><th>Company</th><th>Score</th><th>Gain</th><th>Goal</th><th></th></tr></thead>
              <tbody>{b.funding.requests.map((r) => (
                <tr key={r.client.id}>
                  <td><Link href={`/console/clients/${r.client.id}`}><strong>{r.client.name}</strong></Link><div className="small muted">{r.client.email}{r.client.phone ? ` · ${r.client.phone}` : ""}</div></td>
                  <td className="small">{b.operators.find((o) => o.id === r.client.tenant_id)?.name ?? "Direct"}</td>
                  <td>{r.now}</td><td>{r.gain > 0 ? `+${r.gain}` : r.gain}</td><td className="small">{r.client.funding_goal || "—"}</td>
                  <td><form action={opFundingHandled}><input type="hidden" name="clientId" value={r.client.id} /><button className="btn" type="submit">Mark handled</button></form></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        <h2 style={{ marginTop: 24 }}>Operators ({b.operators.length})</h2>
        {b.operators.length === 0 && <div className="card muted">No operators yet. They sign up at /console/signup, or you add them under Companies and logins.</div>}
        {b.operators.map((o) => {
          const [label, tone] = o.suspended ? ["Suspended", "accent"] : SUB[o.sub_status] ?? [o.sub_status, ""];
          return (
            <div className="card" key={o.id}>
              <div className="row between">
                <div><h3>{o.name}</h3><div className="small muted">{KIND[o.kind] ?? o.kind} · joined {fmt(o.created_at)} · link: /?t={o.slug}</div></div>
                <span className={`pill ${tone}`}>{label}</span>
              </div>
              <div className="row small" style={{ gap: 24, margin: "12px 0" }}>
                <span><strong>{o.clients}</strong> clients</span><span><strong>{o.active}</strong> active</span><span><strong>{o.mailed}</strong> letters mailed</span>
                <span><strong>{o.logins}</strong> staff login{o.logins === 1 ? "" : "s"}</span>
                <span className="muted">Last activity: {o.lastActivity ? fmt(o.lastActivity.slice(0, 10)) : "none"}</span>
              </div>
              <div className="row">
                <Link className="btn" href={`/console?tenant=${o.id}`}>View clients</Link>
                <form action={suspendCompany}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="to" value={o.suspended ? "0" : "1"} />
                  <button className="btn" type="submit">{o.suspended ? "Reinstate" : "Suspend"}</button></form>
                {(o.sub_status === "exempt" || ["pending", "canceled", "unpaid"].includes(o.sub_status)) && (
                  <form action={compCompany}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="to" value={o.sub_status === "exempt" ? "0" : "1"} />
                    <button className="btn" type="submit">{o.sub_status === "exempt" ? "Require subscription" : "Give free access"}</button></form>
                )}
              </div>
              <details style={{ marginTop: 12 }}>
                <summary className="small">Edit company details</summary>
                <form action={editCompany} className="row" style={{ alignItems: "flex-end", marginTop: 10 }}>
                  <input type="hidden" name="id" value={o.id} />
                  <div style={{ flex: "1 1 180px" }}><label>Name clients see</label><input type="text" name="name" defaultValue={o.name} required /></div>
                  <div style={{ flex: "1 1 220px" }}><label>Legal name on contract</label><input type="text" name="legalName" defaultValue={o.legal_name ?? ""} required /></div>
                  <div style={{ flex: "2 1 280px" }}><label>Address on contract</label><input type="text" name="address" defaultValue={o.address} required /></div>
                  <button className="btn dark" type="submit">Save</button>
                </form>
              </details>
            </div>
          );
        })}

        <div className="grid g2" style={{ marginTop: 24 }}>
          <div className="card">
            <h2>Credit monitoring partners</h2>
            {b.partners.length === 0 ? <span className="muted">None set up.</span> : (
              <table>
                <thead><tr><th>Partner</th><th>Clicks</th><th>30 days</th><th>People</th><th>Uploaded after</th></tr></thead>
                <tbody>{b.partners.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.clicks}</td><td>{p.clicks30}</td><td>{p.people}</td><td>{p.uploaded}</td></tr>)}</tbody>
              </table>
            )}
            <p className="fine" style={{ margin: "10px 0 0" }}>"Uploaded after" counts people who clicked the link and later uploaded a report. Your partner's own affiliate dashboard is the record of commissions earned.</p>
          </div>
          <div className="card">
            <h2>Latest activity</h2>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              <table><tbody>{b.activity.map((e, i) => (
                <tr key={i}>
                  <td className="small muted" style={{ whiteSpace: "nowrap" }}>{new Date(e.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                  <td className="small">{e.action.replace(/_/g, " ")}{/failed$/.test(e.action) && (() => { try { const err = JSON.parse(e.detail).error; return err ? <div style={{ color: "var(--accent-dark)" }}>{explainSendError(err)}</div> : null; } catch { return null; } })()}</td>
                  <td className="small muted">{e.client ? <Link href={`/console/clients/${e.client_id}`}>{e.client}</Link> : e.actor.replace(/^\w+:/, "")}{e.company ? ` · ${e.company}` : ""}</td>
                </tr>
              ))}</tbody></table>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
