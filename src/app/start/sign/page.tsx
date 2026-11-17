import { redirect } from "next/navigation";
import { signAll } from "@/app/actions";
import { TopBar } from "@/components/ui";
import { fmt, today } from "@/lib/dates";
import { contractDocs } from "@/lib/documents";
import { brandBarFor } from "@/lib/branding";
import { currentClient } from "@/lib/session";
import { brandOf, cancelDeadline, priceAtSigning } from "@/lib/store";
import { priceLabel } from "@/lib/paywall";

export default async function Sign() {
  const c = await currentClient();
  if (!c) redirect("/start");
  if (!c.disclosure_ack_at) redirect("/start/disclosure");
  if (c.signed_at) redirect("/dashboard");
  const brand = brandOf(c);
  const deadline = cancelDeadline(today());
  const price = priceAtSigning(c.tenant_id);
  const docs = contractDocs(brand, fmt(deadline), price);
  return (
    <>
      <TopBar {...brandBarFor(c)} nav={false} />
      <main className="wrap narrow">
        <ol className="steps"><li className="done">Your details</li><li className="done">Your rights</li><li className="now">Sign</li></ol>
        <h1>Review and sign</h1>
        <p className="muted">Five short documents. One click signs all of them. {price > 0 ? `Free to start; your completed letters are ${priceLabel(price)}, paid once, only when they are ready.` : "Total cost: $0."}</p>
        {docs.map((d, i) => (
          <details className="card" key={d.key} open={i === 1}>
            <summary>{d.title}</summary>
            <div className="doc">{d.body}</div>
          </details>
        ))}
        <div className="card">
          <div className="label">Your signature</div>
          <div className="sig">{c.name}</div>
          <p className="small muted" style={{ marginTop: 10 }}>
            By clicking the button you adopt this as your electronic signature and sign all five documents above, dated {fmt(today())}.
          </p>
          <p style={{ fontWeight: 700 }}>
            You may cancel this contract without penalty or obligation at any time before midnight of the 3rd business day after the date on which you signed the contract ({fmt(deadline)}). See the Notice of Cancellation above for an explanation of this right.
          </p>
          <form action={signAll}>
            <button className="btn accent big" type="submit">Adopt signature and sign all</button>
          </form>
        </div>
      </main>
    </>
  );
}
