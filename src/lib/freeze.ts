import { randomUUID } from "node:crypto";
import { isPlatform, Operator } from "./console";
import { db } from "./db";
import { log } from "./store";

type Row = Record<string, any>;
export interface FreezeBureau { id: string; name: string; url: string; note: string | null }
export interface FreezeEntry { bureau: FreezeBureau; status: "frozen" | "skipped" | null; confirmation: string | null; at: string | null }

export const listFreezeBureaus = () =>
  db().prepare("SELECT id, name, url, note FROM freeze_bureaus ORDER BY sort, created_at").all() as unknown as FreezeBureau[];

export function getFreezes(clientId: string): FreezeEntry[] {
  const rows = new Map((db().prepare("SELECT * FROM freezes WHERE client_id = ?").all(clientId) as Row[]).map((r) => [r.bureau_id, r]));
  return listFreezeBureaus().map((b) => {
    const r = rows.get(b.id);
    return { bureau: b, status: r?.status ?? null, confirmation: r?.confirmation ?? null, at: r?.at ?? null };
  });
}

export function freezeProgress(client: Row) {
  const list = getFreezes(client.id);
  const addressed = list.filter((x) => x.status).length;
  return { total: list.length, addressed, frozen: list.filter((x) => x.status === "frozen").length, complete: !!client.freeze_done_at, list };
}

/** The client records that they froze a bureau, or chose not to. The step completes once every bureau is addressed. */
export function setFreeze(clientId: string, bureauId: string, status: "frozen" | "skipped", confirmation: string) {
  const b = listFreezeBureaus().find((x) => x.id === bureauId);
  if (!b) throw new Error("Unknown bureau.");
  const d = db();
  d.prepare(`INSERT INTO freezes (client_id, bureau_id, status, confirmation, at) VALUES (?,?,?,?,?)
    ON CONFLICT (client_id, bureau_id) DO UPDATE SET status=excluded.status, confirmation=excluded.confirmation, at=excluded.at`)
    .run(clientId, bureauId, status, confirmation.trim().slice(0, 80) || null, new Date().toISOString());
  log(clientId, "consumer", status === "frozen" ? "freeze_placed" : "freeze_skipped", { bureau: b.name });
  const c = d.prepare("SELECT * FROM clients WHERE id = ?").get(clientId) as Row;
  if (!c.freeze_done_at && getFreezes(clientId).every((x) => x.status)) {
    d.prepare("UPDATE clients SET freeze_done_at = ? WHERE id = ?").run(new Date().toISOString(), clientId);
    log(clientId, "consumer", "freeze_step_completed");
  }
}
export function clearFreeze(clientId: string, bureauId: string) {
  const c = db().prepare("SELECT freeze_done_at FROM clients WHERE id = ?").get(clientId) as Row;
  if (c?.freeze_done_at) throw new Error("This step is already complete.");
  db().prepare("DELETE FROM freezes WHERE client_id = ? AND bureau_id = ?").run(clientId, bureauId);
}

export function markReviewed(clientId: string) {
  const d = db();
  if ((d.prepare("SELECT report_reviewed_at FROM clients WHERE id = ?").get(clientId) as Row)?.report_reviewed_at) return;
  if (!d.prepare("SELECT 1 FROM reports WHERE client_id = ?").get(clientId)) throw new Error("Upload your credit report first.");
  d.prepare("UPDATE clients SET report_reviewed_at = ? WHERE id = ?").run(new Date().toISOString(), clientId);
  log(clientId, "consumer", "report_reviewed");
}

/** Why letters cannot be drafted yet, or null when they can. */
export function letterBlocker(client: Row): string | null {
  if (!client.report_reviewed_at) return "The client must review their report first.";
  if (!client.freeze_done_at) return "The client must complete the secondary bureau freeze step first.";
  return null;
}

// ---------- owner edits the list ----------
export function addFreezeBureau(op: Operator, b: { name: string; url: string; note: string }) {
  if (!isPlatform(op)) throw new Error("Only the platform owner can change this list.");
  let u: URL;
  try { u = new URL(b.url.trim()); } catch { throw new Error("Enter the full link, starting with https://"); }
  if (u.protocol !== "https:") throw new Error("The link must start with https://");
  if (!b.name.trim()) throw new Error("Enter the bureau's name.");
  const sort = ((db().prepare("SELECT MAX(sort) m FROM freeze_bureaus").get() as Row).m ?? 0) + 1;
  db().prepare("INSERT INTO freeze_bureaus (id, name, url, note, sort, created_at) VALUES (?,?,?,?,?,?)")
    .run(randomUUID(), b.name.trim(), u.toString(), b.note.trim() || null, sort, new Date().toISOString());
}
export function removeFreezeBureau(op: Operator, id: string) {
  if (!isPlatform(op)) throw new Error("Only the platform owner can change this list.");
  db().prepare("DELETE FROM freeze_bureaus WHERE id = ?").run(id);
}
