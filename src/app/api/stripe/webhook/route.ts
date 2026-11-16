import { NextResponse } from "next/server";
import { applyEvent, verifyWebhook } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret is not configured." }, { status: 503 });
  const payload = await req.text();
  let event;
  try { event = verifyWebhook(payload, req.headers.get("stripe-signature"), secret); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ received: true, result: applyEvent(event) });
}
