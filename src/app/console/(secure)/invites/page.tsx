import { resendInvites, signOutOperator, uploadInvites } from "@/app/console/actions";
import { ConsoleBar, Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { isPlatform } from "@/lib/console";
import { fmt } from "@/lib/dates";
import { inviteLink, invitesFor, MAX_BATCH } from "@/lib/invites";
import { emailConfigured } from "@/lib/notify";
import { requireOperator } from "@/lib/opsession";

const STATUS: Record<string, [string, string]> = {
  pending: ["Not sent yet", ""], sent: ["Sent", ""], failed: ["Failed", "accent"], joined: ["Joined", "dark"], unsubscribed: ["Unsubscribed", ""],
};

export default async function Invites({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const op = await requireOperator();
  const sp = await searchParams;
  const { rows, totals } = invitesFor(op.tenant_id);
  const Stat = ({ label, value }: { label: string; value: number }) => <div className="card" style={{ marginBottom: 0 }}><div className="label">{label}</div><div className="stat">{value}</div></div>;
  return (
    <>
      <ConsoleBar active="invites" owner={isPlatform(op)} name={op.name} signOut={signOutOperator} />
      <main className="wrap" style={{ maxWidth: 1240 }}>
        <h1>Invite clients</h1>
        <p className="muted">Send your existing clients a personal link to start their free credit review. Their name and email are filled in for them.</p>
        <Flash {...sp} />

        <form action={uploadInvites} className="card">
          <h2>Add people</h2>
          <div className="field"><label htmlFor="list">Paste a list: one person per line, as name, email, phone</label>
            <textarea id="list" name="list" rows={5} placeholder={"Jordan Rivers, jordan@example.com, 386-555-0111\nDana Cole, dana@example.com"} /></div>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 260px" }}><label htmlFor="file">Or upload a CSV export from your client list</label><input id="file" name="file" type="file" accept=".csv,text/csv,text/plain" /></div>
            <SubmitButton pending="Creating invites…">Create and send invites</SubmitButton>
          </div>
          <p className="fine" style={{ margin: "10px 0 0" }}>
            Up to {MAX_BATCH} at a time. Invitations go by email only, never by text, because texting people who have not agreed to it is against the law.
            Each email carries your company's name and address and an unsubscribe link. Only invite people you already have a relationship with.
            {!emailConfigured() && <strong> Email is not switched on yet, so invites are created but not sent; copy each person's link below instead.</strong>}
          </p>
        </form>

        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <Stat label="Invited" value={totals.total} /><Stat label="Sent" value={totals.sent} /><Stat label="Opened" value={totals.opened} />
          <Stat label="Joined" value={totals.joined} /><Stat label="Failed" value={totals.failed} /><Stat label="Unsubscribed" value={totals.unsubscribed} />
        </div>

        <div className="row between" style={{ marginTop: 24 }}>
          <h2 style={{ margin: 0 }}>Everyone invited</h2>
          {emailConfigured() && (totals.pending > 0 || totals.failed > 0) && <form action={resendInvites}><button className="btn" type="submit">Send the {totals.pending + totals.failed} not yet delivered</button></form>}
        </div>
        <div className="card tablewrap" style={{ marginTop: 12 }}>
          {rows.length === 0 ? <span className="muted">No invites yet.</span> : (
            <table>
              <thead><tr><th>Person</th><th>Status</th><th>Sent</th><th>Opened</th><th>Their link</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name || "—"}<div className="small muted">{r.email}</div></td>
                  <td><span className={`pill ${STATUS[r.status]?.[1] ?? ""}`}>{STATUS[r.status]?.[0] ?? r.status}</span>{r.error && <div className="small muted">{r.error.slice(0, 80)}</div>}</td>
                  <td className="small">{r.sent_at ? fmt(r.sent_at.slice(0, 10)) : "—"}</td>
                  <td className="small">{r.opened_at ? fmt(r.opened_at.slice(0, 10)) : "—"}</td>
                  <td className="small"><input type="text" readOnly value={inviteLink(r)} aria-label={`Invite link for ${r.email}`} style={{ fontSize: 12, minWidth: 220 }} /></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
