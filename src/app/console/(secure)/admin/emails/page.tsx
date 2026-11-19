import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutOperator } from "@/app/console/actions";
import { ConsoleBar } from "@/components/ui";
import { isPlatform } from "@/lib/console";
import { requireOperator } from "@/lib/opsession";
import { SAMPLE_CTX, SEQUENCES, WELCOME } from "@/lib/sequences";

const when = (ms: number) => { const h = ms / 3_600_000; return h < 24 ? `${h} hours` : `${Math.round(h / 24)} days`; };
const START: Record<string, string> = {
  finish_signup: "after they fill in the sign-up form",
  get_report: "after they sign",
  review_freeze: "after their first report is uploaded",
  unlock_letters: "after their letters are ready (direct customers only)",
};

/** Every follow-up email, filled in with sample values, so the owner can read exactly what goes out. */
export default async function Emails() {
  const op = await requireOperator();
  if (!isPlatform(op)) redirect("/console");
  return (
    <>
      <ConsoleBar active="admin" owner name={op.name} signOut={signOutOperator} />
      <main className="wrap" style={{ maxWidth: 760 }}>
        <p className="small"><Link href="/console/admin">← Business</Link></p>
        <h1>Follow-up emails</h1>
        <p className="muted">Sample name and numbers shown. Real emails use each person&apos;s own name, error count and letter count, come from the company they signed up with, and include a one-click unsubscribe. At least 20 hours apart; a sequence stops the moment the person moves to the next step.</p>
        {(() => { const w = WELCOME(SAMPLE_CTX); return (
          <section style={{ marginTop: 32 }}>
            <h2>Welcome</h2>
            <details className="card" open>
              <summary><strong>Welcome email</strong> · right after they fill in the form, to everyone · &ldquo;{w.subject}&rdquo;</summary>
              <div className="doc" style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>{w.body}</div>
              <p className="small muted">Steps they&apos;ve already finished are marked &quot;(done)&quot;. The cost section appears for direct customers only.</p>
            </details>
          </section>
        ); })()}
        {SEQUENCES.map((q) => (
          <section key={q.key} style={{ marginTop: 32 }}>
            <h2>{q.name}</h2>
            {q.steps.map((st, i) => { const m = st.write(SAMPLE_CTX); return (
              <details className="card" key={i} open={i === 0}>
                <summary><strong>Email {i + 1}</strong> · {when(st.after)} {START[q.key]} · &ldquo;{m.subject}&rdquo;</summary>
                <div className="doc" style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>{m.body}</div>
                {m.sms && <p className="small muted">Text (only if they opted in): {m.sms}</p>}
              </details>
            ); })}
          </section>
        ))}
      </main>
    </>
  );
}
