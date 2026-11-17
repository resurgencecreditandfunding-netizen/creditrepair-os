import { headers } from "next/headers";
import { addFreezeBureau, addMonitoringService, addOperator, addTenant, removeFreezeBureau, removeLogin, removeMonitoringService, resetLoginPassword, saveAlerts, saveBranding, signOutOperator, testAlerts } from "@/app/console/actions";
import { listFreezeBureaus } from "@/lib/freeze";
import { brandBar, companyLink } from "@/lib/branding";
import { emailConfigured, smsConfigured } from "@/lib/notify";
import { getTenant } from "@/lib/store";
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
  const freezeList = listFreezeBureaus();
  const mine = getTenant(op.tenant_id);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return (
    <>
      <ConsoleBar active="settings" owner={op.role === "platform"} name={op.name} signOut={signOutOperator} />
      <main className="wrap">
        <h1>Companies and logins</h1>
        <p className="muted">Each company has its own clients, its own name on the contract, and its own sign-up link.</p>
        <Flash {...sp} />

        {ops.canManage(op) && (
          <div className="card">
            <h2>Sign-up alerts</h2>
            <p className="small muted">
              {ops.isPlatform(op) ? "Get an email or text when someone signs up, and when a company joins or starts paying." : "Get an email or text the moment one of your clients signs their agreement."}
              {" "}Email is {emailConfigured() ? <strong>on</strong> : <strong style={{ color: "var(--accent-dark)" }}>not switched on yet</strong>}. Text is {smsConfigured() ? <strong>on</strong> : <strong style={{ color: "var(--accent-dark)" }}>not switched on yet</strong>}.
            </p>
            <form action={saveAlerts} className="row" style={{ alignItems: "flex-end" }}>
              <div style={{ flex: "2 1 220px" }}><label htmlFor="aemail">Email</label><input id="aemail" name="email" type="email" defaultValue={mine.notify_email ?? ""} /></div>
              <div style={{ flex: "1 1 160px" }}><label htmlFor="aphone">Mobile (US)</label><input id="aphone" name="phone" type="tel" defaultValue={mine.notify_phone ?? ""} placeholder="(386) 555-0123" /></div>
              {ops.isPlatform(op) && (
                <div style={{ flex: "1 1 200px" }}><label htmlFor="ascope">Client sign-ups</label>
                  <select id="ascope" name="scope" defaultValue={mine.notify_all ? "all" : "direct"}>
                    <option value="all">Every company</option><option value="direct">Only my own clients</option>
                  </select></div>
              )}
              <button className="btn dark" type="submit">Save</button>
            </form>
            <form action={testAlerts} style={{ marginTop: 10 }}><button className="btn link" type="submit">Send a test alert</button></form>
          </div>
        )}

        {tenants.map((t) => (
          <div className="card" key={t.id}>
            <div className="row between"><h2 style={{ margin: 0 }}>{t.name}</h2><span className="row" style={{ gap: 6 }}><span className={`pill ${["active", "trialing", "exempt"].includes(t.sub_status) ? "" : "accent"}`}>{SUB[t.sub_status] ?? t.sub_status}</span><span className="pill">{KIND[t.kind] ?? t.kind} · {t.clients} client{t.clients === 1 ? "" : "s"}</span></span></div>
            <p className="small muted" style={{ margin: "6px 0 10px" }}>Contracting company: {t.legal_name ?? t.name} · {t.address}</p>
            <div className="label">Client sign-up link</div>
            <p><code>{t.id === "tenant_default" ? origin : companyLink(t.slug, origin)}</code></p>
            <div className="label">Staff logins</div>
            {t.operators.length === 0 ? <p className="small muted">None yet.</p> : (
              <table><tbody>{t.operators.map((o: any) => (
                <tr key={o.id}>
                  <td>{o.name}<div className="small muted">{o.email}</div></td>
                  <td><span className="pill">{o.role === "platform" ? "owner" : o.role}</span></td>
                  <td>
                    {ops.canManage(op) && (ops.isPlatform(op) || o.role !== "platform") && (
                      <details>
                        <summary className="small">Manage</summary>
                        <form action={resetLoginPassword} className="row" style={{ marginTop: 8 }}>
                          <input type="hidden" name="id" value={o.id} />
                          <input type="text" name="password" minLength={10} required placeholder="New password (10+ characters)" aria-label={`New password for ${o.email}`} autoComplete="off" style={{ width: 240 }} />
                          <button className="btn" type="submit">Set password</button>
                        </form>
                        {o.id !== op.id && o.role !== "platform" && (
                          <form action={removeLogin} style={{ marginTop: 8 }}><input type="hidden" name="id" value={o.id} /><button className="btn link" type="submit">Remove this login</button></form>
                        )}
                      </details>
                    )}
                  </td>
                </tr>
              ))}</tbody></table>
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

        {ops.canManage(op) && !ops.isPlatform(op) && (
          <form action={saveBranding} className="card">
            <h2>Your branding</h2>
            <p className="small muted">Your clients see your logo and colour on every page instead of ours.</p>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <div style={{ flex: "2 1 260px" }}><label htmlFor="logo">Logo (PNG, JPG or WebP, under 300 KB; a wide logo on a transparent or dark background works best)</label>
                <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" /></div>
              <div style={{ flex: "0 0 140px" }}><label htmlFor="accent">Button colour</label><input id="accent" name="accent" type="color" defaultValue={mine.accent ?? "#d04c1c"} style={{ height: 40, padding: 2 }} /></div>
              <button className="btn dark" type="submit">Save branding</button>
            </div>
            {brandBar(mine).logo && (
              <div className="row" style={{ marginTop: 12, background: "var(--black)", padding: 12, borderRadius: 8 }}>
                <img src={brandBar(mine).logo} alt="Your logo" style={{ height: 32 }} />
                <label className="check" style={{ color: "#fff", margin: 0 }}><input type="checkbox" name="removeLogo" /><span>Remove logo</span></label>
              </div>
            )}
          </form>
        )}

        {ops.isPlatform(op) && (
          <div className="card">
            <h2>Secondary bureaus (freeze step)</h2>
            <p className="small muted">Every client freezes each of these before letters are prepared. Check each link opens the company's freeze page, and replace home-page links with the direct freeze page when you have it.</p>
            <div className="tablewrap"><table><tbody>{freezeList.map((b) => (
              <tr key={b.id}><td><strong>{b.name}</strong><div className="small muted">{b.note}</div></td>
                <td className="small" style={{ wordBreak: "break-all" }}><a href={b.url} target="_blank" rel="noopener">{b.url}</a></td>
                <td><form action={removeFreezeBureau}><input type="hidden" name="id" value={b.id} /><button className="btn link" type="submit">Remove</button></form></td></tr>
            ))}</tbody></table></div>
            <form action={addFreezeBureau} className="row" style={{ alignItems: "flex-end", marginTop: 12 }}>
              <div style={{ flex: "1 1 160px" }}><label htmlFor="fname">Bureau</label><input id="fname" name="name" type="text" required /></div>
              <div style={{ flex: "2 1 240px" }}><label htmlFor="furl">Freeze page link</label><input id="furl" name="url" type="text" required placeholder="https://" /></div>
              <div style={{ flex: "2 1 220px" }}><label htmlFor="fnote">Note for clients (optional)</label><input id="fnote" name="note" type="text" maxLength={140} /></div>
              <button className="btn dark" type="submit">Add bureau</button>
            </form>
            <p className="fine" style={{ margin: "10px 0 0" }}>To change a link, add the bureau again with the new link, then remove the old one. Clients who already finished this step are not asked again.</p>
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
