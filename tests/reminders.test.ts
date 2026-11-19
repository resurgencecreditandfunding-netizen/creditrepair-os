import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";
process.env.APP_URL = "https://leverageiq100.com";
let rem: typeof import("@/lib/reminders"), store: typeof import("@/lib/store"), db: typeof import("@/lib/db").db, sample: typeof import("@/lib/sample");
let seqs: typeof import("@/lib/sequences"), unsub: typeof import("@/lib/unsubscribe"), ops: typeof import("@/lib/console");
const meta = { ip: "203.0.113.1", userAgent: "test" };
const H = 3_600_000, DAY = 24 * H;
// 3pm Eastern on a weekday, inside the sending window
const T0 = Date.parse("2026-11-18T20:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const sent: any[] = [];
const person = (tenant: string, name: string, phone = "") => ({ tenant, name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, phone, address: "1 Main", city: "Daytona Beach", state: "FL", zip: "32114", dob: "1988-04-12", ssnLast4: "1234", businessStage: "operating", fundingGoal: "", smsOptIn: !!phone });

beforeAll(async () => {
  rem = await import("@/lib/reminders"); store = await import("@/lib/store"); db = (await import("@/lib/db")).db; sample = await import("@/lib/sample");
  seqs = await import("@/lib/sequences"); unsub = await import("@/lib/unsubscribe"); ops = await import("@/lib/console");
  ops.registerCompany({ company: "Smith Tax", legalName: "Smith Tax LLC", address: "9 Oak", kind: "tax_pro", name: "Ann", email: "ann@smith.example", password: "long-password-1" });
});
const stub = () => vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { sent.push({ url, body: String(init.body) }); return new Response("{}"); }));
const on = () => Object.assign(process.env, { RESEND_API_KEY: "re_x", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+13865550000" });
afterEach(() => { vi.unstubAllGlobals(); sent.length = 0; for (const k of ["RESEND_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]) delete process.env[k]; });
const emailsTo = (to: string) => sent.filter((x) => x.url.endsWith("/emails")).map((x) => JSON.parse(x.body)).filter((e) => e.to[0] === to);
/** Only this client is checked: every other test client is paused while it runs. */
async function runFor(id: string, at: number) {
  db().prepare("UPDATE clients SET reminders_off = 1 WHERE id != ? AND reminders_off = 0").run(id);
  try { return await rem.runReminders(at); } finally { db().prepare("UPDATE clients SET reminders_off = 0 WHERE id != ? AND id NOT IN (SELECT client_id FROM audit_log WHERE action = 'reminder_emails_unsubscribed')").run(id); }
}
/** Marks the welcome as sent when they registered, so a test can focus on what comes after it. */
const welcomed = (id: string, at: number) => seqs.recordSend(id, "welcome", 0, iso(at));
const setTimes = (id: string, t: { created?: number; signed?: number }) => {
  if (t.created !== undefined) db().prepare("UPDATE clients SET created_at = ? WHERE id = ?").run(iso(t.created), id);
  if (t.signed !== undefined) db().prepare("UPDATE clients SET signed_at = ? WHERE id = ?").run(iso(t.signed), id);
};
/** Signs, reviews, freezes and drafts round 1, with every timestamp at `at`. */
function withDrafts(tenant: string, name: string, at: number) {
  const id = store.createClient(person(tenant, name));
  store.ackDisclosure(id, meta); store.signContract(id, name, meta);
  db().prepare("UPDATE clients SET signed_at = '2026-01-05T12:00:00Z', report_reviewed_at = ?, freeze_done_at = ? WHERE id = ?").run(iso(at), iso(at), id);
  store.saveReport(id, sample.sampleReport());
  store.buildRound(id);
  welcomed(id, at - DAY);
  db().prepare("UPDATE reports SET created_at = ? WHERE client_id = ?").run(iso(at - DAY), id);
  db().prepare("UPDATE letters SET created_at = ? WHERE client_id = ?").run(iso(at), id);
  return id;
}

describe("sending hours", () => {
  it("only send inside legal texting hours", () => {
    expect(rem.inSendWindow(Date.parse("2026-11-18T20:00:00Z"))).toBe(true);  // 3pm ET
    expect(rem.inSendWindow(Date.parse("2026-11-18T14:00:00Z"))).toBe(false); // 9am ET = 6am PT
    expect(rem.inSendWindow(Date.parse("2026-11-19T02:00:00Z"))).toBe(false); // 9pm ET
  });
  it("do nothing without an email or text service", async () => {
    expect((await rem.runReminders(T0)).skipped).toBe("no email or text service");
  });
});

describe("follow-up sequences", () => {
  it("follow up with people who filled in the form but didn't sign, then stop after three", async () => {
    on(); stub();
    const id = store.createClient(person("default", "Jordan Rivers", "386-555-0111"));
    setTimes(id, { created: T0 });
    welcomed(id, T0);
    expect(seqs.sequenceFor(store.getClient(id)!)?.seq.key).toBe("finish_signup");
    expect((await runFor(id, T0 + 1 * H)).sent).toBe(0);
    expect((await runFor(id, T0 + 2 * H)).sent).toBe(1);
    const [e] = emailsTo("jordan@example.com");
    expect(e.subject).toBe("Jordan, you're one click from your free audit");
    expect(e.text).toContain("https://leverageiq100.com/login/verify?token=");
    expect(e.text).toContain("&next=%2Fstart%2Fsign");
    expect(e.text).toContain("220 Sheila");
    expect(e.text).toContain("https://leverageiq100.com/reminders/off?t=");
    expect(e.reply_to).toBe("support@leverageiq100.com");
    expect(e.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(e.headers["List-Unsubscribe"]).toContain("/api/reminders-off?t=");
    expect(new URLSearchParams(sent.find((x) => x.url.includes("twilio")).body).get("Body")).toContain("Reply STOP");
    expect((await runFor(id, T0 + 3 * H)).sent).toBe(0);
    expect((await runFor(id, T0 + 24 * H)).sent).toBe(1);
    expect((await runFor(id, T0 + 72 * H)).sent).toBe(1);
    expect((await runFor(id, T0 + 30 * DAY)).sent).toBe(0);
    expect(emailsTo("jordan@example.com").map((m) => m.subject)).toEqual([
      "Jordan, you're one click from your free audit", "Your audit is ready to start", "Should we close your file?"]);
    expect(store.getLog(id).filter((x) => x.action === "reminder_sent")).toHaveLength(0);
  });

  it("switch to the next stage's emails as soon as they move forward", async () => {
    on(); stub();
    const id = store.createClient(person("default", "Casey Long"));
    setTimes(id, { created: T0 });
    welcomed(id, T0);
    await runFor(id, T0 + 2 * H);
    store.ackDisclosure(id, meta); store.signContract(id, "Casey Long", meta);
    setTimes(id, { signed: T0 + 5 * H });
    expect(seqs.sequenceFor(store.getClient(id)!)?.seq.key).toBe("get_report");
    await rem.afterSigning(id, T0 + 5 * H);                  // the trial email goes out the moment they sign
    const trial = emailsTo("casey@example.com").at(-1);
    expect(trial.subject).toBe("Casey, haven't got your credit report yet? Start a 7-day trial for $1");
    expect(trial.text).toContain("https://leverageiq100.com/go/");
    expect(trial.text).toContain("regular monthly price unless you cancel");
    expect(trial.text).toContain("https://leverageiq100.com/login and enter this email");
    expect(store.getLog(id).some((e) => e.action === "welcome_sent")).toBe(false); // replaces the plain sign-in note
    expect((await runFor(id, T0 + 26 * H)).sent).toBe(0);  // next one is 3 days after signing
    expect(seqs.sentSteps(id, "get_report")).toHaveLength(1);
    store.saveReport(id, sample.sampleReport());
    db().prepare("UPDATE reports SET created_at = ? WHERE client_id = ?").run(iso(T0 + 30 * H), id);
    expect(seqs.sequenceFor(store.getClient(id)!)?.seq.key).toBe("review_freeze");
    expect((await runFor(id, T0 + 51 * H)).sent).toBe(1);
    expect(emailsTo("casey@example.com").at(-1).subject).toMatch(/^We found \d+ possible errors on your reports$/);
  });

  it("pace people who are already behind: first email first, then at least 20 hours apart", async () => {
    on(); stub();
    const id = store.createClient(person("default", "Riley Park"));
    setTimes(id, { created: T0 - 10 * DAY });
    expect(await runFor(id, T0)).toMatchObject({ sent: 1, failed: 0 });        // the welcome, late
    expect((await runFor(id, T0 + 4 * H)).sent).toBe(0);                        // not two emails in one afternoon
    expect((await runFor(id, T0 + 21 * H)).sent).toBe(1);                       // noon the next day: follow-up 1
    expect((await runFor(id, T0 + 25 * H)).sent).toBe(0);                       // 4pm: overdue, but too soon after the last
    expect((await runFor(id, T0 + 45 * H)).sent).toBe(1);
    expect(emailsTo("riley@example.com").map((m) => m.subject)).toEqual(["Welcome, Riley. Here's where this is going", "Riley, you're one click from your free audit", "Your audit is ready to start"]);
  });

  it("send the $37 letter emails to direct customers only", async () => {
    on(); stub();
    const direct = withDrafts("default", "Morgan Direct", T0);
    db().prepare("UPDATE clients SET price_cents = 3700, paid_at = NULL WHERE id = ?").run(direct);
    expect(seqs.sequenceFor(store.getClient(direct)!)?.seq.key).toBe("unlock_letters");
    expect((await runFor(direct, T0 + 3 * H)).sent).toBe(1);
    expect(emailsTo("morgan@example.com")[0].subject).toMatch(/^Your \d+ dispute letters? (is|are) ready$/);
    db().prepare("UPDATE clients SET paid_at = ? WHERE id = ?").run(iso(T0 + 4 * H), direct);
    expect(seqs.sequenceFor(store.getClient(direct)!)).toBeNull();

    const viaOperator = withDrafts("smith-tax", "Avery Operator", T0);
    expect(seqs.sequenceFor(store.getClient(viaOperator)!)).toBeNull();
    expect(rem.messageFor(store.getClient(viaOperator)!)?.key).toBe("approve");
  });

  it("let anyone stop the emails from a signed link, without signing in", async () => {
    on(); stub();
    const id = store.createClient(person("default", "Quinn Stop"));
    setTimes(id, { created: T0 });
    const t = unsub.unsubscribeToken(id);
    expect(unsub.clientFromToken(t)).toBe(id);
    expect(unsub.clientFromToken(`${id}.${"x".repeat(32)}`)).toBeNull();
    expect(unsub.clientFromToken("nonsense")).toBeNull();
    expect(unsub.turnOff(id)).toBe(true);
    expect((await rem.runReminders(T0 + 2 * H)).sent).toBeGreaterThanOrEqual(0);
    expect(emailsTo("quinn@example.com")).toHaveLength(0);
  });

  it("welcome everyone the moment they register, with the whole road and no ask", async () => {
    on(); stub();
    const id = store.createClient(person("default", "Sky Welcome", "386-555-0199"));
    expect(seqs.sequenceFor(store.getClient(id)!)?.seq.key).toBe("finish_signup");
    expect(await rem.sendWelcome(id, T0)).toBe(true);
    expect(await rem.sendWelcome(id, T0)).toBe(false); // only once
    const [w] = emailsTo("sky@example.com");
    expect(w.subject).toBe("Welcome, Sky. Here's where this is going");
    expect(w.text).toContain("HOW YOU GET THERE");
    expect(w.text).toContain("one payment of $37");
    expect(w.text).toContain("&next=%2Fstart%2Fsign");
    expect(w.text).toContain("/reminders/off?t=");
    expect(w.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent.some((x) => x.url.includes("twilio"))).toBe(false); // email only
    setTimes(id, { created: T0 });
    expect((await runFor(id, T0 + 1 * H)).sent).toBe(0);
    expect((await runFor(id, T0 + 2 * H)).sent).toBe(1); // first follow-up 2 hours after an on-time welcome

    const op = store.createClient(person("smith-tax", "Lee Operator"));
    expect(await rem.sendWelcome(op, T0)).toBe(true);
    const ow = emailsTo("lee@example.com")[0];
    expect(ow.from).toContain("Smith Tax");
    expect(ow.text).not.toContain("$37");
  });

  it("send people who sign with a report already the short sign-in note instead", async () => {
    on(); stub();
    const id = store.createClient(person("default", "Pat Ready"));
    store.ackDisclosure(id, meta); store.signContract(id, "Pat Ready", meta);
    store.saveReport(id, sample.sampleReport());
    await rem.afterSigning(id, T0);
    expect(emailsTo("pat@example.com")[0].subject).toBe("You're signed up with Leverage IQ: how to get back in");
  });

  it("render every email with sample values", () => {
    for (const x of [seqs.SAMPLE_CTX, { ...seqs.SAMPLE_CTX, signed: true, hasReport: true, isDirect: false }]) {
      const w = seqs.WELCOME(x);
      expect(w.body).not.toMatch(/undefined|NaN|\[object/);
      expect(w.body).toContain(x.signed ? "(done)" : "/start/sign");
    }
    for (const q of seqs.SEQUENCES) for (const st of q.steps) {
      const m = st.write(seqs.SAMPLE_CTX);
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.body).not.toMatch(/undefined|NaN|\[object/);
      expect(m.body).toContain("https://leverageiq100.com/");
    }
  });
});

describe("generic reminders after the follow-up stages", () => {
  it("wait two days in a step, then remind, then every five days, at most three times", async () => {
    on(); stub();
    const id = withDrafts("smith-tax", "Jamie Approve", T0);
    expect(rem.messageFor(store.getClient(id)!)?.key).toBe("approve");
    expect((await runFor(id, T0)).sent).toBe(0);          // first sighting
    expect((await runFor(id, T0 + 1 * DAY)).sent).toBe(0);
    expect((await runFor(id, T0 + 2 * DAY)).sent).toBe(1);
    const email = emailsTo("jamie@example.com")[0];
    expect(email.subject).toMatch(/^Jamie, your next step: read and approve your \d+ dispute letters?$/);
    expect(email.text).toContain("https://leverageiq100.com/login/verify?token=");
    expect(email.text).toContain("/reminders/off?t=");
    expect((await runFor(id, T0 + 4 * DAY)).sent).toBe(0);
    expect((await runFor(id, T0 + 7 * DAY)).sent).toBe(1);
    expect((await runFor(id, T0 + 12 * DAY)).sent).toBe(1);
    expect((await runFor(id, T0 + 30 * DAY)).sent).toBe(0); // max reached
    expect(store.getLog(id).filter((e) => e.action === "reminder_sent")).toHaveLength(3);
  });
  it("respect the client's choices", async () => {
    on(); stub();
    const id = withDrafts("smith-tax", "Drew Prefs", T0);
    rem.setPrefs(id, { reminders: false, texts: false });
    await runFor(id, T0); await runFor(id, T0 + 3 * DAY);
    expect(emailsTo("drew@example.com")).toHaveLength(0);
  });
});
