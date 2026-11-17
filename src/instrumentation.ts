/** Runs once when the server starts. The reminder schedule lives in a Node.js-only file, so the edge build never sees it. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startReminders } = await import("./instrumentation-node");
    startReminders();
  }
}
