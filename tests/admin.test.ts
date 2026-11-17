import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";
process.env.ADMIN_EMAIL = "owner@example.com";
process.env.ADMIN_PASSWORD = "correct-horse-battery";
let ops: typeof import("@/lib/console"), admin: typeof import("@/lib/admin"), store: typeof import("@/lib/store"), billing: typeof import("@/lib/billing");
type Op = import("@/lib/console").Operator;
let owner: Op, annAdmin: Op, annStaff: Op, boAdmin: Op, smith: string, apex: string;
const reg = (company: string, email: string) => ({ company, legalName: `${company} LLC`, address: "1 Main St, Dayton, OH", kind: "tax_pro", name: "Admin", email, password: "long-password-1" });
const person = (tenant: string, name: string) => ({ tenant, name, email: `${name.toLowerCase()}@example.com`, phone: "", address: "1 Main St", city: "Columbus", state: "OH", zip: "43004", dob: "1988-04-12", ssnLast4: "1234", businessStage: "operating", fundingGoal: "" });

beforeAll(async () => {
  ops = await import("@/lib/console"); admin = await import("@/lib/admin"); store = await import("@/lib/store"); billing = await import("@/lib/billing");
  owner = ops.verifyOperator("owner@example.com", "correct-horse-battery")!;
  const a = ops.registerCompany(reg("Smith Tax", "ann@smith.example")); smith = a.tenantId; annAdmin = ops.getOperator(a.operatorId)!;
  const b = ops.registerCompany(reg("Apex Credit", "bo@apex.example")); apex = b.tenantId; boAdmin = ops.getOperator(b.operatorId)!;
  annStaff = ops.getOperator(ops.createOperator({ tenantId: smith, email: "staff@smith.example", name: "Staff", password: "long-password-2", role: "staff" }))!;
  billing.applyEvent({ type: "checkout.session.completed", data: { object: { mode: "subscription", client_reference_id: smith, customer: "cus_1", subscription: "sub_1" } } });
  const c = store.createClient(person("smith-tax", "Jordan")); store.createClient(person("default", "Dana"));
  store.log(c, "consumer", "monitoring_link_opened", { service: "MyFreeScoreNow" });
  store.log(c, "consumer", "monitoring_link_opened", { service: "MyFreeScoreNow" });
  store.log(c, "consumer", "funding_review_requested");
});

describe("business overview", () => {
  it("is for the owner only", () => {
    expect(() => admin.businessOverview(annAdmin)).toThrow(/platform owner/);
  });
  it("counts revenue, clients, partner clicks and funding requests", () => {
    const b = admin.businessOverview(owner);
    expect(b.revenue).toMatchObject({ paying: 1, mrr: 147, pending: 1, pastDue: 0 });
    expect(b.clients).toMatchObject({ total: 2, new7: 2, direct: 1 });
    expect(b.partners).toEqual([{ name: "MyFreeScoreNow", clicks: 2, clicks30: 2, people: 1, uploaded: 0 }]);
    expect(b.funding.requests.map((r) => r.client.name)).toEqual(["Jordan"]);
    expect(b.operators.map((o) => [o.name, o.clients, o.logins]).sort()).toEqual([["Apex Credit", 0, 1], ["Smith Tax", 1, 2]]);
  });
});

describe("owner controls", () => {
  it("suspends a paying company without touching its subscription, and reinstates it", () => {
    admin.setSuspended(owner, smith, true);
    expect(billing.goodStanding(store.getTenant(smith))).toBe(false);
    expect(admin.businessOverview(owner).revenue).toMatchObject({ paying: 0, suspended: 1 });
    // a Stripe renewal must not lift the suspension
    billing.applyEvent({ type: "customer.subscription.updated", data: { object: { id: "sub_1", customer: "cus_1", status: "active", metadata: { tenant_id: smith } } } });
    expect(billing.goodStanding(store.getTenant(smith))).toBe(false);
    admin.setSuspended(owner, smith, false);
    expect(billing.goodStanding(store.getTenant(smith))).toBe(true);
  });
  it("gives free access only where nobody is being charged", () => {
    expect(() => admin.setComped(owner, smith, true)).toThrow(/live subscription/);
    admin.setComped(owner, apex, true);
    expect(store.getTenant(apex).sub_status).toBe("exempt");
    admin.setComped(owner, apex, false);
    expect(store.getTenant(apex).sub_status).toBe("pending");
  });
  it("edits company details, and never the platform's own company", () => {
    admin.updateCompany(owner, apex, { name: "Apex Credit Pros", legalName: "Apex Credit Co", address: "2 Elm St, Akron, OH" });
    expect(store.getTenant(apex)).toMatchObject({ name: "Apex Credit Pros", legal_name: "Apex Credit Co", slug: "apex-credit" });
    expect(() => admin.updateCompany(owner, "tenant_default", { name: "X", legalName: "X", address: "X" })).toThrow(/not found/);
    expect(() => admin.setSuspended(annAdmin, apex, true)).toThrow(/platform owner/);
  });
});

describe("login management", () => {
  it("lets a company admin reset and remove logins in their own company only", () => {
    admin.resetPassword(annAdmin, annStaff.id, "brand-new-password");
    expect(ops.verifyOperator("staff@smith.example", "brand-new-password")).not.toBeNull();
    expect(ops.verifyOperator("staff@smith.example", "long-password-2")).toBeNull();
    expect(() => admin.resetPassword(annAdmin, boAdmin.id, "brand-new-password")).toThrow(/not found/);
    expect(() => admin.resetPassword(annAdmin, owner.id, "brand-new-password")).toThrow(/not found/);
    expect(() => admin.resetPassword(annStaff, annAdmin.id, "brand-new-password")).toThrow(/not found/);
    expect(() => admin.resetPassword(annAdmin, annStaff.id, "short")).toThrow(/10 characters/);
  });
  it("blocks removing yourself or an owner, and removes others", () => {
    expect(() => admin.removeLogin(annAdmin, annAdmin.id)).toThrow(/your own/);
    expect(() => admin.removeLogin(owner, owner.id)).toThrow(/your own/);
    admin.removeLogin(annAdmin, annStaff.id);
    expect(ops.verifyOperator("staff@smith.example", "brand-new-password")).toBeNull();
    admin.removeLogin(owner, boAdmin.id);
    expect(ops.getOperator(boAdmin.id)).toBeNull();
  });
});
