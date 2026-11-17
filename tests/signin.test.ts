import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";
process.env.APP_URL = "https://leverageiq100.com";
let signin: typeof import("@/lib/signin"), store: typeof import("@/lib/store"), ops: typeof import("@/lib/console"), db: typeof import("@/lib/db").db;
const person = (tenant: string, name: string, phone = "") => ({ tenant, name, email: "jordan@example.com", phone, address: "1 Main St", city: "Daytona Beach", state: "FL", zip: "32114", dob: "1988-04-12", ssnLast4: "1234", businessStage: "operating", fundingGoal: "" });
let a: string, b: string;
beforeAll(async () => {
  signin = await import("@/lib/signin"); store = await import("@/lib/store"); ops = await import("@/lib/console"); db = (await import("@/lib/db")).db;
  ops.registerCompany({ company: "Smith Tax", legalName: "Smith Tax LLC", address: "9 Oak", kind: "tax_pro", name: "Ann", email: "ann@smith.example", password: "long-password-1" });
  a = store.createClient(person("default", "Jordan Rivers", "(386) 555-0111"));
  b = store.createClient(person("smith-tax", "Jordan Rivers"));
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.RESEND_API_KEY; });

describe("sign-in links", () => {
  it("work once and only before they expire", () => {
    const t = signin.createToken(a);
    expect(signin.redeemToken(t)).toBe(a);
    expect(signin.redeemToken(t)).toBeNull();
    expect(signin.redeemToken("made-up")).toBeNull();
    const old = signin.createToken(a, -1);
    expect(signin.redeemToken(old)).toBeNull();
    expect(store.getLog(a).filter((e) => e.action === "signed_in")).toHaveLength(1);
  });
  it("store only a hash of the token", () => {
    const t = signin.createToken(a);
    expect(JSON.stringify(db().prepare("SELECT * FROM login_tokens").all())).not.toContain(t);
  });
  it("find every account for an email, and match phone numbers however they were typed", () => {
    expect(signin.findAccounts("JORDAN@example.com ").map((x) => x.id).sort()).toEqual([a, b].sort());
    expect(signin.findAccounts("386.555.0111").map((x) => x.id)).toEqual([a]);
    expect(signin.findAccounts("nobody@example.com")).toEqual([]);
  });
  it("email one message listing each account, from the company's name", async () => {
    process.env.RESEND_API_KEY = "re_x";
    const sent: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return new Response("{}"); }));
    await signin.sendSignInLinks("jordan@example.com");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["jordan@example.com"]);
    expect(sent[0].text).toContain("Smith Tax: https://leverageiq100.com/login/verify?token=");
    expect(sent[0].from).toMatch(/<alerts@leverageiq100\.com>$/);
    await signin.sendSignInLinks("stranger@example.com");
    expect(sent).toHaveLength(1);
  });
});
