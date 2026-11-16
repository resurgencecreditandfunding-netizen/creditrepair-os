import { NextResponse } from "next/server";
import { getMonitoring } from "@/lib/console";
import { currentClient } from "@/lib/session";
import { log } from "@/lib/store";

/** Sends the client to a credit monitoring partner and records the click for attribution. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const service = getMonitoring((await params).id);
  if (!service) return new NextResponse("Not found", { status: 404 });
  const client = await currentClient();
  if (client) log(client.id, "consumer", "monitoring_link_opened", { service: service.name });
  return NextResponse.redirect(service.url, 302);
}
