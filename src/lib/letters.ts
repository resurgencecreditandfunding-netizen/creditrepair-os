import { fmt } from "./dates";
import { BUREAU_ADDRESS, LAW } from "./law";
import { STEP_NAME } from "./rounds";
import { Bureau, BUREAU_NAME, Finding, ItemType, Step } from "./types";

export interface LetterClient {
  name: string; address: string; city: string; state: string; zip: string; dob: string; ssnLast4: string;
}
export interface LetterCase {
  itemType: ItemType; itemLabel: string; bureau: Bureau; findings: Finding[];
  /** True when the furnisher is a collection agency (adds a debt validation request). */
  isCollection?: boolean;
  /** Date the previous round was mailed, for follow-up letters. */
  priorMailedAt?: string | null;
}
export interface LetterInput {
  client: LetterClient; step: Step; date: string;
  recipientType: "cra" | "furnisher"; recipientName: string; recipientBureau?: Bureau;
  cases: LetterCase[];
}

const ACTION = {
  delete: "Delete this item from my file.",
  correct: "Correct this item so that it is accurate and complete, or delete it if it cannot be verified.",
  investigate: "Investigate this item and delete it if it cannot be verified as accurate and complete.",
};
const uniq = <T,>(a: T[]) => [...new Set(a)];

function itemBlock(c: LetterCase, n: number, withBureau: boolean) {
  const action = c.findings.some((f) => f.action === "delete") ? "delete"
    : c.findings.some((f) => f.action === "correct") ? "correct" : "investigate";
  const lines = c.findings.map((f) => `  - ${f.fact}`);
  const cites = uniq(c.findings.flatMap((f) => f.statutes));
  return [
    `ITEM ${n}: ${c.itemLabel}${withBureau ? ` (as reported to ${BUREAU_NAME[c.bureau]})` : ""}`,
    `What is wrong:`, ...lines,
    `What I am asking for: ${ACTION[action]}`,
    `Authority: ${cites.join("; ")}`,
  ].join("\n");
}

const INTRO: Record<Step, (i: LetterInput) => string> = {
  CRA_INVESTIGATION: () =>
    `I am disputing the information listed below, which appears in my credit file. For each item I state the specific reason it is inaccurate, incomplete, or cannot be verified.\n\nPlease reinvestigate each item, verify it with the company that furnished it, and report the results to me.`,
  METHOD_OF_VERIFICATION: (i) =>
    `I previously disputed the items below${prior(i)}. You responded that the information was verified, but the specific errors I identified are still in my file and your response did not address them.\n\nI request a description of the procedure you used to determine the accuracy and completeness of each item, including the business name, address, and telephone number of every furnisher you contacted. You must provide this within 15 days of receiving this request (${LAW.PROCEDURE_DESCRIPTION}).\n\nI also renew my dispute of each item for the reasons stated below.`,
  FAILURE_TO_INVESTIGATE: (i) =>
    `I disputed the items below${prior(i)}. More than 30 days have passed since you received my dispute and I have not received the results of any reinvestigation.\n\nInformation that is not verified within the reinvestigation period must be promptly deleted (${LAW.DELETE_UNVERIFIED}). I ask that you delete each item below and send me an updated copy of my report.`,
  CURE_FRIVOLOUS: (i) =>
    `I disputed the items below${prior(i)}, and you declined to investigate, describing my dispute as frivolous or irrelevant. It is not. I am the consumer, I prepared this dispute about my own file, and for each item I identify the specific information I dispute and why.\n\nI enclose proof of my identity and address. With this letter you have everything required to investigate (${LAW.FRIVOLOUS}), and I ask that you do so.`,
  FURNISHER_DIRECT: () =>
    `I am writing to you directly because you furnish the information below to the consumer reporting agencies, and it is inaccurate. This is a direct dispute under ${LAW.FURNISHER_DIRECT}.\n\nPlease conduct a reasonable investigation, review the information I have provided, and report the results to me within 30 days. If the information is inaccurate, notify every consumer reporting agency you furnished it to and correct it (${LAW.FURNISHER_UPDATE}). While this dispute is open, the account must be reported as disputed (${LAW.FURNISHER_DISPUTE_FLAG}).`,
  ESCALATION: (i) =>
    `This is my final request regarding the items below. I have disputed them with ${i.recipientName} and with the furnisher, and the errors I identified remain in my file.\n\nI am filing a complaint with the Consumer Financial Protection Bureau describing this history. If the items are not corrected or deleted, I ask that you add my statement of dispute to my file (${LAW.CONSUMER_STATEMENT}). I am also keeping a full record of this correspondence in case I need to pursue my rights under ${LAW.LIABILITY}.`,
};
function prior(i: LetterInput) {
  const d = i.cases.map((c) => c.priorMailedAt).filter(Boolean).sort()[0];
  return d ? ` in a letter mailed on ${fmt(d)}` : "";
}

const CLOSING: Record<Step, string> = {
  CRA_INVESTIGATION: `You are required to complete a reasonable reinvestigation within 30 days of receiving this letter (${LAW.REINVESTIGATE}), to forward all relevant information I have provided to the furnisher (${LAW.FORWARD_TO_FURNISHER}), and to delete or modify any information that is inaccurate, incomplete, or cannot be verified (${LAW.DELETE_UNVERIFIED}). Please send me written notice of the results and an updated copy of my report (${LAW.RESULTS_NOTICE}).`,
  METHOD_OF_VERIFICATION: `Please send the procedure description and the results of your reinvestigation to the address above.`,
  FAILURE_TO_INVESTIGATE: `Please confirm the deletions in writing.`,
  CURE_FRIVOLOUS: `Please send me written notice of the results and an updated copy of my report (${LAW.RESULTS_NOTICE}).`,
  FURNISHER_DIRECT: `Please send your written response to the address above.`,
  ESCALATION: `Please respond in writing within 30 days.`,
};

export function recipientAddress(i: Pick<LetterInput, "recipientType" | "recipientBureau" | "recipientName">) {
  return i.recipientType === "cra" && i.recipientBureau
    ? BUREAU_ADDRESS[i.recipientBureau]
    : `${i.recipientName}\n[Dispute address shown for this company on your credit report]`;
}

/** Builds the letter from the recorded facts only. Nothing is added that is not in a finding. */
export function composeLetter(i: LetterInput): string {
  const c = i.client;
  const collector = i.step === "FURNISHER_DIRECT" && i.cases.some((x) => x.isCollection);
  const parts = [
    `${c.name}\n${c.address}\n${c.city}, ${c.state} ${c.zip}`,
    fmt(i.date),
    recipientAddress(i),
    `RE: ${STEP_NAME[i.step]}\nName: ${c.name}\nDate of birth: ${fmt(c.dob)}\nSocial Security number: XXX-XX-${c.ssnLast4}`,
    `To whom it may concern:`,
    INTRO[i.step](i),
    ...i.cases.map((x, n) => itemBlock(x, n + 1, i.recipientType === "furnisher")),
    CLOSING[i.step],
    ...(collector ? [`If you are collecting this debt on behalf of another company, I also request validation of the debt, including the name and address of the original creditor (${LAW.FDCPA_VALIDATION}). A debt I have disputed must be reported as disputed (${LAW.FDCPA_DISPUTED}).`] : []),
    `Enclosures: copy of my government-issued photo ID; proof of my current address${i.cases.some((x) => x.findings.some((f) => f.code === "CONSUMER_IDENTITY_THEFT")) ? "; identity theft report" : ""}.`,
    `Sincerely,\n\n\n${c.name}`,
  ];
  return parts.join("\n\n");
}
