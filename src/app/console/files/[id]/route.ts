import { NextResponse } from "next/server";
import { clientFor } from "@/lib/console";
import { getFile, readFile } from "@/lib/files";
import { currentOperator } from "@/lib/opsession";

export const dynamic = "force-dynamic";

/** A client's file, for staff of the client's company or the platform owner. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const op = await currentOperator();
  const doc = getFile((await params).id);
  if (!op || !doc) return new NextResponse("Not found", { status: 404 });
  try { clientFor(op, doc.client_id); } catch { return new NextResponse("Not found", { status: 404 }); }
  return new NextResponse(new Uint8Array(readFile(doc)), { headers: { "Content-Type": doc.mime, "Content-Disposition": `inline; filename="${doc.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
