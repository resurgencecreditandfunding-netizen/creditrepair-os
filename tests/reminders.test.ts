import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";
process.env.APP_URL = "https://leverageiq100.com";
let rem: typeof import("@/lib/reminders"), store: typeof import("@/lib/store"), db: typeof import("@/lib/db").db, sample: typeof import("@/lib/sample"), freeze: typeof import("@/lib/freeze");
const meta = { ip: "203.0.113.1", userAgent: "test" };
const DAY = 86_400_000;
// 3pm Eastern on a weekday, inside the sending window
const NOON3 = Date.parse("2026-11-18T20:00:00Z");
let id: string;
const sent: any[] = [];
beforeAll(async () => {
  rem = await import("@/lib/reminders"); store = await import("@/lib/store"); db = (await import("@/lib/db")).db; sample = await import("@/lib/sample"); freeze = await import("@/lib/freeze");
  id = store.createClient({ tenant: "default", name: "Jordan Rivers", email: "jordan@example.com", phone: "386-555-0111", address: "1 Main", city: "Daytona Beach", state: "FL", zip: "32114", dob: "1988-04-12", ssnLast4: "1234", businessStage: "operating", fundingGoal: "", smsOptIn: true });
  store.ackDisclosure(id, meta); store.signContract(id, "Jordan Rivers", meta);
});
const stub = () => vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { sent.push({ url, body: String(init.body) }); return new Response("{}"); }));
const on = () => Object.assign(process.env, { RESEND_API_KEY: "re_x", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+13865550000" });
afterEach(() => { vi.unstubAllGlobals(); sent.length = 0; for (const k of ["RESEND_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]) delete process.env[k]; });

describe("reminders", () => {
  it("only send inside legal texting hours", () => {
    expect(rem.inSendWindow(Date.parse("2026-11-18T20:00:00Z"))).toBe(true);  // 3pm ET
    expect(rem.inSendWindow(Date.parse("2026-11-18T14:00:00Z"))).toBe(false); // 9am ET = 6am PT
    expect(rem.inSendWindow(Date.parse("2026-11-19T02:00:00Z"))).toBe(false); // 9pm ET
  });
  it("wait two days in a step, then remind by email and text, then every five days, at most three times", async () => {
    on(); stub();
    expect(rem.messageFor(store.getClient(id)!)?.key).toBe("monitor");
    expect((await rem.runReminders(NOON3)).sent).toBe(0);          // first sighting
    expect((await rem.runReminders(NOON3 + 1 * DAY)).sent).toBe(0);
    expect((await rem.runReminders(NOON3 + 2 * DAY)).sent).toBe(1);
    const email = JSON.parse(sent.find((x) => x.url.endsWith("/emails")).body);
    expect(email.subject).toBe("Jordan, your next step: get your 3-bureau credit report so we can audit it");
    expect(email.text).toContain("https://leverageiq100.com/login/verify?token=");
    expect(email.text).toContain("Turn them off");
    const text = new URLSearchParams(sent.find((x) => x.url.includes("twilio")).body);
    expect(text.get("To")).toBe("+13865550111");
    expect(text.get("Body")).toContain("Reply STOP");
    expect((await rem.runReminders(NOON3 + 4 * DAY)).sent).toBe(0);
    expect((await rem.runReminders(NOON3 + 7 * DAY)).sent).toBe(1);
    expect((await rem.runReminders(NOON3 + 12 * DAY)).sent).toBe(1);
    expect((await rem.runReminders(NOON3 + 30 * DAY)).sent).toBe(0); // max reached
    expect(store.getLog(id).filter((e) => e.action === "reminder_sent")).toHaveLength(3);
  });
  it("start a fresh count when the client moves to the next step", async () => {
    on(); stub();
    store.saveReport(id, sample.sampleReport());
    expect(rem.messageFor(store.getClient(id)!)?.key).toBe("review");
    await rem.runReminders(NOON3 + 40 * DAY);
    expect((await rem.runReminders(NOON3 + 42 * DAY)).sent).toBe(1);
  });
  it("respect the client's choices", async () => {
    on(); stub();
    rem.setPrefs(id, { reminders: true, texts: false });
    freeze.markReviewed(id);
    await rem.runReminders(NOON3 + 50 * DAY);
    await rem.runReminders(NOON3 + 52 * DAY);
    expect(sent.some((x) => x.url.includes("twilio"))).toBe(false);
    expect(sent.some((x) => x.url.endsWith("/emails"))).toBe(true);
    rem.setPrefs(id, { reminders: false, texts: false });
    sent.length = 0;
    await rem.runReminders(NOON3 + 60 * DAY);
    expect(sent).toHaveLength(0);
  });
  it("do nothing without an email or text service", async () => {
    expect((await rem.runReminders(NOON3)).skipped).toBe("no email or text service");
  });
});
