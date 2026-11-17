import { unsubscribe } from "@/app/actions";
import { TopBar } from "@/components/ui";
import { PRODUCT } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** A button rather than a one-click link, so mail scanners cannot unsubscribe people by opening the link. */
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ i?: string; done?: string }> }) {
  const { i, done } = await searchParams;
  return (
    <>
      <TopBar brand={PRODUCT} nav={false} />
      <main className="wrap" style={{ maxWidth: 460 }}>
        <h1>Unsubscribe</h1>
        {done ? <div className="card">{done === "1" ? "Done. You will not get invitation emails from us again." : "We could not find that invitation, so there is nothing to unsubscribe."}</div> : (
          <form action={unsubscribe} className="card">
            <input type="hidden" name="i" value={i ?? ""} />
            <p>Stop all invitation emails to this address?</p>
            <button className="btn dark" type="submit">Unsubscribe</button>
          </form>
        )}
      </main>
    </>
  );
}
