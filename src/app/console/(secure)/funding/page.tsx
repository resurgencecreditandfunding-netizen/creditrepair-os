import Link from "next/link";
import { paySharePaid, saveDeal, saveShares, signOutOperator } from "@/app/console/actions";
import { ConsoleBar, Flash } from "@/components/ui";
import { isPlatform, listTenants } from "@/lib/console";
import { fmt } from "@/lib/dates";
import { DEAL_STATUS, pipeline, sharePct } from "@/lib/funding-deals";
import { requireOperator } from "@/lib/opsession";

const usd = (v: number | null | undefined) => (v == null ? "—" : `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

export default async function Funding({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const op = await requireOperator();
  const sp = await searchParams;
  const owner = isPlatform(op);
  const { deals, totals } = pipeline(op);
  const companies = owner ? listTenants(op).filter((t) => t.id !== "tenant_default") : [];
  const Stat = ({ label, value, hot }: { label: string; value: string | number; hot?: boolean }) => (
    <div className="card" style={{ marginBottom: 0 }}><div className="label">{label}</div><div className="stat" style={hot ? { color: "var(--accent)" } : undefined}>{value}</div></div>
  );
  return (
    <>
      <ConsoleBar active="funding" owner={owner} name={op.name} signOut={signOutOperator} />
      <main className="wrap" style={{ maxWidth: 1240 }}>
        <h1>Funding</h1>
        <p className="muted">{owner ? "Every funding request across the platform. You run the deals; operators see their own clients' progress and their share." : `Your clients' funding requests. Funding is arranged by the platform, and your company earns ${sharePct(op.tenant_id)}% of the commission on each funded deal.`}</p>
        <Flash {...sp} />

        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <Stat label="New requests" value={totals.newRequests} hot={totals.newRequests > 0} />
          <Stat label="Open deals" value={totals.open} />
          <Stat label="Funded" value={totals.funded} />
          <Stat label="Funded volume" value={usd(totals.volume)} />
          {owner && <Stat label="Commission earned" value={usd(totals.commission)} />}
          <Stat label={owner ? "Operator share owed" : "Your share owed"} value={usd(totals.shareOwed)} hot={owner && totals.shareOwed > 0} />
          <Stat label={owner ? "Operator share paid" : "Your share paid"} value={usd(totals.sharePaid)} />
        </div>

        <h2 style={{ marginTop: 24 }}>Deals ({deals.length})</h2>
        {deals.length === 0 && <div className="card muted">No funding requests yet. They appear here when a client's funding opens and they ask for a review.</div>}
        {deals.map((d) => (
          <div className="card" key={d.id}>
            <div className="row between">
              <div>
                <h3><Link href={`/console/clients/${d.client_id}`}>{d.client_name}</Link></h3>
                <div className="small muted">{owner ? `${d.company} · ` : ""}{d.client_email}{d.client_phone ? ` · ${d.client_phone}` : ""} · goal {d.goal ?? "not given"} · requested {fmt(d.created_at.slice(0, 10))}</div>
              </div>
              <span className={`pill ${d.status === "requested" ? "accent" : d.status === "funded" ? "dark" : ""}`}>{DEAL_STATUS[d.status as keyof typeof DEAL_STATUS]}</span>
            </div>
            <div className="row small" style={{ gap: 24, margin: "10px 0" }}>
              {d.lender && <span>Lender: <strong>{d.lender}</strong></span>}
              {d.product && <span>Product: <strong>{d.product}</strong></span>}
              {d.funded_amount != null && <span>Funded: <strong>{usd(d.funded_amount)}</strong></span>}
              {owner && d.commission != null && <span>Commission: <strong>{usd(d.commission)}</strong></span>}
              {d.share_amount != null && <span>{owner ? "Operator share" : "Your share"}: <strong>{usd(d.share_amount)}</strong> ({d.share_pct}%) {d.share_paid_at ? <span className="pill dark">Paid {fmt(d.share_paid_at.slice(0, 10))}</span> : <span className="pill accent">Owed</span>}</span>}
            </div>
            {owner && (
              <details>
                <summary className="small">Update this deal</summary>
                <form action={saveDeal} className="row" style={{ alignItems: "flex-end", marginTop: 10 }}>
                  <input type="hidden" name="id" value={d.id} />
                  <div style={{ flex: "1 1 160px" }}><label>Status</label>
                    <select name="status" defaultValue={d.status}>{Object.entries(DEAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div style={{ flex: "1 1 160px" }}><label>Lender</label><input type="text" name="lender" defaultValue={d.lender ?? ""} /></div>
                  <div style={{ flex: "1 1 160px" }}><label>Product</label><input type="text" name="product" defaultValue={d.product ?? ""} placeholder="Line of credit" /></div>
                  <div style={{ flex: "1 1 120px" }}><label>Funded amount</label><input type="text" name="funded" inputMode="decimal" defaultValue={d.funded_amount ?? ""} /></div>
                  <div style={{ flex: "1 1 120px" }}><label>Your commission</label><input type="text" name="commission" inputMode="decimal" defaultValue={d.commission ?? ""} /></div>
                  <div style={{ flex: "2 1 240px" }}><label>Notes (only you see these)</label><input type="text" name="notes" defaultValue={d.notes ?? ""} /></div>
                  <button className="btn dark" type="submit">Save</button>
                </form>
                {d.share_amount && !d.share_paid_at && (
                  <form action={paySharePaid} style={{ marginTop: 10 }}><input type="hidden" name="id" value={d.id} /><button className="btn" type="submit">Record {usd(d.share_amount)} paid to {d.company}</button></form>
                )}
              </details>
            )}
          </div>
        ))}

        {owner && (
          <form action={saveShares} className="card" style={{ marginTop: 24 }}>
            <h2>Revenue share</h2>
            <p className="small muted">The percentage of your commission paid to the operator whose client funded. It is locked in when a deal is marked funded, so changes apply to future deals only. Your own direct clients have no share.</p>
            <div className="field" style={{ maxWidth: 220 }}><label htmlFor="default">Default for every company (%)</label>
              <input id="default" name="default" type="text" inputMode="decimal" defaultValue={sharePct("__default__")} required /></div>
            {companies.length > 0 && (
              <table><thead><tr><th>Company</th><th>Its own rate (%) — blank uses the default</th></tr></thead>
                <tbody>{companies.map((t) => (
                  <tr key={t.id}><td>{t.name}</td><td><input type="text" inputMode="decimal" name={`t_${t.id}`} defaultValue={(t as any).funding_share_pct ?? ""} style={{ maxWidth: 140 }} aria-label={`Rate for ${t.name}`} /></td></tr>
                ))}</tbody></table>
            )}
            <button className="btn dark" type="submit" style={{ marginTop: 12 }}>Save revenue share</button>
          </form>
        )}
      </main>
    </>
  );
}
