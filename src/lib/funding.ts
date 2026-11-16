import { monthsBetween } from "./dates";
import { isNegativeView } from "./audit";
import { BUREAUS, CreditReport } from "./types";

/** Tunable per tenant later. Funding opens on improvement, or straight away if already fundable. */
export const FUNDING_RULES = { minGain: 20, fundableScore: 680 };

export function middleScore(r: CreditReport): number | null {
  const s = BUREAUS.map((b) => r.scores[b]).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.floor((s.length - 1) / 2)]; // lenders use the middle score (lower of two)
}

export interface FundingStatus {
  baseline: number | null; current: number | null; gain: number;
  unlocked: boolean; reason: string; pointsToGo: number;
  factors: { label: string; value: string; ok: boolean; tip: string }[];
}

export function fundingStatus(first: CreditReport | null, latest: CreditReport | null, asOf: string): FundingStatus {
  const baseline = first ? middleScore(first) : null;
  const current = latest ? middleScore(latest) : null;
  const gain = baseline !== null && current !== null ? current - baseline : 0;
  const { minGain, fundableScore } = FUNDING_RULES;
  let unlocked = false, reason = "Connect your credit report to begin.", pointsToGo = 0;
  if (baseline !== null && current !== null) {
    if (current >= fundableScore) { unlocked = true; reason = `Your middle score is ${current}, at or above the ${fundableScore} funding threshold.`; }
    else if (gain >= minGain) { unlocked = true; reason = `Your middle score has improved ${gain} points since you started.`; }
    else {
      pointsToGo = Math.min(minGain - gain, fundableScore - current);
      reason = `Funding opens when your middle score improves ${minGain} points or reaches ${fundableScore}.`;
    }
  }
  const factors: FundingStatus["factors"] = [];
  if (latest) {
    let limit = 0, bal = 0, oldest: string | null = null, derog = 0;
    for (const a of latest.accounts) {
      const v = BUREAUS.map((b) => a.bureaus[b]).find(Boolean)!;
      if (a.kind === "revolving" && v.status === "current" && v.creditLimit) { limit += v.creditLimit; bal += v.balance; }
      if (v.dateOpened && (!oldest || v.dateOpened < oldest)) oldest = v.dateOpened;
      if (BUREAUS.some((b) => a.bureaus[b] && isNegativeView(a.bureaus[b]!))) derog++;
    }
    const util = limit ? Math.round((bal / limit) * 100) : null;
    const recentInq = new Set(latest.inquiries.filter((i) => monthsBetween(i.date, asOf) <= 6).map((i) => `${i.creditor}|${i.date}`)).size;
    const ageYears = oldest ? Math.floor(monthsBetween(oldest, asOf) / 12) : 0;
    factors.push(
      { label: "Revolving utilization", value: util === null ? "No open cards" : `${util}%`, ok: util !== null && util <= 10, tip: "Lenders want reported balances under 10% of limits." },
      { label: "Negative accounts", value: String(derog), ok: derog === 0, tip: "Each inaccurate negative item removed or corrected helps approval odds." },
      { label: "Hard inquiries, last 6 months", value: String(recentInq), ok: recentInq <= 2, tip: "Two or fewer keeps you inside most lenders' limits." },
      { label: "Oldest account", value: `${ageYears} yr`, ok: ageYears >= 2, tip: "Two or more years of history is the usual minimum." },
    );
  }
  return { baseline, current, gain, unlocked, reason, pointsToGo, factors };
}
