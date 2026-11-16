import { headers } from "next/headers";
import { addMonitoringService, addOperator, addTenant, removeMonitoringService, signOutOperator } from "@/app/console/actions";
import { ConsoleBar, Flash } from "@/components/ui";
import * as ops from "@/lib/console";
import { requireOperator } from "@/lib/opsession";

const KIND: Record<string, string> = { direct: "Platform", credit_repair: "Credit repair firm", tax_pro: "Tax professional", funding_pro: "Funding professional" };
const SUB: Record<string, string> = { exempt: "No charge", pending: "Not subscribed", active: "Subscribed", trialing: "Trial", past_due: "Payment overdue", canceled: "Cancelled", unpaid: "Unpaid" };

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const op = await requireOperator();
  const sp = await searchParams;
  const tenants = ops.listTenants(op);
  const partners = ops.listMonitoring();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return (
    <>
      <ConsoleBar active="settings" name={op.name} signOut={signOutOperator} />
      <main className="wrap">
        <h1>Companies and logins</h1>
        <p className="muted">Each company has its own clients, its own name on the contract, and its own sign-up link.</p>
        <Flash {...sp} />

        {tenants.map((t) => (
          <div className="card" key={t.id}>
            <div className="row between"><h2 style={{ margin: 0 }}>{t.name}</h2><span className="row" style={{ gap: 6 }}><span className={`pill ${["active", "trialing", "exempt"].includes(t.sub_status) ? "" : "red"}`}>{SUB[t.sub_status] ?? t.sub_status}</span><span className="pill">{KIND[t.kind] ?? t.kind} · {t.clients} client{t.clients === 1 ? "" : "s"}</span></span></div>
            <p className="small muted" style={{ margin: "6px 0 10px" }}>Contracting company: {t.legal_name ?? t.name} · {t.address}</p>
            <div className="label">Client sign-up link</div>
            <p><code>{origin}/?t={t.slug}</code></p>
            <div className="label">Staff logins</div>
            {t.operators.length === 0 ? <p className="small muted">None yet.</p> : (
              <table><tbody>{t.operators.map((o: any) => <tr key={o.id}><td>{o.name}</td><td className="small">{o.email}</td><td><span className="pill">{o.role}</span></td></tr>)}</tbody></table>
            )}
          </div>
        ))}

        {ops.isPlatform(op) && (
          <div className="card">
            <h2>Credit monitoring partners</h2>
            <p className="small muted">Your affiliate links. Every client, at every company, sees these when they connect a report. Clicks are recorded in the client's activity record.</p>
            {partners.length > 0 && (
              <div className="tablewrap"><table><tbody>{partners.map((m) => (
                <tr key={m.id}><td><strong>{m.name}</strong><div className="small muted">{m.blurb}</div></td><td className="small" style={{ wordBreak: "break-all" }}>{m.url}</td>
                  <td><form action={removeMonitoringService}><input type="hidden" name="id" value={m.id} /><button className="btn link" type="submit">Remove</button></form></td></tr>
              ))}</tbody></table></div>
            )}
            <form action={addMonitoringService} className="row" style={{ alignItems: "flex-end", marginTop: 12 }}>
              <div style={{ flex: "1 1 160px" }}><label htmlFor="mname">Service name</label><input id="mname" name="name" type="text" required /></div>
              <div style={{ flex: "2 1 260px" }}><label htmlFor="murl">Your affiliate link</label><input id="murl" name="url" type="text" required placeholder="https://" /></div>
              <div style={{ flex: "2 1 220px" }}><label htmlFor="mblurb">Short description (optional)</label><input id="mblurb" name="blurb" type="text" maxLength={80} placeholder="3-bureau report, $1 trial" /></div>
              <button className="btn dark" type="submit">Add partner</button>
            </form>
          </div>
        )}

        <div className="grid g2">
          {ops.canManage(op) && (
            <form action={addOperator} className="card">
              <h2>Add a staff login</h2>
              {ops.isPlatform(op) && (
                <div className="field"><label htmlFor="tenantId">Company</label>
                  <select id="tenantId" name="tenantId" required>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              )}
              <div className="field"><label htmlFor="oname">Name</label><input id="oname" name="name" type="text" required /></div>
              <div className="field"><label htmlFor="oemail">Email</label><input id="oemail" name="email" type="email" required /></div>
              <div className="field"><label htmlFor="opw">Temporary password (10 or more characters)</label><input id="opw" name="password" type="text" minLength={10} required autoComplete="off" /></div>
              <div className="field"><label htmlFor="role">Access</label>
                <select id="role" name="role"><option value="staff">Staff: works clients</option><option value="admin">Admin: also adds logins</option></select></div>
              <button className="btn dark" type="submit">Create login</button>
            </form>
          )}
          {ops.isPlatform(op) && (
            <form action={addTenant} className="card">
              <h2>Add a company</h2>
              <div className="field"><label htmlFor="tname">Name clients see</label><input id="tname" name="name" type="text" required /></div>
              <div className="field"><label htmlFor="slug">Link name (letters, numbers, dashes)</label><input id="slug" name="slug" type="text" pattern="[a-z0-9\-]+" required placeholder="smith-tax" /></div>
              <div className="field"><label htmlFor="legalName">Legal company name (goes on the contract)</label><input id="legalName" name="legalName" type="text" required /></div>
              <div className="field"><label htmlFor="taddr">Principal business address</label><input id="taddr" name="address" type="text" required /></div>
              <div className="field"><label htmlFor="kind">Type</label>
                <select id="kind" name="kind"><option value="credit_repair">Credit repair firm</option><option value="tax_pro">Tax professional</option><option value="funding_pro">Funding professional</option></select></div>
              <p className="fine">Companies you add here are not charged. Companies that sign up themselves pay the subscription.</p>
              <button className="btn dark" type="submit">Add company</button>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
