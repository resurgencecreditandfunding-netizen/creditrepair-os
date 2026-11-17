import { beforeAll, describe, expect, it } from "vitest";
import { auditReport, streakStart } from "@/lib/audit";
import { addMonths, today } from "@/lib/dates";
import { composeLetter } from "@/lib/letters";
import { byPriority, dueDate, firstStep, nextStep, priority } from "@/lib/rounds";
import { sampleReport } from "@/lib/sample";
import type { CreditReport, Finding } from "@/lib/types";

process.env.DATABASE_PATH = ":memory:";
const t = today();
const meta = { ip: "203.0.113.1", userAgent: "test" };
const person = (name: string) => ({ tenant: "default", name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, phone: "", address: "1 Main St", city: "Daytona Beach", state: "FL", zip: "32114", dob: "1988-04-12", ssnLast4: "1234", businessStage: "operating", fundingGoal: "" });
let store: typeof import("@/lib/store"), db: typeof import("@/lib/db").db;
beforeAll(async () => { store = await import("@/lib/store"); db = (await import("@/lib/db")).db; });

/** A signed client past the waiting period, report reviewed and freezes done. */
function ready(name: string, report: CreditReport) {
  const id = store.createClient(person(name));
  store.ackDisclosure(id, meta); store.signContract(id, name, meta);
  db().prepare("UPDATE clients SET signed_at='2026-01-05T12:00:00Z', report_reviewed_at='2026-01-06', freeze_done_at='2026-01-06' WHERE id=?").run(id);
  store.saveReport(id, report);
  return id;
}
const finding = (o: Partial<Finding>): Finding => ({ code: "X", source: "system", itemType: "account", itemId: "a", itemLabel: "A", bureau: "EQ", severity: "low", title: "", fact: "", statutes: [], action: "correct", ...o });

describe("new audit checks", () => {
  it("finds the start of the last run of late months", () => {
    expect(streakStart(["2024-01", "2024-05", "2024-06", "2024-07"])).toBe("2024-05");
    expect(streakStart(["2024-12", "2025-01"])).toBe("2024-12");
    expect(streakStart([])).toBeNull();
  });
  it("flags a charge-off whose delinquency date is later than its late payments", () => {
    const r = sampleReport();
    const v = r.accounts.find((a) => a.id === "acc_store")!.bureaus.TU!;
    v.dofd = addMonths(t, -30); v.lates = [-34, -33, -32, -31].map((m) => ({ month: addMonths(t, m).slice(0, 7), days: 30 as const }));
    expect(auditReport(r, [], t).filter((f) => f.code === "DOFD_AFTER_LATES").map((f) => f.bureau)).toEqual(["TU"]);
  });
  it("flags the same account listed twice at one bureau, but not at different bureaus", () => {
    const r = sampleReport();
    const copy = structuredClone(r.accounts.find((a) => a.id === "acc_card2")!);
    copy.id = "acc_card2_dup"; copy.bureaus = { EX: copy.bureaus.EX };
    r.accounts.push(copy);
    const dup = auditReport(r, [], t).filter((f) => f.code === "DUPLICATE_TRADELINE");
    expect(dup.map((f) => [f.itemId, f.bureau])).toEqual([["acc_card2_dup", "EX"]]);
  });
  it("flags a medical collection reported within a year of the delinquency", () => {
    const r = sampleReport();
    const m = r.accounts.find((a) => a.id === "acc_med")!;
    for (const v of Object.values(m.bureaus)) { v!.balance = 900; v!.dofd = addMonths(t, -6); }
    expect(auditReport(r, [], t).some((f) => f.itemId === "acc_med" && f.code === "MEDICAL_UNDER_1YR")).toBe(true);
    for (const v of Object.values(m.bureaus)) v!.dofd = addMonths(t, -14);
    expect(auditReport(r, [], t).some((f) => f.code === "MEDICAL_UNDER_1YR")).toBe(false);
  });
});

describe("ladder and order", () => {
  it("puts identity theft on its own §605B track with a short deadline", () => {
    expect(firstStep([finding({ code: "CONSUMER_IDENTITY_THEFT" })])).toBe("IDENTITY_THEFT_BLOCK");
    expect(firstStep([finding({ code: "OBSOLETE" })])).toBe("CRA_INVESTIGATION");
    expect(dueDate("IDENTITY_THEFT_BLOCK", "2026-01-01")).toBe("2026-01-16");
    expect(nextStep("IDENTITY_THEFT_BLOCK", "verified", "account")).toBe("METHOD_OF_VERIFICATION");
    expect(nextStep("REINSERTION", "verified", "account")).toBe("FURNISHER_DIRECT");
    expect(nextStep("REINSERTION", "verified", "inquiry")).toBe("ESCALATION");
  });
  it("orders personal information, then deletions, then by impact, inquiries last", () => {
    const items = [
      { itemType: "inquiry" as const, findings: [finding({ severity: "medium" })] },
      { itemType: "account" as const, findings: [finding({ severity: "medium" })] },
      { itemType: "account" as const, findings: [finding({ severity: "high" })] },
      { itemType: "account" as const, findings: [finding({ action: "delete", severity: "medium" })] },
      { itemType: "personal" as const, findings: [finding({ severity: "low" })] },
    ];
    expect(items.sort(byPriority).map(priority)).toEqual([0, 2, 3, 4, 6]);
  });
  it("writes the strongest item as ITEM 1 and cites §623(a)(1)(B) to furnishers", () => {
    const client = { name: "J R", address: "1 A", city: "C", state: "FL", zip: "32114", dob: "1988-04-12", ssnLast4: "1234" };
    const cases = [
      { itemType: "account" as const, itemLabel: "Low Bank", bureau: "EQ" as const, findings: [finding({ severity: "low", fact: "low fact" })] },
      { itemType: "account" as const, itemLabel: "Old Debt", bureau: "EQ" as const, findings: [finding({ action: "delete", severity: "high", fact: "old fact" })] },
    ];
    const body = composeLetter({ client, step: "CRA_INVESTIGATION", date: t, recipientType: "cra", recipientName: "Equifax", recipientBureau: "EQ", cases });
    expect(body.indexOf("ITEM 1: Old Debt")).toBeGreaterThan(0);
    expect(body.indexOf("ITEM 1: Old Debt")).toBeLessThan(body.indexOf("ITEM 2: Low Bank"));
    const f = composeLetter({ client, step: "FURNISHER_DIRECT", date: t, recipientType: "furnisher", recipientName: "Low Bank", cases: [cases[0]] });
    expect(f).toContain("§ 623(a)(1)(B)");
    const idt = composeLetter({ client, step: "IDENTITY_THEFT_BLOCK", date: t, recipientType: "cra", recipientName: "Equifax", recipientBureau: "EQ",
      cases: [{ ...cases[0], findings: [finding({ code: "CONSUMER_IDENTITY_THEFT", fact: "not mine" })] }] });
    expect(idt).toContain("§ 605B");
    expect(idt).toContain("identity theft report");
  });
});

describe("building letters", () => {
  it("sends identity theft items in their own letter, separate from the regular dispute", () => {
    const id = ready("Ivy Theft", sampleReport());
    store.setAssertion(id, "account", "acc_card2", "identity_theft", "");
    store.buildRound(id);
    const letters = store.getLetters(id) as any[];
    const idt = letters.filter((l) => l.step === "IDENTITY_THEFT_BLOCK");
    expect(idt.map((l) => l.recipient_bureau).sort()).toEqual(["EQ", "EX", "TU"]);
    expect(idt.every((l) => l.cases.length === 1 && l.round === 1)).toBe(true);
    expect(letters.filter((l) => l.step === "CRA_INVESTIGATION").every((l) => l.cases.every((c: any) => c.item_id !== "acc_card2"))).toBe(true);
  });
  it("caps accounts per letter, queues the rest, and waits for the open letter to close", () => {
    const r = sampleReport();
    for (let i = 0; i < 6; i++) r.accounts.push({ id: `bad${i}`, creditor: `Old Collector ${i}`, accountMask: `****00${i}0`, kind: "collection", responsibility: "individual",
      bureaus: { EQ: { status: "collection", balance: 300 + i, dateOpened: addMonths(t, -100), dofd: addMonths(t, -100 - i), lastReported: t } } });
    const id = ready("Cap Test", r);
    store.buildRound(id);
    const eq = (store.getLetters(id) as any[]).filter((l) => l.recipient_bureau === "EQ");
    expect(eq).toHaveLength(1);
    expect(eq[0].cases.filter((c: any) => c.item_type === "account")).toHaveLength(5);
    expect(eq[0].body.match(/ITEM 1: Old Collector/)).not.toBeNull(); // past-limit deletions go first
    const queued = store.getCases(id).filter((c) => c.bureau === "EQ" && c.status === "pending_letter");
    expect(queued.length).toBeGreaterThan(0);
    expect(store.buildRound(id)).toBe(0); // Equifax already has an open letter
    store.attestLetter(id, eq[0].id); store.markMailed(id, eq[0].id, "T", "2026-01-12");
    for (const c of eq[0].cases) store.recordOutcome(id, eq[0].id, c.id, "deleted");
    expect(store.buildRound(id)).toBeGreaterThan(0);
    const next = (store.getLetters(id) as any[]).filter((l) => l.recipient_bureau === "EQ" && l.status === "draft");
    expect(next[0].cases.map((c: any) => c.id).sort()).toEqual(queued.map((c) => c.id).sort());
  });
  it("reopens a deleted item that comes back on a new report, at the reinsertion step", () => {
    const id = ready("Rae Insert", sampleReport());
    store.buildRound(id);
    const tu = (store.getLetters(id) as any[]).find((l) => l.recipient_bureau === "TU");
    store.attestLetter(id, tu.id); store.markMailed(id, tu.id, "T", "2026-01-12");
    const old = tu.cases.find((c: any) => c.item_id === "acc_old");
    store.recordOutcome(id, tu.id, old.id, "deleted");
    store.saveReport(id, sampleReport()); // Pioneer Telecom is back on TransUnion
    const c = store.getCases(id).find((x) => x.id === old.id)!;
    expect(c).toMatchObject({ status: "pending_letter", step: "REINSERTION", round: 2, resolution: null });
    expect(c.findings[0].code).toBe("REINSERTED");
    expect(store.getLog(id).some((e) => e.action === "reinsertion_detected")).toBe(true);
  });
});
