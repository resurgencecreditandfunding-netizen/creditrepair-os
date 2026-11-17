import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Used by the host to confirm the site is up and the database is reachable. */
export function GET() {
  try { db().prepare("SELECT 1").get(); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ ok: false }, { status: 503 }); }
}
