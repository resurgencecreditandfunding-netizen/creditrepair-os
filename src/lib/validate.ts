import { BUREAUS, CreditReport } from "./types";

const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const STATUS = ["current", "late", "chargeoff", "collection", "repossession", "bankruptcy", "settled", "paid", "closed"];

/** Rejects anything that is not a well-formed report, whether uploaded or produced by the AI parser. */
export function validateReport(x: any): CreditReport {
  const fail = (m: string): never => { throw new Error(`Report is not valid: ${m}`); };
  if (!x || typeof x !== "object") fail("not an object");
  if (!isDate(x.pulledAt)) fail("pulledAt must be YYYY-MM-DD");
  if (!x.scores || typeof x.scores !== "object") fail("scores missing");
  for (const b of Object.keys(x.scores)) {
    if (!BUREAUS.includes(b as any)) fail(`unknown bureau ${b}`);
    if (typeof x.scores[b] !== "number" || x.scores[b] < 300 || x.scores[b] > 850) fail(`score for ${b} out of range`);
  }
  if (!Array.isArray(x.accounts)) fail("accounts must be a list");
  const ids = new Set<string>();
  for (const a of x.accounts) {
    if (!a.id || !a.creditor || !a.accountMask || !a.kind) fail("account missing id, creditor, accountMask or kind");
    if (ids.has(a.id)) fail(`duplicate account id ${a.id}`);
    ids.add(a.id);
    if (!a.bureaus || !Object.keys(a.bureaus).length) fail(`account ${a.id} has no bureau data`);
    for (const [b, v] of Object.entries<any>(a.bureaus)) {
      if (!BUREAUS.includes(b as any)) fail(`unknown bureau ${b}`);
      if (!STATUS.includes(v.status)) fail(`account ${a.id} has unknown status ${v.status}`);
      if (typeof v.balance !== "number") fail(`account ${a.id} balance must be a number`);
      for (const k of ["dateOpened", "dateClosed", "dofd", "lastReported"]) if (v[k] != null && !isDate(v[k])) fail(`account ${a.id} ${k} must be YYYY-MM-DD`);
    }
  }
  return {
    pulledAt: x.pulledAt, source: String(x.source ?? "upload"), scores: x.scores, personal: x.personal ?? {},
    accounts: x.accounts, inquiries: Array.isArray(x.inquiries) ? x.inquiries : [],
    publicRecords: Array.isArray(x.publicRecords) ? x.publicRecords : [],
  };
}
