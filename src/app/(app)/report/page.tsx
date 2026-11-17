import { clearItem, loadSample, reviewDone, stateItem, uploadReport } from "@/app/actions";
import Link from "next/link";
import { Flash, TopBar } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { listMonitoring } from "@/lib/console";
import { fmt } from "@/lib/dates";
import { requireClient } from "@/lib/session";
import * as store from "@/lib/store";
import { BUREAU_NAME, BUREAUS, Finding, ItemType } from "@/lib/types";

const money = (n?: number) => (n === undefined ? "—" : `$${n.toLocaleString("en-US")}`);
const REASONS: Record<string, string> = {
  not_mine: "This is not my account", identity_theft: "This is from identity theft", never_late: "I was never late",
  wrong_balance: "The balance is wrong", paid_in_full: "I paid this in full", other: "Something else is inaccurate",
};

function Statement({ itemType, itemId, current, options, quick }: {
  itemType: ItemType; itemId: string; current?: { reason: string; note?: string }; options?: Record<string, string>; quick?: [string, string];
}) {
  const hidden = <><input type="hidden" name="itemType" value={itemType} /><input type="hidden" name="itemId" value={itemId} /></>;
  if (current) {
    return (
      <form action={clearItem} className="row small" style={{ marginTop: 8 }}>
        {hidden}
        <span className={`pill ${current.reason === "accurate" ? "" : "dark"}`}>
          {current.reason === "accurate" ? "You confirmed this is accurate. It will not be disputed." : `You said: ${REASONS[current.reason] ?? current.reason.replace(/_/g, " ")}`}
        </span>
        <button className="btn link" type="submit">Undo</button>
      </form>
    );
  }
  if (quick) {
    return (
      <form action={stateItem} style={{ marginTop: 6 }}>
        {hidden}<input type="hidden" name="reason" value={quick[0]} />
        <button className="btn link small" type="submit">{quick[1]}</button>
      </form>
    );
  }
  return (
    <details style={{ marginTop: 10 }}>
      <summary className="small">Is something wrong with this item, or is it accurate?</summary>
      <form action={stateItem} className="row" style={{ marginTop: 10, alignItems: "flex-end" }}>
        {hidden}
        <div style={{ flex: "1 1 200px" }}>
          <label>What is wrong</label>
          <select name="reason" defaultValue="">
            <option value="" disabled>Choose one</option>
            {Object.entries(options ?? REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="accurate">Nothing. This is accurate, do not dispute it</option>
          </select>
        </div>
        <div style={{ flex: "2 1 240px" }}><label>Details (optional)</label><input type="text" name="note" maxLength={300} /></div>
        <button className="btn dark" type="submit">Save</button>
      </form>
    </details>
  );
}

function Findings({ list }: { list: Finding[] }) {
  return <>{list.map((f, i) => (
    <div key={i} className={`finding ${f.source === "consumer" ? "consumer" : ""}`}>
      <div className="row" style={{ gap: 8 }}>
        <strong className="small">{f.title}</strong>
        <span className="pill">{BUREAU_NAME[f.bureau]}</span>
        {f.severity === "high" && <span className="pill accent">High impact</span>}
      </div>
      <div className="small">{f.fact}</div>
      <div className="small muted">{f.statutes.join("; ")}</div>
    </div>
  ))}</>;
}

export default async function Report({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const c = await requireClient();
  const sp = await searchParams;
  const report = store.getReports(c.id).at(-1);
  const findings = store.currentFindings(c.id);
  const stated = new Map(store.getAssertions(c.id).map((a) => [`${a.item_type}:${a.item_id}`, { reason: a.reason, note: a.note }]));
  const partners = listMonitoring();
  const by = (type: string, id: string) => findings.filter((f) => f.itemType === type && f.itemId === id);

  return (
    <>
      <TopBar brand={store.brandOf(c).name} active="report" />
      <main className="wrap">
        <h1>Credit report</h1>
        <p className="muted">{report ? `Pulled ${fmt(report.pulledAt)} · source: ${report.source}` : "No report connected yet."}</p>
        <Flash {...sp} />

        <div className="card">
          <h2>{report ? "Add a newer report" : "Step 1. Get your 3-bureau report"}</h2>
          {partners.length > 0 ? (
            <>
              <p className="small muted">{report ? "Pull a fresh report each month so we can see what changed." : "You need a report that shows all three bureaus. Sign up with one of these services, then download your report."}</p>
              <div className="grid g3">
                {partners.map((m) => (
                  <a key={m.id} href={`/go/${m.id}`} target="_blank" rel="sponsored noopener" className="card" style={{ marginBottom: 0, textDecoration: "none" }}>
                    <h3>{m.name} ↗</h3>
                    <span className="small muted">{m.blurb ?? "3-bureau report and scores"}</span>
                  </a>
                ))}
              </div>
              <p className="fine" style={{ margin: "10px 0 0" }}>These services charge their own fee, paid to them and not to us. We may earn a commission if you sign up through these links. You may use any service that provides a 3-bureau report, or your free reports from annualcreditreport.com.</p>
            </>
          ) : <p className="small muted">Download a report that shows all three bureaus from your credit monitoring service, or get your free reports at annualcreditreport.com.</p>}

          <h2 style={{ marginTop: 20 }}>{report ? "Upload it" : "Step 2. Upload it here"}</h2>
          <ol className="small muted" style={{ margin: "0 0 12px", paddingLeft: 18 }}>
            <li>Open the full 3-bureau report in your monitoring account.</li>
            <li>Save it as a PDF (Print, then "Save as PDF"), or save the page as HTML.</li>
            <li>Upload that file below. It is read automatically and audited in about a minute.</li>
          </ol>
          <div className="row">
            <form action={uploadReport} className="row">
              <input type="file" name="file" accept=".pdf,.html,.htm,.json,application/pdf,text/html" required aria-label="Credit report file" />
              <button className="btn accent" type="submit">Upload report</button>
            </form>
            {store.DEMO && <form action={loadSample}><button className="btn" type="submit">Load demo report</button></form>}
          </div>
          {!aiEnabled() && <p className="small" style={{ margin: "10px 0 0", color: "var(--accent-dark)" }}>Report reading is not switched on yet, so PDF and HTML uploads will be refused.</p>}
        </div>

        {report?.source.includes("read by AI") && (
          <div className="notice">This report was read automatically from your file. Check the accounts below against your original report. If anything was read wrong, upload the report again or mark that item accurate so it is not disputed.</div>
        )}

        {report && (
          <>
            <div className="notice gray small">
              Red findings are facts the system detected in the report itself. Black findings are things you told us. An item with no finding is never disputed. If a detected item is actually accurate, mark it accurate and it is left alone.
            </div>

            <h2 style={{ marginTop: 24 }}>Accounts</h2>
            {report.accounts.map((a) => {
              const list = by("account", a.id);
              return (
                <div className="card" key={a.id}>
                  <div className="row between">
                    <div><h3>{a.creditor}</h3><div className="small muted">{a.accountMask} · {a.kind}{a.originalCreditor && a.originalCreditor !== a.creditor ? ` · original creditor: ${a.originalCreditor}` : ""}</div></div>
                    {list.length ? <span className="pill accent">{list.length} finding{list.length > 1 ? "s" : ""}</span> : <span className="pill">No errors detected</span>}
                  </div>
                  <div className="tablewrap" style={{ marginTop: 10 }}>
                    <table>
                      <thead><tr><th>Bureau</th><th>Status</th><th>Balance</th><th>Opened</th><th>First delinquency</th><th>Late marks</th></tr></thead>
                      <tbody>{BUREAUS.map((b) => {
                        const v = a.bureaus[b];
                        return v ? (
                          <tr key={b}><td>{BUREAU_NAME[b]}</td><td>{v.status}</td><td>{money(v.balance)}</td><td>{fmt(v.dateOpened)}</td><td>{fmt(v.dofd)}</td><td>{v.lates?.map((l) => `${l.month} (${l.days})`).join(", ") || "—"}</td></tr>
                        ) : <tr key={b}><td>{BUREAU_NAME[b]}</td><td colSpan={5} className="muted">Not reported</td></tr>;
                      })}</tbody>
                    </table>
                  </div>
                  <Findings list={list} />
                  <Statement itemType="account" itemId={a.id} current={stated.get(`account:${a.id}`)} />
                </div>
              );
            })}

            <h2 style={{ marginTop: 24 }}>Hard inquiries</h2>
            <div className="card">
              {report.inquiries.length === 0 && <p className="muted" style={{ margin: 0 }}>None reported.</p>}
              {report.inquiries.map((i) => (
                <div key={i.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--gray-1)" }}>
                  <div className="row between"><span><strong>{i.creditor}</strong> <span className="muted small">· {BUREAU_NAME[i.bureau]} · {fmt(i.date)}</span></span></div>
                  <Findings list={by("inquiry", i.id)} />
                  <Statement itemType="inquiry" itemId={i.id} current={stated.get(`inquiry:${i.id}`)} quick={["unauthorized_inquiry", "I did not authorize this inquiry"]} />
                </div>
              ))}
            </div>

            <h2 style={{ marginTop: 24 }}>Personal information</h2>
            <div className="card">
              {BUREAUS.filter((b) => report.personal[b]).map((b) => (
                <div key={b} style={{ marginBottom: 12 }}>
                  <div className="label">{BUREAU_NAME[b]}</div>
                  {(["name", "address", "employer"] as const).flatMap((kind) =>
                    (report.personal[b]![`${kind === "address" ? "addresse" : kind}s` as "names" | "addresses" | "employers"] ?? []).map((value) => {
                      const id = `${b}|${kind}|${value}`;
                      return (
                        <div key={id} className="row between" style={{ padding: "4px 0" }}>
                          <span className="small"><span className="muted">{kind}:</span> {value}</span>
                          <Statement itemType="personal" itemId={id} current={stated.get(`personal:${id}`)} quick={["wrong_personal", "Not mine"]} />
                        </div>
                      );
                    }))}
                </div>
              ))}
            </div>
            <div className="card" style={{ marginTop: 24, borderColor: c.report_reviewed_at ? undefined : "var(--accent)" }}>
              {c.report_reviewed_at ? (
                <div className="row between"><span><span className="pill dark">Reviewed</span> <span className="small muted">You can still change any item above until your letters are prepared.</span></span>
                  <Link className="btn" href="/freeze">Go to the freeze step</Link></div>
              ) : (
                <form action={reviewDone} className="row between">
                  <span><strong>Finished reviewing?</strong> <span className="small muted">Confirm you have checked every item. Next you'll freeze the secondary bureaus.</span></span>
                  <button className="btn accent" type="submit">I've reviewed my report</button>
                </form>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
