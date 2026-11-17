import { NextResponse } from "next/server";
import { getFile, readFile } from "@/lib/files";
import { currentClient } from "@/lib/session";

export const dynamic = "force-dynamic";

/** A client's own uploaded file. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await currentClient();
  const doc = getFile((await params).id);
  if (!c || !doc || doc.client_id !== c.id) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(readFile(doc)), { headers: { "Content-Type": doc.mime, "Content-Disposition": `inline; filename="${doc.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
