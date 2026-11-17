import { randomBytes, randomUUID } from "node:crypto";
import { baseDomain, companyLink } from "./branding";
import { db } from "./db";
import { emailConfigured, fromAs, normalizePhone, sendEmail, site, validEmail } from "./notify";
import { getTenant, log } from "./store";

type Row = Record<string, any>;
export const MAX_BATCH = 500;
const SPACING_MS = Number(process.env.INVITE_SPACING_MS ?? 600); // stays under the email service's rate limit

/** Reads "name, email, phone" lines, from a pasted list or a CSV export. A header row is skipped. */
export function parseList(text: string) {
  const rows: { name: string; email: string; phone: string }[] = [], bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.some((c) => /^e-?mail$/i.test(c))) continue;
    const email = cells.find((c) => validEmail(c))?.toLowerCase();
    if (!email) { bad.push(line.slice(0, 60)); continue; }
    const phone = cells.find((c) => normalizePhone(c)) ?? "";
    const name = cells.find((c) => c && c.toLowerCase() !== email && c !== phone && !/\d{3}/.test(c)) ?? "";
    rows.push({ name, email, phone });
  }
  return { rows, bad };
}

/** Creates invites, skipping duplicates, people who opted out, and existing clients of this company. */
export function createInvites(tenantId: string, rows: { name: string; email: string; phone: string }[], by: string) {
  if (rows.length > MAX_BATCH) throw new Error(`Up to ${MAX_BATCH} people at a time.`);
  const d = db(), now = new Date().toISOString();
  const skipped = { duplicate: 0, optedOut: 0, alreadyClient: 0 };
  const ids: string[] = [], seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.email) || d.prepare("SELECT 1 FROM invites WHERE tenant_id = ? AND email = ?").get(tenantId, r.email)) { skipped.duplicate++; continue; }
    seen.add(r.email);
    if (d.prepare("SELECT 1 FROM email_optouts WHERE email = ?").get(r.email)) { skipped.optedOut++; continue; }
    if (d.prepare("SELECT 1 FROM clients WHERE tenant_id = ? AND lower(email) = ?").get(tenantId, r.email)) { skipped.alreadyClient++; continue; }
    const id = randomUUID();
    d.prepare("INSERT INTO invites (id, tenant_id, name, email, phone, token, status, created_by, created_at) VALUES (?,?,?,?,?,?,'pending',?,?)")
      .run(id, tenantId, r.name || null, r.email, r.phone || null, randomBytes(18).toString("base64url"), by, now);
    ids.push(id);
  }
  return { created: ids.length, ids, skipped };
}

/** The company's own site when subdomains are on; the invite itself carries the company either way. */
export function inviteLink(inv: Row) {
  const own = inv.tenant_id !== "tenant_default" && baseDomain();
  return `${own ? companyLink(getTenant(inv.tenant_id).slug, site()) : site()}/start?i=${inv.token}`;
}

function message(inv: Row) {
  const t = getTenant(inv.tenant_id);
  const first = (inv.name ?? "").split(" ")[0] || "there";
  return {
    subject: `${first === "there" ? "A" : `${first}, a`} free credit review from ${t.name}`,
    text: `Hi ${first},\n\n${t.name} now offers a free credit review and dispute service. We check your credit reports for errors, prepare disputes in your name for the items you confirm are wrong, and track every deadline for you. There is no charge for the credit service, and no result is guaranteed.\n\nStart here: ${inviteLink(inv)}\n\n— ${t.name}\n${t.address}\n\nDon't want emails like this? ${site()}/unsubscribe?i=${inv.token}`,
    from: fromAs(t.name),
  };
}

/** Sends pending invites one by one. Runs in the background after an upload. */
export async function sendInvites(ids: string[], sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  if (!emailConfigured()) return { sent: 0, failed: 0 };
  const d = db();
  let sent = 0, failed = 0;
  for (const id of ids) {
    const inv = d.prepare("SELECT * FROM invites WHERE id = ? AND status IN ('pending','failed')").get(id) as Row | undefined;
    if (!inv || d.prepare("SELECT 1 FROM email_optouts WHERE email = ?").get(inv.email)) continue;
    const m = message(inv);
    try {
      await sendEmail(inv.email, m.subject, m.text, m.from);
      d.prepare("UPDATE invites SET status = 'sent', sent_at = ?, error = NULL WHERE id = ?").run(new Date().toISOString(), id);
      sent++;
    } catch (e) {
      d.prepare("UPDATE invites SET status = 'failed', error = ? WHERE id = ?").run(String((e as Error).message).slice(0, 200), id);
      failed++;
    }
    await sleep(SPACING_MS);
  }
  log(null, "system", "invites_sent", { sent, failed });
  return { sent, failed };
}

export const getInvite = (token: string) => db().prepare("SELECT * FROM invites WHERE token = ?").get(token) as Row | undefined;
export function markOpened(token: string) {
  db().prepare("UPDATE invites SET opened_at = COALESCE(opened_at, ?) WHERE token = ?").run(new Date().toISOString(), token);
}
export function markJoined(token: string, clientId: string) {
  db().prepare("UPDATE invites SET status = 'joined', client_id = ? WHERE token = ?").run(clientId, token);
}
export function optOut(token: string) {
  const inv = getInvite(token);
  if (!inv) return false;
  db().prepare("INSERT OR IGNORE INTO email_optouts (email, at) VALUES (?, ?)").run(inv.email, new Date().toISOString());
  db().prepare("UPDATE invites SET status = 'unsubscribed' WHERE email = ? AND status != 'joined'").run(inv.email);
  return true;
}

export function invitesFor(tenantId: string) {
  const rows = db().prepare("SELECT * FROM invites WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1000").all(tenantId) as Row[];
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  return { rows, totals: { total: rows.length, pending: count("pending"), sent: count("sent") + count("joined"), opened: rows.filter((r) => r.opened_at).length, joined: count("joined"), failed: count("failed"), unsubscribed: count("unsubscribed") } };
}
