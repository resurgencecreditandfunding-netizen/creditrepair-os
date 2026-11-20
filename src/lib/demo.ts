import { randomUUID } from "node:crypto";
import { db } from "./db";
import { deliver, normalizePhone, validEmail } from "./notify";
import { PRODUCT } from "./brand";
import type { Match } from "./meta";

type Row = Record<string, any>;
/** Operator demo funnel: ad -> opt-in (/demo) -> video with the offer appearing late (/demo/watch) -> plan -> sign-up. */
export const DEMO_COOKIE = "liq_demo";
export const KINDS: Record<string, string> = { tax_pro: "Tax professional", credit_repair: "Credit repair firm", funding_pro: "Funding professional" };

/** Share of the video watched before the offer appears (default 75%). */
export const revealAt = () => {
  const n = Number(process.env.VSL_REVEAL_AT ?? 0.75);
  return n > 0 && n < 1 ? n : 0.75;
};

export function saveLead(l: { name: string; email: string; phone: string; kind: string; source: string | null; match: Match }) {
  const name = l.name.trim(), email = l.email.trim().toLowerCase();
  if (!name) throw new Error("Please enter your name.");
  if (!validEmail(email)) throw new Error("Please enter a valid email address.");
  const phone = l.phone.trim() ? normalizePhone(l.phone) : null;
  if (l.phone.trim() && !phone) throw new Error("Please enter a valid US mobile number.");
  const kind = l.kind in KINDS ? l.kind : "tax_pro";
  const id = randomUUID();
  db().prepare("INSERT INTO demo_leads (id, name, email, phone, kind, source, ad_match, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(id, name, email, phone, kind, l.source, JSON.stringify(l.match), new Date().toISOString());
  return id;
}
export const getLead = (id: string | undefined | null) =>
  id ? (db().prepare("SELECT * FROM demo_leads WHERE id = ?").get(id) as Row | undefined) : undefined;
export const markOfferSeen = (id: string) =>
  db().prepare("UPDATE demo_leads SET offer_seen_at = COALESCE(offer_seen_at, ?) WHERE id = ?").run(new Date().toISOString(), id).changes > 0;
export const linkLead = (id: string | undefined | null, tenantId: string) => {
  if (id) db().prepare("UPDATE demo_leads SET tenant_id = ? WHERE id = ? AND tenant_id IS NULL").run(tenantId, id);
};

/** Opt-ins, how many reached the offer, and how many signed up and paid. */
export function demoStats() {
  const d = db();
  const n = (sql: string) => (d.prepare(sql).get() as Row).n as number;
  return {
    optIns: n("SELECT count(*) n FROM demo_leads"),
    sawOffer: n("SELECT count(*) n FROM demo_leads WHERE offer_seen_at IS NOT NULL"),
    signedUp: n("SELECT count(*) n FROM demo_leads WHERE tenant_id IS NOT NULL"),
    paid: n("SELECT count(*) n FROM demo_leads l JOIN tenants t ON t.id = l.tenant_id WHERE t.sub_status IN ('active','trialing','past_due')"),
  };
}

/** Tells the owner about a new demo opt-in. */
export async function alertOwner(id: string) {
  try {
    const l = getLead(id);
    const owner = db().prepare("SELECT * FROM tenants WHERE id = 'tenant_default'").get() as Row;
    const email = owner?.notify_email, phone = owner?.notify_phone;
    if (!l || (!email && !phone)) return;
    await deliver([{ email: email ?? null, phone: phone ?? null, who: "owner" }], {
      subject: `Demo opt-in: ${l.name} (${KINDS[l.kind] ?? l.kind})`,
      text: `${l.name} opted in to watch the demo.\n\nEmail: ${l.email}\nPhone: ${l.phone ?? "not given"}\nBusiness: ${KINDS[l.kind] ?? l.kind}`,
      sms: `${PRODUCT}: demo opt-in from ${l.name} (${KINDS[l.kind] ?? l.kind}).`,
    }, null);
  } catch (e) { console.error("[demo alert]", e); }
}
