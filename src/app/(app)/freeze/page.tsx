import Link from "next/link";
import { recordFreeze, undoFreeze } from "@/app/actions";
import { Flash, TopBar } from "@/components/ui";
import { fmt } from "@/lib/dates";
import { freezeProgress } from "@/lib/freeze";
import { requireClient } from "@/lib/session";
import * as store from "@/lib/store";

export default async function Freeze({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const c = await requireClient();
  const sp = await searchParams;
  const p = freezeProgress(c);
  return (
    <>
      <TopBar brand={store.brandOf(c).name} />
      <main className="wrap" style={{ maxWidth: 860 }}>
        <Link href="/dashboard" className="small muted">← Dashboard</Link>
        <div className="row between" style={{ marginTop: 8 }}>
          <h1>Freeze the secondary bureaus</h1>
          <span className={`pill ${p.complete ? "dark" : "accent"}`}>{p.complete ? "Step complete" : `${p.addressed} of ${p.total} done`}</span>
        </div>
        <p className="muted">Before your dispute letters go out, place a security freeze with each of these smaller reporting companies.</p>
        <Flash {...sp} />

        <div className="card small">
          <p><strong>What a freeze does.</strong> It stops the company from sharing your report with anyone new unless you allow it. That protects you against identity theft while your disputes are open and limits how widely your information is passed around.</p>
          <p><strong>What it costs.</strong> Nothing. Freezes are free and do not change your credit scores.</p>
          <p style={{ margin: 0 }}><strong>What to know.</strong> A freeze does not guarantee any dispute result. Before you apply for funding or open a bank account, you will need to lift the freezes lenders check. We remind you at that step. Keep any PIN or confirmation number each company gives you.</p>
        </div>

        {p.list.map(({ bureau: b, status, confirmation, at }) => (
          <div className="card" key={b.id}>
            <div className="row between">
              <div><h3>{b.name}</h3>{b.note && <div className="small muted">{b.note}</div>}</div>
              {status && <span className={`pill ${status === "frozen" ? "dark" : ""}`}>{status === "frozen" ? "Frozen" : "Skipped"} {fmt(at!.slice(0, 10))}</span>}
            </div>
            {status ? (
              <div className="row small" style={{ marginTop: 10 }}>
                {confirmation && <span className="muted">Confirmation: {confirmation}</span>}
                {!p.complete && <form action={undoFreeze}><input type="hidden" name="bureauId" value={b.id} /><button className="btn link" type="submit">Undo</button></form>}
              </div>
            ) : (
              <>
                <a className="btn" href={b.url} target="_blank" rel="noopener" style={{ marginTop: 12 }}>Open {b.name.split(" (")[0]} ↗</a>
                <form action={recordFreeze} className="row" style={{ marginTop: 12, alignItems: "flex-end" }}>
                  <input type="hidden" name="bureauId" value={b.id} />
                  <div style={{ flex: "1 1 220px" }}><label>Confirmation number or PIN (optional, for your records)</label><input type="text" name="confirmation" maxLength={80} autoComplete="off" /></div>
                  <button className="btn accent" type="submit" name="status" value="frozen">I froze it</button>
                  <button className="btn link" type="submit" name="status" value="skipped">Skip this one</button>
                </form>
              </>
            )}
          </div>
        ))}

        {p.complete ? (
          <div className="notice row between"><span><strong>Freeze step complete.</strong> Your letters can now be prepared.</span><Link className="btn accent" href="/disputes">Go to disputes</Link></div>
        ) : (
          <p className="small muted">Mark each company as frozen or skipped to finish this step. Skipping one is your choice; for example, you may want ChexSystems open if you plan to open a bank account soon.</p>
        )}
      </main>
    </>
  );
}
