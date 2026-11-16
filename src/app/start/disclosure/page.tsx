import { redirect } from "next/navigation";
import { acknowledgeDisclosure } from "@/app/actions";
import { TopBar } from "@/components/ui";
import { disclosureDoc } from "@/lib/documents";
import { currentClient } from "@/lib/session";
import { brandOf } from "@/lib/store";

export default async function Disclosure() {
  const c = await currentClient();
  if (!c) redirect("/start");
  if (c.disclosure_ack_at) redirect("/start/sign");
  const doc = disclosureDoc();
  return (
    <>
      <TopBar brand={brandOf(c).name} nav={false} />
      <main className="wrap narrow">
        <ol className="steps"><li className="done">Your details</li><li className="now">Your rights</li><li>Sign</li></ol>
        <h1>Read this first</h1>
        <p className="muted">Federal law requires that you receive this statement, on its own, before you are shown any agreement.</p>
        <div className="card">
          <div className="doc" style={{ maxHeight: "none", background: "#fff", border: 0, padding: 0, margin: 0 }}>{doc.body}</div>
        </div>
        <form action={acknowledgeDisclosure}>
          <button className="btn red big" type="submit">I have received and read this statement</button>
        </form>
      </main>
    </>
  );
}
