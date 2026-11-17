import { stripe, stripeGet } from "./billing";
import { isPlatform, Operator } from "./console";
import { db } from "./db";
import { getClient, log, needsPayment } from "./store";

type Row = Record<string, any>;
export const priceLabel = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
export const paymentsOn = () => !!process.env.STRIPE_SECRET_KEY;

/** One-time Stripe checkout for a client's letters. Promotion codes are allowed, e.g. a 100%-off code for community members. */
export async function startCheckout(c: Row, origin: string): Promise<string> {
  if (!needsPayment(c)) throw new Error("Your letters are already unlocked.");
  if (!paymentsOn()) throw new Error("Payments are not switched on yet.");
  const session = await stripe("checkout/sessions", {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(c.price_cents),
    "line_items[0][price_data][product_data][name]": "Your completed dispute letters (every round)",
    allow_promotion_codes: "true",
    client_reference_id: c.id,
    customer_email: c.email,
    "metadata[kind]": "letters",
    "metadata[client_id]": c.id,
    "payment_intent_data[metadata][client_id]": c.id,
    success_url: `${origin}/disputes/unlocked?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/disputes`,
  });
  log(c.id, "consumer", "checkout_started", { amount: c.price_cents });
  return session.url as string;
}

/** Confirms a payment on return from checkout, without waiting for the webhook. Only a paid session for this same client counts. */
export async function confirmSession(clientId: string, sessionId: string): Promise<boolean> {
  const c = getClient(clientId)!;
  if (!needsPayment(c)) return true;
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return false;
  const s = await stripeGet(`checkout/sessions/${sessionId}`);
  if (s.metadata?.client_id !== clientId || s.metadata?.kind !== "letters" || !["paid", "no_payment_required"].includes(s.payment_status)) return false;
  markPaid(clientId, s.payment_intent ?? s.id, s.amount_total ?? 0);
  return true;
}
export function markPaid(clientId: string, ref: string, cents: number) {
  const r = db().prepare("UPDATE clients SET paid_at = ?, paid_cents = ?, payment_ref = ? WHERE id = ? AND paid_at IS NULL").run(new Date().toISOString(), cents, ref, clientId);
  if (!r.changes) return;
  log(clientId, "consumer", "letters_paid", { amount: cents, ref });
  if (cents > 0) void import("./meta").then((m) => m.consumerEvent(clientId, "Purchase", cents / 100));
}

export function setDirectPrice(op: Operator, dollars: number) {
  if (!isPlatform(op)) throw new Error("Only the platform owner can set the price.");
  if (!(dollars >= 0 && dollars <= 10000)) throw new Error("Enter a price in dollars.");
  db().prepare("INSERT INTO settings (key, value) VALUES ('direct_price_cents', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(String(Math.round(dollars * 100)));
}

// ---------- preview ----------
export interface Segment { text: string; hidden: boolean }

/** Stand-in characters with the same shape, so a hidden line looks like text but none of its content reaches the browser. */
function scramble(s: string, seed: number) {
  let x = seed + 7;
  const next = () => (x = (x * 1103515245 + 12345) & 0x7fffffff);
  return s.replace(/[A-Za-z0-9]/g, (ch) => {
    const r = next();
    if (ch >= "0" && ch <= "9") return String(r % 10);
    const c = String.fromCharCode(97 + (r % 26));
    return ch === ch.toUpperCase() ? c.toUpperCase() : c;
  });
}

/**
 * The preview: the letter's wording stays readable; the specific facts and legal citations for each item are hidden.
 * Hidden text is replaced on the server, so the blur cannot be undone in the browser.
 */
export function previewSegments(body: string): Segment[] {
  const out: Segment[] = [];
  body.split("\n").forEach((line, i) => {
    if (/^\s+- /.test(line)) out.push({ text: scramble(line, i), hidden: true });
    else if (line.startsWith("Authority: ")) {
      out.push({ text: "Authority: ", hidden: false });
      out.push({ text: scramble(line.slice(11), i), hidden: true });
    } else out.push({ text: line, hidden: false });
    out.push({ text: "\n", hidden: false });
  });
  return out;
}
