import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { emailConfigured, fromAs, normalizePhone, sendEmail, sendSms, site, smsConfigured } from "./notify";
import { getTenant, log } from "./store";

type Row = Record<string, any>;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** A one-time sign-in link for a client. Short-lived when requested; longer when sent inside a reminder. */
export function createToken(clientId: string, minutes = 30) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  db().prepare("INSERT INTO login_tokens (token_hash, client_id, expires_at, created_at) VALUES (?,?,?,?)")
    .run(hash(token), clientId, new Date(now + minutes * 60_000).toISOString(), new Date(now).toISOString());
  return token;
}
export const signInUrl = (token: string, next?: string) => `${site()}/login/verify?token=${encodeURIComponent(token)}${next ? `&next=${encodeURIComponent(next)}` : ""}`;

/** Spends a token. Returns the client id, or null if the token is unknown, used, or expired. */
export function redeemToken(token: string): string | null {
  const d = db();
  const row = d.prepare("SELECT * FROM login_tokens WHERE token_hash = ?").get(hash(token)) as Row | undefined;
  if (!row || row.used_at || row.expires_at < new Date().toISOString()) return null;
  const r = d.prepare("UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").run(new Date().toISOString(), hash(token));
  if (!r.changes) return null;
  log(row.client_id, "consumer", "signed_in");
  return row.client_id;
}

/** Accounts matching an email address or a mobile number. One person may be a client of more than one company. */
export function findAccounts(contact: string): Row[] {
  const c = contact.trim().toLowerCase();
  if (c.includes("@")) return db().prepare("SELECT * FROM clients WHERE lower(email) = ? ORDER BY created_at DESC").all(c) as Row[];
  const phone = normalizePhone(c);
  if (!phone) return [];
  return (db().prepare("SELECT * FROM clients WHERE phone IS NOT NULL AND phone != ''").all() as Row[]).filter((x) => normalizePhone(x.phone) === phone);
}

/**
 * Sends sign-in links. Says nothing about whether an account exists: the caller shows the same message either way.
 * Returns the links only in demo mode, for testing without an email service.
 */
export async function sendSignInLinks(contact: string): Promise<{ demoLinks?: { company: string; url: string }[] }> {
  const accounts = findAccounts(contact);
  if (!accounts.length) return {};
  const byPhone = !contact.includes("@");
  const links = accounts.map((a) => ({ a, company: getTenant(a.tenant_id).name, url: signInUrl(createToken(a.id)) }));
  if (process.env.DEMO_MODE === "1") return { demoLinks: links.map(({ company, url }) => ({ company, url })) };
  const first = links[0];
  try {
    if (byPhone && smsConfigured()) {
      await sendSms(normalizePhone(contact)!, `${first.company}: your sign-in link (expires in 30 minutes): ${first.url}`);
    } else if (!byPhone && emailConfigured()) {
      const body = links.length === 1
        ? `Use this link to sign in. It works once and expires in 30 minutes.\n\n${first.url}`
        : `You have more than one account. Use the link for the one you want. Each works once and expires in 30 minutes.\n\n${links.map((l) => `${l.company}: ${l.url}`).join("\n\n")}`;
      await sendEmail(first.a.email, `Your sign-in link`, `${body}\n\nIf you did not ask to sign in, ignore this email.`, fromAs(first.company));
    }
    for (const l of links) log(l.a.id, "system", "signin_link_sent", { channel: byPhone ? "text" : "email" });
  } catch (e) { console.error("[signin]", e); }
  return {};
}

export const signInAvailable = () => emailConfigured() || smsConfigured() || process.env.DEMO_MODE === "1";
