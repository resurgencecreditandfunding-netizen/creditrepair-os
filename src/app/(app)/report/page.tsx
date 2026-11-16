import { clearItem, loadSample, stateItem, uploadReport } from "@/app/actions";
import { Flash, TopBar } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
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
        {f.severity === "high" && <span className="pill red">High impact</span>}
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
  const by = (type: string, id: string) => findings.filter((f) => f.itemType === type && f.itemId === id);

  return (
    <>
      <TopBar brand={store.brandOf(c).name} active="report" />
      <main className="wrap">
        <h1>Credit report</h1>
        <p className="muted">{report ? `Pulled ${fmt(report.pulledAt)} · source: ${report.source}` : "No report connected yet."}</p>
        <Flash {...sp} />

        <div className="card">
          <h2>{report ? "Add a newer report" : "Connect your report"}</h2>
          <div className="row">
            <form action={uploadReport} className="row">
              <input type="file" name="file" accept={aiEnabled() ? ".json,.pdf,application/pdf,application/json" : ".json,application/json"} required />
              <button className="btn dark" type="submit">Upload</button>
            </form>
            {store.DEMO && <form action={loadSample}><button className="btn" type="submit">Load demo report</button></form>}
          </div>
          <p className="small muted" style={{ margin: "10px 0 0" }}>
            {aiEnabled() ? "Upload a 3-bureau report as PDF (read by AI, then checked) or as JSON." : "Upload a report as JSON. PDF reading turns on when an AI key is configured. A live bureau connection is the next integration."}
          </p>
        </div>

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
                    {list.length ? <span className="pill red">{list.length} finding{list.length > 1 ? "s" : ""}</span> : <span className="pill">No errors detected</span>}
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
          </>
        )}
      </main>
    </>
  );
}
