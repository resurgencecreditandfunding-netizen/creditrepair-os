import { PLANS, type PlanKey } from "@/lib/billing";

/** The three operator plans. `action` renders each as a checkout button; `href` as a link. */
export function PlanCards({ chosen, action, href }: { chosen?: string | null; action?: (f: FormData) => Promise<void>; href?: (k: PlanKey) => string }) {
  return (
    <div className="grid g3">
      {(Object.keys(PLANS) as PlanKey[]).map((k) => {
        const p = PLANS[k];
        const best = k === "season12";
        const cta = p.recurring ? "Start monthly" : `Get the ${p.months}-month pass`;
        return (
          <div key={k} className="card" style={{ marginBottom: 0, display: "flex", flexDirection: "column", borderColor: chosen === k || (!chosen && best) ? "var(--accent)" : undefined }}>
            {best && <span className="pill accent" style={{ alignSelf: "flex-start" }}>Best value</span>}
            <h3 style={{ marginTop: 8 }}>{p.name}</h3>
            <div className="stat">{p.price}</div>
            <p className="small">{p.pitch}</p>
            <p className="small muted" style={{ flex: 1 }}>{p.after}</p>
            {action ? (
              <form action={action}><input type="hidden" name="plan" value={k} /><button className={`btn ${best ? "accent" : "dark"}`} type="submit" style={{ width: "100%" }}>{cta}</button></form>
            ) : href ? <a className={`btn ${best ? "accent" : "dark"}`} href={href(k)} style={{ textAlign: "center" }}>{cta}</a> : null}
          </div>
        );
      })}
    </div>
  );
}
