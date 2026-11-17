import type { Metadata } from "next";
import Link from "next/link";
import { contactEmail } from "@/components/LegalLinks";
import { LegalPage } from "@/components/LegalPage";
import { getTenant } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy policy | Leverage IQ", description: "How Leverage IQ collects, uses and protects your information." };

const UPDATED = "November 18, 2026";

export default function Privacy() {
  const t = getTenant("default");
  const company = t.legal_name ?? t.name;
  const email = contactEmail();
  return (
    <LegalPage title="Privacy policy" updated={UPDATED}>
      <p>This policy explains what information {company} (&ldquo;we,&rdquo; &ldquo;us&rdquo;), which operates Leverage IQ, collects, how we use it, who we share it with, and the choices you have. It applies to leverageiq100.com, the Leverage IQ client accounts and operator console, and our emails and text messages.</p>
      <p>If you signed up through a credit repair company, tax professional or funding broker that uses Leverage IQ (an &ldquo;operator&rdquo;), that company can see your account and has its own privacy practices. We process your information on its behalf and as described here.</p>

      <h2>Information we collect</h2>
      <h3>Information you give us</h3>
      <ul>
        <li><strong>Account details:</strong> name, email address, mobile number, mailing address, date of birth, the last four digits of your Social Security number, and information about your business and funding goals.</li>
        <li><strong>Credit reports:</strong> the reports you upload, including accounts, balances, payment history, inquiries, personal information and scores.</li>
        <li><strong>Your dispute information:</strong> the items you tell us are wrong or accurate, the letters we prepare, your approvals, mailing and tracking details, and replies you upload from credit bureaus and creditors.</li>
        <li><strong>Secondary-bureau freezes:</strong> which freezes you placed and any confirmation numbers you choose to record.</li>
        <li><strong>Funding requests:</strong> what you share when you ask for a funding review.</li>
        <li><strong>Signatures and records:</strong> your electronic signature, the documents you signed, and the time, IP address and browser used.</li>
        <li><strong>Operators:</strong> company and legal name, business address, staff names and email addresses, branding, and the client lists you upload to send invitations.</li>
      </ul>
      <h3>Information collected automatically</h3>
      <ul>
        <li><strong>Device and usage information:</strong> IP address, browser type, pages visited on our public site, and the date and time of visits.</li>
        <li><strong>Campaign information:</strong> if you arrive from a tagged link or ad, the campaign it belonged to.</li>
        <li><strong>Cookies:</strong> described under &ldquo;Cookies and advertising&rdquo; below.</li>
      </ul>
      <h3>Payments</h3>
      <p>Payments are processed by Stripe. We receive confirmation of the payment and its amount, but we never see or store your full card number.</p>

      <h2>How we use your information</h2>
      <ul>
        <li>To provide the services you signed up for: auditing your reports, preparing your dispute letters, tracking deadlines, reading replies, and showing your progress.</li>
        <li>To send you account messages: sign-in links, reminders about steps waiting on you, and responses to your requests.</li>
        <li>To review funding options when you ask us to.</li>
        <li>To process payments and operator subscriptions.</li>
        <li>To keep records required by law, including your signed agreements and the disclosures you received.</li>
        <li>To protect accounts, prevent fraud and misuse, and fix problems.</li>
        <li>To measure and improve our advertising, as described below.</li>
      </ul>

      <h2>Automated and AI processing</h2>
      <p>We use automated rules to find possible errors on your reports and to choose the next step in your disputes. We use an AI service provider, Anthropic, to read the reports and replies you upload and, if you ask, to reword a letter. These documents are sent to the provider only to perform that task. Under its commercial terms, the provider does not use them to train its models. You review every finding and approve every letter before anything is mailed.</p>

      <h2>Who we share information with</h2>
      <ul>
        <li><strong>Service providers</strong> who run parts of Leverage IQ for us, under contracts that limit their use of your information: hosting (Render), email (Resend), text messages (Twilio), payments (Stripe) and AI document reading (Anthropic).</li>
        <li><strong>Your operator,</strong> if you signed up through one. They see your account, findings, letters, progress and funding requests.</li>
        <li><strong>Credit bureaus and creditors</strong> receive the dispute letters you approve and mail yourself.</li>
        <li><strong>Funding partners,</strong> only if you request a funding review and only what is needed to review your options. We tell you before you apply if a lender may pay us.</li>
        <li><strong>Advertising partners:</strong> see &ldquo;Cookies and advertising.&rdquo;</li>
        <li><strong>Legal and safety:</strong> when required by law, legal process or to protect rights and safety.</li>
        <li><strong>Business transfers:</strong> to a buyer or successor if our business is sold or reorganized, subject to this policy.</li>
      </ul>
      <p><strong>We do not sell your personal information for money.</strong> We never share the contents of your credit reports, your findings, your letters or your scores with advertising partners.</p>
      <p><strong>Text messages:</strong> no mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Your consent to receive texts is not shared with anyone.</p>

      <h2>Cookies and advertising</h2>
      <p>We use cookies that keep you signed in and remember which campaign link brought you to us. On our public pages only (the home page, the professionals page and sign-up pages), we use the Meta Pixel. When you create an account, sign, start checkout, pay or subscribe, our server tells Meta through its Conversions API. Those messages contain the event, any amount paid, and your email address, phone number, name, city, state and ZIP code in scrambled (hashed) form, plus your IP address, browser type and Meta&rsquo;s own cookie identifiers. Meta uses this to measure and improve our ads. We never place the pixel inside your account, and we never send report contents.</p>
      <p>Under some state laws, including California&rsquo;s, sharing information for advertising can count as &ldquo;sharing&rdquo; or &ldquo;targeted advertising.&rdquo; You can opt out on our <Link href="/privacy/choices">Your privacy choices</Link> page. We also honor the Global Privacy Control signal sent by your browser: when it is on, we do not load the pixel or send events about you to Meta.</p>

      <h2>Your choices</h2>
      <ul>
        <li><strong>Reminders and texts:</strong> turn them off on the Documents page of your account, or reply STOP to any text.</li>
        <li><strong>Invitation emails:</strong> use the unsubscribe link in the email.</li>
        <li><strong>Advertising:</strong> opt out on <Link href="/privacy/choices">Your privacy choices</Link>, or turn on Global Privacy Control in your browser.</li>
        <li><strong>Cancel:</strong> you can cancel your services at any time from the Documents page of your account.</li>
      </ul>

      <h2>Your rights</h2>
      <p>Depending on where you live, you may have the right to know what personal information we hold about you, to get a copy, to correct it, to delete it, and to opt out of targeted advertising. To make a request, email <a href={`mailto:${email}`}>{email}</a> from the address on your account. We will confirm your identity before acting, respond within the time the law allows, and not treat you differently for using your rights. You may use an authorized agent; we will ask for proof of their authority. Some information, such as your signed agreements and the records of your disputes, we must keep for legal reasons even after a deletion request, and we will tell you if that applies.</p>

      <h2>How long we keep information</h2>
      <p>We keep your information while your account is open and afterward for as long as needed to meet legal, tax and record-keeping obligations and to resolve disputes, generally up to five years after your services end. We then delete it or make it anonymous.</p>

      <h2>How we protect information</h2>
      <p>We use encryption in transit (HTTPS), access controls that limit each operator to its own clients, one-time sign-in links instead of reusable passwords for clients, and activity records. We store only the last four digits of your Social Security number. No system is perfectly secure; if a breach affects you, we will notify you as the law requires.</p>

      <h2>Children</h2>
      <p>Leverage IQ is for adults 18 and older. We do not knowingly collect information from anyone under 18.</p>

      <h2>Changes to this policy</h2>
      <p>If we make material changes, we will update the date above and, where required, tell you by email or in your account before the changes take effect.</p>

      <h2>Contact us</h2>
      <p>{company}<br />{t.address}<br /><a href={`mailto:${email}`}>{email}</a></p>
    </LegalPage>
  );
}
