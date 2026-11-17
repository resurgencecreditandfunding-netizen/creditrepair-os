import { createHash } from "node:crypto";

export interface Brand { name: string; address: string; legalName?: string | null; /** The platform company, when the client signs with a licensed operator. */ platform?: string | null }
/** The company that is party to the contract. The product name is shown only as the service name. */
const party = (b: Brand) => b.legalName && b.legalName !== b.name ? `${b.legalName} (which provides this service under the name ${b.name})` : b.name;
const co = (b: Brand) => b.legalName || b.name;
export interface Doc { key: string; version: string; title: string; body: string; hash: string }

const V = "2026-11-draft1";

/** Statutory text of the disclosure required by CROA § 405(a), 15 U.S.C. § 1679c(a). Do not edit. */
const CROA_DISCLOSURE = `Consumer Credit File Rights Under State and Federal Law

You have a right to dispute inaccurate information in your credit report by contacting the credit bureau directly. However, neither you nor any "credit repair" company or credit repair organization has the right to have accurate, current, and verifiable information removed from your credit report. The credit bureau must remove accurate, negative information from your report only if it is over 7 years old. Bankruptcy information can be reported for 10 years.

You have a right to obtain a copy of your credit report from a credit bureau. You may be charged a reasonable fee. There is no fee, however, if you have been turned down for credit, employment, insurance, or a rental dwelling because of information in your credit report within the preceding 60 days. The credit bureau must provide someone to help you interpret the information in your credit file. You are entitled to receive a free copy of your credit report if you are unemployed and intend to apply for employment in the next 60 days, if you are a recipient of public welfare assistance, or if you have reason to believe that there is inaccurate information in your credit report due to fraud.

You have a right to sue a credit repair organization that violates the Credit Repair Organization Act. This law prohibits deceptive practices by credit repair organizations.

You have the right to cancel your contract with any credit repair organization for any reason within 3 business days from the date you signed it.

Credit bureaus are required to follow reasonable procedures to ensure that the information they report is accurate. However, mistakes may occur.

You may, on your own, notify a credit bureau in writing that you dispute the accuracy of information in your credit file. The credit bureau must then reinvestigate and modify or remove inaccurate or incomplete information. The credit bureau may not charge any fee for this service. Any pertinent information and copies of all documents you have concerning an error should be given to the credit bureau.

If the credit bureau's reinvestigation does not resolve the dispute to your satisfaction, you may send a brief statement to the credit bureau, to be kept in your file, explaining why you think the record is inaccurate. The credit bureau must include a summary of your statement about disputed information with any report it issues about you.

The Federal Trade Commission regulates credit bureaus and credit repair organizations. For more information contact:

The Public Reference Branch
Federal Trade Commission
Washington, D.C. 20580`;

function doc(key: string, title: string, body: string): Doc {
  return { key, version: V, title, body, hash: createHash("sha256").update(body).digest("hex") };
}

export function disclosureDoc(): Doc {
  return doc("croa_disclosure", "Consumer Credit File Rights", CROA_DISCLOSURE);
}

export function contractDocs(b: Brand, cancelBy: string): Doc[] {
  return [
    doc("esign_consent", "Consent to Electronic Records and Signatures",
`You agree to receive this agreement, the required disclosures, and all later notices from ${co(b)} electronically, and to sign electronically. Your electronic signature has the same effect as a handwritten one.

You can ask for paper copies at any time at no charge, and you can withdraw this consent by writing to ${co(b)}, ${b.address}. You need a device with a web browser and the ability to view and save PDF or web pages. Copies of everything you sign stay available in your account under Documents.`),

    doc("service_agreement", "Credit Services Agreement",
`This agreement is between you and ${party(b)}, ${b.address}.

1. Price. The total cost of these services is $0.00. There is no setup fee, no monthly fee, and no fee of any kind for the credit services. No payment is due now or later.

2. Services we will perform.
   (a) Obtain your credit reports with your consent and review them for information that is inaccurate, incomplete, outdated, or unverifiable.
   (b) Show you each item we identify and the specific reason for it. You decide which items to dispute. We dispute only items you tell us are inaccurate, incomplete, or unverifiable.
   (c) Prepare dispute letters in your name to the credit bureaus and, where appropriate, to the companies that furnished the information, and mail them after you have reviewed and approved each one.
   (d) Track response deadlines, record the results, and prepare follow-up letters in rounds.
   (e) Show you your progress and your readiness for financing.

3. Timing. Each round takes about 35 to 45 days. We estimate the services will be complete within 6 months of the date you sign, and they end earlier if you cancel or when every round is finished.

4. No guarantee. We do not guarantee any result, any change to your credit score, the removal of any item, or approval for any loan or credit. Accurate, current, and verifiable information cannot lawfully be removed from a credit report, and we will not attempt to remove it.

5. Your promises. You will give us truthful information. You will not ask us to dispute information you know to be accurate. You will not make any false statement to a credit bureau, creditor, or lender.

6. Your rights. You may dispute information with the credit bureaus yourself at no cost. You do not need us to do it.

7. Cancelling. You may stop the services at any time, for any reason, at no cost.

YOU MAY CANCEL THIS CONTRACT WITHOUT PENALTY OR OBLIGATION AT ANY TIME BEFORE MIDNIGHT OF THE 3RD BUSINESS DAY AFTER THE DATE ON WHICH YOU SIGNED THE CONTRACT. SEE THE ATTACHED NOTICE OF CANCELLATION FORM FOR AN EXPLANATION OF THIS RIGHT.`),

    doc("notice_of_cancellation", "Notice of Cancellation",
`You may cancel this contract, without any penalty or obligation, at any time before midnight of the 3rd day which begins after the date the contract is signed by you.

To cancel this contract, mail or deliver a signed, dated copy of this cancellation notice, or any other written notice, to ${co(b)} at ${b.address} before midnight on ${cancelBy}. You may also cancel with one click from the Documents page of your account.

I hereby cancel this transaction.

Date: ____________________

Signature: ____________________`),

    doc("limited_authorization", "Limited Authorization",
`You authorize ${co(b)} to (1) obtain your consumer credit reports for the purpose of reviewing them with you, and (2) prepare and mail correspondence in your name to credit bureaus and to companies that furnish information about you, only after you have reviewed and approved the specific letter.

This authorization does not let us sign contracts for you, apply for credit for you, or speak to anyone as if we were you. You can revoke it at any time by cancelling.`),

    doc("funding_disclosure", "How We Are Paid, and Your Funding Options",
`The credit services are free. ${co(b)} is paid only if you later choose a financing product through us. In that case the lender or partner may pay us a fee or commission, and we will tell you about that compensation before you apply.${b.platform ? ` Funding is arranged through our platform partner, ${b.platform}, which may receive a fee or commission from the lender and may share part of it with ${co(b)}.` : ""}

You are never required to apply for, or accept, any financing. Choosing not to seek funding does not affect your credit services and creates no charge.

Funding options open in your account when your credit score has improved or already meets lender requirements. We do not make loans, and we do not guarantee approval, an amount, or terms. Any application you submit must be truthful and complete.`),
  ];
}
