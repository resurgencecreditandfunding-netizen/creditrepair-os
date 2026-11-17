import { requestFunding } from "@/app/actions";
import { Flash, TopBar } from "@/components/ui";
import { today } from "@/lib/dates";
import { fundingStatus, FUNDING_RULES } from "@/lib/funding";
import { freezeProgress } from "@/lib/freeze";
import { DEAL_STATUS, dealsFor, openDeal } from "@/lib/funding-deals";
import { requireClient } from "@/lib/session";
import { brandBarFor } from "@/lib/branding";
import * as store from "@/lib/store";

export default async function Funding({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const c = await requireClient();
  const sp = await searchParams;
  const reports = store.getReports(c.id);
  const f = fundingStatus(reports[0] ?? null, reports.at(-1) ?? null, today());
  const frozen = freezeProgress(c).list.filter((x) => x.status === "frozen");
  const deals = dealsFor(c.id);
  const requested = !!openDeal(c.id);
  return (
    <>
      <TopBar {...brandBarFor(c)} active="funding" />
      <main className="wrap">
        <div className="row between"><h1>Funding</h1><span className={`pill ${f.unlocked ? "dark" : "accent"}`}>{f.unlocked ? "Open" : "Locked"}</span></div>
        <p className="muted">{f.reason}</p>
        <Flash {...sp} />

        {!f.unlocked && (
          <div className="card">
            <h2>How funding opens</h2>
            <p>Funding opens when your middle credit score improves by {FUNDING_RULES.minGain} points, or reaches {FUNDING_RULES.fundableScore}. Applying before then usually means a denial and a hard inquiry that sets you back.</p>
            {f.current !== null && (
              <>
                <div className="bar"><span style={{ width: `${Math.max(4, Math.min(100, (f.gain / FUNDING_RULES.minGain) * 100))}%` }} /></div>
                <p className="small muted" style={{ marginTop: 8 }}>Middle score {f.current} · started at {f.baseline} · {f.pointsToGo} points to go</p>
              </>
            )}
          </div>
        )}

        {f.unlocked && c.status === "active" && (
          <div className="card">
            <h2>You are ready for a funding review</h2>
            <p>We compare your profile with credit union and lender requirements and show you the options you are likely to qualify for. Seeking funding is optional. We are paid by the lender only if you choose a product, and we tell you about that compensation before you apply.</p>
            {requested ? <p><span className="pill dark">{DEAL_STATUS[openDeal(c.id)!.status as keyof typeof DEAL_STATUS]}</span> <span className="small muted">We will contact you about your options.</span></p> : (
              <form action={requestFunding}>
                {frozen.length > 0 && (
                  <div className="notice">
                    <strong>Lift your freezes first.</strong> Lenders check some of these reports, and a frozen report can mean an automatic denial. Lift (or temporarily thaw) each one on its own site:
                    <ul className="small" style={{ margin: "8px 0" }}>{frozen.map((x) => <li key={x.bureau.id}><a href={x.bureau.url} target="_blank" rel="noopener">{x.bureau.name} ↗</a></li>)}</ul>
                    <label className="check"><input type="checkbox" name="lifted" required /><span>I have lifted, or scheduled a temporary lift of, the freezes I placed.</span></label>
                  </div>
                )}
                <button className="btn accent big" type="submit">Request my funding review</button>
              </form>
            )}
            <p className="fine" style={{ marginTop: 14, marginBottom: 0 }}>No approval, amount, or terms are guaranteed. Every application must be truthful and complete.</p>
          </div>
        )}

        {deals.length > 0 && (
          <div className="card">
            <h2>Your funding history</h2>
            <table><tbody>{deals.map((d) => (
              <tr key={d.id}><td className="small">{new Date(d.created_at).toLocaleDateString("en-US")}</td><td><span className="pill">{DEAL_STATUS[d.status as keyof typeof DEAL_STATUS]}</span></td>
                <td className="small">{d.lender ?? ""}{d.product ? ` · ${d.product}` : ""}</td><td>{d.funded_amount ? `$${Number(d.funded_amount).toLocaleString("en-US")}` : ""}</td></tr>
            ))}</tbody></table>
          </div>
        )}

        {f.factors.length > 0 && (
          <div className="card">
            <h2>What lenders look at</h2>
            <div className="tablewrap"><table>
              <thead><tr><th>Factor</th><th>You</th><th></th><th>Target</th></tr></thead>
              <tbody>{f.factors.map((x) => (
                <tr key={x.label}><td>{x.label}</td><td><strong>{x.value}</strong></td>
                  <td><span className={`pill ${x.ok ? "dark" : "accent"}`}>{x.ok ? "On target" : "Needs work"}</span></td>
                  <td className="small muted">{x.tip}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
        )}
      </main>
    </>
  );
}
