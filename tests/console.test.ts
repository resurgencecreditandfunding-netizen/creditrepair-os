import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";
process.env.ADMIN_EMAIL = "owner@example.com";
process.env.ADMIN_PASSWORD = "correct-horse-battery";
let ops: typeof import("@/lib/console");
let store: typeof import("@/lib/store");
let sample: typeof import("@/lib/sample");
let docs: typeof import("@/lib/documents");
const meta = { ip: "203.0.113.1", userAgent: "test" };
const person = (tenant: string, name: string) => ({ tenant, name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, phone: "", address: "1 Main St", city: "Columbus", state: "OH", zip: "43004", dob: "1988-04-12", ssnLast4: "1234", businessStage: "operating", fundingGoal: "" });

let platform: import("@/lib/console").Operator, staffA: import("@/lib/console").Operator, staffB: import("@/lib/console").Operator;
let clientA: string, clientB: string;

beforeAll(async () => {
  ops = await import("@/lib/console"); store = await import("@/lib/store"); sample = await import("@/lib/sample"); docs = await import("@/lib/documents");
  platform = ops.verifyOperator("owner@example.com", "correct-horse-battery")!;
  const a = ops.createTenant(platform, { name: "Smith Tax", slug: "smith-tax", legalName: "Smith Tax Services LLC", address: "9 Oak Ave, Dayton, OH 45402", kind: "tax_pro" });
  const b = ops.createTenant(platform, { name: "Apex Credit", slug: "apex", legalName: "Apex Credit Co", address: "2 Elm St, Akron, OH 44301", kind: "credit_repair" });
  staffA = ops.getOperator(ops.createOperator({ tenantId: a, email: "a@smith.example", name: "Ann", password: "long-password-1", role: "staff" }))!;
  staffB = ops.getOperator(ops.createOperator({ tenantId: b, email: "b@apex.example", name: "Bo", password: "long-password-2", role: "admin" }))!;
  clientA = store.createClient(person("smith-tax", "Jordan Rivers"));
  clientB = store.createClient(person("apex", "Casey Lane"));
});

describe("operator logins", () => {
  it("seeds the platform owner and rejects wrong passwords", () => {
    expect(platform.role).toBe("platform");
    expect(ops.verifyOperator("owner@example.com", "wrong")).toBeNull();
    expect(ops.verifyOperator("nobody@example.com", "correct-horse-battery")).toBeNull();
  });
  it("refuses short passwords and duplicate emails", () => {
    expect(() => ops.createOperator({ tenantId: staffA.tenant_id, email: "x@y.co", name: "X", password: "short", role: "staff" })).toThrow(/10 characters/);
    expect(() => ops.createOperator({ tenantId: staffA.tenant_id, email: "A@smith.example", name: "X", password: "long-password-3", role: "staff" })).toThrow(/already/);
  });
});

describe("company isolation", () => {
  it("shows each company only its own clients", () => {
    expect(ops.listClients(staffA).map((r) => r.client.id)).toEqual([clientA]);
    expect(ops.listClients(staffB).map((r) => r.client.id)).toEqual([clientB]);
    expect(ops.listClients(platform)).toHaveLength(2);
  });
  it("ignores a company filter from a non-platform operator", () => {
    expect(ops.listClients(staffA, { tenantId: staffB.tenant_id }).map((r) => r.client.id)).toEqual([clientA]);
  });
  it("blocks reading or noting another company's client", () => {
    expect(() => ops.clientFor(staffA, clientB)).toThrow(/not found/);
    expect(() => ops.addNote(staffA, clientB, "hi")).toThrow(/not found/);
    expect(ops.clientFor(platform, clientB).id).toBe(clientB);
    expect(ops.listTenants(staffA).map((t) => t.slug)).toEqual(["smith-tax"]);
  });
  it("lets only the platform owner add companies", () => {
    expect(() => ops.createTenant(staffB, { name: "X", slug: "x", legalName: "X LLC", address: "1 St", kind: "tax_pro" })).toThrow(/platform owner/);
  });
});

describe("contracts name the right company", () => {
  it("uses the licensed company's legal name for its clients", () => {
    const text = docs.contractDocs(store.brandOf(store.getClient(clientA)!), "x").map((d) => d.body).join("\n");
    expect(text).toContain("Smith Tax Services LLC (which provides this service under the name Smith Tax)");
    expect(text).not.toContain("Resurgence");
  });
  it("uses Resurgence Consulting Services Incorporated for direct clients, not the product name", () => {
    const direct = store.createClient(person("default", "Dana Cole"));
    const all = docs.contractDocs(store.brandOf(store.getClient(direct)!), "x");
    expect(all.find((d) => d.key === "service_agreement")!.body).toContain("Resurgence Consulting Services Incorporated (which provides this service under the name CreditOS)");
    expect(all.find((d) => d.key === "limited_authorization")!.body).toContain("You authorize Resurgence Consulting Services Incorporated to");
  });
});

describe("client summary and queue", () => {
  it("tracks stage from report through mailing, and staff cannot skip client approval", async () => {
    expect(ops.summarize(store.getClient(clientA)!).stage).toBe("needs_report");
    store.ackDisclosure(clientA, meta); store.signContract(clientA, "Jordan Rivers", meta);
    const { db } = await import("@/lib/db");
    db().prepare("UPDATE clients SET signed_at = '2026-01-05T12:00:00Z' WHERE id = ?").run(clientA);
    store.saveReport(clientA, sample.sampleReport(), "operator:a@smith.example");
    expect(ops.summarize(store.getClient(clientA)!).stage).toBe("needs_review");
    store.buildRound(clientA);
    let s = ops.summarize(store.getClient(clientA)!);
    expect(s).toMatchObject({ stage: "awaiting_approval", drafts: 3, toMail: 0 });
    expect(() => store.markMailed(clientA, s.letters[0].id, "T1", undefined, "operator:a@smith.example")).toThrow(/approved by the consumer/);
    store.attestLetter(clientA, s.letters[0].id);
    s = ops.summarize(store.getClient(clientA)!);
    expect(s).toMatchObject({ stage: "ready_to_mail", toMail: 1 });
    store.markMailed(clientA, s.letters[0].id, "T1", "2026-01-12", "operator:a@smith.example");
    expect(ops.summarize(store.getClient(clientA)!).overdue).toBe(1);
    expect(store.getLog(clientA).find((e) => e.action === "letter_mailed")!.actor).toBe("operator:a@smith.example");
  });
  it("raises and clears a funding request", () => {
    store.log(clientA, "consumer", "funding_review_requested");
    expect(ops.summarize(store.getClient(clientA)!).fundingRequested).toBe(true);
    ops.markFundingHandled(staffA, clientA);
    expect(ops.summarize(store.getClient(clientA)!).fundingRequested).toBe(false);
  });
});

describe("credit monitoring partners", () => {
  it("lets only the platform owner manage affiliate links, and only https ones", () => {
    expect(() => ops.addMonitoring(staffB, { name: "X", url: "https://x.example/a", blurb: "" })).toThrow(/platform owner/);
    expect(() => ops.addMonitoring(platform, { name: "X", url: "javascript:alert(1)", blurb: "" })).toThrow(/https/);
    expect(() => ops.addMonitoring(platform, { name: "X", url: "http://x.example", blurb: "" })).toThrow(/https/);
    expect(ops.listMonitoring().map((m) => [m.name, m.url])).toEqual([["MyFreeScoreNow", "https://app.myfreescorenow.com/enroll/B03C9622"]]);
    const id = ops.addMonitoring(platform, { name: "ScoreWatch", url: "https://scorewatch.example/?aff=123", blurb: "3-bureau" });
    expect(ops.listMonitoring()).toHaveLength(2);
    expect(() => ops.removeMonitoring(staffA, id)).toThrow(/platform owner/);
    ops.removeMonitoring(platform, id);
    expect(ops.listMonitoring().map((m) => m.name)).toEqual(["MyFreeScoreNow"]);
  });
});

describe("saved report pages", () => {
  it("are reduced to readable text without scripts or markup", async () => {
    const { htmlToText } = await import("@/lib/ai");
    const text = htmlToText(`<html><head><title>x</title><style>td{color:red}</style></head><body><script>track()</script>
      <h2>Northgate Retail Card</h2><table><tr><td>Balance</td><td>$2,315</td></tr><tr><td>Status</td><td>Charge-off &amp; closed</td></tr></table></body></html>`);
    expect(text).toBe("Northgate Retail Card\nBalance | $2,315 |\nStatus | Charge-off & closed |");
  });
});
