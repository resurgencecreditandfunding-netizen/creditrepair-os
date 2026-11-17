import { runReminders } from "./lib/reminders";

/** Hourly client-reminder check. REMINDERS_OFF=1 disables it. */
export function startReminders() {
  if (process.env.REMINDERS_OFF === "1") return;
  const tick = () => runReminders().then((r) => (r.sent || r.failed ? console.log("[reminders]", r) : undefined)).catch((e) => console.error("[reminders]", e));
  console.log("[reminders] scheduled: first check in 5 minutes, then hourly");
  setTimeout(tick, 5 * 60_000);
  setInterval(tick, 60 * 60_000);
}
