import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";
let lessons: typeof import("@/lib/lessons"), wins: typeof import("@/lib/wins"), store: typeof import("@/lib/store"), sample: typeof import("@/lib/sample"), db: typeof import("@/lib/db").db;
const meta = { ip: "203.0.113.1", userAgent: "test" };
beforeAll(async () => {
  lessons = await import("@/lib/lessons"); wins = await import("@/lib/wins"); store = await import("@/lib/store"); sample = await import("@/lib/sample"); db = (await import("@/lib/db")).db;
});

describe("lesson links", () => {
  it("save https links per step and clear blanks", () => {
    lessons.saveLessons("tenant_default", { review: "https://www.skool.com/my-community/classroom/abc", freeze: "https://youtu.be/xyz" });
    expect(lessons.lessonsFor("tenant_default")).toEqual({ review: "https://www.skool.com/my-community/classroom/abc", freeze: "https://youtu.be/xyz" });
    lessons.saveLessons("tenant_default", { review: "https://www.skool.com/my-community/classroom/abc", freeze: "" });
    expect(Object.keys(lessons.lessonsFor("tenant_default"))).toEqual(["review"]);
    expect(() => lessons.saveLessons("tenant_default", { review: "javascript:alert(1)" })).toThrow();
    expect(() => lessons.saveLessons("tenant_default", { review: "http://example.com" })).toThrow(/https/);
  });
});

describe("win cards", () => {
  it("appear only for results the record backs up", () => {
    const id = store.createClient({ tenant: "default", name: "Jordan Rivers", email: "j@example.com", phone: "", address: "1", city: "C", state: "FL", zip: "32114", dob: "1988-04-12", ssnLast4: "1234", businessStage: "operating", fundingGoal: "" });
    store.ackDisclosure(id, meta); store.signContract(id, "Jordan Rivers", meta);
    db().prepare("UPDATE clients SET price_cents = 0, signed_at = '2026-01-05T12:00:00Z', report_reviewed_at='2026-01-06', freeze_done_at='2026-01-06' WHERE id=?").run(id);
    const first = sample.sampleReport();
    store.saveReport(id, first);
    expect(wins.winsFor(store.getClient(id)!)).toEqual([]);
    store.buildRound(id);
    for (const l of store.getLetters(id) as any[]) {
      store.attestLetter(id, l.id); store.markMailed(id, l.id, "T", "2026-01-12");
      for (const c of l.cases) store.recordOutcome(id, l.id, c.id, "deleted");
    }
    const deleted = store.getCases(id).filter((c) => c.status === "resolved").map((c) => ({ itemType: c.item_type, itemId: c.item_id, bureau: c.bureau }));
    store.saveReport(id, sample.simulateRefresh(first, deleted));
    const w = wins.winsFor(store.getClient(id)!);
    expect(w.map((x) => x.kind)).toEqual(["deleted", "points", "unlocked"]);
    expect(w[0].line).toMatch(/inaccurate items deleted/);
    expect(JSON.stringify(w)).not.toMatch(/\d{3}-|XXX|Northgate|Meridian/); // nothing from the report itself
  });
});
