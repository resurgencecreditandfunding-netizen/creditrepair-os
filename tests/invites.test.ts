import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";
process.env.APP_URL = "https://leverageiq100.com";
let inv: typeof import("@/lib/invites"), ops: typeof import("@/lib/console"), store: typeof import("@/lib/store");
let smith: string;
beforeAll(async () => {
  inv = await import("@/lib/invites"); ops = await import("@/lib/console"); store = await import("@/lib/store");
  smith = ops.registerCompany({ company: "Smith Tax", legalName: "Smith Tax LLC", address: "9 Oak Ave, Dayton, OH", kind: "tax_pro", name: "Ann", email: "ann@smith.example", password: "long-password-1" }).tenantId;
  store.createClient({ tenant: "smith-tax", name: "Existing Client", email: "existing@example.com", phone: "", address: "1", city: "C", state: "OH", zip: "45402", dob: "1980-01-01", ssnLast4: "1111", businessStage: "none", fundingGoal: "" });
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.RESEND_API_KEY; });

describe("invite lists", () => {
  it("read pasted lines and CSV exports, skipping headers and lines without an email", () => {
    const { rows, bad } = inv.parseList(`Name,Email,Phone\n"Jordan Rivers","JORDAN@example.com","(386) 555-0111"\nDana Cole\tdana@example.com\nno email here\n\nlee@example.com`);
    expect(rows).toEqual([
      { name: "Jordan Rivers", email: "jordan@example.com", phone: "(386) 555-0111" },
      { name: "Dana Cole", email: "dana@example.com", phone: "" },
      { name: "", email: "lee@example.com", phone: "" },
    ]);
    expect(bad).toEqual(["no email here"]);
  });
  it("skip duplicates and existing clients", () => {
    const r = inv.createInvites(smith, [
      { name: "Jordan", email: "jordan@example.com", phone: "" }, { name: "Jordan again", email: "jordan@example.com", phone: "" },
      { name: "Existing", email: "existing@example.com", phone: "" }, { name: "Dana", email: "dana@example.com", phone: "" },
    ], "ann@smith.example");
    expect(r).toMatchObject({ created: 2, skipped: { duplicate: 1, alreadyClient: 1, optedOut: 0 } });
    expect(inv.createInvites(smith, [{ name: "J", email: "jordan@example.com", phone: "" }], "ann").created).toBe(0);
  });
  it("send a lawful email from the company, and record failures", async () => {
    process.env.RESEND_API_KEY = "re_x";
    const sent: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      if (b.to[0] === "dana@example.com") return new Response("bad address", { status: 422 });
      sent.push(b); return new Response("{}");
    }));
    const ids = inv.invitesFor(smith).rows.map((r) => r.id);
    expect(await inv.sendInvites(ids, async () => {})).toEqual({ sent: 1, failed: 1 });
    expect(sent[0].from).toMatch(/^Smith Tax </);
    expect(sent[0].subject).toBe("Jordan, a free credit review from Smith Tax");
    expect(sent[0].text).toContain("9 Oak Ave, Dayton, OH");
    expect(sent[0].text).toMatch(/https:\/\/leverageiq100\.com\/unsubscribe\?i=/);
    expect(sent[0].text).toMatch(/https:\/\/leverageiq100\.com\/start\?i=/);
    expect(sent[0].text).toContain("no result is guaranteed");
    expect(inv.invitesFor(smith).totals).toMatchObject({ sent: 1, failed: 1 });
  });
  it("track opens and joins, and honour unsubscribes everywhere", async () => {
    const jordan = inv.invitesFor(smith).rows.find((r) => r.email === "jordan@example.com")!;
    inv.markOpened(jordan.token);
    const id = store.createClient({ tenant: "smith-tax", name: "Jordan", email: "jordan@example.com", phone: "", address: "1", city: "C", state: "OH", zip: "45402", dob: "1980-01-01", ssnLast4: "2222", businessStage: "none", fundingGoal: "" });
    inv.markJoined(jordan.token, id);
    expect(inv.invitesFor(smith).totals).toMatchObject({ opened: 1, joined: 1 });
    const dana = inv.invitesFor(smith).rows.find((r) => r.email === "dana@example.com")!;
    expect(inv.optOut(dana.token)).toBe(true);
    expect(inv.optOut("nope")).toBe(false);
    expect(inv.createInvites("tenant_default", [{ name: "D", email: "dana@example.com", phone: "" }], "owner").skipped.optedOut).toBe(1);
  });
});
