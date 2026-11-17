import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";
let store: typeof import("@/lib/store");
let sample: typeof import("@/lib/sample");
const meta = { ip: "203.0.113.1", userAgent: "test" };
const person = { tenant: "default", name: "Jordan A Rivers", email: "j@example.com", phone: "", address: "418 Maple Court", city: "Columbus", state: "OH", zip: "43004", dob: "1988-04-12", ssnLast4: "1234", businessStage: "operating", fundingGoal: "" };

beforeAll(async () => { store = await import("@/lib/store"); sample = await import("@/lib/sample"); });

describe("compliance gates", () => {
  it("will not sign before the disclosure is acknowledged", () => {
    const id = store.createClient(person);
    expect(() => store.signContract(id, person.name, meta)).toThrow(/disclosure/);
  });
  it("blocks all dispute work during the 3-business-day cancellation period", () => {
    const id = store.createClient(person);
    store.ackDisclosure(id, meta); store.signContract(id, person.name, meta);
    store.saveReport(id, sample.sampleReport());
    expect(store.getAgreements(id)).toHaveLength(6);
    expect(store.canServe(store.getClient(id)!)).toBe(false);
    expect(() => store.buildRound(id)).toThrow(/cancellation period/);
  });
  it("runs rounds once the period has passed, and never mails without approval", async () => {
    const id = store.createClient(person);
    store.ackDisclosure(id, meta); store.signContract(id, person.name, meta);
    const { db } = await import("@/lib/db");
    db().prepare("UPDATE clients SET price_cents = 0, signed_at = '2026-01-05T12:00:00Z', report_reviewed_at = '2026-01-06', freeze_done_at = '2026-01-06' WHERE id = ?").run(id);
    store.saveReport(id, sample.sampleReport());
    store.setAssertion(id, "account", "acc_store", "accurate", "");
    expect(store.buildRound(id)).toBe(3); // one letter per bureau
    const cases = store.getCases(id);
    expect(cases.some((c) => c.item_id === "acc_store")).toBe(false); // consumer said accurate
    expect(cases.some((c) => c.item_id === "acc_card1")).toBe(false); // no finding, no dispute
    expect(cases.every((c) => c.round === 1 && c.step === "CRA_INVESTIGATION")).toBe(true);

    const letter = store.getLetters(id)[0] as any;
    expect(() => store.markMailed(id, letter.id, "T1")).toThrow(/approved/);
    store.attestLetter(id, letter.id); store.markMailed(id, letter.id, "T1", "2026-01-12");
    expect(() => store.recordOutcome(id, letter.id, letter.cases[0].id, "no_response")).not.toThrow(); // deadline long past
    const moved = store.getCases(id).find((c) => c.id === letter.cases[0].id)!;
    expect(moved).toMatchObject({ round: 2, step: "FAILURE_TO_INVESTIGATE", status: "pending_letter" });
    store.cancelService(id);
    expect(() => store.buildRound(id)).toThrow();
  });
  it("keeps a hash-chained activity record", async () => {
    const { db } = await import("@/lib/db");
    const rows = db().prepare("SELECT prev_hash, hash FROM audit_log ORDER BY seq").all() as any[];
    expect(rows.length).toBeGreaterThan(10);
    rows.slice(1).forEach((r, i) => expect(r.prev_hash).toBe(rows[i].hash));
  });
});
