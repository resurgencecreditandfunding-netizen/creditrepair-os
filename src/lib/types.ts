export type Bureau = "EQ" | "EX" | "TU";
export const BUREAUS: Bureau[] = ["EQ", "EX", "TU"];
export const BUREAU_NAME: Record<Bureau, string> = { EQ: "Equifax", EX: "Experian", TU: "TransUnion" };

export type AccountKind = "revolving" | "installment" | "mortgage" | "auto" | "student" | "collection" | "other";
export type AccountStatus =
  | "current" | "late" | "chargeoff" | "collection" | "repossession"
  | "bankruptcy" | "settled" | "paid" | "closed";

/** How ONE bureau reports an account. Dates are ISO (YYYY-MM-DD). */
export interface BureauView {
  status: AccountStatus;
  balance: number;
  pastDue?: number;
  creditLimit?: number;
  dateOpened?: string;
  dateClosed?: string;
  /** Date of first delinquency: the date that starts the 7-year reporting clock. */
  dofd?: string;
  lastReported?: string;
  lates?: { month: string; days: 30 | 60 | 90 | 120 }[];
}

export interface Account {
  id: string;
  creditor: string;
  accountMask: string;
  kind: AccountKind;
  originalCreditor?: string;
  isMedical?: boolean;
  responsibility?: "individual" | "joint" | "authorized_user";
  bureaus: Partial<Record<Bureau, BureauView>>;
}

export interface Inquiry { id: string; bureau: Bureau; creditor: string; date: string }
export interface PublicRecord {
  id: string;
  type: "bankruptcy_ch7" | "bankruptcy_ch13";
  filed: string;
  bureaus: Bureau[];
}
export interface PersonalInfo { names: string[]; addresses: string[]; employers: string[] }

export interface CreditReport {
  pulledAt: string;
  source: string;
  scores: Partial<Record<Bureau, number>>;
  personal: Partial<Record<Bureau, PersonalInfo>>;
  accounts: Account[];
  inquiries: Inquiry[];
  publicRecords: PublicRecord[];
}

export type ItemType = "account" | "inquiry" | "public_record" | "personal";

export type AssertionReason =
  | "not_mine" | "identity_theft" | "never_late" | "wrong_balance"
  | "paid_in_full" | "unauthorized_inquiry" | "wrong_personal" | "other";

/** Something the consumer tells us is wrong. The system never invents these. */
export interface Assertion { itemType: ItemType; itemId: string; reason: AssertionReason; note?: string }

export interface Finding {
  code: string;
  source: "system" | "consumer";
  itemType: ItemType;
  itemId: string;
  itemLabel: string;
  bureau: Bureau;
  severity: "high" | "medium" | "low";
  title: string;
  /** The specific, checkable fact. This sentence goes into the letter. */
  fact: string;
  statutes: string[];
  action: "delete" | "correct" | "investigate";
}

export type Step =
  | "CRA_INVESTIGATION"        // round 1, always
  | "METHOD_OF_VERIFICATION"   // round 2 after "verified"
  | "FAILURE_TO_INVESTIGATE"   // round 2 after no response
  | "CURE_FRIVOLOUS"           // round 2 after a frivolous notice
  | "FURNISHER_DIRECT"         // round 3
  | "ESCALATION"               // round 4
  | "IDENTITY_THEFT_BLOCK"     // round 1, own track: identity theft items
  | "REINSERTION";             // a deleted item came back

export type Outcome = "deleted" | "corrected" | "verified" | "no_response" | "frivolous";
