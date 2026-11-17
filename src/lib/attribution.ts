/**
 * Which ad or link brought someone in. Kept in a first-party cookie from the moment they land with a campaign tag,
 * then saved on the client or company record when they sign up. No data goes to the ad platform from here.
 */
export const SOURCE_COOKIE = "liq_src";
export const SOURCE_DAYS = 30;

export interface Source { source: string | null; medium: string | null; campaign: string | null; content: string | null; facebook: boolean; landing: string; at: string }

const clean = (v: string | null) => (v ? v.trim().slice(0, 80).replace(/[^\w .:/+-]/g, "") || null : null);

/** A source when the link carries campaign tags or a Facebook click id; otherwise null (an untagged visit never overwrites a tagged one). */
export function sourceFromUrl(url: URL, now = new Date()): Source | null {
  const q = url.searchParams;
  const tagged = ["utm_source", "utm_medium", "utm_campaign", "utm_content"].some((k) => q.get(k));
  const facebook = !!q.get("fbclid");
  if (!tagged && !facebook) return null;
  return {
    source: clean(q.get("utm_source")) ?? (facebook ? "facebook" : null),
    medium: clean(q.get("utm_medium")) ?? (facebook ? "paid" : null),
    campaign: clean(q.get("utm_campaign")),
    content: clean(q.get("utm_content")),
    facebook,
    landing: url.pathname.slice(0, 80),
    at: now.toISOString(),
  };
}

export function parseSource(raw: string | undefined | null): Source | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s && typeof s === "object" && typeof s.landing === "string" ? (s as Source) : null;
  } catch { return null; }
}

/** One line for reports, such as "facebook · consumer-launch · static-a". */
export function sourceLabel(s: Source | null): string {
  if (!s) return "No campaign tag";
  return [s.source ?? "unknown", s.campaign, s.content].filter(Boolean).join(" · ");
}
