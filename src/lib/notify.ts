import { db } from "./db";
import { PRODUCT } from "./brand";
import { log } from "./store";

/**
 * Sign-up alerts by email (Resend) and text message (Twilio).
 *   RESEND_API_KEY, NOTIFY_FROM                      email
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM   text
 * Each company stores where its alerts go. The platform's own company (tenant_default) is the owner,
 * and its notify_all flag decides whether the owner hears about every company's sign-ups or only direct ones.
 */
type Row = Record<string, any>;
export const emailConfigured = () => !!process.env.RESEND_API_KEY;
export const smsConfigured = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
const FROM = () => process.env.NOTIFY_FROM || `${PRODUCT} <alerts@leverageiq100.com>`;
/** Same sending address, shown under another name (a company's own name for its clients). */
export const fromAs = (name: string) => FROM().replace(/^[^<]*</, `${name.replace(/[<>"]/g, "")} <`);
export const site = () => (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");

/** US numbers only: returns +1XXXXXXXXXX, or null if it is not a valid US number. */
export function normalizePhone(input: string): string | null {
  const d = input.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? `+1${ten}` : null;
}
export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export interface Recipient { email: string | null; phone: string | null; who: string }
const recipientOf = (t: Row, who: string): Recipient | null =>
  t && (t.notify_email || t.notify_phone) ? { email: t.notify_email, phone: t.notify_phone, who } : null;

/** Who hears about a client signing: their company, and the owner (always for direct clients, for others only if the owner chose all). */
export function recipientsForClient(client: Row): Recipient[] {
  const d = db();
  const owner = d.prepare("SELECT * FROM tenants WHERE id = 'tenant_default'").get() as Row;
  const out: Recipient[] = [];
  if (client.tenant_id !== "tenant_default") {
    const r = recipientOf(d.prepare("SELECT * FROM tenants WHERE id = ?").get(client.tenant_id) as Row, "company");
    if (r) out.push(r);
  }
  if (client.tenant_id === "tenant_default" || owner?.notify_all) {
    const r = recipientOf(owner, "owner");
    if (r && !out.some((x) => x.email === r.email && x.phone === r.phone)) out.push(r);
  }
  return out;
}

export interface EmailExtras { replyTo?: string | null; unsubscribeUrl?: string | null }
export async function sendEmail(to: string, subject: string, text: string, from = FROM(), extras: EmailExtras = {}) {
  const res = await fetch(`${process.env.RESEND_API_BASE ?? "https://api.resend.com"}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [to], subject, text,
      ...(extras.replyTo ? { reply_to: extras.replyTo } : {}),
      // One-click unsubscribe for mail apps (Gmail, Yahoo, Apple Mail)
      ...(extras.unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${extras.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`email ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
export async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const res = await fetch(`${process.env.TWILIO_API_BASE ?? "https://api.twilio.com"}/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }),
  });
  if (!res.ok) throw new Error(`text ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Sends to every recipient on every configured channel. Never throws: an alert failing must not break a sign-up. */
export async function deliver(recipients: Recipient[], msg: { subject: string; text: string; sms: string }, clientId: string | null) {
  const jobs: Promise<void>[] = [];
  for (const r of recipients) {
    if (r.email && emailConfigured()) jobs.push(sendEmail(r.email, msg.subject, msg.text).then(() => log(clientId, "system", "alert_sent", { to: r.who, channel: "email" })));
    if (r.phone && smsConfigured()) jobs.push(sendSms(r.phone, msg.sms).then(() => log(clientId, "system", "alert_sent", { to: r.who, channel: "text" })));
  }
  const results = await Promise.allSettled(jobs);
  const errors: string[] = [];
  for (const x of results) if (x.status === "rejected") {
    const error = String((x.reason as Error)?.message ?? x.reason).slice(0, 300);
    errors.push(error);
    log(clientId, "system", "alert_failed", { error });
    console.error("[alerts]", x.reason);
  }
  return { attempted: jobs.length, failed: errors.length, errors };
}

const STAGE: Record<string, string> = { operating: "Owns an operating business", starting: "Starting a business", planning: "Plans to start later", none: "No business" };

export async function clientSigned(clientId: string) {
  try {
    const d = db();
    const c = d.prepare("SELECT * FROM clients WHERE id = ?").get(clientId) as Row;
    if (!c) return;
    const t = d.prepare("SELECT * FROM tenants WHERE id = ?").get(c.tenant_id) as Row;
    const company = c.tenant_id === "tenant_default" ? "direct" : t.name;
    const link = site() ? `${site()}/console/clients/${c.id}` : "";
    await deliver(recipientsForClient(c), {
      subject: `New sign-up: ${c.name} (${company})`,
      text: [
        `${c.name} just signed up with ${t.name} on ${PRODUCT}.`, "",
        `Email: ${c.email}`, `Phone: ${c.phone || "not given"}`, `Location: ${c.city}, ${c.state}`,
        `Business: ${STAGE[c.business_stage] ?? c.business_stage}`, `Funding goal: ${c.funding_goal || "not given"}`,
        "", link ? `Open their file: ${link}` : "",
      ].join("\n"),
      sms: `${PRODUCT}: new sign-up, ${c.name} (${company}).${link ? ` ${link}` : ""}`,
    }, clientId);
  } catch (e) { console.error("[alerts]", e); }
}

/** Tells the owner when a company signs up for the platform or starts paying. */
export async function operatorEvent(tenantId: string, kind: "registered" | "subscribed") {
  try {
    const d = db();
    const t = d.prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId) as Row;
    const owner = recipientOf(d.prepare("SELECT * FROM tenants WHERE id = 'tenant_default'").get() as Row, "owner");
    if (!t || !owner) return;
    const what = kind === "registered" ? "signed up as an operator (not paid yet)" : "started a paid subscription";
    await deliver([owner], {
      subject: `Operator ${kind === "registered" ? "sign-up" : "subscribed"}: ${t.name}`,
      text: `${t.name} (${t.legal_name ?? t.name}) ${what}.${site() ? `\n\nBusiness page: ${site()}/console/admin` : ""}`,
      sms: `${PRODUCT}: ${t.name} ${what}.`,
    }, null);
  } catch (e) { console.error("[alerts]", e); }
}

export function setAlertSettings(tenantId: string, s: { email: string; phone: string; all?: boolean }) {
  const email = s.email.trim().toLowerCase();
  if (email && !validEmail(email)) throw new Error("Enter a valid email address.");
  const phone = s.phone.trim() ? normalizePhone(s.phone) : null;
  if (s.phone.trim() && !phone) throw new Error("Enter a 10-digit US mobile number.");
  db().prepare("UPDATE tenants SET notify_email = ?, notify_phone = ?, notify_all = COALESCE(?, notify_all) WHERE id = ?")
    .run(email || null, phone, s.all === undefined ? null : s.all ? 1 : 0, tenantId);
}

export async function sendTestAlert(tenantId: string) {
  const t = db().prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId) as Row;
  const r = recipientOf(t, "test");
  if (!r) throw new Error("Save an email address or mobile number first.");
  if (!emailConfigured() && !smsConfigured()) throw new Error("Alerts are not switched on yet. The platform needs an email or text service key.");
  const out = await deliver([r], { subject: `${PRODUCT} test alert`, text: "This is a test. Sign-up alerts are working.", sms: `${PRODUCT}: test alert. Sign-up alerts are working.` }, null);
  if (!out.attempted) throw new Error(r.email && !emailConfigured() ? "Email alerts are not switched on yet; only text is." : "Text alerts are not switched on yet; only email is.");
  if (out.failed) throw new Error(`The test did not go through. ${explainSendError(out.errors[0])}`);
}

/** A client asked for a funding review: always tells the owner, who runs funding, and the client's company. */
export async function fundingRequested(clientId: string) {
  try {
    const d = db();
    const c = d.prepare("SELECT * FROM clients WHERE id = ?").get(clientId) as Row;
    const t = d.prepare("SELECT * FROM tenants WHERE id = ?").get(c.tenant_id) as Row;
    const owner = recipientOf(d.prepare("SELECT * FROM tenants WHERE id = 'tenant_default'").get() as Row, "owner");
    const company = c.tenant_id !== "tenant_default" ? recipientOf(t, "company") : null;
    const to = [company, owner].filter((x): x is Recipient => !!x);
    const label = c.tenant_id === "tenant_default" ? "direct" : t.name;
    await deliver(to, {
      subject: `Funding request: ${c.name} (${label})`,
      text: `${c.name} asked for a funding review.\n\nEmail: ${c.email}\nPhone: ${c.phone || "not given"}\nFunding goal: ${c.funding_goal || "not given"}${site() ? `\n\nFunding pipeline: ${site()}/console/funding` : ""}`,
      sms: `${PRODUCT}: funding request from ${c.name} (${label}).`,
    }, clientId);
  } catch (e) { console.error("[alerts]", e); }
}

/** Turns a provider's reply into something the owner can act on. */
export function explainSendError(raw: string): string {
  const e = raw.toLowerCase();
  if (e.startsWith("email")) {
    if (e.includes("not verified") || e.includes("verify a domain") || e.includes("domain") && e.includes("403"))
      return `Resend has not verified your sending domain yet. In Resend, open Domains, add the DNS records it lists to GoDaddy, and click Verify. (Resend said: ${raw.slice(10, 180)})`;
    if (e.includes(" 401") || e.includes("api key") || e.includes("api_key"))
      return `Resend did not accept the API key. Check RESEND_API_KEY in Render: it should start with re_ and have no spaces. (Resend said: ${raw.slice(10, 180)})`;
    if (e.includes(" 422") && e.includes("from"))
      return `Resend rejected the sender address. The sending address must be on your verified domain. (Resend said: ${raw.slice(10, 180)})`;
    if (e.includes(" 429")) return "Resend's sending limit was reached. Wait a few minutes, or check your Resend plan's daily limit.";
    return `Resend said: ${raw.slice(6, 220)}`;
  }
  if (e.startsWith("text")) return `Twilio said: ${raw.slice(5, 220)}`;
  return raw;
}
