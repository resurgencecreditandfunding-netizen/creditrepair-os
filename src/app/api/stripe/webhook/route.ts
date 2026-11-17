import { NextResponse } from "next/server";
import { applyEvent, PLAN_MONTHLY, verifyWebhook } from "@/lib/billing";
import * as meta from "@/lib/meta";
import { operatorEvent } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret is not configured." }, { status: 503 });
  const payload = await req.text();
  let event;
  try { event = verifyWebhook(payload, req.headers.get("stripe-signature"), secret); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  const result = applyEvent(event);
  const o = event.data.object;
  if (result === "activated") {
    void operatorEvent(o.client_reference_id, "subscribed");
    void meta.operatorEvent(o.client_reference_id, "Subscribe", PLAN_MONTHLY);
  }
  // Same event id as the one sent when the client returns from checkout, so Meta counts the purchase once.
  if (result === "letters_paid" && o.amount_total > 0) void meta.consumerEvent(o.metadata.client_id, "Purchase", o.amount_total / 100);
  return NextResponse.json({ received: true, result });
}
