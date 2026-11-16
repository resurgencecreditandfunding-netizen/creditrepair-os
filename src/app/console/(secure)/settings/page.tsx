import { headers } from "next/headers";
import { addOperator, addTenant, signOutOperator } from "@/app/console/actions";
import { ConsoleBar, Flash } from "@/components/ui";
import * as ops from "@/lib/console";
import { requireOperator } from "@/lib/opsession";

const KIND: Record<string, string> = { direct: "Platform", credit_repair: "Credit repair firm", tax_pro: "Tax professional" };

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const op = await requireOperator();
  const sp = await searchParams;
  const tenants = ops.listTenants(op);
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
            <div className="row between"><h2 style={{ margin: 0 }}>{t.name}</h2><span className="pill">{KIND[t.kind] ?? t.kind} · {t.clients} client{t.clients === 1 ? "" : "s"}</span></div>
            <p className="small muted" style={{ margin: "6px 0 10px" }}>Contracting company: {t.legal_name ?? t.name} · {t.address}</p>
            <div className="label">Client sign-up link</div>
            <p><code>{origin}/?t={t.slug}</code></p>
            <div className="label">Staff logins</div>
            {t.operators.length === 0 ? <p className="small muted">None yet.</p> : (
              <table><tbody>{t.operators.map((o: any) => <tr key={o.id}><td>{o.name}</td><td className="small">{o.email}</td><td><span className="pill">{o.role}</span></td></tr>)}</tbody></table>
            )}
          </div>
        ))}

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
                <select id="kind" name="kind"><option value="credit_repair">Credit repair firm</option><option value="tax_pro">Tax professional</option></select></div>
              <button className="btn dark" type="submit">Add company</button>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
