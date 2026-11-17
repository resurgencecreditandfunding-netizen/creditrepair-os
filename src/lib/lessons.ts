import { db } from "./db";
import { STEPS } from "./journey";

type Row = Record<string, any>;
/** Each company links its own lessons (a community course, videos) to the journey steps. */
export function lessonsFor(tenantId: string): Record<string, string> {
  return Object.fromEntries((db().prepare("SELECT step_key, url FROM lessons WHERE tenant_id = ?").all(tenantId) as Row[]).map((r) => [r.step_key, r.url]));
}
export function saveLessons(tenantId: string, links: Record<string, string>) {
  const d = db();
  for (const [key] of STEPS) {
    const raw = (links[key] ?? "").trim();
    if (!raw) { d.prepare("DELETE FROM lessons WHERE tenant_id = ? AND step_key = ?").run(tenantId, key); continue; }
    let u: URL;
    try { u = new URL(raw); } catch { throw new Error(`The link for "${STEPS.find((s) => s[0] === key)![1]}" is not a full web address.`); }
    if (u.protocol !== "https:") throw new Error("Lesson links must start with https://");
    d.prepare("INSERT INTO lessons (tenant_id, step_key, url) VALUES (?,?,?) ON CONFLICT (tenant_id, step_key) DO UPDATE SET url = excluded.url").run(tenantId, key, u.toString());
  }
}
