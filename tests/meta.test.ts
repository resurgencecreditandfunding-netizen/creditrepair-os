import { createHash } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";
process.env.APP_URL = "https://leverageiq100.com";
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
let meta: typeof import("@/lib/meta"), store: typeof import("@/lib/store"), ops: typeof import("@/lib/console"), pw: typeof import("@/lib/paywall");
const person = (tenant: string, name: string) => ({ tenant, name, email: `  ${name.split(" ")[0]}@Example.com `, phone: "(386) 555-0111", address: "1 Main", city: "Daytona Beach", state: "FL", zip: "32114-1234", dob: "1988-04-12", ssnLast4: "1234", businessStage: "operating", fundingGoal: "" });
const calls: { url: string; body: any }[] = [];
const on = () => Object.assign(process.env, { META_PIXEL_ID: "123456789012345", META_CAPI_TOKEN: "EAAtoken" });

beforeAll(async () => {
  meta = await import("@/lib/meta"); store = await import("@/lib/store"); ops = await import("@/lib/console"); pw = await import("@/lib/paywall");
});
afterEach(() => { vi.unstubAllGlobals(); calls.length = 0; for (const k of ["META_PIXEL_ID", "META_CAPI_TOKEN", "META_TEST_EVENT_CODE"]) delete process.env[k]; });
const stub = (status = 200) => vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, body: JSON.parse(String(init.body)) }); return new Response('{"events_received":1}', { status }); }));

describe("match keys", () => {
  it("are normalized and hashed the way Meta requires", () => {
    const ud = meta.userData({ email: "  Jordan@Example.com ", phone: "(386) 555-0111", name: "Jordan A. Rivers", city: "Daytona Beach", state: "FL", zip: "32114-1234", externalId: "c1" }, { fbp: "fb.1.1.2", fbc: "fb.1.3.abc", ip: "203.0.113.9", ua: "Mozilla" });
    expect(ud).toEqual({
      em: [sha("jordan@example.com")], ph: [sha("13865550111")], fn: [sha("jordan")], ln: [sha("rivers")],
      ct: [sha("daytonabeach")], st: [sha("fl")], zp: [sha("32114")], country: [sha("us")], external_id: [sha("c1")],
      client_ip_address: "203.0.113.9", client_user_agent: "Mozilla", fbp: "fb.1.1.2", fbc: "fb.1.3.abc",
    });
  });
  it("leave out what is missing instead of sending blanks", () => {
    expect(Object.keys(meta.userData({ externalId: "t1" }, {}))).toEqual(["country", "external_id"]);
  });
});

describe("events", () => {
  it("send nothing until the pixel and token are set", async () => {
    stub();
    const id = store.createClient(person("default", "Dana Cole"));
    expect(await meta.consumerEvent(id, "Lead")).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it("send a consumer sign-up with a stable event id, no report data, and the test code when set", async () => {
    on(); process.env.META_TEST_EVENT_CODE = "TEST123"; stub();
    const id = store.createClient(person("default", "Jordan Rivers"));
    meta.saveMatch("clients", id, { fbp: "fb.1.1.2", fbc: "fb.1.3.abc", ip: "203.0.113.9", ua: "Mozilla" });
    expect(await meta.consumerEvent(id, "Lead")).toBe(true);
    expect(calls[0].url).toBe("https://graph.facebook.com/v26.0/123456789012345/events?access_token=EAAtoken");
    const e = calls[0].body.data[0];
    expect(e).toMatchObject({ event_name: "Lead", event_id: `Lead-${id}`, action_source: "website", event_source_url: "https://leverageiq100.com/", custom_data: { content_category: "consumer" } });
    expect(e.user_data.fbc).toBe("fb.1.3.abc");
    expect(calls[0].body.test_event_code).toBe("TEST123");
    expect(JSON.stringify(calls[0].body)).not.toMatch(/Jordan|Example|Daytona|1234|report|dispute/i);
  });
  it("send the $37 purchase once with its value, whichever path confirms it first", async () => {
    on(); stub();
    const id = store.createClient(person("default", "Pat Payer"));
    pw.markPaid(id, "pi_1", 3700);
    await new Promise((r) => setTimeout(r, 20));
    pw.markPaid(id, "pi_1", 3700); // second confirmation changes nothing and sends nothing
    await new Promise((r) => setTimeout(r, 20));
    const purchases = calls.filter((c) => c.body.data[0].event_name === "Purchase");
    expect(purchases).toHaveLength(1);
    expect(purchases[0].body.data[0]).toMatchObject({ event_id: `Purchase-${id}`, custom_data: { value: 37, currency: "USD", content_category: "consumer" } });
  });
  it("never send an operator's clients, and never anyone who asked not to be tracked", async () => {
    on(); stub();
    ops.registerCompany({ company: "Smith Tax", legalName: "Smith Tax LLC", address: "9 Oak", kind: "tax_pro", name: "Ann Smith", email: "ann@smith.example", password: "long-password-1" });
    const theirs = store.createClient(person("smith-tax", "Opal Client"));
    expect(await meta.consumerEvent(theirs, "Lead")).toBe(false);
    const gpc = store.createClient(person("default", "Gina Private"));
    meta.saveMatch("clients", gpc, { gpc: true });
    expect(await meta.consumerEvent(gpc, "Lead")).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it("send operator events about the company's admin, to the operator page", async () => {
    on(); stub();
    const t = store.getTenant("smith-tax").id;
    expect(await meta.operatorEvent(t, "Subscribe", 147)).toBe(true);
    expect(calls[0].body.data[0]).toMatchObject({ event_name: "Subscribe", event_id: `Subscribe-${t}`, event_source_url: "https://leverageiq100.com/partners", custom_data: { value: 147, currency: "USD", content_category: "operator" } });
    expect(calls[0].body.data[0].user_data.em).toEqual([sha("ann@smith.example")]);
    expect(await meta.operatorEvent("tenant_default", "Subscribe", 147)).toBe(false);
  });
  it("never break anything when Meta rejects an event, and show the error to the owner", async () => {
    on(); stub(400);
    const id = store.createClient(person("default", "Err Case"));
    await expect(meta.consumerEvent(id, "Lead")).resolves.toBe(false);
    const ev = meta.recentEvents();
    expect(ev.byEvent.find((x) => x.event === "Lead")!.failed).toBeGreaterThan(0);
    expect(ev.lastError).toMatch(/^400/);
  });
});
