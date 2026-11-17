import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";

type Row = Record<string, any>;

/**
 * Operator subscriptions through Stripe. Settings:
 *   STRIPE_SECRET_KEY      secret API key (sk_test_... or sk_live_...)
 *   STRIPE_PRICE_ID        the recurring price operators subscribe to (price_...)
 *   STRIPE_WEBHOOK_SECRET  signing secret of the webhook endpoint (whsec_...)
 *   APP_URL                public address of this site, e.g. https://app.example.com
 */
export const billingConfigured = () => !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
export const PLAN_LABEL = process.env.PLAN_LABEL ?? "$147 per month";
const API = () => process.env.STRIPE_API_BASE ?? "https://api.stripe.com";

/** past_due keeps access while Stripe retries the card; Stripe moves it to canceled or unpaid if retries fail. */
const OK = new Set(["exempt", "active", "trialing", "past_due"]);
/** A company the platform owner has suspended is locked out whatever its payment status. */
export const goodStanding = (tenant: Row) => !tenant.suspended && OK.has(tenant.sub_status ?? "exempt");
/** What one paying operator is worth per month, for the revenue estimate. */
export const PLAN_MONTHLY = Number(process.env.PLAN_MONTHLY ?? 147);

async function stripe(path: string, params: Record<string, string>): Promise<Row> {
  const res = await fetch(`${API()}/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const json = (await res.json().catch(() => ({}))) as Row;
  if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? `request failed (${res.status})`}`);
  return json;
}

/** Sends a company admin to Stripe's hosted checkout page to start the subscription. */
export async function createCheckout(tenant: Row, email: string, origin: string): Promise<string> {
  if (!billingConfigured()) throw new Error("Billing is not set up yet.");
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": process.env.STRIPE_PRICE_ID!,
    "line_items[0][quantity]": "1",
    client_reference_id: tenant.id,
    "subscription_data[metadata][tenant_id]": tenant.id,
    success_url: `${origin}/console/billing?ok=${encodeURIComponent("Payment received. Your account opens in a few seconds.")}`,
    cancel_url: `${origin}/console/billing`,
  };
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
  if (event.type === "checkout.session.completed" && o.mode === "subscription" && o.client_reference_id) {
    const r = d.prepare("UPDATE tenants SET sub_status='active', stripe_customer_id=?, stripe_subscription_id=? WHERE id=?")
      .run(o.customer, o.subscription, o.client_reference_id);
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
