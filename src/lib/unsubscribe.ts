import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { site } from "./notify";
import { log } from "./store";

/** Follow-up emails carry a link that turns them off without signing in, as the email laws require. */
const secret = () => `unsub:${process.env.SESSION_SECRET ?? "dev-only-secret"}`;
const sign = (id: string) => createHmac("sha256", secret()).update(id).digest("base64url").slice(0, 32);
export const unsubscribeToken = (clientId: string) => `${clientId}.${sign(clientId)}`;
export const unsubscribeUrl = (clientId: string) => `${site()}/reminders/off?t=${encodeURIComponent(unsubscribeToken(clientId))}`;
export const oneClickUrl = (clientId: string) => `${site()}/api/reminders-off?t=${encodeURIComponent(unsubscribeToken(clientId))}`;

export function clientFromToken(t: string): string | null {
  const [id, mac] = (t ?? "").split(".");
  if (!id || !mac) return null;
  const good = sign(id);
  return mac.length === good.length && timingSafeEqual(Buffer.from(mac), Buffer.from(good)) ? id : null;
}
export function turnOff(clientId: string) {
  const r = db().prepare("UPDATE clients SET reminders_off = 1 WHERE id = ?").run(clientId);
  if (r.changes) log(clientId, "consumer", "reminder_emails_unsubscribed");
  return r.changes > 0;
}
