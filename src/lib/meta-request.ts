import { cookies, headers } from "next/headers";
import { parseSource, SOURCE_COOKIE } from "./attribution";
import type { Match } from "./meta";

/** Set by the "Your privacy choices" page; treated the same as Global Privacy Control. */
export const OPTOUT_COOKIE = "liq_optout";

/** Match keys for the person making this request: Meta's own cookies, the ad click id, IP address and browser. */
export async function currentMatch(): Promise<Match> {
  const c = await cookies(), h = await headers();
  return {
    fbp: c.get("_fbp")?.value ?? null,
    fbc: c.get("_fbc")?.value ?? parseSource(c.get(SOURCE_COOKIE)?.value)?.fbc ?? null,
    ip: h.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
    ua: h.get("user-agent"),
    gpc: h.get("sec-gpc") === "1" || c.get(OPTOUT_COOKIE)?.value === "1",
  };
}
