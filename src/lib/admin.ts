import { PLAN_MONTHLY } from "./billing";
import { isPlatform, listClients, Operator } from "./console";
import { addDays, today } from "./dates";
import { db } from "./db";
import { hashPassword } from "./password";
import { log } from "./store";

type Row = Record<string, any>;
const owner = (op: Operator) => { if (!isPlatform(op)) throw new Error("Only the platform owner can do this."); };
const n = (sql: string, ...args: any[]) => (db().prepare(sql).get(...args) as Row).n as number;
const who = (op: Operator) => `owner:${op.email}`;

/** Everything on the owner's business page, computed from the live database. */
export function businessOverview(op: Operator) {
  owner(op);
  const d = db();
  const since30 = `${addDays(today(), -30)}T00:00:00.000Z`, since7 = `${addDays(today(), -7)}T00:00:00.000Z`;
  const tenants = d.prepare("SELECT * FROM tenants WHERE id != 'tenant_default' ORDER BY COALESCE(created_at, '') DESC, name").all() as Row[];
  const by = (st: string) => tenants.filter((t) => !t.suspended && t.sub_status === st).length;
  const paying = by("active");
  const clients = listClients(op);

  const operators = tenants.map((t) => {
    const mine = clients.filter((c) => c.client.tenant_id === t.id);
    return {
      ...(t as { id: string; name: string; slug: string; kind: string; sub_status: string; suspended: number; created_at: string | null; legal_name: string | null; address: string }),
      clients: mine.length,
      active: mine.filter((c) => c.client.status === "active" && c.client.signed_at).length,
      mailed: n("SELECT COUNT(*) n FROM letters l JOIN clients c ON c.id = l.client_id WHERE c.tenant_id = ? AND l.mailed_at IS NOT NULL", t.id),
      lastActivity: (d.prepare("SELECT MAX(a.at) at FROM audit_log a JOIN clients c ON c.id = a.client_id WHERE c.tenant_id = ?").get(t.id) as Row).at as string | null,
      logins: n("SELECT COUNT(*) n FROM operators WHERE tenant_id = ?", t.id),
    };
  });

  const partners = (d.prepare("SELECT name FROM monitoring_services ORDER BY created_at").all() as Row[]).map((m) => {
    const like = `%"service":${JSON.stringify(m.name)}%`;
    return {
      name: m.name as string,
      clicks: n("SELECT COUNT(*) n FROM audit_log WHERE action = 'monitoring_link_opened' AND detail LIKE ?", like),
      clicks30: n("SELECT COUNT(*) n FROM audit_log WHERE action = 'monitoring_link_opened' AND detail LIKE ? AND at >= ?", like, since30),
      people: n("SELECT COUNT(DISTINCT client_id) n FROM audit_log WHERE action = 'monitoring_link_opened' AND detail LIKE ?", like),
      // clicked a partner link and later uploaded a report: the closest signal we have to a completed sign-up
      uploaded: n(`SELECT COUNT(DISTINCT a.client_id) n FROM audit_log a WHERE a.action = 'monitoring_link_opened' AND a.detail LIKE ?
        AND EXISTS (SELECT 1 FROM reports r WHERE r.client_id = a.client_id AND r.created_at >= a.at)`, like),
    };
  });

  return {
    revenue: { paying, mrr: paying * PLAN_MONTHLY, pastDue: by("past_due"), pending: by("pending"), canceled: by("canceled") + by("unpaid"), comped: by("exempt"), suspended: tenants.filter((t) => t.suspended).length },
    clients: {
      total: clients.length,
      new7: n("SELECT COUNT(*) n FROM clients WHERE created_at >= ?", since7),
      new30: n("SELECT COUNT(*) n FROM clients WHERE created_at >= ?", since30),
      signed: clients.filter((c) => c.client.signed_at).length,
      withReport: clients.filter((c) => c.now !== null).length,
      inDispute: clients.filter((c) => c.open > 0).length,
      direct: clients.filter((c) => c.client.tenant_id === "tenant_default").length,
    },
    work: {
      mailed: n("SELECT COUNT(*) n FROM letters WHERE mailed_at IS NOT NULL"),
      mailed30: n("SELECT COUNT(*) n FROM letters WHERE mailed_at >= ?", since30.slice(0, 10)),
      resolved: n("SELECT COUNT(*) n FROM cases WHERE status = 'resolved'"),
      deleted: n("SELECT COUNT(*) n FROM cases WHERE resolution LIKE 'Deleted%'"),
    },
    letters: {
      price: (d.prepare("SELECT value FROM settings WHERE key = 'direct_price_cents'").get() as Row | undefined)?.value ?? process.env.DIRECT_PRICE_CENTS ?? "3700",
      paid: n("SELECT COUNT(*) n FROM clients WHERE paid_at IS NOT NULL"),
      paid30: n("SELECT COUNT(*) n FROM clients WHERE paid_at >= ?", since30),
      revenue: ((d.prepare("SELECT COALESCE(SUM(paid_cents), 0) s FROM clients WHERE paid_at IS NOT NULL").get() as Row).s as number) / 100,
      waiting: n(`SELECT COUNT(*) n FROM clients c WHERE c.price_cents > 0 AND c.paid_at IS NULL AND EXISTS (SELECT 1 FROM letters l WHERE l.client_id = c.id AND l.status = 'draft')`),
    },
    funding: {
      open: clients.filter((c) => c.fundingOpen && c.client.status === "active").length,
      requests: clients.filter((c) => c.fundingRequested),
    },
    operators, partners,
    activity: d.prepare(`SELECT a.at, a.actor, a.action, c.name client, c.id client_id, t.name company FROM audit_log a
      LEFT JOIN clients c ON c.id = a.client_id LEFT JOIN tenants t ON t.id = c.tenant_id ORDER BY a.seq DESC LIMIT 25`).all() as Row[],
  };
}

// ---------- owner controls over companies ----------
function tenant(id: string) {
  const t = db().prepare("SELECT * FROM tenants WHERE id = ?").get(id) as Row | undefined;
  if (!t || t.id === "tenant_default") throw new Error("Company not found.");
  return t;
}
export function setSuspended(op: Operator, tenantId: string, suspended: boolean) {
  owner(op); const t = tenant(tenantId);
  db().prepare("UPDATE tenants SET suspended = ? WHERE id = ?").run(suspended ? 1 : 0, tenantId);
  log(null, who(op), suspended ? "company_suspended" : "company_reinstated", { company: t.name });
}
/** Free access, or back to needing a subscription. Never overrides a live Stripe subscription. */
export function setComped(op: Operator, tenantId: string, comped: boolean) {
  owner(op); const t = tenant(tenantId);
  if (comped && ["active", "trialing", "past_due"].includes(t.sub_status)) throw new Error("This company has a live subscription. Cancel it in Stripe first, or you would be giving free access while still charging them.");
  if (!comped && t.sub_status !== "exempt") return;
  db().prepare("UPDATE tenants SET sub_status = ? WHERE id = ?").run(comped ? "exempt" : "pending", tenantId);
  log(null, who(op), comped ? "company_made_free" : "company_requires_subscription", { company: t.name });
}
export function updateCompany(op: Operator, tenantId: string, f: { name: string; legalName: string; address: string }) {
  owner(op); const t = tenant(tenantId);
  if (!f.name.trim() || !f.legalName.trim() || !f.address.trim()) throw new Error("Name, legal name and address are all required.");
  db().prepare("UPDATE tenants SET name = ?, legal_name = ?, address = ? WHERE id = ?").run(f.name.trim(), f.legalName.trim(), f.address.trim(), tenantId);
  // Contracts already signed keep the text that was signed; only new contracts use the new details.
  log(null, who(op), "company_details_changed", { before: { name: t.name, legalName: t.legal_name, address: t.address }, after: f });
}

// ---------- logins: the owner anywhere, a company admin within their own company ----------
function manageable(op: Operator, operatorId: string) {
  const target = db().prepare("SELECT * FROM operators WHERE id = ?").get(operatorId) as Row | undefined;
  const allowed = target && (isPlatform(op) || (op.role === "admin" && target.tenant_id === op.tenant_id && target.role !== "platform"));
  if (!allowed) throw new Error("Login not found.");
  return target!;
}
export function resetPassword(op: Operator, operatorId: string, password: string) {
  const target = manageable(op, operatorId);
  if (password.length < 10) throw new Error("Password must be at least 10 characters.");
  db().prepare("UPDATE operators SET password_hash = ? WHERE id = ?").run(hashPassword(password), operatorId);
  log(null, `${op.role}:${op.email}`, "login_password_reset", { login: target.email });
}
export function removeLogin(op: Operator, operatorId: string) {
  const target = manageable(op, operatorId);
  if (target.id === op.id) throw new Error("You cannot remove your own login.");
  if (target.role === "platform") throw new Error("An owner login cannot be removed here.");
  db().prepare("DELETE FROM operators WHERE id = ?").run(operatorId);
  log(null, `${op.role}:${op.email}`, "login_removed", { login: target.email });
}
