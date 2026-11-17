import Link from "next/link";
import { notFound } from "next/navigation";
import { approveLetter, discardLetter, mailLetter, reword, saveOutcome, uploadReply, confirmReply } from "@/app/actions";
import { ResponseUpload, Suggested } from "@/components/ResponseUpload";
import { filesFor } from "@/lib/files";
import { pendingSuggestions } from "@/lib/responses";
import { PrintButton } from "@/components/PrintButton";
import { Flash, TopBar } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { fmt } from "@/lib/dates";
import { OUTCOME_NAME, STEP_NAME } from "@/lib/rounds";
import { requireClient } from "@/lib/session";
import * as store from "@/lib/store";
import { BUREAU_NAME } from "@/lib/types";

export default async function Letter({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const c = await requireClient();
  const { id } = await params;
  const sp = await searchParams;
  const l = store.getLetter(c.id, id) as any;
  if (!l) notFound();
  const docs = filesFor(c.id, l.id);
  const sugg = pendingSuggestions(l, docs);
  const Hidden = () => <input type="hidden" name="id" value={l.id} />;

  return (
    <>
      <TopBar brand={store.brandOf(c).name} active="disputes" />
      <main className="wrap" style={{ maxWidth: 860 }}>
        <div className="noprint">
          <Link href="/disputes" className="small muted">← All disputes</Link>
          <h1 style={{ marginTop: 8 }}>Round {l.round}: {l.recipient_name}</h1>
          <p className="muted">{STEP_NAME[l.step as keyof typeof STEP_NAME]}</p>
          <Flash {...sp} />

          {l.status === "draft" && (
            <div className="card">
              <h2>Your approval</h2>
              <p className="small muted">Read the letter below. Approve it only if every statement is true. If an item is actually accurate, discard this draft and mark the item accurate on your report.</p>
              <form action={approveLetter}>
                <Hidden />
                <label className="check"><input type="checkbox" name="attest" required /><span>{store.ATTESTATION}</span></label>
                <button className="btn accent" type="submit">Approve this letter</button>
              </form>
              <div className="row" style={{ marginTop: 12 }}>
                {aiEnabled() && <form action={reword}><Hidden /><button className="btn" type="submit">Reword in plain language (AI)</button></form>}
                <form action={discardLetter}><Hidden /><button className="btn link" type="submit">Discard draft</button></form>
              </div>
            </div>
          )}

          {l.status === "attested" && (
            <div className="card">
              <h2>Ready to mail</h2>
              <p className="small muted">Approved {fmt(l.attested_at)}. You send this one yourself:</p>
              <ol className="small" style={{ margin: "0 0 14px", paddingLeft: 18 }}>
                <li>Print the letter and sign it above your name.</li>
                <li>Add a copy of your photo ID and a recent bill or statement showing your address.</li>
                <li>Mail it from the post office by certified mail with return receipt, and keep the receipt.</li>
                <li>Enter the tracking number below. We start the response clock and tell you when the deadline passes.</li>
              </ol>
              <form action={mailLetter} className="row" style={{ alignItems: "flex-end" }}>
                <Hidden />
                <div style={{ flex: "1 1 240px" }}><label htmlFor="tracking">Certified mail tracking number</label><input id="tracking" type="text" name="tracking" required /></div>
                <button className="btn accent" type="submit">Mark as mailed today</button>
                <PrintButton />
              </form>
              <form action={discardLetter} style={{ marginTop: 10 }}><Hidden /><button className="btn link" type="submit">Discard</button></form>
            </div>
          )}

          {(l.status === "mailed" || l.status === "closed") && (
            <div className="card">
              <div className="row between"><h2>Results</h2><PrintButton /></div>
              <p className="small muted">Mailed {fmt(l.mailed_at)} · tracking {l.tracking} · response due {fmt(l.due_at)}. Record what happened to each item when you hear back, or once the deadline passes.</p>
              <ResponseUpload docs={docs} suggestions={sugg} upload={uploadReply} confirm={confirmReply} hidden={<Hidden />} fileBase="/files" aiOn={aiEnabled()} />
              <table><tbody>
                {l.cases.map((x: any) => (
                  <tr key={x.id}>
                    <td>{x.item_label}<div className="small muted">{BUREAU_NAME[x.bureau as keyof typeof BUREAU_NAME]}</div>{!x.outcome && <Suggested s={sugg[x.id]} />}</td>
                    <td style={{ width: 300 }}>
                      {x.outcome ? <span className="pill dark">{OUTCOME_NAME[x.outcome as keyof typeof OUTCOME_NAME]}</span> : (
                        <form action={saveOutcome} className="row" style={{ flexWrap: "nowrap" }}>
                          <Hidden /><input type="hidden" name="caseId" value={x.id} />
                          <select name="outcome" defaultValue={sugg[x.id]?.outcome ?? ""} required aria-label={`Result for ${x.item_label}`}>
                            <option value="" disabled>Result</option>
                            {Object.entries(OUTCOME_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <button className="btn dark" type="submit">Save</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
        </div>
        <div className="paper">{l.body}</div>
      </main>
    </>
  );
}
