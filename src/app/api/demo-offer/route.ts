import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DEMO_COOKIE, markOfferSeen } from "@/lib/demo";

export const dynamic = "force-dynamic";

/** Records that this viewer watched far enough to see the offer. */
export async function POST() {
  const id = (await cookies()).get(DEMO_COOKIE)?.value;
  if (id) markOfferSeen(id);
  return NextResponse.json({ ok: true });
}
