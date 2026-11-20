import { randomUUID } from "node:crypto";
import { today } from "./dates";
import { db } from "./db";
import { fundingStatus, middleScore } from "./funding";
import { checkPassword, hashPassword } from "./password";
import * as store from "./store";

type Row = Record<string, any>;
export type Role = "platform" | "admin" | "staff";
export interface Operator { id: string; tenant_id: string; email: string; name: string; role: Role }

// ---------- operators ----------
export function createOperator(o: { tenantId: string; email: string; name: string; password: string; role: Role }) {
  if (o.password.length < 10) throw new Error("Password must be at least 10 characters.");
  const email = o.email.trim().toLowerCase();
  if (db().prepare("SELECT 1 FROM operators WHERE email = ?").get(email)) throw new Error("That email already has a login.");
  const id = randomUUID();
  db().prepare("INSERT INTO operators (id, tenant_id, email, name, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, o.tenantId, email, o.name, hashPassword(o.password), o.role, new Date().toISOString());
  return id;
}
export function verifyOperator(email: string, password: string): Operator | null {
  const row = db().prepare("SELECT * FROM operators WHERE email = ?").get(email.trim().toLowerCase()) as Row | undefined;
  // Hash even when the email is unknown so response time does not reveal which emails exist.
  const ok = checkPassword(password, row?.password_hash ?? "00:00");
  return row && ok ? toOperator(row) : null;
}
export const getOperator = (id: string) => {
  const row = db().prepare("SELECT * FROM operators WHERE id = ?").get(id) as Row | undefined;
  return row ? toOperator(row) : null;
};
const toOperator = (r: Row): Operator => ({ id: r.id, tenant_id: r.tenant_id, email: r.email, name: r.name, role: r.role });
export const isPlatform = (op: Operator) => op.role === "platform";
export const canManage = (op: Operator) => op.role === "platform" || op.role === "admin";

// ---------- tenants ----------
export interface TenantInfo { id: string; slug: string; name: string; address: string; kind: string; legal_name: string | null; sub_status: string; funding_share_pct: number | null; clients: number; operators: Row[] }
export function listTenants(op: Operator): TenantInfo[] {
  const d = db();
  const rows = (isPlatform(op) ? d.prepare("SELECT * FROM tenants ORDER BY name").all() : d.prepare("SELECT * FROM tenants WHERE id = ?").all(op.tenant_id)) as Row[];
  return rows.map((t) => ({
    ...(t as TenantInfo),
    clients: (d.prepare("SELECT COUNT(*) n FROM clients WHERE tenant_id = ?").get(t.id) as Row).n as number,
    operators: d.prepare("SELECT id, email, name, role FROM operators WHERE tenant_id = ? ORDER BY email").all(t.id) as Row[],
  }));
}
export function createTenant(op: Operator, t: { name: string; slug: string; legalName: string; address: string; kind: string }) {
  if (!isPlatform(op)) throw new Error("Only the platform owner can add a company.");
  const slug = t.slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!slug || !t.name || !t.legalName || !t.address) throw new Error("Name, link name, legal name and address are all required.");
  if (db().prepare("SELECT 1 FROM tenants WHERE slug = ?").get(slug)) throw new Error("That link name is taken.");
  const id = randomUUID();
  db().prepare("INSERT INTO tenants (id, slug, name, address, kind, legal_name, created_at) VALUES (?,?,?,?,?,?,?)").run(id, slug, t.name, t.address, t.kind, t.legalName, new Date().toISOString());
  return id;
}

// ---------- access: every client read goes through here ----------
export function clientFor(op: Operator, clientId: string): Row {
  const c = store.getClient(clientId);
  if (!c || (!isPlatform(op) && c.tenant_id !== op.tenant_id)) throw new Error("Client not found.");
  return c;
}

// ---------- overview ----------
const STAGES = {
  cancelled: "Cancelled", needs_report: "Needs credit report", needs_review: "Report ready, no disputes yet",
  awaiting_approval: "Waiting on client approval", ready_to_mail: "Ready to mail", next_round: "Next round ready",
  awaiting_response: "Waiting on bureau", funding: "Funding open", idle: "Nothing pending",
} as const;
export type Stage = keyof typeof STAGES;
export const stageName = (s: Stage) => STAGES[s];

export function summarize(c: Row) {
  const reports = store.getReports(c.id);
  const first = reports[0] ?? null, latest = reports.at(-1) ?? null;
  const cases = store.getCases(c.id);
  const letters = store.getLetters(c.id) as Row[];
  const funding = fundingStatus(first, latest, today());
  const log = store.getLog(c.id);
  const deal = db().prepare("SELECT status FROM funding_deals WHERE client_id = ? ORDER BY created_at DESC LIMIT 1").get(c.id) as Row | undefined;
  const count = (st: string) => letters.filter((l) => l.status === st).length;
  const mailed = letters.filter((l) => l.status === "mailed");
  const nextDue = mailed.map((l) => l.due_at as string).sort()[0] ?? null;
  const open = cases.filter((x) => !["resolved", "exhausted"].includes(x.status)).length;
  const resolved = cases.filter((x) => x.status === "resolved").length;
  const pending = cases.filter((x) => x.status === "pending_letter").length;

  let stage: Stage = "idle";
  if (c.status !== "active") stage = "cancelled";
  else if (!latest) stage = "needs_report";
  else if (count("attested")) stage = "ready_to_mail";
  else if (count("draft")) stage = "awaiting_approval";
  else if (pending) stage = "next_round";
  else if (mailed.length) stage = "awaiting_response";
  else if (!cases.length) stage = "needs_review";
  else if (funding.unlocked) stage = "funding";

  return {
    client: c, stage, start: first ? middleScore(first) : null, now: latest ? middleScore(latest) : null,
    gain: funding.gain, fundingOpen: funding.unlocked, open, resolved, pending,
    drafts: count("draft"), toMail: count("attested"), mailed: mailed.length, nextDue,
    overdue: mailed.filter((l) => l.due_at < today()).length,
    fundingRequested: deal?.status === "requested",
    fundingStage: (deal?.status ?? null) as string | null,
    letters,
  };
}
export type Summary = ReturnType<typeof summarize>;

export function listClients(op: Operator, f: { q?: string; tenantId?: string } = {}): Summary[] {
  const where: string[] = [], args: string[] = [];
  const tenant = isPlatform(op) ? f.tenantId : op.tenant_id; // non-platform operators are always pinned to their own company
  if (tenant) { where.push("tenant_id = ?"); args.push(tenant); }
  if (f.q?.trim()) { where.push("(name LIKE ? OR email LIKE ?)"); args.push(`%${f.q.trim()}%`, `%${f.q.trim()}%`); }
  const rows = db().prepare(`SELECT * FROM clients ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT 500`).all(...args) as Row[];
  return rows.map(summarize);
}

export function addNote(op: Operator, clientId: string, text: string) {
  clientFor(op, clientId);
  if (!text.trim()) throw new Error("Write a note first.");
  store.log(clientId, `operator:${op.email}`, "note", { text: text.trim() });
}
export function markFundingHandled(op: Operator, clientId: string) {
  clientFor(op, clientId);
  db().prepare("UPDATE funding_deals SET status = 'in_review', updated_at = ? WHERE client_id = ? AND status = 'requested'").run(new Date().toISOString(), clientId);
  store.log(clientId, `operator:${op.email}`, "funding_review_handled");
}

// ---------- credit monitoring partners (the platform owner's affiliate links) ----------
export interface MonitoringService { id: string; name: string; url: string; blurb: string | null }
export function listMonitoring(): MonitoringService[] {
  return db().prepare("SELECT id, name, url, blurb FROM monitoring_services ORDER BY created_at").all() as unknown as MonitoringService[];
}
export const getMonitoring = (id: string) =>
  db().prepare("SELECT id, name, url, blurb FROM monitoring_services WHERE id = ?").get(id) as unknown as MonitoringService | undefined;
export function addMonitoring(op: Operator, m: { name: string; url: string; blurb: string }) {
  if (!isPlatform(op)) throw new Error("Only the platform owner can change credit monitoring partners.");
  let u: URL;
  try { u = new URL(m.url.trim()); } catch { throw new Error("Enter the full affiliate link, starting with https://"); }
  if (u.protocol !== "https:") throw new Error("The affiliate link must start with https://");
  if (!m.name.trim()) throw new Error("Enter the service name.");
  const id = randomUUID();
  db().prepare("INSERT INTO monitoring_services (id, name, url, blurb, created_at) VALUES (?,?,?,?,?)")
    .run(id, m.name.trim(), u.toString(), m.blurb.trim() || null, new Date().toISOString());
  return id;
}
export function removeMonitoring(op: Operator, id: string) {
  if (!isPlatform(op)) throw new Error("Only the platform owner can change credit monitoring partners.");
  db().prepare("DELETE FROM monitoring_services WHERE id = ?").run(id);
}

// ---------- self-serve sign-up for a new company ----------
export interface Registration { company: string; legalName: string; address: string; kind: string; name: string; email: string; password: string; source?: string | null; plan?: string | null }
/** Creates the company (unpaid) and its first admin login. Access opens when the subscription starts. */
export function registerCompany(r: Registration) {
  for (const k of ["company", "legalName", "address", "name", "email"] as const) if (!r[k].trim()) throw new Error("Please fill in every field.");
  if (r.password.length < 10) throw new Error("Password must be at least 10 characters.");
  const email = r.email.trim().toLowerCase();
  const d = db();
  if (d.prepare("SELECT 1 FROM operators WHERE email = ?").get(email)) throw new Error("That email already has a login. Sign in instead.");
  const base = r.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "company";
  let slug = base;
  for (let n = 2; d.prepare("SELECT 1 FROM tenants WHERE slug = ?").get(slug); n++) slug = `${base}-${n}`;
  const tenantId = randomUUID();
  const kind = r.kind === "tax_pro" || r.kind === "funding_pro" ? r.kind : "credit_repair";
  d.prepare("INSERT INTO tenants (id, slug, name, address, kind, legal_name, sub_status, created_at) VALUES (?,?,?,?,?,?,'pending',?)")
    .run(tenantId, slug, r.company.trim(), r.address.trim(), kind, r.legalName.trim(), new Date().toISOString());
  const operatorId = createOperator({ tenantId, email, name: r.name.trim(), password: r.password, role: "admin" });
  if (r.source) d.prepare("UPDATE tenants SET source = ? WHERE id = ?").run(r.source, tenantId);
  if (r.plan) d.prepare("UPDATE tenants SET plan = ? WHERE id = ?").run(r.plan, tenantId);
  return { tenantId, operatorId };
}
