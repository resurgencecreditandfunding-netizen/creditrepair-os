import Link from "next/link";
import { TopBar } from "@/components/ui";
import { brandBarFor } from "@/lib/branding";
import { requireClient } from "@/lib/session";
import { winsFor } from "@/lib/wins";

export default async function Wins({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const c = await requireClient();
  const withName = (await searchParams).name === "1";
  const wins = winsFor(c);
  const q = withName ? "?name=1" : "";
  return (
    <>
      <TopBar {...brandBarFor(c)} />
      <main className="wrap">
        <Link href="/dashboard" className="small muted">← Dashboard</Link>
        <h1 style={{ marginTop: 8 }}>Your wins</h1>
        <p className="muted">Share your progress with your community. Cards never show your scores, accounts or anything else from your report.</p>
        {wins.length === 0 ? <div className="card muted">Your first win card appears when an item is deleted or your score climbs. Keep going.</div> : (
          <>
            <p className="small"><Link href={withName ? "/wins" : "/wins?name=1"}>{withName ? "Hide my first name on the cards" : "Show my first name on the cards"}</Link></p>
            <div className="grid g2">
              {wins.map((w) => (
                <div className="card" key={w.kind}>
                  <img src={`/win-card/${w.kind}${q}`} alt={`${w.big} ${w.line}`} width={1080} height={1080} style={{ width: "100%", height: "auto", borderRadius: 8, display: "block" }} />
                  <a className="btn accent" href={`/win-card/${w.kind}${q}`} download={`win-${w.kind}.png`} style={{ marginTop: 12 }}>Download to share</a>
                </div>
              ))}
            </div>
            <p className="fine">When you post, keep it honest: your results are yours, and others' may differ.</p>
          </>
        )}
      </main>
    </>
  );
}
