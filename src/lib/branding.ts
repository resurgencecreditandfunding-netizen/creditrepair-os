import { headers } from "next/headers";
import { db } from "./db";
import { sniff } from "./files";
import { getTenant } from "./store";

type Row = Record<string, any>;
export interface BrandBar { brand: string; logo?: string; accent?: string }
const DEFAULT_ACCENT = "#d04c1c";
export const MAX_LOGO = 300 * 1024;

/** WCAG relative luminance contrast between a colour and white. Buttons put white text on the accent. */
export function contrastWithWhite(hex: string) {
  const c = hex.replace("#", "").match(/../g)!.map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return 1.05 / (L + 0.05);
}

/** What the client header shows for a company. The platform itself keeps the Leverage IQ logo and colours. */
export function brandBar(t: Row): BrandBar {
  if (t.id === "tenant_default") return { brand: t.name };
  return { brand: t.name, logo: t.logo_mime ? `/brand/${t.slug}?v=${t.brand_version}` : undefined, accent: t.accent || undefined };
}
export const brandBarFor = (client: Row) => brandBar(getTenant(client.tenant_id));

export function setBranding(tenantId: string, b: { logo?: Buffer | null; removeLogo?: boolean; accent: string }) {
  if (tenantId === "tenant_default") throw new Error("The platform's own brand is set in the code, not here.");
  const accent = b.accent.trim().toLowerCase();
  if (accent && !/^#[0-9a-f]{6}$/.test(accent)) throw new Error("Pick a colour.");
  if (accent && contrastWithWhite(accent) < 3) throw new Error("That colour is too light: white button text on it would be hard to read. Pick a darker shade.");
  const d = db();
  if (b.logo && b.logo.length) {
    if (b.logo.length > MAX_LOGO) throw new Error("The logo must be under 300 KB.");
    const mime = sniff(b.logo);
    if (!mime || mime === "application/pdf") throw new Error("Upload the logo as PNG, JPG or WebP.");
    d.prepare("UPDATE tenants SET logo = ?, logo_mime = ? WHERE id = ?").run(b.logo, mime, tenantId);
  } else if (b.removeLogo) d.prepare("UPDATE tenants SET logo = NULL, logo_mime = NULL WHERE id = ?").run(tenantId);
  d.prepare("UPDATE tenants SET accent = ?, brand_version = brand_version + 1 WHERE id = ?").run(accent && accent !== DEFAULT_ACCENT ? accent : null, tenantId);
}

/** Company sites live at <link name>.<BASE_DOMAIN>, for example smith-tax.leverageiq100.com. */
export const baseDomain = () => (process.env.BASE_DOMAIN ?? "").toLowerCase().replace(/^\.|\.$/g, "");
export function slugFromHost(host: string | null): string | null {
  const base = baseDomain();
  const h = (host ?? "").toLowerCase().split(":")[0];
  if (!base || !h.endsWith(`.${base}`)) return null;
  const sub = h.slice(0, -base.length - 1);
  return sub && sub !== "www" && !sub.includes(".") ? sub : null;
}
/** The company for this visit: from a subdomain first, then a ?t= link, else the platform. */
export async function tenantForVisit(t?: string) {
  const fromHost = slugFromHost((await headers()).get("host"));
  return getTenant(fromHost ?? t ?? "default");
}
export const companyLink = (slug: string, origin: string) => (baseDomain() ? `https://${slug}.${baseDomain()}` : `${origin}/?t=${slug}`);
