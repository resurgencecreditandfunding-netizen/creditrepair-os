import { describe, expect, it } from "vitest";
import { auditReport } from "@/lib/audit";
import { addBusinessDays, addMonths, today } from "@/lib/dates";
import { fundingStatus } from "@/lib/funding";
import { composeLetter } from "@/lib/letters";
import { dueDate, groupFindings, nextStep } from "@/lib/rounds";
import { sampleReport, simulateRefresh } from "@/lib/sample";
import { factTokens } from "@/lib/ai";
import { validateReport } from "@/lib/validate";

const t = today();
const report = sampleReport();
const codes = (item: string, bureau?: string) =>
  auditReport(report, [], t).filter((f) => f.itemId === item && (!bureau || f.bureau === bureau)).map((f) => f.code);

describe("audit engine", () => {
  it("never flags accurate, consistent accounts", () => {
    expect(codes("acc_card1")).toEqual([]);
    expect(codes("acc_card2")).toEqual([]);
  });
  it("flags cross-bureau contradictions on the charge-off", () => {
    expect(codes("acc_store", "EX")).toEqual(expect.arrayContaining(["DOFD_MISMATCH", "BALANCE_MISMATCH", "DUPLICATE_DEBT"]));
    expect(codes("acc_store", "TU")).not.toContain("DUPLICATE_DEBT"); // collector does not report to TU
  });
  it("flags a re-aged collection only where the dates show it", () => {
    expect(codes("acc_coll1", "EX")).toContain("COLLECTION_REAGED");
    expect(codes("acc_coll1", "EQ")).not.toContain("COLLECTION_REAGED");
  });
  it("flags obsolete items using the 180-day rule", () => {
    expect(codes("acc_old", "TU")).toContain("OBSOLETE");
    const fresh = structuredClone(report);
    fresh.accounts.find((a) => a.id === "acc_old")!.bureaus.TU!.dofd = addMonths(t, -88); // 7y4m: inside 7y+180d
    expect(auditReport(fresh, [], t).some((f) => f.itemId === "acc_old" && f.code === "OBSOLETE")).toBe(false);
  });
  it("flags balance on settled account, late after close, and small medical collection", () => {
    expect(codes("acc_loan", "EX")).toContain("BALANCE_ON_PAID");
    expect(codes("acc_loan", "TU")).not.toContain("BALANCE_ON_PAID");
    expect(codes("acc_auto", "EQ")).toContain("LATE_AFTER_CLOSE");
    expect(codes("acc_med", "EQ")).toContain("MEDICAL_POLICY");
  });
  it("creates inquiry findings only from a consumer statement", () => {
    expect(auditReport(report, [], t).some((f) => f.itemType === "inquiry")).toBe(false);
    const f = auditReport(report, [{ itemType: "inquiry", itemId: "inq2", reason: "unauthorized_inquiry", note: "I never applied" }], t)
      .filter((x) => x.itemType === "inquiry");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ source: "consumer", bureau: "EX" });
    expect(f[0].fact).toContain("I never applied.");
  });
});

describe("round ladder", () => {
  it("always starts with the bureau and escalates by outcome", () => {
    expect(nextStep("CRA_INVESTIGATION", "verified", "account")).toBe("METHOD_OF_VERIFICATION");
    expect(nextStep("CRA_INVESTIGATION", "no_response", "account")).toBe("FAILURE_TO_INVESTIGATE");
    expect(nextStep("CRA_INVESTIGATION", "frivolous", "account")).toBe("CURE_FRIVOLOUS");
    expect(nextStep("METHOD_OF_VERIFICATION", "verified", "account")).toBe("FURNISHER_DIRECT");
    expect(nextStep("METHOD_OF_VERIFICATION", "verified", "inquiry")).toBe("ESCALATION");
    expect(nextStep("FURNISHER_DIRECT", "verified", "account")).toBe("ESCALATION");
    expect(nextStep("ESCALATION", "verified", "account")).toBe("exhausted");
    expect(nextStep("FURNISHER_DIRECT", "deleted", "account")).toBe("resolved");
  });
  it("sets deadlines of 30 days, or 15 for a procedure request, plus mail time", () => {
    expect(dueDate("CRA_INVESTIGATION", "2026-01-01")).toBe("2026-02-05");
    expect(dueDate("METHOD_OF_VERIFICATION", "2026-01-01")).toBe("2026-01-21");
  });
});

describe("letters", () => {
  const client = { name: "Jordan A Rivers", address: "418 Maple Court", city: "Columbus", state: "OH", zip: "43004", dob: "1988-04-12", ssnLast4: "1234" };
  const grouped = groupFindings(auditReport(report, [], t).filter((f) => f.bureau === "EX"));
  const cases = [...grouped.values()].map((findings) => ({ itemType: findings[0].itemType, itemLabel: findings[0].itemLabel, bureau: findings[0].bureau, findings }));
  const body = composeLetter({ client, step: "CRA_INVESTIGATION", date: t, recipientType: "cra", recipientName: "Experian", recipientBureau: "EX", cases });

  it("contains every finding fact, the bureau address and masked SSN only", () => {
    for (const c of cases) for (const f of c.findings) expect(body).toContain(f.fact);
    expect(body).toContain("P.O. Box 4500");
    expect(body).toContain("XXX-XX-1234");
    expect(body).toContain("§ 611(a)(1)(A)");
  });
  it("extracts fact tokens so an AI rewording can be checked", () => {
    const tokens = factTokens(body);
    expect(tokens).toEqual(expect.arrayContaining(["$2,315", "$940", "XXX-XX-1234"]));
    expect(tokens.some((x) => x.startsWith("ITEM 1:"))).toBe(true);
  });
});

describe("funding gate", () => {
  it("stays locked until the score improves", () => {
    const s = fundingStatus(report, report, t);
    expect(s).toMatchObject({ unlocked: false, baseline: 591, current: 591, pointsToGo: 20 });
  });
  it("unlocks after deletions lift the middle score 20 points", () => {
    const better = simulateRefresh(report, [
      { itemType: "account", itemId: "acc_coll1", bureau: "EQ" }, { itemType: "account", itemId: "acc_coll1", bureau: "EX" },
      { itemType: "account", itemId: "acc_med", bureau: "EQ" }, { itemType: "account", itemId: "acc_med", bureau: "TU" },
      { itemType: "account", itemId: "acc_old", bureau: "TU" }, { itemType: "account", itemId: "acc_loan", bureau: "EX" },
    ]);
    const s = fundingStatus(report, better, t);
    expect(s.gain).toBeGreaterThanOrEqual(20);
    expect(s.unlocked).toBe(true);
  });
});

describe("dates and validation", () => {
  it("skips weekends and federal holidays for the cancellation period", () => {
    expect(addBusinessDays("2026-11-24", 3)).toBe("2026-11-30"); // Thanksgiving and the weekend skipped
    expect(addBusinessDays("2026-07-02", 3)).toBe("2026-07-08"); // July 4 observed on Friday the 3rd
  });
  it("accepts the sample and rejects malformed reports", () => {
    expect(() => validateReport(report)).not.toThrow();
    expect(() => validateReport({ ...report, pulledAt: "11/16/2026" })).toThrow(/pulledAt/);
  });
});
