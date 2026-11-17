import { randomUUID } from "node:crypto";
import { isPlatform, Operator } from "./console";
import { db } from "./db";
import { log } from "./store";

type Row = Record<string, any>;
export const DEAL_STATUS = {
  requested: "New request", in_review: "In review", submitted: "Application submitted", approved: "Approved",
  funded: "Funded", declined: "Declined", withdrawn: "Withdrawn",
} as const;
export type DealStatus = keyof typeof DEAL_STATUS;
const CLOSED: DealStatus[] = ["funded", "declined", "withdrawn"];

/** The operator's cut of the platform's commission: the company's own rate, or the platform-wide default. */
export function sharePct(tenantId: string): number {
  if (tenantId === "tenant_default") return 0;
  const t = db().prepare("SELECT funding_share_pct FROM tenants WHERE id = ?").get(tenantId) as Row | undefined;
  if (t?.funding_share_pct != null) return t.funding_share_pct;
  const s = db().prepare("SELECT value FROM settings WHERE key = 'funding_share_pct'").get() as Row | undefined;
  return s ? Number(s.value) : 0;
}
export function setDefaultShare(op: Operator, pct: number) {
  if (!isPlatform(op)) throw new Error("Only the platform owner can set revenue share.");
  if (!(pct >= 0 && pct <= 100)) throw new Error("Enter a percentage from 0 to 100.");
  db().prepare("INSERT INTO settings (key, value) VALUES ('funding_share_pct', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(String(pct));
}
export function setCompanyShare(op: Operator, tenantId: string, pct: number | null) {
  if (!isPlatform(op)) throw new Error("Only the platform owner can set revenue share.");
  if (pct !== null && !(pct >= 0 && pct <= 100)) throw new Error("Enter a percentage from 0 to 100, or leave it blank for the default.");
  db().prepare("UPDATE tenants SET funding_share_pct = ? WHERE id = ?").run(pct, tenantId);
}

export const openDeal = (clientId: string) =>
  db().prepare(`SELECT * FROM funding_deals WHERE client_id = ? AND status NOT IN ('funded','declined','withdrawn') ORDER BY created_at DESC LIMIT 1`).get(clientId) as Row | undefined;
export const dealsFor = (clientId: string) => db().prepare("SELECT * FROM funding_deals WHERE client_id = ? ORDER BY created_at DESC").all(clientId) as Row[];

/** A client asks for a funding review. One open request at a time. */
export function requestDeal(client: Row): { id: string; created: boolean } {
  const open = openDeal(client.id);
  if (open) return { id: open.id, created: false };
  const id = randomUUID(), now = new Date().toISOString();
  db().prepare("INSERT INTO funding_deals (id, client_id, tenant_id, status, goal, created_at, updated_at) VALUES (?,?,?,'requested',?,?,?)")
    .run(id, client.id, client.tenant_id, client.funding_goal || null, now, now);
  log(client.id, "consumer", "funding_review_requested", { goal: client.funding_goal, dealId: id });
  return { id, created: true };
}

/** Owner updates a deal. Marking it funded with a commission locks in the operator's share at today's rate. */
export function updateDeal(op: Operator, id: string, u: { status: DealStatus; lender: string; product: string; fundedAmount: number | null; commission: number | null; notes: string }) {
  if (!isPlatform(op)) throw new Error("Only the platform owner can update funding deals.");
  const d = db();
  const deal = d.prepare("SELECT * FROM funding_deals WHERE id = ?").get(id) as Row | undefined;
  if (!deal) throw new Error("Deal not found.");
  if (!(u.status in DEAL_STATUS)) throw new Error("Unknown status.");
  if (u.status === "funded" && !(u.fundedAmount && u.fundedAmount > 0)) throw new Error("Enter the funded amount.");
  for (const v of [u.fundedAmount, u.commission]) if (v !== null && !(v >= 0)) throw new Error("Amounts must be zero or more.");
  let pct = deal.share_pct as number | null, share = deal.share_amount as number | null;
  if (u.status === "funded" && u.commission !== null && !deal.share_paid_at) {
    pct = sharePct(deal.tenant_id);
    share = Math.round(u.commission * pct) / 100;
  }
  d.prepare(`UPDATE funding_deals SET status=?, lender=?, product=?, funded_amount=?, commission=?, share_pct=?, share_amount=?, notes=?, updated_at=? WHERE id=?`)
    .run(u.status, u.lender.trim() || null, u.product.trim() || null, u.fundedAmount, u.commission, pct, share, u.notes.trim() || null, new Date().toISOString(), id);
  log(deal.client_id, `owner:${op.email}`, "funding_deal_updated", { dealId: id, status: u.status, fundedAmount: u.fundedAmount });
}
export function markSharePaid(op: Operator, id: string) {
  if (!isPlatform(op)) throw new Error("Only the platform owner can record payouts.");
  const deal = db().prepare("SELECT * FROM funding_deals WHERE id = ?").get(id) as Row | undefined;
  if (!deal?.share_amount) throw new Error("There is no share to pay on this deal.");
  db().prepare("UPDATE funding_deals SET share_paid_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  log(deal.client_id, `owner:${op.email}`, "funding_share_paid", { dealId: id, amount: deal.share_amount });
}

/** Deals the operator may see, with totals. Operators see only their own company's, and never the platform's commission. */
export function pipeline(op: Operator) {
  const rows = (isPlatform(op)
    ? db().prepare("SELECT f.*, c.name client_name, c.email client_email, c.phone client_phone, t.name company FROM funding_deals f JOIN clients c ON c.id = f.client_id JOIN tenants t ON t.id = f.tenant_id ORDER BY f.updated_at DESC").all()
    : db().prepare("SELECT f.*, c.name client_name, c.email client_email, c.phone client_phone, t.name company FROM funding_deals f JOIN clients c ON c.id = f.client_id JOIN tenants t ON t.id = f.tenant_id WHERE f.tenant_id = ? ORDER BY f.updated_at DESC").all(op.tenant_id)) as Row[];
  const deals = isPlatform(op) ? rows : rows.map(({ commission: _c, notes: _n, ...r }) => r);
  const funded = rows.filter((r) => r.status === "funded");
  const sum = (xs: Row[], k: string) => xs.reduce((a, r) => a + (r[k] ?? 0), 0);
  return {
    deals,
    totals: {
      open: rows.filter((r) => !CLOSED.includes(r.status)).length,
      newRequests: rows.filter((r) => r.status === "requested").length,
      funded: funded.length,
      volume: sum(funded, "funded_amount"),
      commission: isPlatform(op) ? sum(funded, "commission") : null,
      shareOwed: sum(funded.filter((r) => !r.share_paid_at), "share_amount"),
      sharePaid: sum(funded.filter((r) => r.share_paid_at), "share_amount"),
    },
  };
}
