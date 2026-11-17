import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getClient } from "./store";

const COOKIE = "cfo_session";
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "1") throw new Error("SESSION_SECRET is required in production.");
  return s ?? "dev-only-secret";
};
const sign = (id: string) => createHmac("sha256", secret()).update(id).digest("hex");

export async function startSession(clientId: string) {
  (await cookies()).set(COOKIE, `${clientId}.${sign(clientId)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
}
export async function endSession() { (await cookies()).delete(COOKIE); }

export async function currentClient() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, mac] = raw.split(".");
  const good = sign(id ?? "");
  if (!mac || mac.length !== good.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  return getClient(id) ?? null;
}
/** Sends the visitor to whichever onboarding step they still owe. */
export async function requireClient() {
  const c = await currentClient();
  if (!c) redirect("/login");
  if (!c.disclosure_ack_at) redirect("/start/disclosure");
  if (!c.signed_at) redirect("/start/sign");
  return c;
}
export async function requestMeta() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown", userAgent: h.get("user-agent") ?? "unknown" };
}
