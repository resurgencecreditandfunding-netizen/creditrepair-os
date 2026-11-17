import { cancel, setReminderPrefs, signOut } from "@/app/actions";
import { Flash, TopBar } from "@/components/ui";
import { fmt } from "@/lib/dates";
import { requireClient } from "@/lib/session";
import { brandBarFor } from "@/lib/branding";
import * as store from "@/lib/store";

export default async function Documents({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const c = await requireClient();
  const sp = await searchParams;
  const docs = store.getAgreements(c.id);
  const events = store.getLog(c.id);
  return (
    <>
      <TopBar {...brandBarFor(c)} active="documents" />
      <main className="wrap">
        <h1>Documents</h1>
        <p className="muted">Everything you received and signed, exactly as it was shown to you.</p>
        <Flash {...sp} />
        {docs.map((d) => (
          <details className="card" key={d.id}>
            <summary>{d.doc_title} <span className="pill" style={{ marginLeft: 8 }}>{d.kind === "signed" ? "Signed" : "Received"} {fmt(d.at)}</span></summary>
            <div className="doc">{d.doc_body}</div>
            {d.signed_name && <div style={{ marginTop: 12 }}><div className="label">Signed electronically</div><div className="sig" style={{ fontSize: 26 }}>{d.signed_name}</div></div>}
            <p className="fine" style={{ margin: "10px 0 0" }}>Version {d.doc_version} · {new Date(d.at).toUTCString()} · IP {d.ip} · document fingerprint {d.doc_hash.slice(0, 16)}…</p>
          </details>
        ))}

        <form action={setReminderPrefs} className="card">
          <h2>Reminders</h2>
          <p className="small muted">We remind you when something is waiting on you, such as a letter to approve or a response deadline that has passed.</p>
          <label className="check"><input type="checkbox" name="reminders" defaultChecked={!c.reminders_off} /><span>Send me reminders</span></label>
          <label className="check"><input type="checkbox" name="texts" defaultChecked={!!c.sms_opt_in_at} disabled={!c.phone} />
            <span>Also by text message{c.phone ? ` to ${c.phone}` : " (add a mobile number to your account first)"}. Message and data rates may apply. Reply STOP to opt out.</span></label>
          <button className="btn dark" type="submit">Save</button>
        </form>

        <div className="card">
          <h2>Cancel</h2>
          {c.status === "active" ? (
            <>
              <p className="small muted">You can cancel at any time, for any reason, at no cost. Your 3-business-day right to cancel runs through {fmt(store.cancelDeadline(c.signed_at.slice(0, 10)))}, and you may still cancel after that.</p>
              <form action={cancel}><button className="btn" type="submit">Cancel my services</button></form>
            </>
          ) : <span className="pill accent">Services cancelled</span>}
        </div>

        <details className="card">
          <summary>Activity record ({events.length})</summary>
          <div className="tablewrap" style={{ marginTop: 10 }}><table>
            <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
            <tbody>{events.map((e) => <tr key={e.seq}><td className="small">{new Date(e.at).toLocaleString("en-US")}</td><td className="small">{e.actor}</td><td className="small">{e.action.replace(/_/g, " ")}</td></tr>)}</tbody>
          </table></div>
        </details>
        <form action={signOut}><button className="btn link" type="submit">Sign out of this device</button></form>
      </main>
    </>
  );
}
