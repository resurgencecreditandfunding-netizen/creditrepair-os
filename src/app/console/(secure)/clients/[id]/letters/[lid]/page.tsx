import Link from "next/link";
import { notFound } from "next/navigation";
import { opMailLetter, opSaveOutcome, signOutOperator, opUploadReply, opConfirmReply } from "@/app/console/actions";
import { ResponseUpload, Suggested } from "@/components/ResponseUpload";
import { aiEnabled } from "@/lib/ai";
import { filesFor } from "@/lib/files";
import { pendingSuggestions } from "@/lib/responses";
import { PrintButton } from "@/components/PrintButton";
import { ConsoleBar, Flash } from "@/components/ui";
import * as ops from "@/lib/console";
import { fmt } from "@/lib/dates";
import { requireOperator } from "@/lib/opsession";
import { OUTCOME_NAME, STEP_NAME } from "@/lib/rounds";
import * as store from "@/lib/store";
import { BUREAU_NAME } from "@/lib/types";

export default async function OpLetter({ params, searchParams }: { params: Promise<{ id: string; lid: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const op = await requireOperator();
  const { id, lid } = await params;
  const sp = await searchParams;
  let c;
  try { c = ops.clientFor(op, id); } catch { notFound(); }
  const l = store.getLetter(id, lid) as any;
  if (!l) notFound();
  const docs = filesFor(id, l.id);
  const sugg = pendingSuggestions(l, docs);
  const Ids = () => <><input type="hidden" name="clientId" value={id} /><input type="hidden" name="id" value={lid} /></>;

  return (
    <>
      <ConsoleBar owner={op.role === "platform"} name={op.name} signOut={signOutOperator} />
      <main className="wrap" style={{ maxWidth: 860 }}>
        <div className="noprint">
          <Link href={`/console/clients/${id}`} className="small muted">← {c.name}</Link>
          <h1 style={{ marginTop: 8 }}>Round {l.round}: {l.recipient_name}</h1>
          <p className="muted">{STEP_NAME[l.step as keyof typeof STEP_NAME]} · for {c.name}</p>
          <Flash {...sp} />

          {l.status === "draft" && (
            <div className="notice">Waiting on the client. This letter cannot be mailed until {c.name.split(" ")[0]} reads and approves it in their account. Staff cannot approve on a client's behalf.</div>
          )}
          {l.status === "attested" && (
            <div className="card">
              <h2>Mail this letter</h2>
              <p className="small muted">Client approved {fmt(l.attested_at)}. Print it, have the client sign or apply their signature on file, enclose ID and proof of address, and send by certified mail.</p>
              <form action={opMailLetter} className="row" style={{ alignItems: "flex-end" }}>
                <Ids />
                <div style={{ flex: "1 1 240px" }}><label htmlFor="tracking">Certified mail tracking number</label><input id="tracking" type="text" name="tracking" required /></div>
                <button className="btn accent" type="submit">Mark as mailed today</button>
                <PrintButton />
              </form>
            </div>
          )}
          {(l.status === "mailed" || l.status === "closed") && (
            <div className="card">
              <div className="row between"><h2>Results</h2><PrintButton /></div>
              <p className="small muted">Mailed {fmt(l.mailed_at)} · tracking {l.tracking} · response due {fmt(l.due_at)}.</p>
              <ResponseUpload docs={docs} suggestions={sugg} upload={opUploadReply} confirm={opConfirmReply} hidden={<Ids />} fileBase="/console/files" aiOn={aiEnabled()} />
              <table><tbody>{l.cases.map((x: any) => (
                <tr key={x.id}>
                  <td>{x.item_label}<div className="small muted">{BUREAU_NAME[x.bureau as keyof typeof BUREAU_NAME]}</div>{!x.outcome && <Suggested s={sugg[x.id]} />}</td>
                  <td style={{ width: 300 }}>
                    {x.outcome ? <span className="pill dark">{OUTCOME_NAME[x.outcome as keyof typeof OUTCOME_NAME]}</span> : (
                      <form action={opSaveOutcome} className="row" style={{ flexWrap: "nowrap" }}>
                        <Ids /><input type="hidden" name="caseId" value={x.id} />
                        <select name="outcome" defaultValue={sugg[x.id]?.outcome ?? ""} required aria-label={`Result for ${x.item_label}`}>
                          <option value="" disabled>Result</option>
                          {Object.entries(OUTCOME_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <button className="btn dark" type="submit">Record</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}</tbody></table>
            </div>
          )}
        </div>
        <div className="paper">{l.body}</div>
      </main>
    </>
  );
}
