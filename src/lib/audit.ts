import { addDays, addYears, fmt, monthsBetween } from "./dates";
import { LAW } from "./law";
import {
  Account, Assertion, Bureau, BUREAU_NAME, BUREAUS, BureauView, CreditReport, Finding,
} from "./types";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const NEGATIVE = new Set(["late", "chargeoff", "collection", "repossession", "bankruptcy", "settled"]);

export const isNegativeView = (v: BureauView) => NEGATIVE.has(v.status) || (v.lates?.length ?? 0) > 0;
export const isNegative = (a: Account) => Object.values(a.bureaus).some((v) => v && isNegativeView(v));
export const accountLabel = (a: Account) => `${a.creditor}, account ${a.accountMask}`;

function views(a: Account): [Bureau, BureauView][] {
  return BUREAUS.filter((b) => a.bureaus[b]).map((b) => [b, a.bureaus[b]!]);
}
function others(all: [Bureau, BureauView][], me: Bureau, pick: (v: BureauView) => string | undefined) {
  const mine = pick(all.find(([b]) => b === me)![1]);
  // Name only the bureaus whose version actually differs from this one.
  return all.filter(([b, v]) => b !== me && pick(v) !== mine)
    .map(([b, v]) => `${BUREAU_NAME[b]} reports ${pick(v) ?? "nothing"}`).join("; ");
}

/**
 * Deterministic audit. Every finding is a fact that can be checked against the report,
 * or a statement the consumer made. An item with no finding is never disputed.
 */
export function auditReport(report: CreditReport, assertions: Assertion[], asOf: string): Finding[] {
  const out: Finding[] = [];

  for (const a of report.accounts) {
    const all = views(a);
    const neg = isNegative(a);
    const push = (bureau: Bureau, f: Omit<Finding, "source" | "itemType" | "itemId" | "itemLabel" | "bureau">) =>
      out.push({ ...f, source: "system", itemType: "account", itemId: a.id, itemLabel: accountLabel(a), bureau });

    // --- Cross-bureau consistency: the same account cannot have two different truths.
    if (all.length > 1) {
      const distinct = (pick: (v: BureauView) => string | number | undefined) =>
        new Set(all.map(([, v]) => pick(v)).filter((x) => x !== undefined)).size > 1;

      if (distinct((v) => v.dofd)) {
        for (const [b, v] of all) if (v.dofd && others(all, b, (o) => o.dofd)) push(b, {
          code: "DOFD_MISMATCH", severity: "high", action: "correct",
          title: "Date of first delinquency differs between bureaus",
          fact: `You report the date of first delinquency as ${fmt(v.dofd)}, but ${others(all, b, (o) => o.dofd && fmt(o.dofd))}. An account has only one date of first delinquency, and that date controls how long the item may be reported.`,
          statutes: [LAW.ACCURACY, LAW.FURNISHER_DOFD, LAW.OBSOLETE_CLOCK],
        });
      }
      if (distinct((v) => v.status)) {
        for (const [b, v] of all) if (others(all, b, (o) => o.status)) push(b, {
          code: "STATUS_MISMATCH", severity: neg ? "high" : "medium", action: "correct",
          title: "Account status differs between bureaus",
          fact: `You report this account's status as "${v.status}", but ${others(all, b, (o) => `"${o.status}"`)}. The same account cannot hold different statuses at the same time.`,
          statutes: [LAW.ACCURACY, LAW.FURNISHER_ACCURACY],
        });
      }
      const bals = all.map(([, v]) => v.balance);
      const spread = Math.max(...bals) - Math.min(...bals);
      if (spread > 0 && (neg || (spread >= 100 && spread / Math.max(...bals) > 0.1))) {
        for (const [b, v] of all) push(b, {
          code: "BALANCE_MISMATCH", severity: neg ? "medium" : "low", action: "correct",
          title: "Balance differs between bureaus",
          fact: `You report a balance of ${money(v.balance)}, but ${others(all, b, (o) => money(o.balance))}.`,
          statutes: [LAW.ACCURACY, LAW.FURNISHER_ACCURACY],
        });
      }
      if (distinct((v) => v.dateOpened?.slice(0, 7))) {
        for (const [b, v] of all) if (v.dateOpened && others(all, b, (o) => o.dateOpened?.slice(0, 7))) push(b, {
          code: "OPEN_DATE_MISMATCH", severity: "low", action: "correct",
          title: "Date opened differs between bureaus",
          fact: `You report this account as opened ${fmt(v.dateOpened)}, but ${others(all, b, (o) => o.dateOpened && fmt(o.dateOpened))}.`,
          statutes: [LAW.ACCURACY],
        });
      }
    }

    // --- Per-bureau checks.
    for (const [b, v] of all) {
      const derog = ["chargeoff", "collection", "repossession", "settled"].includes(v.status);

      if (derog && v.dofd) {
        // § 605(c): the 7-year period starts 180 days after the date of first delinquency.
        const expires = addYears(addDays(v.dofd, 180), 7);
        if (asOf > expires) push(b, {
          code: "OBSOLETE", severity: "high", action: "delete",
          title: "Past the 7-year reporting limit",
          fact: `The date of first delinquency you report is ${fmt(v.dofd)}. The reporting period for this item ended on ${fmt(expires)}, so it may no longer appear in my file.`,
          statutes: [LAW.OBSOLETE, LAW.OBSOLETE_CLOCK],
        });
      }
      if (derog && !v.dofd) push(b, {
        code: "MISSING_DOFD", severity: "high", action: "investigate",
        title: "No date of first delinquency reported",
        fact: `This item is reported as "${v.status}" with no date of first delinquency. Without that date the item is incomplete and its lawful reporting period cannot be determined.`,
        statutes: [LAW.FURNISHER_DOFD, LAW.ACCURACY],
      });
      if (a.kind === "collection" && v.dofd && v.dateOpened && v.dofd >= v.dateOpened) push(b, {
        code: "COLLECTION_REAGED", severity: "high", action: "correct",
        title: "Collection appears re-aged",
        fact: `You report the date of first delinquency (${fmt(v.dofd)}) as on or after the date this collection account was opened (${fmt(v.dateOpened)}). The date of first delinquency belongs to the original debt and must come before the debt was placed for collection.`,
        statutes: [LAW.FURNISHER_DOFD, LAW.OBSOLETE_CLOCK, LAW.ACCURACY],
      });
      if (a.kind !== "collection" && v.dofd && v.dateOpened && v.dofd < v.dateOpened) push(b, {
        code: "DOFD_BEFORE_OPEN", severity: "medium", action: "correct",
        title: "Delinquency dated before the account existed",
        fact: `You report a date of first delinquency of ${fmt(v.dofd)}, which is before the account was opened on ${fmt(v.dateOpened)}.`,
        statutes: [LAW.ACCURACY],
      });
      if (["paid", "settled"].includes(v.status) && v.balance > 0) push(b, {
        code: "BALANCE_ON_PAID", severity: "high", action: "correct",
        title: "Balance reported on a paid or settled account",
        fact: `This account is reported as "${v.status}" and yet shows a balance of ${money(v.balance)}. A paid or settled account must report a $0 balance.`,
        statutes: [LAW.ACCURACY, LAW.FURNISHER_UPDATE],
      });
      if (v.status === "bankruptcy" && (v.balance > 0 || (v.pastDue ?? 0) > 0)) push(b, {
        code: "BALANCE_IN_BANKRUPTCY", severity: "high", action: "correct",
        title: "Balance reported on an account included in bankruptcy",
        fact: `This account is reported as included in bankruptcy but still shows a balance of ${money(v.balance)}${v.pastDue ? ` and ${money(v.pastDue)} past due` : ""}.`,
        statutes: [LAW.ACCURACY, LAW.FURNISHER_UPDATE],
      });
      if ((v.pastDue ?? 0) > v.balance) push(b, {
        code: "PAST_DUE_EXCEEDS_BALANCE", severity: "medium", action: "correct",
        title: "Past-due amount is larger than the balance",
        fact: `You report ${money(v.pastDue!)} past due on a total balance of ${money(v.balance)}. The past-due amount cannot exceed the balance.`,
        statutes: [LAW.ACCURACY],
      });
      if (v.dateClosed && ["paid", "settled"].includes(v.status)) {
        const after = (v.lates ?? []).filter((l) => l.month > v.dateClosed!.slice(0, 7));
        if (after.length) push(b, {
          code: "LATE_AFTER_CLOSE", severity: "high", action: "correct",
          title: "Late payment reported after the account was closed",
          fact: `You report a ${after[0].days}-day late payment for ${after[0].month}, after this account was closed and ${v.status} on ${fmt(v.dateClosed)}.`,
          statutes: [LAW.ACCURACY, LAW.FURNISHER_ACCURACY],
        });
      }
      for (const l of v.lates ?? []) {
        if (monthsBetween(`${l.month}-01`, asOf) > 84) push(b, {
          code: "OBSOLETE_LATE", severity: "medium", action: "delete",
          title: "Late payment older than 7 years",
          fact: `You report a ${l.days}-day late payment for ${l.month}, which is more than seven years old.`,
          statutes: [LAW.OBSOLETE],
        });
      }
      if (a.kind === "collection" && a.isMedical && (v.status === "paid" || v.balance < 500)) push(b, {
        code: "MEDICAL_POLICY", severity: "medium", action: "delete",
        title: "Medical collection that bureau policy excludes",
        fact: v.status === "paid"
          ? `This is a paid medical collection. Under your published policy, paid medical collections are not reported.`
          : `This is a medical collection with an original balance under $500 (${money(v.balance)}). Under your published policy, medical collections under $500 are not reported.`,
        statutes: [LAW.MEDICAL_POLICY],
      });
      if (a.responsibility === "authorized_user" && isNegativeView(v)) push(b, {
        code: "AUTHORIZED_USER_NEGATIVE", severity: "medium", action: "delete",
        title: "Negative history on an account I am only an authorized user of",
        fact: `I am listed only as an authorized user on this account. I am not contractually liable for it, and I ask that it be removed from my file.`,
        statutes: [LAW.ACCURACY],
      });
    }

    // --- The same debt reported twice with a balance (original creditor and collector).
    if (a.kind === "collection" && a.originalCreditor) {
      const orig = report.accounts.find((o) => o.id !== a.id && o.kind !== "collection" &&
        o.creditor.toLowerCase() === a.originalCreditor!.toLowerCase());
      for (const [b, v] of all) {
        const ov = orig?.bureaus[b];
        if (orig && ov && ov.balance > 0 && v.balance > 0) {
          out.push({
            code: "DUPLICATE_DEBT", source: "system", itemType: "account", itemId: orig.id, itemLabel: accountLabel(orig),
            bureau: b, severity: "high", action: "correct",
            title: "Same debt reported with a balance by two companies",
            fact: `This account shows a balance of ${money(ov.balance)}, while the same debt is also reported with a balance of ${money(v.balance)} by ${a.creditor}. A debt that was sold or transferred must report a $0 balance with the original creditor.`,
            statutes: [LAW.ACCURACY, LAW.FURNISHER_UPDATE],
          });
        }
      }
    }
  }

  // --- Bankruptcies: 10 years from the filing date.
  for (const p of report.publicRecords) {
    if (asOf > addYears(p.filed, 10)) for (const b of p.bureaus) out.push({
      code: "OBSOLETE_BANKRUPTCY", source: "system", itemType: "public_record", itemId: p.id,
      itemLabel: `Bankruptcy filed ${fmt(p.filed)}`, bureau: b, severity: "high", action: "delete",
      title: "Bankruptcy past the 10-year reporting limit",
      fact: `This bankruptcy was filed on ${fmt(p.filed)}, more than ten years ago, and may no longer be reported.`,
      statutes: [LAW.OBSOLETE],
    });
  }

  out.push(...assertionFindings(report, assertions));
  return out;
}

const ASSERT: Record<Assertion["reason"], Pick<Finding, "title" | "fact" | "statutes" | "action" | "severity">> = {
  not_mine: { title: "Consumer states: not my account", severity: "high", action: "delete",
    fact: "I have no knowledge of this item. I did not open it or authorize it, and it does not belong to me.",
    statutes: [LAW.REINVESTIGATE, LAW.ACCURACY] },
  identity_theft: { title: "Consumer states: result of identity theft", severity: "high", action: "delete",
    fact: "This item is the result of identity theft. My identity theft report is enclosed, and I ask that this information be blocked.",
    statutes: [LAW.ID_THEFT_BLOCK] },
  never_late: { title: "Consumer states: late payments are wrong", severity: "high", action: "correct",
    fact: "The late payment history reported on this account is inaccurate. My payments were made on time.",
    statutes: [LAW.REINVESTIGATE, LAW.FURNISHER_ACCURACY] },
  wrong_balance: { title: "Consumer states: balance is wrong", severity: "medium", action: "correct",
    fact: "The balance reported on this account is inaccurate.",
    statutes: [LAW.REINVESTIGATE, LAW.FURNISHER_ACCURACY] },
  paid_in_full: { title: "Consumer states: paid in full", severity: "high", action: "correct",
    fact: "I paid this account in full, and it is not reported that way.",
    statutes: [LAW.REINVESTIGATE, LAW.FURNISHER_UPDATE] },
  unauthorized_inquiry: { title: "Consumer states: inquiry not authorized", severity: "medium", action: "delete",
    fact: "I did not apply for credit with this company or authorize it to obtain my report, and I am not aware of any permissible purpose for this inquiry.",
    statutes: [LAW.PERMISSIBLE_PURPOSE, LAW.REINVESTIGATE] },
  wrong_personal: { title: "Consumer states: personal information is wrong", severity: "low", action: "delete",
    fact: "This personal information is not mine or is not accurate, and I ask that it be removed from my file.",
    statutes: [LAW.REINVESTIGATE, LAW.ACCURACY] },
  other: { title: "Consumer states: information is inaccurate", severity: "medium", action: "investigate",
    fact: "This information is inaccurate.", statutes: [LAW.REINVESTIGATE] },
};

function assertionFindings(report: CreditReport, assertions: Assertion[]): Finding[] {
  const out: Finding[] = [];
  for (const s of assertions) {
    let label = "", bureaus: Bureau[] = [];
    if (s.itemType === "account") {
      const a = report.accounts.find((x) => x.id === s.itemId); if (!a) continue;
      label = accountLabel(a); bureaus = BUREAUS.filter((b) => a.bureaus[b]);
    } else if (s.itemType === "inquiry") {
      const i = report.inquiries.find((x) => x.id === s.itemId); if (!i) continue;
      label = `Inquiry by ${i.creditor} on ${fmt(i.date)}`; bureaus = [i.bureau];
    } else if (s.itemType === "public_record") {
      const p = report.publicRecords.find((x) => x.id === s.itemId); if (!p) continue;
      label = `Bankruptcy filed ${fmt(p.filed)}`; bureaus = p.bureaus;
    } else {
      // personal item ids look like "EQ|address|123 Main St"
      const [b, kind, ...rest] = s.itemId.split("|");
      const value = rest.join("|");
      const list = report.personal[b as Bureau]?.[`${kind}s` as "names" | "addresses" | "employers"];
      if (!list?.includes(value)) continue;
      label = `${kind[0].toUpperCase()}${kind.slice(1)}: ${value}`; bureaus = [b as Bureau];
    }
    const t = ASSERT[s.reason];
    const note = s.note?.trim();
    for (const bureau of bureaus) out.push({
      ...t, code: `CONSUMER_${s.reason.toUpperCase()}`, source: "consumer",
      itemType: s.itemType, itemId: s.itemId, itemLabel: label, bureau,
      fact: note ? `${t.fact} ${note.endsWith(".") ? note : note + "."}` : t.fact,
    });
  }
  return out;
}
