import { beforeAll, describe, expect, it } from "vitest";
import { parseSource, sourceFromUrl, sourceLabel } from "@/lib/attribution";

process.env.DATABASE_PATH = ":memory:";
process.env.ADMIN_EMAIL = "owner@example.com";
process.env.ADMIN_PASSWORD = "correct-horse-battery";

describe("campaign tags", () => {
  it("are read from an ad link and cleaned", () => {
    const s = sourceFromUrl(new URL("https://leverageiq100.com/partners?utm_source=facebook&utm_medium=paid&utm_campaign=operators-launch&utm_content=static-b<script>&fbclid=abc"), new Date("2026-11-18T12:00:00Z"))!;
    expect(s).toEqual({ source: "facebook", medium: "paid", campaign: "operators-launch", content: "static-bscript", facebook: true, landing: "/partners", at: "2026-11-18T12:00:00.000Z", fbc: "fb.1.1795003200000.abc" });
    expect(sourceLabel(s)).toBe("facebook · operators-launch · static-bscript");
  });
  it("treat a Facebook click without tags as Facebook", () => {
    expect(sourceFromUrl(new URL("https://leverageiq100.com/?fbclid=xyz"))).toMatchObject({ source: "facebook", medium: "paid", campaign: null });
  });
  it("ignore untagged visits, so they never overwrite a tagged one", () => {
    expect(sourceFromUrl(new URL("https://leverageiq100.com/?t=smith-tax"))).toBeNull();
  });
  it("survive a bad cookie", () => {
    expect(parseSource("not json")).toBeNull();
    expect(parseSource(undefined)).toBeNull();
    expect(sourceLabel(null)).toBe("No campaign tag");
  });
});

describe("sign-ups by campaign", () => {
  let store: typeof import("@/lib/store"), ops: typeof import("@/lib/console"), admin: typeof import("@/lib/admin"), billing: typeof import("@/lib/billing");
  beforeAll(async () => { store = await import("@/lib/store"); ops = await import("@/lib/console"); admin = await import("@/lib/admin"); billing = await import("@/lib/billing"); });
  const tag = (campaign: string, content: string) => JSON.stringify(sourceFromUrl(new URL(`https://x.com/?utm_source=facebook&utm_campaign=${campaign}&utm_content=${content}`)));
  const person = (name: string, source: string | null) => ({ tenant: "default", name, email: `${name}@example.com`, phone: "", address: "1", city: "C", state: "FL", zip: "32114", dob: "1990-01-01", ssnLast4: "1111", businessStage: "operating", fundingGoal: "", source });

  it("are counted for consumers and operators on the Business page", () => {
    const meta = { ip: "x", userAgent: "y" };
    const a = store.createClient(person("ann", tag("consumer-launch", "static-a")));
    store.createClient(person("bo", tag("consumer-launch", "static-a")));
    store.createClient(person("cy", tag("consumer-launch", "video")));
    store.createClient(person("di", null));
    store.ackDisclosure(a, meta); store.signContract(a, "ann", meta);
    const t = ops.registerCompany({ company: "Smith Tax", legalName: "Smith Tax LLC", address: "9 Oak", kind: "tax_pro", name: "Ann", email: "ann@smith.example", password: "long-password-1", source: tag("operators-launch", "static-b") }).tenantId;
    billing.applyEvent({ type: "checkout.session.completed", data: { object: { mode: "subscription", client_reference_id: t, customer: "c", subscription: "s" } } });
    ops.registerCompany({ company: "Apex", legalName: "Apex LLC", address: "2 Elm", kind: "credit_repair", name: "Bo", email: "bo@apex.example", password: "long-password-1" });
    const owner = ops.verifyOperator("owner@example.com", "correct-horse-battery")!;
    const { sources } = admin.businessOverview(owner);
    expect(sources.consumers).toEqual([
      { label: "facebook · consumer-launch · static-a", signedUp: 2, signed: 1, paid: 0 },
      { label: "facebook · consumer-launch · video", signedUp: 1, signed: 0, paid: 0 },
      { label: "No campaign tag", signedUp: 1, signed: 0, paid: 0 },
    ]);
    expect(sources.operators).toEqual([
      { label: "facebook · operators-launch · static-b", signedUp: 1, signed: 0, paid: 1 },
      { label: "No campaign tag", signedUp: 1, signed: 0, paid: 0 },
    ]);
  });
});
