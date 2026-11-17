import Link from "next/link";
import type { Step } from "@/lib/journey";

const LABEL: Record<Step["status"], string> = { done: "Done", current: "You are here", next: "Next", upcoming: "", skipped: "Not needed" };

/** The client's journey: done, current, next and remaining steps. Set links={false} for the staff view. */
export function JourneyMap({ steps, finished, total, links = true, title = "Your journey", lessons = {} }: { steps: Step[]; finished: number; total: number; links?: boolean; title?: string; lessons?: Record<string, string> }) {
  return (
    <section className="card journey" aria-label={title}>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{title}</h2>
        <span className="small muted">{finished} of {total} steps complete</span>
      </div>
      <div className="bar" style={{ margin: "12px 0 6px" }}><span style={{ width: `${Math.max(3, (finished / total) * 100)}%` }} /></div>
      <ol className="jsteps">
        {steps.map((s, i) => (
          <li key={s.key} className={`js-${s.status}`} aria-current={s.status === "current" ? "step" : undefined}>
            <span className="js-dot" aria-hidden="true">{s.status === "done" ? "✓" : s.status === "skipped" ? "–" : i + 1}</span>
            <div className="js-body">
              <div className="row" style={{ gap: 8 }}>
                <span className="js-title">{s.title}</span>
                {LABEL[s.status] && <span className={`pill ${s.status === "current" ? "accent" : s.status === "next" ? "dark" : ""}`}>{LABEL[s.status]}</span>}
              </div>
              {(s.status === "current" || s.status === "next") && <div className="small muted">{s.detail}</div>}
              {(s.status === "current" || s.status === "next") && lessons[s.key] && <a className="small" href={lessons[s.key]} target="_blank" rel="noopener" style={{ display: "inline-block", marginTop: 4 }}>Watch the lesson ↗</a>}
              {s.status === "current" && links && s.href && s.cta && <div><Link className="btn accent" href={s.href} style={{ marginTop: 10 }}>{s.cta}</Link></div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
