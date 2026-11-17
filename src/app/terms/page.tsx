import type { Metadata } from "next";
import Link from "next/link";
import { contactEmail } from "@/components/LegalLinks";
import { LegalPage } from "@/components/LegalPage";
import { PLAN_LABEL } from "@/lib/billing";
import { getTenant } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms of use | Leverage IQ", description: "The terms for using Leverage IQ." };

const UPDATED = "November 18, 2026";

export default function Terms() {
  const t = getTenant("default");
  const company = t.legal_name ?? t.name;
  const email = contactEmail();
  return (
    <LegalPage title="Terms of use" updated={UPDATED}>
      <p>These terms govern your use of leverageiq100.com and the Leverage IQ platform, operated by {company} (&ldquo;we,&rdquo; &ldquo;us&rdquo;). By creating an account or using the platform, you agree to them. Please also read our <Link href="/privacy">privacy policy</Link>.</p>

      <h2>1. Who may use Leverage IQ</h2>
      <p>You must be at least 18 and live in the United States. You must give accurate information and keep it up to date, and you may use the platform only for your own credit file or, as an operator, for clients who have authorized you.</p>

      <h2>2. Clients: your Credit Services Agreement comes first</h2>
      <p>If you use Leverage IQ to dispute information on your credit reports, the services, their price and your cancellation rights are set out in the Credit Services Agreement and disclosures you signed. They are always available on the Documents page of your account. If those documents and these terms conflict, your Credit Services Agreement controls.</p>
      <p>You have the right to dispute inaccurate information with the credit bureaus yourself at no cost. Nothing in these terms limits any right you have under the Credit Repair Organizations Act or any other law that cannot be waived.</p>

      <h2>3. What we do and don't do</h2>
      <ul>
        <li>We help you find information on your reports that may be inaccurate, incomplete or unverifiable, and prepare dispute letters for you to review, approve and mail.</li>
        <li>We do not guarantee any result, any change to your credit scores, the removal of any item, or approval for any loan or credit. Accurate, current and verifiable information cannot lawfully be removed.</li>
        <li>We are not a law firm and do not give legal, tax or financial advice. We are not a lender and do not make credit decisions.</li>
        <li>Automated tools, including AI, help read documents and suggest results. You are responsible for checking them, and nothing is recorded or mailed until you confirm it.</li>
      </ul>

      <h2>4. Your responsibilities</h2>
      <ul>
        <li>Dispute only information you believe is inaccurate, incomplete or unverifiable.</li>
        <li>Make only true statements to credit bureaus, creditors and lenders. Never misstate your income, identity or any other fact on a dispute or application.</li>
        <li>Keep your sign-in links and passwords to yourself, and tell us right away if you think your account has been used without your permission.</li>
        <li>Do not misuse the platform: no attempts to access other people's accounts or data, no copying or scraping, no interference with its security or operation, and no use that breaks the law.</li>
      </ul>

      <h2>5. Operators</h2>
      <p>If you use the operator console for a business:</p>
      <ul>
        <li><strong>Subscription.</strong> Your subscription is {PLAN_LABEL}, billed in advance each month through Stripe, and renews automatically until you cancel. You can cancel at any time from the Billing page; cancellation takes effect at the end of the current billing period, and we do not refund partial months. We will tell you before any price change takes effect.</li>
        <li><strong>Your clients and the law.</strong> Your business is responsible for its relationship with its clients and for following every law that applies to it. That includes the Credit Repair Organizations Act, state credit services laws (including any registration or bond requirements), the Telemarketing Sales Rule, the TCPA, CAN-SPAM, and the rule against charging clients for credit repair before services are fully performed. Leverage IQ provides compliance tools but does not make your business compliant.</li>
        <li><strong>Invitations.</strong> Invite only people you have an existing relationship with, and only by the means the platform provides.</li>
        <li><strong>Client information.</strong> Use client information only to serve those clients, keep your staff logins secure, and remove access for anyone who leaves your business.</li>
        <li><strong>Revenue share.</strong> Any share of funding commissions is governed by a separate written agreement with us. Nothing on the platform, including figures shown on your Funding page, is a promise of earnings.</li>
        <li><strong>Suspension.</strong> We may suspend or end an operator account that misuses the platform, harms clients, breaks the law or doesn't pay.</li>
        <li><strong>Indemnity.</strong> You will defend and hold us harmless from claims arising from your business's services to its clients or your breach of these terms, except to the extent the claim is caused by our own breach.</li>
      </ul>

      <h2>6. Third-party services</h2>
      <p>The platform links to services we don't control, such as credit monitoring providers, credit bureau freeze pages and lenders. Their own terms and fees apply, and we may earn a commission when you sign up for a partner service through our links, as disclosed where those links appear.</p>

      <h2>7. Content and ownership</h2>
      <p>You keep ownership of the information and documents you upload. You give us permission to use them only to operate the platform for you and as described in our privacy policy. We own the platform, its software, design and content, and the Leverage IQ name and logo; these terms do not give you any rights in them beyond using the platform as intended.</p>

      <h2>8. Disclaimers and limits of liability</h2>
      <p>Except as stated in your Credit Services Agreement or where the law does not allow it, the platform is provided &ldquo;as is,&rdquo; without warranties of any kind, and we are not liable for indirect, incidental, special or consequential damages, or lost profits. For operators, our total liability for any claim relating to the platform is limited to the amount you paid us in the twelve months before the claim. These limits do not apply to rights you have under consumer protection laws that cannot be waived.</p>

      <h2>9. Ending your use</h2>
      <p>You can stop using the platform at any time. Clients can cancel from the Documents page; operators can cancel from the Billing page. We may suspend or end access for a breach of these terms or where the law requires. Sections that by their nature should continue after an account ends will continue.</p>

      <h2>10. Governing law</h2>
      <p>These terms are governed by the laws of the State of Florida and applicable federal law. Any dispute will be heard in the state or federal courts located in Volusia County, Florida, unless the law gives you the right to bring it elsewhere.</p>

      <h2>11. Changes</h2>
      <p>We may update these terms. If a change is material, we will update the date above and tell you by email or in your account before it takes effect. Continuing to use the platform after that means you accept the change.</p>

      <h2>12. Contact</h2>
      <p>{company}<br />{t.address}<br /><a href={`mailto:${email}`}>{email}</a></p>
    </LegalPage>
  );
}
