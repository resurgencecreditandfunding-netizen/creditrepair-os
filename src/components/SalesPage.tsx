import Link from "next/link";
import { PRODUCT, TAGLINE } from "@/lib/brand";

/**
 * The platform's own sales page for direct clients.
 * Marketing rules this copy follows: no promise of removals, score gains or approvals; only inaccurate,
 * incomplete or unverifiable information is challenged; the price is stated plainly; screenshots are labelled as sample data.
 */

const CTA = ({ label = "Get started", note = true, dark = false }: { label?: string; note?: boolean; dark?: boolean }) => (
  <div className="sp-cta">
    <Link href="/start" className="btn accent big">{label}</Link>
    {note && <span className={dark ? "sp-note-dark" : "sp-note"}>Free to start. No card needed.</span>}
  </div>
);

const Shot = ({ src, w, h, alt }: { src: string; w: number; h: number; alt: string }) => (
  <figure className="sp-shot">
    <img src={src} width={w} height={h} alt={alt} loading="lazy" />
    <figcaption>Sample account with made-up data.</figcaption>
  </figure>
);

const PAINS: [string, string][] = [
  ["You don't know what's actually wrong.", "Three reports, dozens of accounts, and dates that never quite line up. Without knowing what to look for, real errors hide in plain sight."],
  ["Copy-and-paste letters get brushed off.", "Internet templates read like every other form letter the bureaus receive. Vague disputes are easy to dismiss as frivolous."],
  ["You don't know which law applies.", "Section 611, 623, 605B, method of verification. Cite the wrong rule, or none at all, and your letter carries no weight."],
  ["“Verified” stops you cold.", "The bureau says the item was verified. Now what? Most people never learn there is a second, third and fourth round, or what each one should say."],
  ["Deadlines slip and paperwork piles up.", "Bureaus get 30 days. Who did you mail, when, and what came back? Lose track and you lose your place."],
  ["You apply for funding too early.", "Applying before your profile is ready usually means a denial and another hard inquiry, and you end up further back than where you started."],
];

const FEATURES: { eyebrow: string; title: string; body: string[]; img: [string, number, number, string] }[] = [
  {
    eyebrow: "Always know your next step", title: "A journey map from your first report to funding",
    body: [
      "Fourteen clear steps, from getting your report to lifting your freezes before you apply. You always see what's done, where you are, and what comes next, with one button for the thing to do right now.",
      "When something is waiting on you, a reminder tells you. No more starting strong and losing the thread.",
    ],
    img: ["/screens/journey.webp", 1100, 502, "Journey map showing completed steps, the current step and the next step"],
  },
  {
    eyebrow: "Find the real errors", title: "Every account checked across all three bureaus",
    body: [
      "Leverage IQ compares how Equifax, Experian and TransUnion report each account and flags what doesn't add up: conflicting dates, balances on paid accounts, re-aged collections, items past the seven-year limit, duplicate accounts and more.",
      "Every finding comes with the plain-English reason and the law behind it. If something is accurate, you mark it, and it's left alone.",
    ],
    img: ["/screens/audit.webp", 1100, 604, "An account with three findings, each with the reason and the law that applies"],
  },
  {
    eyebrow: "Protect yourself first", title: "A guided secondary-bureau freeze",
    body: [
      "Before your letters go out, you freeze LexisNexis, Innovis, ChexSystems and the other secondary reporting companies, with a link to each and a place to keep your confirmation numbers.",
      "Freezes are free, don't change your scores, and you're reminded to lift them before you apply for funding.",
    ],
    img: ["/screens/freeze.webp", 1100, 908, "Freeze checklist with two bureaus frozen and three to go"],
  },
  {
    eyebrow: "Letters built for your file", title: "Dispute letters in the right order, citing the right law",
    body: [
      "No templates. Each letter is written from your specific errors, strongest items first, with the Fair Credit Reporting Act section that applies to each one.",
      "Round one asks each bureau to verify. What comes next depends on their answer: a method-of-verification demand, a deletion demand when they miss the deadline, a direct dispute to the creditor, then a final demand. Identity theft and reinserted items get letters of their own.",
      "Preview every letter free before you unlock it.",
    ],
    img: ["/screens/letter.webp", 1100, 1010, "Letter preview: the wording is visible and each item's details are hidden until unlocked"],
  },
  {
    eyebrow: "Never lose your place", title: "Every letter, deadline and reply in one place",
    body: [
      "Enter your certified-mail tracking number and the 30-day clock starts. When a reply arrives, take a photo and upload it: it's read for you, and the results are suggested for you to confirm.",
      "The next round is prepared from there, one letter per bureau at a time, so nothing overlaps.",
    ],
    img: ["/screens/disputes.webp", 1100, 611, "Disputes page listing letters by bureau with their status and response deadline"],
  },
  {
    eyebrow: "Funding the smart way", title: "Know when you're ready to apply",
    body: [
      "See what lenders look at: utilization, negative accounts, recent inquiries and account age. Funding opens when your middle score improves 20 points or reaches 680.",
      "When it does, you request a review of business funding options. Applying is always your choice.",
    ],
    img: ["/screens/funding.webp", 1100, 652, "Funding readiness: progress toward unlocking funding and the factors lenders review"],
  },
];

const FAQ: [string, string][] = [
  ["Is this legal?", "Yes. Disputing information you believe is inaccurate, incomplete or unverifiable is your right under the Fair Credit Reporting Act. We follow the Credit Repair Organizations Act: you get your rights in writing, a written agreement, three business days to cancel, and nothing is charged before your letters are complete."],
  ["Can you remove accurate negative items?", "No. Accurate, current and verifiable information can't lawfully be removed by anyone. Leverage IQ helps you challenge what's inaccurate, incomplete or can't be verified."],
  ["How long does it take?", "Each round takes about 35 to 45 days: mail time plus the bureaus' 30-day investigation. Many files need more than one round, and Leverage IQ prepares each one for you."],
  ["Do I mail the letters myself?", "Yes. You print, sign and send them by certified mail, which gives you proof of delivery. Leverage IQ tracks everything after that."],
  ["Do I have to get funding through you?", "No. Funding is optional. If you choose it, lenders may pay us a fee, and we tell you about that before you apply."],
  ["Can I do this without Leverage IQ?", "Yes. You can dispute directly with the credit bureaus at no cost. Leverage IQ is for people who want a guided path instead of figuring it out alone."],
];

export function SalesPage({ price, legalName, address }: { price: string | null; legalName: string; address: string }) {
  return (
    <div className="sp">
      <header className="sp-top">
        <div className="sp-in sp-row">
          <img src="/wordmark.png" alt={PRODUCT} width={720} height={119} className="sp-mark" />
          <nav className="sp-row" style={{ gap: 18 }}>
            <a href="#how" className="sp-link">How it works</a>
            <a href="#pricing" className="sp-link">Pricing</a>
            <Link href="/partners" className="sp-link">For professionals</Link>
            <Link href="/login" className="sp-link">Sign in</Link>
            <Link href="/start" className="btn accent">Get started</Link>
          </nav>
        </div>
      </header>

      <section className="sp-hero">
        <div className="sp-in">
          <div className="sp-eyebrow">For business owners and aspiring entrepreneurs</div>
          <h1>Stop guessing your way through credit repair. <em>Follow a guided path to funding.</em></h1>
          <p className="sp-lead">{PRODUCT} audits all three of your credit reports, shows you exactly what's wrong and why, writes your dispute letters in the right order with the right law behind them, and walks you through every step until your business is ready to apply for funding.</p>
          <CTA dark />
          <ul className="sp-trust">
            <li>Free to start</li><li>You approve every letter</li><li>Built on the Fair Credit Reporting Act</li><li>No subscription</li>
          </ul>
          <figure className="sp-shot sp-hero-shot">
            <img src="/screens/hero.webp" width={1400} height={973} alt="The Leverage IQ dashboard: three bureau scores and the journey map" />
            <figcaption>Sample account with made-up data.</figcaption>
          </figure>
        </div>
      </section>

      <section className="sp-sec" id="problem">
        <div className="sp-in">
          <h2>Doing your own credit repair shouldn't feel like guesswork</h2>
          <p className="sp-sub">You have the right to dispute errors yourself, for free. But almost everyone who tries it alone runs into the same walls.</p>
          <div className="sp-pains">
            {PAINS.map(([h, p]) => <div className="sp-pain" key={h}><h3>{h}</h3><p>{p}</p></div>)}
          </div>
          <p className="sp-bridge">That's where people stall. Not because they can't do it, but because nobody showed them the path.</p>
        </div>
      </section>

      <section className="sp-sec sp-dark" id="how">
        <div className="sp-in sp-center">
          <div className="sp-eyebrow">The solution</div>
          <h2>{PRODUCT} is the guided journey DIY credit repair never had</h2>
          <p className="sp-sub">You stay in control and you do the mailing. {PRODUCT} does the hard thinking: finding the errors, building the letters, choosing the next round, and keeping every deadline.</p>
          <CTA dark />
        </div>
      </section>

      {FEATURES.map((f, i) => (
        <section className={`sp-sec ${i % 2 ? "sp-alt" : ""}`} key={f.title}>
          <div className={`sp-in sp-feature ${i % 2 ? "sp-flip" : ""}`}>
            <div className="sp-copy">
              <div className="sp-eyebrow">{f.eyebrow}</div>
              <h2>{f.title}</h2>
              {f.body.map((p) => <p key={p}>{p}</p>)}
            </div>
            <Shot src={f.img[0]} w={f.img[1]} h={f.img[2]} alt={f.img[3]} />
          </div>
        </section>
      ))}

      <section className="sp-sec sp-dark">
        <div className="sp-in">
          <h2 className="sp-center">How it works</h2>
          <ol className="sp-steps">
            {[
              ["Create your free account", "Read your rights and sign your agreement in one click. Cancel any time."],
              ["Upload your 3-bureau report", "Get your report from a credit monitoring service and upload it. Your audit is ready in minutes."],
              ["Review, freeze and preview", "Check your findings, freeze the secondary bureaus, and preview your letters free."],
              [price ? `Unlock once for ${price}` : "Approve, print and mail", price ? "Read and approve every letter, then print and mail. Every later round is included." : "Read and approve every letter, then print and mail. We track the rest."],
            ].map(([h, p], i) => <li key={h}><span className="sp-num">{i + 1}</span><h3>{h}</h3><p>{p}</p></li>)}
          </ol>
          <div className="sp-center"><CTA dark /></div>
        </div>
      </section>

      <section className="sp-sec">
        <div className="sp-in">
          <h2 className="sp-center">Who {PRODUCT} is for</h2>
          <div className="sp-who">
            <div className="sp-who-yes">
              <h3>Built for you if</h3>
              <ul>
                <li>You own a business, or plan to, and want to qualify for business funding.</li>
                <li>You've tried disputing on your own and got stuck at "verified."</li>
                <li>You want to fix your credit yourself, with a step-by-step guide instead of guesswork.</li>
                <li>You'd rather pay once than pay a monthly fee for months.</li>
                <li>You want to understand your credit, not just hand it off and hope.</li>
              </ul>
            </div>
            <div className="sp-who-no">
              <h3>Not for you if</h3>
              <ul>
                <li>You want accurate, current information removed. The law doesn't allow it, and we won't try.</li>
                <li>You want a guaranteed score or a guaranteed loan. Nobody can honestly promise either.</li>
                <li>You want someone else to do everything. You review, approve and mail your own letters.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="sp-sec sp-alt" id="pricing">
        <div className="sp-in">
          <h2 className="sp-center">{price ? "Free to start. One payment when your letters are ready." : "Free to start."}</h2>
          <div className="sp-prices">
            <div className="sp-price">
              <div className="sp-eyebrow">Free</div>
              <div className="sp-amount">$0</div>
              <ul>
                <li>Your account and signed agreement</li><li>3-bureau audit with the reason for every finding</li>
                <li>Guided secondary-bureau freeze</li><li>Journey map and reminders</li><li>Preview of every letter</li>
              </ul>
            </div>
            {price && (
              <div className="sp-price sp-price-main">
                <div className="sp-eyebrow">Your letters</div>
                <div className="sp-amount">{price} <small>once</small></div>
                <ul>
                  <li>Every dispute letter, every round, ready to print</li><li>Method-of-verification, deletion and creditor letters as you need them</li>
                  <li>Deadline tracking and reply reading</li><li>Funding readiness and your funding review</li>
                  <li>No subscription and no monthly fees</li>
                </ul>
                <p className="sp-small">Charged only after your first letters are complete.</p>
              </div>
            )}
          </div>
          <div className="sp-center"><CTA /></div>
        </div>
      </section>

      <section className="sp-sec">
        <div className="sp-in sp-faq">
          <h2 className="sp-center">Questions</h2>
          {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="sp-sec sp-dark">
        <div className="sp-in sp-center">
          <h2>Your credit. Your call. <em>Now with a guide.</em></h2>
          <p className="sp-sub">Start free today and see exactly what's on your reports.</p>
          <CTA dark />
        </div>
      </section>

      <footer className="sp-foot">
        <div className="sp-in">
          <p>{price ? `Free to start. Your dispute letters cost ${price}, paid once when they are complete, with every later round included.` : "The credit service is free."} We may also be paid by lenders if you later choose funding through us, and you never have to. We dispute only information that is inaccurate, incomplete or unverifiable; accurate information cannot be removed. No result, score change or loan approval is guaranteed. You can dispute errors with the credit bureaus yourself at no cost.</p>
          <p>{PRODUCT} · {TAGLINE} · {legalName} · {address} · <Link href="/login">Sign in</Link> · <Link href="/partners">For professionals</Link> · <Link href="/console/login">Staff sign-in</Link></p>
        </div>
      </footer>
    </div>
  );
}
