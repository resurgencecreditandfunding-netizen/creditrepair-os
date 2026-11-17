import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";
process.env.ADMIN_EMAIL = "owner@example.com";
process.env.ADMIN_PASSWORD = "correct-horse-battery";
let fd: typeof import("@/lib/funding-deals"), ops: typeof import("@/lib/console"), store: typeof import("@/lib/store"), docs: typeof import("@/lib/documents");
type Op = import("@/lib/console").Operator;
let owner: Op, ann: Op, bo: Op, smith: string, jordan: string, dana: string;
const person = (tenant: string, name: string) => ({ tenant, name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, phone: "", address: "1 Main", city: "Daytona Beach", state: "FL", zip: "32114", dob: "1988-04-12", ssnLast4: "1234", businessStage: "operating", fundingGoal: "$25,000 to $100,000" });
beforeAll(async () => {
  fd = await import("@/lib/funding-deals"); ops = await import("@/lib/console"); store = await import("@/lib/store"); docs = await import("@/lib/documents");
  owner = ops.verifyOperator("owner@example.com", "correct-horse-battery")!;
  const a = ops.registerCompany({ company: "Smith Tax", legalName: "Smith Tax LLC", address: "9 Oak", kind: "tax_pro", name: "Ann", email: "ann@smith.example", password: "long-password-1" });
  smith = a.tenantId; ann = ops.getOperator(a.operatorId)!;
  bo = ops.getOperator(ops.registerCompany({ company: "Apex", legalName: "Apex LLC", address: "2 Elm", kind: "credit_repair", name: "Bo", email: "bo@apex.example", password: "long-password-1" }).operatorId)!;
  jordan = store.createClient(person("smith-tax", "Jordan Rivers"));
  dana = store.createClient(person("default", "Dana Cole"));
});

describe("funding deals", () => {
  it("allow one open request per client", () => {
    const first = fd.requestDeal(store.getClient(jordan)!);
    expect(first.created).toBe(true);
    expect(fd.requestDeal(store.getClient(jordan)!)).toEqual({ id: first.id, created: false });
    expect(ops.summarize(store.getClient(jordan)!).fundingRequested).toBe(true);
    ops.markFundingHandled(ann, jordan);
    expect(fd.openDeal(jordan)!.status).toBe("in_review");
  });
  it("lock the operator's share in when funded, at the company's own rate or the default", () => {
    fd.setDefaultShare(owner, 20);
    const deal = fd.openDeal(jordan)!;
    expect(() => fd.updateDeal(owner, deal.id, { status: "funded", lender: "Coastal CU", product: "LOC", fundedAmount: null, commission: 1500, notes: "" })).toThrow(/funded amount/);
    fd.updateDeal(owner, deal.id, { status: "funded", lender: "Coastal CU", product: "Line of credit", fundedAmount: 50000, commission: 1500, notes: "fast close" });
    let p = fd.pipeline(owner);
    expect(p.totals).toMatchObject({ funded: 1, volume: 50000, commission: 1500, shareOwed: 300 });
    fd.setCompanyShare(owner, smith, 30);
    expect(fd.sharePct(smith)).toBe(30);
    fd.updateDeal(owner, deal.id, { status: "funded", lender: "Coastal CU", product: "Line of credit", fundedAmount: 50000, commission: 2000, notes: "" });
    expect(fd.pipeline(owner).totals.shareOwed).toBe(600);
    fd.markSharePaid(owner, deal.id);
    p = fd.pipeline(owner);
    expect(p.totals).toMatchObject({ shareOwed: 0, sharePaid: 600 });
    // a later rate change does not touch a paid deal
    fd.setCompanyShare(owner, smith, 50);
    fd.updateDeal(owner, deal.id, { status: "funded", lender: "Coastal CU", product: "Line of credit", fundedAmount: 50000, commission: 2000, notes: "" });
    expect(fd.pipeline(owner).totals.sharePaid).toBe(600);
  });
  it("show operators only their own deals, without the platform's commission or notes", () => {
    const mine = fd.pipeline(ann);
    expect(mine.deals).toHaveLength(1);
    expect(mine.deals[0]).not.toHaveProperty("commission");
    expect(mine.deals[0]).not.toHaveProperty("notes");
    expect(mine.totals.commission).toBeNull();
    expect(fd.pipeline(bo).deals).toHaveLength(0);
    expect(() => fd.updateDeal(ann, mine.deals[0].id, { status: "declined", lender: "", product: "", fundedAmount: null, commission: null, notes: "" })).toThrow(/platform owner/);
  });
  it("give direct clients no operator share", () => {
    const d = fd.requestDeal(store.getClient(dana)!);
    fd.updateDeal(owner, d.id, { status: "funded", lender: "X", product: "Y", fundedAmount: 10000, commission: 400, notes: "" });
    expect(fd.dealsFor(dana)[0].share_amount).toBe(0);
  });
  it("disclose the platform partner on an operator's funding disclosure only", () => {
    const op = docs.contractDocs(store.brandOf(store.getClient(jordan)!), "x").find((d) => d.key === "funding_disclosure")!.body;
    expect(op).toContain("platform partner, Resurgence Consulting Services Incorporated");
    const direct = docs.contractDocs(store.brandOf(store.getClient(dana)!), "x").find((d) => d.key === "funding_disclosure")!.body;
    expect(direct).not.toContain("platform partner");
  });
});
