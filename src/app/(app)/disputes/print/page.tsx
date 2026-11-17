import Link from "next/link";
import { PrintButton } from "@/components/PrintButton";
import { TopBar } from "@/components/ui";
import { brandBarFor } from "@/lib/branding";
import { requireClient } from "@/lib/session";
import * as store from "@/lib/store";

/** Every approved letter on one page, each on its own sheet when printed or saved as PDF. */
export default async function PrintAll() {
  const c = await requireClient();
  const ready = (store.getLetters(c.id) as any[]).filter((l) => l.status === "attested");
  return (
    <>
      <TopBar {...brandBarFor(c)} active="disputes" />
      <main className="wrap" style={{ maxWidth: 860 }}>
        <div className="noprint">
          <Link href="/disputes" className="small muted">← Disputes</Link>
          <div className="row between" style={{ marginTop: 8 }}>
            <h1>Print your letters</h1>
            {ready.length > 0 && <PrintButton />}
          </div>
          <div className="card small">
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Print, or choose "Save as PDF" to keep a copy.</li>
              <li>Sign each letter above your name.</li>
              <li>Put a copy of your photo ID and a recent bill showing your address in each envelope.</li>
              <li>Send each one by certified mail with return receipt, then enter its tracking number on that letter's page.</li>
            </ol>
          </div>
          {ready.length === 0 && <div className="card muted">No approved letters are waiting to be printed.</div>}
        </div>
        {ready.map((l) => <div key={l.id} className="paper print-letter" style={{ marginBottom: 24 }}>{l.body}</div>)}
      </main>
    </>
  );
}
