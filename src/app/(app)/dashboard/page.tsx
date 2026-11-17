import Link from "next/link";
import { demoRefresh } from "@/app/actions";
import { Flash, TopBar } from "@/components/ui";
import { fmt, today } from "@/lib/dates";
import { fundingStatus } from "@/lib/funding";
import { requireClient } from "@/lib/session";
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
  const drafts = letters.filter((l: any) => l.status === "draft");
  const waiting = letters.filter((l: any) => l.status === "mailed");
  const canServe = store.canServe(c);

  const stage = !latest ? 1 : !cases.length ? 2 : funding.unlocked ? 4 : 3;
  const steps = ["Signed", "Report connected", "Disputes in rounds", "Funding open"];

  let next: { text: string; href: string; cta: string };
  if (c.status !== "active") next = { text: "Your services are cancelled.", href: "/documents", cta: "View documents" };
  else if (!latest) next = { text: "Connect your credit report so we can audit it.", href: "/report", cta: "Connect report" };
  else if (drafts.length) next = { text: `${drafts.length} letter${drafts.length > 1 ? "s are" : " is"} waiting for your approval.`, href: "/disputes", cta: "Review letters" };
  else if (!canServe) next = { text: `Your cancellation period runs through ${fmt(store.cancelDeadline(c.signed_at.slice(0, 10)))}. Disputes can begin on ${fmt(store.serviceStartDate(c))}. Review your report in the meantime.`, href: "/report", cta: "Review report" };
  else if (cases.some((x) => x.status === "pending_letter") || (findings.length && !cases.length)) next = { text: "Items are ready for the next round of letters.", href: "/disputes", cta: "Prepare letters" };
  else if (waiting.length) next = { text: `Waiting on ${waiting.length} response${waiting.length > 1 ? "s" : ""}. Next deadline: ${fmt(waiting.map((l: any) => l.due_at).sort()[0])}.`, href: "/disputes", cta: "View disputes" };
  else if (funding.unlocked) next = { text: "Your funding options are open.", href: "/funding", cta: "See funding" };
  else next = { text: "Review your report and tell us about anything that is wrong.", href: "/report", cta: "Review report" };

  return (
    <>
      <TopBar brand={store.brandOf(c).name} active="dashboard" />
      <main className="wrap">
        <h1>Welcome, {c.name.split(" ")[0]}</h1>
        <p className="muted">Free credit repair, then funding.</p>
        <Flash {...sp} />
        <ol className="steps">
          {steps.map((s, i) => <li key={s} className={i < stage ? "done" : i === stage ? "now" : ""}>{s}</li>)}
        </ol>
        <div className="notice row between">
          <span><strong>Next step.</strong> {next.text}</span>
          <Link className="btn accent" href={next.href}>{next.cta}</Link>
        </div>

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

        <div className="grid g2" style={{ marginTop: 16 }}>
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
