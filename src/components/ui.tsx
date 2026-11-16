import Link from "next/link";

export function TopBar({ brand, active, nav = true }: { brand: string; active?: string; nav?: boolean }) {
  const items = [["dashboard", "Dashboard"], ["report", "Credit report"], ["disputes", "Disputes"], ["funding", "Funding"], ["documents", "Documents"]];
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href={nav ? "/dashboard" : "/"} className="brand"><i />{brand}</Link>
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
