import { addDays } from "./dates";
import { Finding, ItemType, Outcome, Step } from "./types";

export const STEP_ROUND: Record<Step, number> = {
  CRA_INVESTIGATION: 1, METHOD_OF_VERIFICATION: 2, FAILURE_TO_INVESTIGATE: 2,
  CURE_FRIVOLOUS: 2, FURNISHER_DIRECT: 3, ESCALATION: 4,
};
export const STEP_NAME: Record<Step, string> = {
  CRA_INVESTIGATION: "Verification and reinvestigation request",
  METHOD_OF_VERIFICATION: "Method of verification demand",
  FAILURE_TO_INVESTIGATE: "Failure to investigate: deletion demand",
  CURE_FRIVOLOUS: "Response to frivolous determination",
  FURNISHER_DIRECT: "Direct dispute to the furnisher",
  ESCALATION: "Final demand and regulator complaint",
};
export const OUTCOME_NAME: Record<Outcome, string> = {
  deleted: "Deleted", corrected: "Corrected", verified: "Verified / unchanged",
  no_response: "No response by deadline", frivolous: "Called frivolous",
};

/** Days allowed for a response once the letter is received, plus mail transit. */
const MAIL_DAYS = 5;
export function dueDate(step: Step, mailedAt: string) {
  // § 611(a)(7): procedure description within 15 days. Everything else: 30 days.
  return addDays(mailedAt, MAIL_DAYS + (step === "METHOD_OF_VERIFICATION" ? 15 : 30));
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
      return outcome === "verified" ? "METHOD_OF_VERIFICATION"
        : outcome === "no_response" ? "FAILURE_TO_INVESTIGATE" : "CURE_FRIVOLOUS";
    case "METHOD_OF_VERIFICATION":
    case "FAILURE_TO_INVESTIGATE":
    case "CURE_FRIVOLOUS":
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
