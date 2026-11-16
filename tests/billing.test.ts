import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";
let billing: typeof import("@/lib/billing");
let ops: typeof import("@/lib/console");
let store: typeof import("@/lib/store");
const SECRET = "whsec_test";
const signed = (body: object, t = Math.floor(Date.now() / 1000), secret = SECRET) => {
  const payload = JSON.stringify(body);
  return { payload, header: `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}` };
};
const reg = { company: "Smith Tax & Books", legalName: "Smith Tax Services LLC", address: "9 Oak Ave, Dayton, OH", kind: "tax_pro", name: "Ann", email: "ann@smith.example", password: "long-password-1" };
let tenantId: string;

beforeAll(async () => {
  billing = await import("@/lib/billing"); ops = await import("@/lib/console"); store = await import("@/lib/store");
  tenantId = ops.registerCompany(reg).tenantId;
});

describe("company sign-up", () => {
  it("creates an unpaid company with an admin login and a clean link name", () => {
    const t = store.getTenant(tenantId);
    expect(t).toMatchObject({ slug: "smith-tax-books", sub_status: "pending", legal_name: "Smith Tax Services LLC" });
    expect(billing.goodStanding(t)).toBe(false);
    expect(ops.verifyOperator("ann@smith.example", "long-password-1")).toMatchObject({ role: "admin", tenant_id: tenantId });
  });
  it("gives a second company with the same name its own link, and refuses a reused email", () => {
    expect(() => ops.registerCompany(reg)).toThrow(/already has a login/);
    const second = ops.registerCompany({ ...reg, email: "bo@other.example" });
    expect(store.getTenant(second.tenantId).slug).toBe("smith-tax-books-2");
  });
  it("leaves the platform's own company free of charge", () => {
    expect(billing.goodStanding(store.getTenant("default"))).toBe(true);
  });
});

describe("webhook signature", () => {
  it("accepts a correctly signed event", () => {
    const { payload, header } = signed({ type: "ping" });
    expect(billing.verifyWebhook(payload, header, SECRET).type).toBe("ping");
  });
  it("rejects a wrong secret, a changed body, an old timestamp and a missing header", () => {
    const { payload, header } = signed({ type: "ping" });
    expect(() => billing.verifyWebhook(payload, signed({ type: "ping" }, undefined, "whsec_other").header, SECRET)).toThrow(/match/);
    expect(() => billing.verifyWebhook(payload.replace("ping", "pong"), header, SECRET)).toThrow(/match/);
    const old = signed({ type: "ping" }, Math.floor(Date.now() / 1000) - 3600);
    expect(() => billing.verifyWebhook(old.payload, old.header, SECRET)).toThrow(/old/);
    expect(() => billing.verifyWebhook(payload, null, SECRET)).toThrow(/Missing/);
  });
});

describe("subscription lifecycle", () => {
  const sub = (status: string) => ({ type: "customer.subscription.updated", data: { object: { id: "sub_1", customer: "cus_1", status, metadata: { tenant_id: tenantId } } } });
  it("opens access on checkout, keeps it during a late payment, and closes it on cancellation", () => {
    expect(billing.applyEvent({ type: "checkout.session.completed", data: { object: { mode: "subscription", client_reference_id: tenantId, customer: "cus_1", subscription: "sub_1" } } })).toBe("activated");
    expect(store.getTenant(tenantId)).toMatchObject({ sub_status: "active", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" });
    billing.applyEvent(sub("past_due"));
    expect(billing.goodStanding(store.getTenant(tenantId))).toBe(true);
    billing.applyEvent(sub("unpaid"));
    expect(billing.goodStanding(store.getTenant(tenantId))).toBe(false);
    billing.applyEvent(sub("active"));
    // deletion arrives without metadata; matched by subscription id
    billing.applyEvent({ type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1", status: "canceled" } } });
    expect(store.getTenant(tenantId).sub_status).toBe("canceled");
  });
  it("ignores unrelated events and unknown companies", () => {
    expect(billing.applyEvent({ type: "invoice.paid", data: { object: {} } })).toBe("ignored");
    expect(billing.applyEvent({ type: "checkout.session.completed", data: { object: { mode: "subscription", client_reference_id: "nope", customer: "c", subscription: "s" } } })).toBe("unknown company");
    expect(store.getTenant("default").sub_status).toBe("exempt");
  });
});
