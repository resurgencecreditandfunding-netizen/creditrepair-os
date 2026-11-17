import Link from "next/link";
import { demoRefresh } from "@/app/actions";
import { JourneyMap } from "@/components/JourneyMap";
import { Flash, TopBar } from "@/components/ui";
import { journey } from "@/lib/journey";
import { lessonsFor } from "@/lib/lessons";
import { winsFor } from "@/lib/wins";
import { fmt, today } from "@/lib/dates";
import { fundingStatus } from "@/lib/funding";
import { requireClient } from "@/lib/session";
import { brandBarFor } from "@/lib/branding";
import * as store from "@/lib/store";
import { BUREAU_NAME, BUREAUS } from "@/lib/types";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const c = await requireClient();
  const sp = await searchParams;
  const reports = store.getReports(c.id);
  const first = reports[0] ?? null, latest = reports.at(-1) ?? null;
  const funding = fundingStatus(first, latest, today());
  const cases = store.getCases(c.id);
  const letters = store.getLetters(c.id);
  const findings = store.currentFindings(c.id);
  const open = cases.filter((x) => !["resolved", "exhausted"].includes(x.status));
  const resolved = cases.filter((x) => x.status === "resolved");
  const waiting = letters.filter((l: any) => l.status === "mailed");

  const map = journey(c);
  const wins = winsFor(c);

  return (
    <>
      <TopBar {...brandBarFor(c)} active="dashboard" />
      <main className="wrap">
        <h1>Welcome, {c.name.split(" ")[0]}</h1>
        <p className="muted">{(c.price_cents ?? 0) > 0 ? "Your guided path from credit errors to funding." : "Free credit repair, then funding."}</p>
        <Flash {...sp} />
        {c.status !== "active" && <div className="notice">Your services are cancelled. <Link href="/documents">View your documents</Link>.</div>}

        <div className="grid g3">
          {BUREAUS.map((b) => {
            const now = latest?.scores[b], was = first?.scores[b];
            const d = now !== undefined && was !== undefined ? now - was : 0;
            return (
              <div className="card" key={b} style={{ marginBottom: 0 }}>
                <div className="label">{BUREAU_NAME[b]}</div>
                <div className="stat">{now ?? "—"}</div>
                <div className="small muted">{d > 0 ? <span className="pill dark">+{d} since start</span> : was !== undefined ? `Started at ${was}` : "No report yet"}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16 }}><JourneyMap {...map} lessons={lessonsFor(c.tenant_id)} /></div>
        {wins.length > 0 && (
          <div className="notice row between">
            <span><strong>You have {wins.length} win{wins.length > 1 ? "s" : ""} to share.</strong> {wins[0].big} {wins[0].line}.</span>
            <Link className="btn accent" href="/wins">See your win cards</Link>
          </div>
        )}

        <div className="grid g2">
          <div className="card">
            <h2>Dispute progress</h2>
            <table><tbody>
              <tr><td>Errors found on your current report</td><td><strong>{findings.length}</strong></td></tr>
              <tr><td>Items in dispute</td><td><strong>{open.length}</strong></td></tr>
              <tr><td>Items deleted or corrected</td><td><strong>{resolved.length}</strong></td></tr>
              <tr><td>Letters awaiting a response</td><td><strong>{waiting.length}</strong></td></tr>
            </tbody></table>
          </div>
          <div className="card">
            <div className="row between"><h2>Funding</h2><span className={`pill ${funding.unlocked ? "dark" : "accent"}`}>{funding.unlocked ? "Open" : "Locked"}</span></div>
            <p>{funding.reason}</p>
            {!funding.unlocked && funding.current !== null && (
              <>
                <div className="bar"><span style={{ width: `${Math.max(4, Math.min(100, (funding.gain / 20) * 100))}%` }} /></div>
                <p className="small muted" style={{ marginTop: 8 }}>{funding.pointsToGo} points to go. Middle score now {funding.current}, started at {funding.baseline}.</p>
              </>
            )}
            <Link className="btn" href="/funding">Funding readiness</Link>
          </div>
        </div>

        {store.DEMO && latest && (
          <form action={demoRefresh} className="notice gray row between">
            <span className="small"><strong>Demo mode.</strong> Simulate a fresh report that reflects the results you recorded.</span>
            <button className="btn" type="submit">Simulate new report</button>
          </form>
        )}
      </main>
    </>
  );
}
