import { NextResponse } from "next/server";
import { clientFromToken, turnOff } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";

/** One-click unsubscribe (RFC 8058): mail apps POST here when someone taps "Unsubscribe". */
export async function POST(req: Request) {
  const id = clientFromToken(new URL(req.url).searchParams.get("t") ?? "");
  if (id) turnOff(id);
  return NextResponse.json({ ok: true });
}
