import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";

type Row = Record<string, any>;

/**
 * Operator subscriptions through Stripe. Settings:
 *   STRIPE_SECRET_KEY      secret API key (sk_test_... or sk_live_...)
 *   STRIPE_PRICE_ID        the $147/month support and community price (price_...); Season Pass renewals use it
 *   STRIPE_WEBHOOK_SECRET  signing secret of the webhook endpoint (whsec_...)
 *   APP_URL                public address of this site, e.g. https://app.example.com
 */
export const billingConfigured = () => !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
export const PLAN_LABEL = process.env.PLAN_LABEL ?? "$147 per month";

/**
 * Operator plans, sold through the private webinar page (/season-pass).
 * Season Passes charge the setup fee today and start the $147/month support and community plan when the term ends.
 */
export type PlanKey = "season6" | "season12" | "monthly";
export const PLANS: Record<PlanKey, { name: string; price: string; cents: number; months?: number; recurring?: boolean; pitch: string; after: string }> = {
  season6: { name: "6-Month Season Pass", price: "$997", cents: 99_700, months: 6, pitch: "Setup and 6 months of full access", after: "Then $147/month for priority support and community access. Cancel any time." },
  season12: { name: "12-Month Season Pass", price: "$1,497", cents: 149_700, months: 12, pitch: "Setup and 12 months of full access", after: "Then $147/month for priority support and community access. Cancel any time." },
  monthly: { name: "Monthly", price: "$497/month", cents: 49_700, recurring: true, pitch: "Full access, month to month", after: "Billed monthly. Cancel any time." },
};
export const isPlan = (k: unknown): k is PlanKey => typeof k === "string" && k in PLANS;
/** The day a Season Pass term ends: the same date, N months on. */
export function termEnd(months: number, nowMs = Date.now()) {
  const d = new Date(nowMs);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
const API = () => process.env.STRIPE_API_BASE ?? "https://api.stripe.com";

/** past_due keeps access while Stripe retries the card; Stripe moves it to canceled or unpaid if retries fail. */
const OK = new Set(["exempt", "active", "trialing", "past_due"]);
/** A company the platform owner has suspended is locked out whatever its payment status. */
export const goodStanding = (tenant: Row) => !tenant.suspended && OK.has(tenant.sub_status ?? "exempt");
/** What one paying operator is worth per month, for the revenue estimate. */
export const PLAN_MONTHLY = Number(process.env.PLAN_MONTHLY ?? 147);

export async function stripe(path: string, params: Record<string, string>): Promise<Row> {
  const res = await fetch(`${API()}/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const json = (await res.json().catch(() => ({}))) as Row;
  if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? `request failed (${res.status})`}`);
  return json;
}

export async function stripeGet(path: string): Promise<Row> {
  const res = await fetch(`${API()}/v1/${path}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } });
  const json = (await res.json().catch(() => ({}))) as Row;
  if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? `request failed (${res.status})`}`);
  return json;
}

/** Sends a company admin to Stripe's hosted checkout page for their plan. */
export async function createCheckout(tenant: Row, email: string, origin: string, plan: PlanKey, nowMs = Date.now()): Promise<string> {
  if (!billingConfigured()) throw new Error("Billing is not set up yet.");
  const p = PLANS[plan];
  const params: Record<string, string> = {
    mode: "subscription",
    client_reference_id: tenant.id,
    "metadata[plan]": plan,
    "subscription_data[metadata][tenant_id]": tenant.id,
    "subscription_data[metadata][plan]": plan,
    success_url: `${origin}/console/billing?ok=${encodeURIComponent("Payment received. Your account opens in a few seconds.")}`,
    cancel_url: `${origin}/console/billing`,
  };
  if (p.recurring) {
    Object.assign(params, {
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(p.cents),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": "Leverage IQ, monthly plan",
      "line_items[0][quantity]": "1",
    });
  } else {
    // The setup fee is charged today; the $147/month plan is held until the term ends, then bills automatically.
    const end = termEnd(p.months!, nowMs);
    Object.assign(params, {
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(p.cents),
      "line_items[0][price_data][product_data][name]": `Leverage IQ ${p.name}: setup and ${p.months} months of access`,
      "line_items[0][quantity]": "1",
      "line_items[1][price]": process.env.STRIPE_PRICE_ID!,
      "line_items[1][quantity]": "1",
      "subscription_data[trial_end]": String(Math.floor(end.getTime() / 1000)),
      "metadata[ends_at]": end.toISOString(),
    });
  }
  if (tenant.stripe_customer_id) params.customer = tenant.stripe_customer_id; else params.customer_email = email;
  const session = await stripe("checkout/sessions", params);
  return session.url as string;
}

/** Stripe's hosted page for updating the card, seeing invoices, or cancelling. */
export async function createPortal(tenant: Row, origin: string): Promise<string> {
  if (!tenant.stripe_customer_id) throw new Error("There is no subscription to manage yet.");
  const session = await stripe("billing_portal/sessions", { customer: tenant.stripe_customer_id, return_url: `${origin}/console/billing` });
  return session.url as string;
}

/** Checks the Stripe-Signature header so only Stripe can change a subscription status. */
export function verifyWebhook(payload: string, header: string | null, secret: string, nowMs = Date.now()): Row {
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=") as [string, string]).filter((p) => p.length === 2 && p[0] !== "v1"));
  const sigs = (header ?? "").split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) throw new Error("Missing signature.");
  if (Math.abs(nowMs / 1000 - t) > 300) throw new Error("Signature is too old.");
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const match = sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!match) throw new Error("Signature does not match.");
  return JSON.parse(payload);
}

/** Applies a verified Stripe event. Safe to receive the same event more than once. */
export function applyEvent(event: Row): string {
  const d = db(), o = event.data?.object ?? {};
  if (event.type === "checkout.session.completed" && o.mode === "payment" && o.metadata?.kind === "letters" && o.metadata?.client_id) {
    if (!["paid", "no_payment_required"].includes(o.payment_status)) return "letters not paid yet";
    const r = d.prepare("UPDATE clients SET paid_at = ?, paid_cents = ?, payment_ref = ? WHERE id = ? AND paid_at IS NULL")
      .run(new Date().toISOString(), o.amount_total ?? 0, o.payment_intent ?? o.id, o.metadata.client_id);
    return r.changes ? "letters_paid" : "letters already paid";
  }
  if (event.type === "checkout.session.completed" && o.mode === "subscription" && o.client_reference_id) {
    const plan = isPlan(o.metadata?.plan) ? o.metadata.plan : null;
    const r = d.prepare("UPDATE tenants SET sub_status='active', stripe_customer_id=?, stripe_subscription_id=?, plan=COALESCE(?, plan), plan_ends_at=? WHERE id=?")
      .run(o.customer, o.subscription, plan, o.metadata?.ends_at ?? null, o.client_reference_id);
    return r.changes ? "activated" : "unknown company";
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const status = event.type.endsWith("deleted") ? "canceled" : String(o.status);
    const r = d.prepare("UPDATE tenants SET sub_status=?, stripe_subscription_id=?, stripe_customer_id=COALESCE(stripe_customer_id, ?) WHERE id=? OR stripe_subscription_id=?")
      .run(status, o.id, o.customer, o.metadata?.tenant_id ?? "", o.id);
    return r.changes ? `status ${status}` : "unknown subscription";
  }
  return "ignored";
}
