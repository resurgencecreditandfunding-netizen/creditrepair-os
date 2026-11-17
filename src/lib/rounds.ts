import { addDays } from "./dates";
import { Finding, ItemType, Outcome, Step } from "./types";

export const STEP_ROUND: Record<Step, number> = {
  CRA_INVESTIGATION: 1, METHOD_OF_VERIFICATION: 2, FAILURE_TO_INVESTIGATE: 2,
  CURE_FRIVOLOUS: 2, FURNISHER_DIRECT: 3, ESCALATION: 4, IDENTITY_THEFT_BLOCK: 1, REINSERTION: 2,
};
export const STEP_NAME: Record<Step, string> = {
  CRA_INVESTIGATION: "Verification and reinvestigation request",
  METHOD_OF_VERIFICATION: "Method of verification demand",
  FAILURE_TO_INVESTIGATE: "Failure to investigate: deletion demand",
  CURE_FRIVOLOUS: "Response to frivolous determination",
  FURNISHER_DIRECT: "Direct dispute to the furnisher",
  ESCALATION: "Final demand and regulator complaint",
  IDENTITY_THEFT_BLOCK: "Identity theft block request",
  REINSERTION: "Reinsertion without notice: deletion demand",
};
export const OUTCOME_NAME: Record<Outcome, string> = {
  deleted: "Deleted", corrected: "Corrected", verified: "Verified / unchanged",
  no_response: "No response by deadline", frivolous: "Called frivolous",
};

/** Days allowed for a response once the letter is received, plus mail transit. */
const MAIL_DAYS = 5;
export function dueDate(step: Step, mailedAt: string) {
  // § 611(a)(7): procedure description within 15 days. § 605B: block within 4 business days (10 calendar days allowed). Everything else: 30 days.
  const days = step === "METHOD_OF_VERIFICATION" ? 15 : step === "IDENTITY_THEFT_BLOCK" ? 10 : 30;
  return addDays(mailedAt, MAIL_DAYS + days);
}

/** Only tradelines have a furnisher that can be disputed directly. */
const hasFurnisher = (t: ItemType) => t === "account";

/**
 * The round ladder. Round 1 is always a reinvestigation request to the bureau.
 * What comes next depends only on how the bureau answered.
 */
export function nextStep(step: Step, outcome: Outcome, itemType: ItemType): Step | "resolved" | "exhausted" {
  if (outcome === "deleted" || outcome === "corrected") return "resolved";
  switch (step) {
    case "CRA_INVESTIGATION":
    case "IDENTITY_THEFT_BLOCK": // a refused block moves to the same follow-up as a verified dispute
      return outcome === "verified" ? "METHOD_OF_VERIFICATION"
        : outcome === "no_response" ? "FAILURE_TO_INVESTIGATE" : "CURE_FRIVOLOUS";
    case "METHOD_OF_VERIFICATION":
    case "FAILURE_TO_INVESTIGATE":
    case "CURE_FRIVOLOUS":
    case "REINSERTION":
      return hasFurnisher(itemType) ? "FURNISHER_DIRECT" : "ESCALATION";
    case "FURNISHER_DIRECT":
      return "ESCALATION";
    case "ESCALATION":
      return "exhausted";
  }
}

export interface CaseKey { itemType: ItemType; itemId: string; bureau: string }
export const caseKey = (c: CaseKey) => `${c.itemType}:${c.itemId}:${c.bureau}`;

/** Group findings into one dispute case per item per bureau. */
export function groupFindings(findings: Finding[]) {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    const k = caseKey(f);
    map.set(k, [...(map.get(k) ?? []), f]);
  }
  return map;
}

/** The step a new case starts at. Identity theft gets its own track; everything else starts with a bureau reinvestigation. */
export const firstStep = (findings: Finding[]): Step =>
  findings.some((f) => f.code === "CONSUMER_IDENTITY_THEFT") ? "IDENTITY_THEFT_BLOCK" : "CRA_INVESTIGATION";

/** Most accounts or public records in one letter. A short, specific letter is harder to dismiss as frivolous. */
export const MAX_ITEMS_PER_LETTER = Number(process.env.MAX_ITEMS_PER_LETTER ?? 5);
export const countsTowardCap = (t: ItemType) => t === "account" || t === "public_record";

/**
 * Order inside a letter, strongest first: personal information (so old addresses and names cannot be used to match),
 * then items that must be deleted outright, then by impact, with inquiries last.
 */
export function priority(c: { itemType: ItemType; findings: Finding[] }): number {
  if (c.itemType === "personal") return 0;
  if (c.itemType === "inquiry") return 6;
  const f = c.findings;
  if (f.some((x) => x.code === "REINSERTED" || x.code === "CONSUMER_IDENTITY_THEFT")) return 1;
  if (f.some((x) => x.action === "delete")) return 2;
  if (f.some((x) => x.severity === "high")) return 3;
  if (f.some((x) => x.severity === "medium")) return 4;
  return 5;
}
export const byPriority = <T extends { itemType: ItemType; findings: Finding[] }>(a: T, b: T) =>
  priority(a) - priority(b) || b.findings.length - a.findings.length;
