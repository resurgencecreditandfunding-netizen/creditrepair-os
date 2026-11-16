import { addMonths, today } from "./dates";
import { Bureau, BUREAUS, CreditReport } from "./types";

/** Demo data only. Dates are relative to today so the examples never go stale. */
export function sampleReport(): CreditReport {
  const t = today();
  const ago = (m: number) => addMonths(t, -m);
  const mo = (m: number) => ago(m).slice(0, 7);
  return {
    pulledAt: t, source: "demo sample",
    scores: { EQ: 584, EX: 597, TU: 591 },
    personal: {
      EQ: { names: ["Jordan A Rivers"], addresses: ["418 Maple Court, Columbus, OH 43004", "77 Old Quarry Rd, Dayton, OH 45402"], employers: ["Rivers Mobile Detailing"] },
      EX: { names: ["Jordan A Rivers", "Jordon Rivers"], addresses: ["418 Maple Court, Columbus, OH 43004"], employers: [] },
      TU: { names: ["Jordan A Rivers"], addresses: ["418 Maple Court, Columbus, OH 43004"], employers: ["Rivers Mobile Detailing"] },
    },
    accounts: [
      { id: "acc_card1", creditor: "First Harbor Bank", accountMask: "****4410", kind: "revolving", responsibility: "individual", bureaus: {
        EQ: { status: "current", balance: 1840, creditLimit: 4000, dateOpened: ago(74), lastReported: ago(1) },
        EX: { status: "current", balance: 1840, creditLimit: 4000, dateOpened: ago(74), lastReported: ago(1) },
        TU: { status: "current", balance: 1840, creditLimit: 4000, dateOpened: ago(74), lastReported: ago(1) } } },
      { id: "acc_auto", creditor: "Lakeline Auto Finance", accountMask: "****0093", kind: "auto", responsibility: "individual", bureaus: {
        EQ: { status: "paid", balance: 0, dateOpened: ago(60), dateClosed: ago(14), lastReported: ago(14), lates: [{ month: mo(9), days: 30 }] },
        EX: { status: "paid", balance: 0, dateOpened: ago(60), dateClosed: ago(14), lastReported: ago(14) },
        TU: { status: "paid", balance: 0, dateOpened: ago(60), dateClosed: ago(14), lastReported: ago(14) } } },
      { id: "acc_store", creditor: "Northgate Retail Card", accountMask: "****7781", kind: "revolving", responsibility: "individual", bureaus: {
        EQ: { status: "chargeoff", balance: 2315, pastDue: 2315, creditLimit: 2000, dateOpened: ago(70), dofd: ago(38), lastReported: ago(2) },
        EX: { status: "chargeoff", balance: 2315, pastDue: 2315, creditLimit: 2000, dateOpened: ago(70), dofd: ago(33), lastReported: ago(2) },
        TU: { status: "chargeoff", balance: 0, creditLimit: 2000, dateOpened: ago(70), dofd: ago(38), lastReported: ago(2) } } },
      { id: "acc_coll1", creditor: "Meridian Recovery Group", accountMask: "****5521", kind: "collection", originalCreditor: "Northgate Retail Card", responsibility: "individual", bureaus: {
        EQ: { status: "collection", balance: 2610, dateOpened: ago(20), dofd: ago(38), lastReported: ago(1) },
        EX: { status: "collection", balance: 2610, dateOpened: ago(20), dofd: ago(20), lastReported: ago(1) } } },
      { id: "acc_med", creditor: "Summit Health Collections", accountMask: "****1207", kind: "collection", originalCreditor: "Valley Urgent Care", isMedical: true, responsibility: "individual", bureaus: {
        EQ: { status: "collection", balance: 312, dateOpened: ago(16), dofd: ago(22), lastReported: ago(1) },
        TU: { status: "collection", balance: 312, dateOpened: ago(16), dofd: ago(22), lastReported: ago(1) } } },
      { id: "acc_old", creditor: "Pioneer Telecom", accountMask: "****3390", kind: "collection", originalCreditor: "Pioneer Telecom", responsibility: "individual", bureaus: {
        TU: { status: "collection", balance: 486, dateOpened: ago(80), dofd: ago(95), lastReported: ago(3) } } },
      { id: "acc_loan", creditor: "Crestview Lending", accountMask: "****8834", kind: "installment", responsibility: "individual", bureaus: {
        EX: { status: "settled", balance: 940, dateOpened: ago(48), dateClosed: ago(11), dofd: ago(19), lastReported: ago(11) },
        TU: { status: "settled", balance: 0, dateOpened: ago(48), dateClosed: ago(11), dofd: ago(19), lastReported: ago(11) } } },
      { id: "acc_card2", creditor: "Bluewater Credit Union", accountMask: "****2256", kind: "revolving", responsibility: "individual", bureaus: {
        EQ: { status: "current", balance: 410, creditLimit: 1500, dateOpened: ago(29), lastReported: ago(1) },
        EX: { status: "current", balance: 410, creditLimit: 1500, dateOpened: ago(29), lastReported: ago(1) },
        TU: { status: "current", balance: 410, creditLimit: 1500, dateOpened: ago(29), lastReported: ago(1) } } },
    ],
    inquiries: [
      { id: "inq1", bureau: "EQ", creditor: "Lakeline Auto Finance", date: ago(3) },
      { id: "inq2", bureau: "EX", creditor: "Corvane Financial", date: ago(2) },
      { id: "inq3", bureau: "TU", creditor: "First Harbor Bank", date: ago(15) },
    ],
    publicRecords: [],
  };
}

/**
 * Demo stand-in for a fresh bureau pull: removes what was recorded as deleted and
 * lifts the scores. A real integration replaces this with a new report from the provider.
 */
export function simulateRefresh(prev: CreditReport, deleted: { itemType: string; itemId: string; bureau: Bureau }[]): CreditReport {
  const r: CreditReport = JSON.parse(JSON.stringify(prev));
  const lift: Record<Bureau, number> = { EQ: 0, EX: 0, TU: 0 };
  for (const d of deleted) {
    if (d.itemType === "account") {
      const a = r.accounts.find((x) => x.id === d.itemId);
      if (a?.bureaus[d.bureau]) { delete a.bureaus[d.bureau]; lift[d.bureau] += 16; }
    } else if (d.itemType === "inquiry") {
      const n = r.inquiries.length;
      r.inquiries = r.inquiries.filter((i) => i.id !== d.itemId);
      if (r.inquiries.length < n) lift[d.bureau] += 3;
    }
  }
  r.accounts = r.accounts.filter((a) => Object.keys(a.bureaus).length);
  for (const b of BUREAUS) if (r.scores[b]) r.scores[b] = Math.min(790, r.scores[b]! + lift[b]);
  return { ...r, pulledAt: today(), source: "demo refresh" };
}
