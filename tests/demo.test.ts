import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";
let demo: typeof import("@/lib/demo"), ops: typeof import("@/lib/console"), db: typeof import("@/lib/db").db;
beforeAll(async () => { demo = await import("@/lib/demo"); ops = await import("@/lib/console"); db = (await import("@/lib/db")).db; });

describe("operator demo funnel", () => {
  it("saves an opt-in and checks what it needs", () => {
    expect(() => demo.saveLead({ name: "", email: "a@b.co", phone: "", kind: "tax_pro", source: null, match: {} })).toThrow(/name/);
    expect(() => demo.saveLead({ name: "Ann", email: "nope", phone: "", kind: "tax_pro", source: null, match: {} })).toThrow(/email/);
    expect(() => demo.saveLead({ name: "Ann", email: "ann@tax.example", phone: "12", kind: "tax_pro", source: null, match: {} })).toThrow(/mobile/);
    const id = demo.saveLead({ name: " Ann Lee ", email: "Ann@Tax.example", phone: "386-555-0101", kind: "weird", source: "fb", match: { fbp: "fb.1" } });
    expect(demo.getLead(id)).toMatchObject({ name: "Ann Lee", email: "ann@tax.example", phone: "+13865550101", kind: "tax_pro" });
  });
  it("counts who reached the offer, signed up and paid", () => {
    const id = demo.saveLead({ name: "Bo", email: "bo@tax.example", phone: "", kind: "tax_pro", source: null, match: {} });
    demo.markOfferSeen(id);
    const t = ops.registerCompany({ company: "Bo Tax", legalName: "Bo Tax LLC", address: "1 Main", kind: "tax_pro", name: "Bo", email: "bo@tax.example", password: "long-password-1", plan: "season12" }).tenantId;
    demo.linkLead(id, t);
    expect(demo.demoStats()).toMatchObject({ optIns: 2, sawOffer: 1, signedUp: 1, paid: 0 });
    db().prepare("UPDATE tenants SET sub_status = 'trialing' WHERE id = ?").run(t);
    expect(demo.demoStats().paid).toBe(1);
  });
  it("reveal point defaults to 75% and ignores bad settings", () => {
    expect(demo.revealAt()).toBe(0.75);
    process.env.VSL_REVEAL_AT = "0.8"; expect(demo.revealAt()).toBe(0.8);
    process.env.VSL_REVEAL_AT = "80"; expect(demo.revealAt()).toBe(0.75);
    delete process.env.VSL_REVEAL_AT;
  });
});
