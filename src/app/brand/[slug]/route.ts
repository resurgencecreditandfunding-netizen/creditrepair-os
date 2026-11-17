import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** A company's logo. Public: it appears on their sign-up page. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const t = db().prepare("SELECT logo, logo_mime FROM tenants WHERE slug = ?").get((await params).slug) as { logo: Uint8Array | null; logo_mime: string | null } | undefined;
  if (!t?.logo || !t.logo_mime) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(t.logo), { headers: { "Content-Type": t.logo_mime, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
