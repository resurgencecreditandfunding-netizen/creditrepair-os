import Link from "next/link";
import { PRODUCT } from "@/lib/brand";

/** The platform logo for its own pages; a licensed company's name as text for theirs. */
function Mark({ brand }: { brand: string }) {
  return brand === PRODUCT ? <img src="/wordmark.png" alt={PRODUCT} width={720} height={119} /> : <><i />{brand}</>;
}
export function ConsoleBrand() {
  return <Link href="/console" className="brand"><img src="/wordmark.png" alt={PRODUCT} width={720} height={119} /><small>Operator console</small></Link>;
}

export function TopBar({ brand, logo, accent, active, nav = true }: { brand: string; logo?: string; accent?: string; active?: string; nav?: boolean }) {
  const items = [["dashboard", "Dashboard"], ["report", "Credit report"], ["disputes", "Disputes"], ["funding", "Funding"], ["documents", "Documents"]];
  return (
    <header className="topbar">
      <div className="topbar-in">
        {accent && <style>{`:root{--accent:${accent};--accent-dark:${accent};--accent-soft:${accent}1a}`}</style>}
        <Link href={nav ? "/dashboard" : "/"} className="brand">{logo ? <img src={logo} alt={brand} style={{ height: 30, maxWidth: 200, objectFit: "contain" }} /> : <Mark brand={brand} />}</Link>
        {nav && (
          <nav className="nav">
            {items.map(([k, label]) => <Link key={k} href={`/${k}`} className={active === k ? "on" : ""}>{label}</Link>)}
          </nav>
        )}
      </div>
    </header>
  );
}

export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return <div className={`notice ${error ? "" : "gray"}`} role="status">{error ?? ok}</div>;
}

export function ConsoleBar({ active, name, signOut, owner }: { active?: string; name: string; signOut: () => Promise<void>; owner?: boolean }) {
  const items = owner
    ? [["admin", "Business"], ["", "Clients"], ["invites", "Invites"], ["funding", "Funding"], ["settings", "Companies and logins"]]
    : [["", "Clients"], ["invites", "Invites"], ["funding", "Funding"], ["settings", "Companies and logins"], ["billing", "Billing"]];
  return (
    <header className="topbar">
      <div className="topbar-in">
        <ConsoleBrand />
        <nav className="nav" style={{ flex: 1 }}>
          {items.map(([k, label]) => <Link key={k} href={`/console/${k}`} className={active === k ? "on" : ""}>{label}</Link>)}
        </nav>
        <form action={signOut} className="row small" style={{ color: "#a1a1aa" }}>
          <span>{name}</span><button className="btn link" type="submit" style={{ color: "#fff" }}>Sign out</button>
        </form>
      </div>
    </header>
  );
}
