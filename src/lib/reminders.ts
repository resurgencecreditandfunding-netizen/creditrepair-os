import { db } from "./db";
import { journey } from "./journey";
import { emailConfigured, fromAs, normalizePhone, sendEmail, sendSms, site, smsConfigured } from "./notify";
import { createToken, signInUrl } from "./signin";
import { today } from "./dates";
import { draftableCases, getLetters, getReports, getTenant, log } from "./store";

type Row = Record<string, any>;
const DAY = 86_400_000;
/** Days in a step before the first reminder, then between reminders, and the most per step. */
export const CADENCE = { first: 2, every: 5, max: 3 };

/** What to say for the client's current step, or null when there is nothing for them to do yet. */
export function messageFor(client: Row): { key: string; ask: string } | null {
  const j = journey(client);
  const cur = j.current;
  if (!cur) return null;
  const letters = getLetters(client.id) as Row[];
  switch (cur.key) {
    case "monitor": return { key: cur.key, ask: "get your 3-bureau credit report so we can audit it" };
    case "upload": return { key: cur.key, ask: "upload your 3-bureau credit report" };
    case "review": return { key: cur.key, ask: "review what we found on your credit report" };
    case "freeze": return { key: cur.key, ask: "finish freezing the secondary bureaus so your letters can be prepared" };
    case "approve": {
      const drafts = letters.filter((l) => l.status === "draft").length;
      return { key: cur.key, ask: drafts ? `read and approve your ${drafts} dispute letter${drafts > 1 ? "s" : ""}` : "prepare your first dispute letters" };
    }
    case "mail": return { key: cur.key, ask: "print and mail your approved letters by certified mail, then enter the tracking numbers" };
    case "responses":
      return letters.some((l) => l.status === "mailed" && l.due_at < today())
        ? { key: cur.key, ask: "record what the bureaus sent back. The response deadline has passed" } : null;
    case "rounds": {
      const drafts = letters.filter((l) => l.status === "draft").length;
      if (drafts) return { key: `${cur.key}:approve`, ask: `read and approve your ${drafts} new letter${drafts > 1 ? "s" : ""}` };
      if (letters.some((l) => l.status === "attested")) return { key: `${cur.key}:mail`, ask: "mail your approved letters" };
      if (letters.some((l) => l.status === "mailed" && l.due_at < today())) return { key: `${cur.key}:results`, ask: "record what the bureaus sent back" };
      return draftableCases(client.id).length ? { key: `${cur.key}:prepare`, ask: "prepare your next round of letters" } : null;
    }
    case "unlock": {
      const last = getReports(client.id).at(-1);
      return last && Date.now() - Date.parse(last.pulledAt) > 30 * DAY ? { key: `unlock:${last.pulledAt}`, ask: "upload a fresh credit report so we can see what changed" } : null;
    }
    case "fund": return { key: cur.key, ask: "request your funding review. Your funding options are open" };
    default: return null;
  }
}

/** Texts only between noon and 8pm Eastern, which is 9am to 5pm Pacific: inside legal calling hours in every US time zone. */
export function inSendWindow(nowMs: number) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(nowMs));
  return h >= 12 && h < 20;
}

async function send(client: Row, ask: string) {
  const company = getTenant(client.tenant_id);
  const first = client.name.split(" ")[0];
  const sent: string[] = [];
  if (emailConfigured() && client.email) {
    const link = signInUrl(createToken(client.id, 72 * 60));
    await sendEmail(client.email, `${first}, your next step: ${ask.split(".")[0]}`,
      `Hi ${first},\n\nYour next step is to ${ask}.\n\nSign in here (link works once, for 3 days): ${link}\nOr go to ${site()}/login any time.\n\n— ${company.name}\n${company.address}\n\nYou get these reminders because you have an account with ${company.name}. Turn them off on the Documents page of your account.`,
      fromAs(company.name));
    sent.push("email");
  }
  const phone = client.sms_opt_in_at && client.phone ? normalizePhone(client.phone) : null;
  if (smsConfigured() && phone) {
    await sendSms(phone, `${company.name}: ${first}, your next step is to ${ask.split(".")[0]}. ${site()}/login Reply STOP to opt out.`);
    sent.push("text");
  }
  return sent;
}

/** Checks every active client and sends the reminders that are due. Safe to run as often as you like. */
export async function runReminders(nowMs = Date.now()) {
  const d = db();
  const out = { checked: 0, sent: 0, failed: 0, skipped: "" };
  if (!emailConfigured() && !smsConfigured()) return { ...out, skipped: "no email or text service" };
  if (!inSendWindow(nowMs)) return { ...out, skipped: "outside sending hours" };
  const clients = d.prepare("SELECT * FROM clients WHERE status = 'active' AND signed_at IS NOT NULL AND reminders_off = 0").all() as Row[];
  for (const c of clients) {
    out.checked++;
    const m = messageFor(c);
    if (!m) continue;
    const row = d.prepare("SELECT * FROM reminders WHERE client_id = ? AND step_key = ?").get(c.id, m.key) as Row | undefined;
    const iso = new Date(nowMs).toISOString();
    if (!row) { d.prepare("INSERT INTO reminders (client_id, step_key, first_seen_at) VALUES (?,?,?)").run(c.id, m.key, iso); continue; }
    if (row.count >= CADENCE.max) continue;
    const since = Date.parse(row.last_sent_at ?? row.first_seen_at);
    if (nowMs - since < (row.count ? CADENCE.every : CADENCE.first) * DAY) continue;
    try {
      const channels = await send(c, m.ask);
      if (!channels.length) continue;
      d.prepare("UPDATE reminders SET count = count + 1, last_sent_at = ? WHERE client_id = ? AND step_key = ?").run(iso, c.id, m.key);
      log(c.id, "system", "reminder_sent", { step: m.key, channels });
      out.sent++;
    } catch (e) {
      out.failed++;
      log(c.id, "system", "reminder_failed", { step: m.key, error: String((e as Error).message).slice(0, 200) });
    }
  }
  return out;
}

/** The welcome message right after signing: how to come back, since there is no password. */
export async function welcome(clientId: string) {
  try {
    const c = db().prepare("SELECT * FROM clients WHERE id = ?").get(clientId) as Row;
    if (!c || !emailConfigured()) return;
    const company = getTenant(c.tenant_id);
    await sendEmail(c.email, `Welcome to ${company.name}`,
      `Hi ${c.name.split(" ")[0]},\n\nYour account is ready. There is no password: to come back later, go to ${site()}/login and enter this email address. We will send you a one-time sign-in link.\n\nYour first step is to get your 3-bureau credit report and upload it.\n\nYour signed documents are on the Documents page of your account.\n\n— ${company.name}\n${company.address}`,
      fromAs(company.name));
    log(clientId, "system", "welcome_sent");
  } catch (e) { console.error("[welcome]", e); }
}

export function setPrefs(clientId: string, p: { reminders: boolean; texts: boolean }) {
  const c = db().prepare("SELECT sms_opt_in_at FROM clients WHERE id = ?").get(clientId) as Row;
  db().prepare("UPDATE clients SET reminders_off = ?, sms_opt_in_at = ? WHERE id = ?")
    .run(p.reminders ? 0 : 1, p.texts ? (c.sms_opt_in_at ?? new Date().toISOString()) : null, clientId);
  log(clientId, "consumer", "reminder_settings_changed", p);
}
