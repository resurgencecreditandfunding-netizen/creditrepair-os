import Link from "next/link";
import { notFound } from "next/navigation";
import { opAddNote, opFundingHandled, opPrepareLetters, opUploadReport, signOutOperator } from "@/app/console/actions";
import { ConsoleBar, Flash } from "@/components/ui";
import * as ops from "@/lib/console";
import { fmt, today } from "@/lib/dates";
import { fundingStatus } from "@/lib/funding";
import { requireOperator } from "@/lib/opsession";
import { groupFindings, STEP_NAME } from "@/lib/rounds";
import * as store from "@/lib/store";
import { BUREAU_NAME, BUREAUS } from "@/lib/types";

const LETTER: Record<string, [string, string]> = {
  draft: ["Waiting on client approval", ""], attested: ["Approved, ready to mail", "accent"],
  mailed: ["Mailed, awaiting response", ""], closed: ["Closed", ""],
};
const BUSINESS: Record<string, string> = { operating: "Owns an operating business", starting: "Starting a business", planning: "Plans to start later", none: "No business" };

export default async function Client({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const op = await requireOperator();
  const { id } = await params;
  const sp = await searchParams;
  let c;
  try { c = ops.clientFor(op, id); } catch { notFound(); }
  const sum = ops.summarize(c);
  const reports = store.getReports(id);
  const latest = reports.at(-1);
  const funding = fundingStatus(reports[0] ?? null, latest ?? null, today());
  const findings = store.currentFindings(id);
  const cases = store.getCases(id);
  const known = new Set(cases.map((x) => `${x.item_type}:${x.item_id}:${x.bureau}`));
  const ready = [...groupFindings(findings).keys()].filter((k) => !known.has(k)).length + sum.pending;
  const canServe = store.canServe(c);
  const log = store.getLog(id);
  const Client = () => <input type="hidden" name="clientId" value={id} />;

  return (
    <>
      <ConsoleBar name={op.name} signOut={signOutOperator} />
      <main className="wrap" style={{ maxWidth: 1240 }}>
        <Link href="/console" className="small muted">← All clients</Link>
        <div className="row between" style={{ marginTop: 8 }}>
          <h1>{c.name}</h1>
          <span className={`pill ${c.status === "active" ? "dark" : "accent"}`}>{ops.stageName(sum.stage)}</span>
        </div>
        <p className="muted">{c.email}{c.phone ? ` · ${c.phone}` : ""} · {c.city}, {c.state} · {BUSINESS[c.business_stage] ?? c.business_stage}{c.funding_goal ? ` · goal: ${c.funding_goal}` : ""}</p>
        <Flash {...sp} />

        {!canServe && c.status === "active" && c.signed_at && (
          <div className="notice">No dispute work may be done for this client until <strong>{fmt(store.serviceStartDate(c))}</strong>. The 3-business-day cancellation period is still running.</div>
        )}
        {!c.signed_at && <div className="notice">This client has not signed yet. Nothing can be done until they do.</div>}

        <div className="grid g3">
          {BUREAUS.map((b) => (
            <div className="card" key={b} style={{ marginBottom: 0 }}>
              <div className="label">{BUREAU_NAME[b]}</div>
              <div className="stat">{latest?.scores[b] ?? "—"}</div>
              <div className="small muted">{reports[0]?.scores[b] !== undefined ? `Started at ${reports[0].scores[b]}` : "No report"}</div>
            </div>
          ))}
        </div>

        <div className="grid g2" style={{ marginTop: 16 }}>
          <div className="card">
            <h2>Next action</h2>
            <p className="small muted">{ready} item{ready === 1 ? "" : "s"} ready for a letter. You can draft letters; only the client can approve them.</p>
            <div className="row">
              <form action={opPrepareLetters}><Client /><button className="btn accent" type="submit" disabled={!canServe || !ready}>Draft letters</button></form>
            </div>
            <form action={opUploadReport} className="row" style={{ marginTop: 14 }}>
              <Client />
              <input type="file" name="file" required aria-label="Credit report file" accept=".pdf,.html,.htm,.json" />
              <button className="btn" type="submit" disabled={!c.signed_at}>Upload report</button>
            </form>
            <p className="fine" style={{ margin: "8px 0 0" }}>{latest ? `Latest report: ${fmt(latest.pulledAt)} (${latest.source}), ${reports.length} on file.` : "No report on file."}</p>
          </div>
          <div className="card">
            <div className="row between"><h2>Funding</h2><span className={`pill ${funding.unlocked ? "dark" : ""}`}>{funding.unlocked ? "Open" : "Locked"}</span></div>
            <p className="small">{funding.reason}</p>
            {sum.fundingRequested && (
              <form action={opFundingHandled} className="row">
                <Client /><input type="hidden" name="return" value="client" />
                <span className="pill accent">Client asked for a funding review</span>
                <button className="btn" type="submit">Mark handled</button>
              </form>
            )}
            <table style={{ marginTop: 8 }}><tbody>{funding.factors.map((x) => (
              <tr key={x.label}><td className="small">{x.label}</td><td className="small"><strong>{x.value}</strong></td><td><span className={`pill ${x.ok ? "" : "accent"}`}>{x.ok ? "On target" : "Needs work"}</span></td></tr>
            ))}</tbody></table>
          </div>
        </div>

        <h2 style={{ marginTop: 24 }}>Letters</h2>
        <div className="card tablewrap">
          {sum.letters.length === 0 ? <span className="muted">None yet.</span> : (
            <table>
              <thead><tr><th>Round</th><th>To</th><th>Type</th><th>Status</th><th>Mailed</th><th>Due</th><th></th></tr></thead>
              <tbody>{sum.letters.map((l) => (
                <tr key={l.id}>
                  <td>{l.round}</td><td>{l.recipient_name}</td><td className="small">{STEP_NAME[l.step as keyof typeof STEP_NAME]} · {l.cases.length} item{l.cases.length > 1 ? "s" : ""}</td>
                  <td><span className={`pill ${LETTER[l.status][1]}`}>{LETTER[l.status][0]}</span></td>
                  <td className="small">{fmt(l.mailed_at)}</td><td className="small">{fmt(l.due_at)}</td>
                  <td><Link className="btn" href={`/console/clients/${id}/letters/${l.id}`}>Open</Link></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        <h2 style={{ marginTop: 24 }}>Items in dispute</h2>
        <div className="card tablewrap">
          {cases.length === 0 ? <span className="muted">None yet. {findings.length} finding{findings.length === 1 ? "" : "s"} on the current report.</span> : (
            <table>
              <thead><tr><th>Item</th><th>Bureau</th><th>Round</th><th>Basis</th><th>Status</th></tr></thead>
              <tbody>{cases.map((x) => (
                <tr key={x.id}>
                  <td>{x.item_label}</td><td>{BUREAU_NAME[x.bureau as keyof typeof BUREAU_NAME]}</td><td>{x.round}</td>
                  <td className="small muted">{x.findings.map((f) => f.title).join("; ")}</td>
                  <td><span className={`pill ${x.status === "resolved" ? "dark" : ""}`}>{x.resolution ?? x.status.replace(/_/g, " ")}</span></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        <div className="grid g2" style={{ marginTop: 24 }}>
          <div className="card">
            <h2>Internal note</h2>
            <form action={opAddNote}>
              <Client />
              <div className="field"><textarea name="text" rows={3} maxLength={1000} required aria-label="Note" /></div>
              <button className="btn dark" type="submit">Save note</button>
            </form>
            <p className="fine" style={{ margin: "10px 0 0" }}>Notes are kept in the permanent activity record and are not shown to the client.</p>
          </div>
          <div className="card">
            <h2>Activity record</h2>
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              <table><tbody>{log.map((e) => (
                <tr key={e.seq}>
                  <td className="small muted" style={{ whiteSpace: "nowrap" }}>{new Date(e.at).toLocaleDateString("en-US")}</td>
                  <td className="small">{e.actor.replace("operator:", "")}</td>
                  <td className="small">{e.action === "note" ? `Note: ${JSON.parse(e.detail).text}` : e.action.replace(/_/g, " ")}</td>
                </tr>
              ))}</tbody></table>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
