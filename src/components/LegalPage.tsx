import Link from "next/link";
import { PRODUCT } from "@/lib/brand";
import { LegalLinks } from "./LegalLinks";

/** Shared layout for the privacy policy, terms and privacy choices pages. */
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="sp">
      <header className="sp-top">
        <div className="sp-in sp-row">
          <Link href="/"><img src="/wordmark.png" alt={PRODUCT} width={720} height={119} className="sp-mark" /></Link>
          <nav className="sp-row" style={{ gap: 18 }}>
            <Link href="/" className="sp-link">For individuals</Link>
            <Link href="/partners" className="sp-link">For professionals</Link>
            <Link href="/login" className="sp-link">Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="sp-in legal">
        <h1>{title}</h1>
        {updated && <p className="muted">Last updated {updated}</p>}
        {children}
      </main>
      <footer className="sp-foot"><div className="sp-in"><p><LegalLinks /></p></div></footer>
    </div>
  );
}
