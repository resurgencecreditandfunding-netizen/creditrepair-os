/** Runs once when the server starts. Starts the hourly reminder check on the Node.js server only. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.REMINDERS_OFF === "1") return;
  const { runReminders } = await import("./lib/reminders");
  const tick = () => runReminders().then((r) => r.sent || r.failed ? console.log("[reminders]", r) : undefined).catch((e) => console.error("[reminders]", e));
  setTimeout(tick, 5 * 60_000);
  setInterval(tick, 60 * 60_000);
}
