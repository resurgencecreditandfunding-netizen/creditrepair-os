import { ImageResponse } from "next/og";
import { PRODUCT, TAGLINE } from "@/lib/brand";
import { currentClient } from "@/lib/session";
import { getTenant } from "@/lib/store";
import { winsFor } from "@/lib/wins";

export const dynamic = "force-dynamic";

/** A 1080×1080 image of one win, in the company's colours. No account details, ever; first name only if the client asks. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const c = await currentClient();
  if (!c) return new Response("Not found", { status: 404 });
  const { kind } = await params;
  const win = winsFor(c).find((w) => w.kind === kind);
  if (!win) return new Response("Not found", { status: 404 });
  const t = getTenant(c.tenant_id);
  const accent = t.id !== "tenant_default" && t.accent ? t.accent : "#d04c1c";
  const brand = t.id === "tenant_default" ? PRODUCT : t.name;
  const who = new URL(req.url).searchParams.get("name") === "1" ? `${c.name.split(" ")[0]}'s win` : "A real win";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b0b0c", color: "#fff", padding: 80, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 34, letterSpacing: 6, textTransform: "uppercase", color: accent, fontWeight: 700 }}>{who}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: win.big.length > 6 ? 170 : 240, fontWeight: 800, lineHeight: 1, letterSpacing: -6 }}>{win.big}</div>
          <div style={{ display: "flex", fontSize: 54, marginTop: 24, lineHeight: 1.2, color: "#e4e4e7", maxWidth: 880 }}>{win.line}</div>
          <div style={{ display: "flex", width: 160, height: 10, background: accent, marginTop: 48 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 800 }}>{brand}</div>
            {t.id === "tenant_default" && <div style={{ display: "flex", fontSize: 24, color: accent, letterSpacing: 4, textTransform: "uppercase", marginTop: 6 }}>{TAGLINE}</div>}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#a1a1aa", maxWidth: 420, textAlign: "right" }}>Individual results vary. No result is guaranteed.</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080, headers: { "Cache-Control": "private, no-store" } },
  );
}
