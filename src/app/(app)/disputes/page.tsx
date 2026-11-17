import Link from "next/link";
import { prepareLetters } from "@/app/actions";
import { Flash, TopBar } from "@/components/ui";
import { fmt } from "@/lib/dates";
import { groupFindings, STEP_NAME } from "@/lib/rounds";
import { requireClient } from "@/lib/session";
import * as store from "@/lib/store";
import { BUREAU_NAME } from "@/lib/types";

const STATUS: Record<string, [string, string]> = {
  draft: ["Needs your approval", "accent"], attested: ["Approved, ready to mail", "dark"],
  mailed: ["Mailed, awaiting response", ""], closed: ["Closed", ""],
};
const CASE_STATUS: Record<string, string> = {
  pending_letter: "Queued for next letter", in_letter: "In a letter", awaiting_response: "Awaiting response",
  resolved: "Resolved", exhausted: "All rounds used",
};

export default async function Disputes({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const c = await requireClient();
  const sp = await searchParams;
  const letters = store.getLetters(c.id) as any[];
  const cases = store.getCases(c.id);
  const known = new Set(cases.map((x) => `${x.item_type}:${x.item_id}:${x.bureau}`));
  const fresh = [...groupFindings(store.currentFindings(c.id)).keys()].filter((k) => !known.has(k)).length;
  const ready = fresh + cases.filter((x) => x.status === "pending_letter").length;
  const canServe = store.canServe(c);
  const blocker = !c.report_reviewed_at ? { text: "Review your credit report first.", href: "/report", cta: "Review report" }
    : !c.freeze_done_at ? { text: "Complete the secondary bureau freeze step before your letters are prepared.", href: "/freeze", cta: "Go to freezes" } : null;

  return (
    <>
      <TopBar brand={store.brandOf(c).name} active="disputes" />
      <main className="wrap">
        <h1>Disputes</h1>
        <p className="muted">Round 1 always asks the bureau to reinvestigate and verify. What follows depends on how they answer.</p>
        <Flash {...sp} />

        {!canServe && c.status === "active" && (
          <div className="notice">Disputes can begin on <strong>{fmt(store.serviceStartDate(c))}</strong>, after your 3-business-day cancellation period ends. This waiting period is required by federal law.</div>
        )}
        {blocker && c.status === "active" && (
          <div className="notice row between"><span>{blocker.text}</span><Link className="btn accent" href={blocker.href}>{blocker.cta}</Link></div>
        )}
        {c.status !== "active" && <div className="notice">Your services are cancelled. No further letters will be prepared.</div>}

        <div className="card row between">
          <div><h2 style={{ margin: 0 }}>{ready} item{ready === 1 ? "" : "s"} ready for a letter</h2>
            <div className="small muted">Strongest items go first, up to 5 accounts per letter, one open letter per bureau at a time. Nothing is sent until you approve it.</div></div>
          <form action={prepareLetters}><button className="btn accent" type="submit" disabled={!canServe || !ready || !!blocker}>Prepare letters</button></form>
        </div>

        <h2 style={{ marginTop: 24 }}>Letters</h2>
        {letters.length === 0 && <div className="card muted">No letters yet.</div>}
        {letters.map((l) => (
          <div className="card row between" key={l.id}>
            <div>
              <div className="row" style={{ gap: 8 }}>
                <span className="pill dark">Round {l.round}</span>
                <strong>{l.recipient_name}</strong>
                <span className={`pill ${STATUS[l.status][1]}`}>{STATUS[l.status][0]}</span>
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>
                {STEP_NAME[l.step as keyof typeof STEP_NAME]} · {l.cases.length} item{l.cases.length > 1 ? "s" : ""}
                {l.mailed_at ? ` · mailed ${fmt(l.mailed_at)} · response due ${fmt(l.due_at)}` : ""}
              </div>
            </div>
            <Link className={`btn ${l.status === "draft" ? "accent" : ""}`} href={`/disputes/${l.id}`}>{l.status === "draft" ? "Review" : "Open"}</Link>
          </div>
        ))}

        <h2 style={{ marginTop: 24 }}>Every item in dispute</h2>
        <div className="card tablewrap">
          {cases.length === 0 ? <span className="muted">Nothing in dispute yet.</span> : (
            <table>
              <thead><tr><th>Item</th><th>Bureau</th><th>Round</th><th>Status</th></tr></thead>
              <tbody>{cases.map((x) => (
                <tr key={x.id}>
                  <td>{x.item_label}</td><td>{BUREAU_NAME[x.bureau as keyof typeof BUREAU_NAME]}</td><td>{x.round}</td>
                  <td>{x.resolution ? <span className="pill dark">{x.resolution}</span> : <span className="pill">{CASE_STATUS[x.status]}</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
