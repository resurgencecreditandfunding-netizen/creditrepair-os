import Link from "next/link";
import { opFundingHandled, signOutOperator } from "@/app/console/actions";
import { ConsoleBar, Flash } from "@/components/ui";
import * as ops from "@/lib/console";
import { fmt } from "@/lib/dates";
import { requireOperator } from "@/lib/opsession";
import { getTenant } from "@/lib/store";

const URGENT: ops.Stage[] = ["ready_to_mail", "next_round"];

export default async function Console({ searchParams }: { searchParams: Promise<{ q?: string; tenant?: string; stage?: string; error?: string; ok?: string }> }) {
  const op = await requireOperator();
  const sp = await searchParams;
  const tenants = ops.listTenants(op);
  const all = ops.listClients(op, { q: sp.q, tenantId: sp.tenant });
  const rows = sp.stage ? all.filter((r) => r.stage === sp.stage) : all;
  const active = all.filter((r) => r.client.status === "active");
  const toMail = all.flatMap((r) => r.letters.filter((l) => l.status === "attested").map((l) => ({ r, l })));
  const overdue = all.flatMap((r) => r.letters.filter((l) => l.status === "mailed" && l.due_at < new Date().toISOString().slice(0, 10)).map((l) => ({ r, l })));
  const nextRound = all.filter((r) => r.stage === "next_round");
  const funding = all.filter((r) => r.fundingRequested);
  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? "";
  const stat = (label: string, n: number, hot = false) => (
    <div className="card" style={{ marginBottom: 0 }}><div className="label">{label}</div><div className="stat" style={hot && n ? { color: "var(--red)" } : undefined}>{n}</div></div>
  );

  return (
    <>
      <ConsoleBar active="" name={op.name} signOut={signOutOperator} />
      <main className="wrap" style={{ maxWidth: 1240 }}>
        <h1>{ops.isPlatform(op) ? "All clients" : getTenant(op.tenant_id).name}</h1>
        <p className="muted">What needs doing today, then every client.</p>
        <Flash {...sp} />

        <div className="grid g3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          {stat("Active clients", active.length)}
          {stat("Letters to mail", toMail.length, true)}
          {stat("Responses overdue", overdue.length, true)}
          {stat("Next round ready", nextRound.length, true)}
          {stat("Funding requests", funding.length, true)}
        </div>

        <h2 style={{ marginTop: 24 }}>Work queue</h2>
        <div className="card">
          {toMail.length + overdue.length + nextRound.length + funding.length === 0 && <span className="muted">Nothing is waiting on you.</span>}
          <table><tbody>
            {toMail.map(({ r, l }) => (
              <tr key={l.id}><td><span className="pill red">Mail</span></td><td><strong>{r.client.name}</strong> approved a round {l.round} letter to {l.recipient_name}</td>
                <td style={{ textAlign: "right" }}><Link className="btn" href={`/console/clients/${r.client.id}/letters/${l.id}`}>Print and mail</Link></td></tr>
            ))}
            {overdue.map(({ r, l }) => (
              <tr key={l.id}><td><span className="pill red">Overdue</span></td><td>{l.recipient_name} owed <strong>{r.client.name}</strong> a response by {fmt(l.due_at)}</td>
                <td style={{ textAlign: "right" }}><Link className="btn" href={`/console/clients/${r.client.id}/letters/${l.id}`}>Record result</Link></td></tr>
            ))}
            {nextRound.map((r) => (
              <tr key={r.client.id}><td><span className="pill dark">Round</span></td><td><strong>{r.client.name}</strong> has {r.pending} item{r.pending > 1 ? "s" : ""} ready for the next round</td>
                <td style={{ textAlign: "right" }}><Link className="btn" href={`/console/clients/${r.client.id}`}>Draft letters</Link></td></tr>
            ))}
            {funding.map((r) => (
              <tr key={`f${r.client.id}`}><td><span className="pill dark">Funding</span></td><td><strong>{r.client.name}</strong> asked for a funding review (score {r.now}, {r.gain >= 0 ? "+" : ""}{r.gain})</td>
                <td style={{ textAlign: "right" }}>
                  <form action={opFundingHandled} className="row" style={{ justifyContent: "flex-end" }}>
                    <input type="hidden" name="clientId" value={r.client.id} />
                    <Link className="btn" href={`/console/clients/${r.client.id}`}>Open</Link>
                    <button className="btn link" type="submit">Mark handled</button>
                  </form>
                </td></tr>
            ))}
          </tbody></table>
        </div>

        <div className="row between" style={{ marginTop: 24 }}>
          <h2 style={{ margin: 0 }}>Clients ({rows.length})</h2>
          <form className="row" method="get">
            <input type="text" name="q" defaultValue={sp.q} placeholder="Search name or email" aria-label="Search clients" style={{ width: 220 }} />
            <select name="stage" defaultValue={sp.stage ?? ""} aria-label="Filter by stage" style={{ width: 220 }}>
              <option value="">Every stage</option>
              {(["needs_report", "needs_review", "awaiting_approval", "ready_to_mail", "awaiting_response", "next_round", "funding", "cancelled"] as ops.Stage[]).map((s) => <option key={s} value={s}>{ops.stageName(s)}</option>)}
            </select>
            {ops.isPlatform(op) && tenants.length > 1 && (
              <select name="tenant" defaultValue={sp.tenant ?? ""} aria-label="Filter by company" style={{ width: 180 }}>
                <option value="">Every company</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <button className="btn dark" type="submit">Filter</button>
          </form>
        </div>
        <div className="card tablewrap" style={{ marginTop: 12 }}>
          {rows.length === 0 ? <span className="muted">No clients match.</span> : (
            <table>
              <thead><tr><th>Client</th>{ops.isPlatform(op) && <th>Company</th>}<th>Stage</th><th>Score</th><th>In dispute</th><th>Resolved</th><th>Next deadline</th><th>Funding</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.client.id}>
                  <td><Link href={`/console/clients/${r.client.id}`}><strong>{r.client.name}</strong></Link><div className="small muted">{r.client.email}</div></td>
                  {ops.isPlatform(op) && <td className="small">{tenantName(r.client.tenant_id)}</td>}
                  <td><span className={`pill ${URGENT.includes(r.stage) ? "red" : ""}`}>{ops.stageName(r.stage)}</span></td>
                  <td>{r.now ?? "—"}{r.gain > 0 && <span className="small muted"> (+{r.gain})</span>}</td>
                  <td>{r.open}</td><td>{r.resolved}</td>
                  <td className="small">{r.nextDue ? <span style={r.overdue ? { color: "var(--red)", fontWeight: 600 } : undefined}>{fmt(r.nextDue)}</span> : "—"}</td>
                  <td>{r.fundingRequested ? <span className="pill dark">Requested</span> : r.fundingOpen ? <span className="pill">Open</span> : <span className="small muted">Locked</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
