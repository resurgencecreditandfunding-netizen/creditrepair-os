import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";
process.env.APP_URL = "https://leverageiq100.com";
let notify: typeof import("@/lib/notify"), freeze: typeof import("@/lib/freeze"), store: typeof import("@/lib/store");
let ops: typeof import("@/lib/console"), journey: typeof import("@/lib/journey"), sample: typeof import("@/lib/sample"), db: typeof import("@/lib/db").db;
const meta = { ip: "203.0.113.1", userAgent: "test" };
const person = (tenant: string, name: string) => ({ tenant, name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, phone: "386-555-0100", address: "1 Main St", city: "Daytona Beach", state: "FL", zip: "32114", dob: "1988-04-12", ssnLast4: "1234", businessStage: "operating", fundingGoal: "$25,000 to $100,000" });
let smith: string, direct: string, viaSmith: string;

beforeAll(async () => {
  notify = await import("@/lib/notify"); freeze = await import("@/lib/freeze"); store = await import("@/lib/store");
  ops = await import("@/lib/console"); journey = await import("@/lib/journey"); sample = await import("@/lib/sample"); db = (await import("@/lib/db")).db;
  smith = ops.registerCompany({ company: "Smith Tax", legalName: "Smith Tax LLC", address: "9 Oak", kind: "tax_pro", name: "Ann", email: "ann@smith.example", password: "long-password-1" }).tenantId;
  direct = store.createClient(person("default", "Dana Cole"));
  viaSmith = store.createClient(person("smith-tax", "Jordan Rivers"));
});
afterEach(() => { vi.unstubAllGlobals(); for (const k of ["RESEND_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]) delete process.env[k]; });

describe("alert settings", () => {
  it("normalizes US mobile numbers and rejects bad input", () => {
    expect(notify.normalizePhone("(386) 555-0123")).toBe("+13865550123");
    expect(notify.normalizePhone("1-386-555-0123")).toBe("+13865550123");
    expect(notify.normalizePhone("555-0123")).toBeNull();
    expect(notify.normalizePhone("(086) 555-0123")).toBeNull();
    expect(() => notify.setAlertSettings("tenant_default", { email: "nope", phone: "" })).toThrow(/valid email/);
    expect(() => notify.setAlertSettings("tenant_default", { email: "", phone: "12345" })).toThrow(/10-digit/);
  });
  it("sends the owner every company's sign-ups, or only direct ones", () => {
    notify.setAlertSettings("tenant_default", { email: "owner@example.com", phone: "386 555 0199", all: true });
    expect(notify.recipientsForClient(store.getClient(viaSmith)!).map((r) => r.who)).toEqual(["owner"]);
    notify.setAlertSettings(smith, { email: "ann@smith.example", phone: "" });
    expect(notify.recipientsForClient(store.getClient(viaSmith)!).map((r) => r.who)).toEqual(["company", "owner"]);
    notify.setAlertSettings("tenant_default", { email: "owner@example.com", phone: "386 555 0199", all: false });
    expect(notify.recipientsForClient(store.getClient(viaSmith)!).map((r) => r.who)).toEqual(["company"]);
    expect(notify.recipientsForClient(store.getClient(direct)!).map((r) => r.who)).toEqual(["owner"]);
    notify.setAlertSettings("tenant_default", { email: "owner@example.com", phone: "386 555 0199", all: true });
  });
});

describe("sending alerts", () => {
  it("emails and texts the right people when a client signs, and logs it", async () => {
    Object.assign(process.env, { RESEND_API_KEY: "re_x", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+13865550000" });
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response("{}", { status: 200 }); }));
    await notify.clientSigned(viaSmith);
    const emails = calls.filter((c) => c.url.endsWith("/emails")).map((c) => JSON.parse(String(c.init.body)));
    expect(emails.map((e) => e.to[0]).sort()).toEqual(["ann@smith.example", "owner@example.com"]);
    expect(emails[0].subject).toBe("New sign-up: Jordan Rivers (Smith Tax)");
    expect(emails[0].text).toContain("https://leverageiq100.com/console/clients/");
    expect(emails[0].text).not.toContain("1234"); // never the SSN digits
    const texts = calls.filter((c) => c.url.includes("api.twilio.com"));
    expect(texts).toHaveLength(1);
    expect(new URLSearchParams(String(texts[0].init.body)).get("To")).toBe("+13865550199");
    expect(store.getLog(viaSmith).filter((e) => e.action === "alert_sent")).toHaveLength(3);
  });
  it("never throws when a provider fails, and records the failure", async () => {
    process.env.RESEND_API_KEY = "re_x";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("domain not verified", { status: 403 })));
    await expect(notify.clientSigned(direct)).resolves.toBeUndefined();
    expect(store.getLog(direct).some((e) => e.action === "alert_failed" && e.detail.includes("403"))).toBe(true);
  });
  it("does nothing when no service is configured", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    await notify.clientSigned(direct);
    expect(f).not.toHaveBeenCalled();
    await expect(notify.sendTestAlert("tenant_default")).rejects.toThrow(/not switched on/);
  });
});

describe("freeze step and letter gate", () => {
  it("blocks letters until the report is reviewed and every bureau is addressed", () => {
    store.ackDisclosure(direct, meta); store.signContract(direct, "Dana Cole", meta);
    db().prepare("UPDATE clients SET price_cents = 0, signed_at = '2026-01-05T12:00:00Z' WHERE id = ?").run(direct);
    expect(() => freeze.markReviewed(direct)).toThrow(/Upload/);
    store.saveReport(direct, sample.sampleReport());
    expect(() => store.buildRound(direct)).toThrow(/Review your credit report/);
    freeze.markReviewed(direct);
    expect(() => store.buildRound(direct)).toThrow(/freeze step/);
    const list = freeze.listFreezeBureaus();
    expect(list.map((b) => b.name)).toContain("LexisNexis (includes SageStream)");
    list.slice(0, -1).forEach((b) => freeze.setFreeze(direct, b.id, "frozen", "PIN-1"));
    expect(store.getClient(direct)!.freeze_done_at).toBeNull();
    freeze.setFreeze(direct, list.at(-1)!.id, "skipped", "");
    const c = store.getClient(direct)!;
    expect(c.freeze_done_at).not.toBeNull();
    expect(freeze.freezeProgress(c)).toMatchObject({ total: list.length, addressed: list.length, frozen: list.length - 1, complete: true });
    expect(() => freeze.clearFreeze(direct, list[0].id)).toThrow(/already complete/);
    expect(store.buildRound(direct)).toBe(3);
  });
  it("lets only the owner edit the bureau list, with https links", () => {
    const owner = { id: "x", tenant_id: "tenant_default", email: "o@x", name: "O", role: "platform" as const };
    const staff = { ...owner, role: "admin" as const };
    expect(() => freeze.addFreezeBureau(staff, { name: "X", url: "https://x.example", note: "" })).toThrow(/platform owner/);
    expect(() => freeze.addFreezeBureau(owner, { name: "X", url: "http://x.example", note: "" })).toThrow(/https/);
    const before = freeze.listFreezeBureaus().length;
    freeze.addFreezeBureau(owner, { name: "MicroBilt", url: "https://www.microbilt.com", note: "" });
    expect(freeze.listFreezeBureaus().map((b) => b.name).at(-1)).toBe("MicroBilt");
    freeze.removeFreezeBureau(owner, freeze.listFreezeBureaus().at(-1)!.id);
    expect(freeze.listFreezeBureaus()).toHaveLength(before);
  });
});

describe("journey map", () => {
  const statuses = (id: string) => Object.fromEntries(journey.journey(store.getClient(id)!).steps.map((s) => [s.key, s.status]));
  it("marks a new client's current, next and remaining steps", () => {
    const j = journey.journey(store.getClient(viaSmith)!);
    expect(j.total).toBe(13);
    expect(statuses(viaSmith)).toMatchObject({ account: "done", sign: "current", monitor: "next", upload: "upcoming", fund: "upcoming" });
  });
  it("moves forward as the client works through the steps", () => {
    const s = statuses(direct);
    expect(s).toMatchObject({ account: "done", sign: "done", monitor: "done", upload: "done", review: "done", freeze: "done", wait: "done", approve: "current", mail: "next", responses: "upcoming" });
    const j = journey.journey(store.getClient(direct)!);
    expect(j.finished).toBe(7);
    expect(j.current?.detail).toMatch(/3 letters waiting/);
  });
});
