import { createHash } from "node:crypto";
import { db } from "./db";
import { log } from "./store";

/**
 * Meta Pixel and Conversions API.
 *   META_PIXEL_ID          the dataset / pixel id from Events Manager
 *   META_CAPI_TOKEN        Conversions API access token (Events Manager > Settings)
 *   META_TEST_EVENT_CODE   optional: events show under "Test events" while this is set
 *   META_GRAPH_VERSION     optional: defaults to v26.0
 *
 * What is sent: the event name, a value for purchases, and match keys (email, phone, name, city, state, ZIP,
 * hashed as Meta requires; plus Meta's own browser and click ids, IP address and browser type).
 * Never sent: anything from a credit report, findings, letters or scores, or any page inside a client's account.
 * Only the platform's own funnels are tracked; an operator's clients are never sent to this pixel.
 * A browser that sends the Global Privacy Control signal is never tracked.
 */
type Row = Record<string, any>;
export const pixelId = () => process.env.META_PIXEL_ID?.trim() || "";
export const capiOn = () => !!(pixelId() && process.env.META_CAPI_TOKEN);
const VERSION = () => process.env.META_GRAPH_VERSION || "v26.0";
const API = () => process.env.META_API_BASE ?? "https://graph.facebook.com";

export interface Match { fbp?: string | null; fbc?: string | null; ip?: string | null; ua?: string | null; gpc?: boolean }

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
/** Meta's normalization rules, then SHA-256. Empty values are left out. */
export const norm = {
  email: (v?: string | null) => (v?.trim() ? sha(v.trim().toLowerCase()) : undefined),
  phone: (v?: string | null) => {
    const d = (v ?? "").replace(/\D/g, "");
    const n = d.length === 10 ? `1${d}` : d;
    return n.length >= 11 ? sha(n) : undefined;
  },
  name: (v?: string | null) => (v?.trim() ? sha(v.trim().toLowerCase().replace(/[^a-zÀ-ɏ]/g, "")) : undefined),
  city: (v?: string | null) => (v?.trim() ? sha(v.trim().toLowerCase().replace(/[^a-z]/g, "")) : undefined),
  state: (v?: string | null) => (v?.trim() ? sha(v.trim().toLowerCase().slice(0, 2)) : undefined),
  zip: (v?: string | null) => (v?.trim() ? sha(v.trim().slice(0, 5)) : undefined),
  id: (v?: string | null) => (v ? sha(v) : undefined),
};

export interface Person { email?: string | null; phone?: string | null; name?: string | null; city?: string | null; state?: string | null; zip?: string | null; externalId: string }

export function userData(p: Person, m: Match) {
  const [first, ...rest] = (p.name ?? "").trim().split(/\s+/);
  const ud: Record<string, unknown> = {
    em: norm.email(p.email), ph: norm.phone(p.phone), fn: norm.name(first), ln: norm.name(rest.at(-1)),
    ct: norm.city(p.city), st: norm.state(p.state), zp: norm.zip(p.zip), country: sha("us"), external_id: norm.id(p.externalId),
    client_ip_address: m.ip || undefined, client_user_agent: m.ua || undefined, fbp: m.fbp || undefined, fbc: m.fbc || undefined,
  };
  for (const k of Object.keys(ud)) if (ud[k] === undefined) delete ud[k];
  for (const k of ["em", "ph", "fn", "ln", "ct", "st", "zp", "country", "external_id"]) if (typeof ud[k] === "string") ud[k] = [ud[k]];
  return ud;
}

export interface MetaEvent {
  name: "Lead" | "CompleteRegistration" | "InitiateCheckout" | "Purchase" | "Subscribe";
  /** The same id for the same real-world event, so Meta counts it once even if sent twice. */
  id: string;
  url: string;
  person: Person;
  match: Match;
  audience: "consumer" | "operator";
  value?: number;
}

export function payload(e: MetaEvent, now = Date.now()) {
  const custom: Record<string, unknown> = { content_category: e.audience };
  if (e.value !== undefined) { custom.value = Math.round(e.value * 100) / 100; custom.currency = "USD"; }
  return {
    data: [{ event_name: e.name, event_time: Math.floor(now / 1000), event_id: e.id, action_source: "website", event_source_url: e.url, user_data: userData(e.person, e.match), custom_data: custom }],
    ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
  };
}

/** Sends one event. Never throws and never slows the person down: failures are logged for the owner. */
export async function send(e: MetaEvent, clientId: string | null) {
  if (!capiOn() || e.match.gpc) return false;
  try {
    const res = await fetch(`${API()}/${VERSION()}/${pixelId()}/events?access_token=${encodeURIComponent(process.env.META_CAPI_TOKEN!)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(e)),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    log(clientId, "system", "meta_event_sent", { event: e.name, audience: e.audience });
    return true;
  } catch (err) {
    log(clientId, "system", "meta_event_failed", { event: e.name, error: String((err as Error).message).slice(0, 240) });
    console.error("[meta]", err);
    return false;
  }
}

// ---------- match keys captured at sign-up, reused for later events ----------
export const saveMatch = (table: "clients" | "tenants", id: string, m: Match) =>
  db().prepare(`UPDATE ${table} SET ad_match = ? WHERE id = ?`).run(JSON.stringify(m), id);
const readMatch = (raw: string | null): Match => { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } };

const site = () => (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "https://leverageiq100.com").replace(/\/$/, "");

/** A consumer funnel event for one of the platform's own (direct) clients. */
export async function consumerEvent(clientId: string, name: MetaEvent["name"], value?: number) {
  const c = db().prepare("SELECT * FROM clients WHERE id = ?").get(clientId) as Row | undefined;
  if (!c || c.tenant_id !== "tenant_default") return false;
  return send({
    name, id: `${name}-${c.id}`, url: `${site()}/`, audience: "consumer", value,
    person: { email: c.email, phone: c.phone, name: c.name, city: c.city, state: c.state, zip: c.zip, externalId: c.id },
    match: readMatch(c.ad_match),
  }, c.id);
}

/** An operator funnel event; the person is the company's first admin. */
export async function operatorEvent(tenantId: string, name: MetaEvent["name"], value?: number) {
  const t = db().prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId) as Row | undefined;
  if (!t || t.id === "tenant_default") return false;
  const admin = db().prepare("SELECT * FROM operators WHERE tenant_id = ? ORDER BY created_at LIMIT 1").get(tenantId) as Row | undefined;
  return send({
    name, id: `${name}-${t.id}`, url: `${site()}/partners`, audience: "operator", value,
    person: { email: admin?.email, name: admin?.name, externalId: t.id },
    match: readMatch(t.ad_match),
  }, null);
}

/** Events sent and failed in the last 7 days, for the Business page. */
export function recentEvents() {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const rows = db().prepare("SELECT action, detail FROM audit_log WHERE action IN ('meta_event_sent','meta_event_failed') AND at >= ?").all(since) as Row[];
  const out = new Map<string, { sent: number; failed: number }>();
  let lastError: string | null = null;
  for (const r of rows) {
    const d = JSON.parse(r.detail);
    const g = out.get(d.event) ?? { sent: 0, failed: 0 };
    if (r.action === "meta_event_sent") g.sent++; else { g.failed++; lastError = d.error; }
    out.set(d.event, g);
  }
  return { byEvent: [...out.entries()].map(([event, g]) => ({ event, ...g })), lastError };
}

/** Stops events for a person from now on, keeping any other match details. */
export function optOut(table: "clients" | "tenants", id: string) {
  const row = db().prepare(`SELECT ad_match FROM ${table} WHERE id = ?`).get(id) as Row | undefined;
  if (!row) return;
  saveMatch(table, id, { ...readMatch(row.ad_match), gpc: true });
  log(table === "clients" ? id : null, "consumer", "ad_tracking_opt_out");
}
/** Opts out every direct client with this email. Says nothing about whether one exists. */
export function optOutByEmail(email: string) {
  const rows = db().prepare("SELECT id FROM clients WHERE lower(trim(email)) = ?").all(email.trim().toLowerCase()) as Row[];
  for (const r of rows) optOut("clients", r.id);
  const ops = db().prepare("SELECT tenant_id FROM operators WHERE lower(trim(email)) = ?").all(email.trim().toLowerCase()) as Row[];
  for (const o of ops) optOut("tenants", o.tenant_id);
}
