import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { goodStanding } from "./billing";
import { getOperator, Operator } from "./console";
import { getTenant } from "./store";

const COOKIE = "cfo_operator";
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "1") throw new Error("SESSION_SECRET is required in production.");
  return `op:${s ?? "dev-only-secret"}`;
};
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("hex");
const HOURS = 12;

export async function startOpSession(id: string) {
  const exp = Date.now() + HOURS * 3600_000;
  (await cookies()).set(COOKIE, `${id}.${exp}.${sign(`${id}.${exp}`)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/console", maxAge: HOURS * 3600,
  });
}
export async function endOpSession() { (await cookies()).set(COOKIE, "", { path: "/console", maxAge: 0 }); }

export async function currentOperator(): Promise<Operator | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, exp, mac] = raw.split(".");
  const good = sign(`${id}.${exp}`);
  if (!mac || mac.length !== good.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  if (Number(exp) < Date.now()) return null;
  return getOperator(id);
}
/** Staff of a company without a live subscription are sent to the billing page. */
export async function requireOperator(opts: { allowUnpaid?: boolean } = {}): Promise<Operator> {
  const op = await currentOperator();
  if (!op) redirect("/console/login");
  if (!opts.allowUnpaid && op.role !== "platform" && !goodStanding(getTenant(op.tenant_id))) redirect("/console/billing");
  return op;
}
