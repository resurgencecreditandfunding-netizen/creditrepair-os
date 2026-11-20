import Link from "next/link";
import { PRODUCT } from "@/lib/brand";
import { LegalLinks } from "./LegalLinks";

/**
 * The sales page for operators: tax professionals, credit repair firms and funding brokers.
 * Copy rules: no earnings figures or percentages for the revenue share, no promised client results,
 * and a plain reminder that operators are responsible for the laws that apply to their own business.
 */

/** Operator plans are presented on the webinar, so the public page sends people there when it's set. */
const SIGNUP = process.env.WEBINAR_URL || "/console/signup";

const CTA = ({ dark = false }: { dark?: boolean }) => (
  <div className="sp-cta">
    <Link href={SIGNUP} className="btn accent big">{process.env.WEBINAR_URL ? "Watch the free training" : "Get started"}</Link>
    <span className={dark ? "sp-note-dark" : "sp-note"}>Your brand, your clients, done-for-you setup.</span>
  </div>
);

const Shot = ({ src, w, h, alt }: { src: string; w: number; h: number; alt: string }) => (
  <figure className="sp-shot">
    <img src={src} width={w} height={h} alt={alt} loading="lazy" />
    <figcaption>Sample company with made-up data.</figcaption>
  </figure>
);

const PAINS: [string, string][] = [
  ["Letters eat your week.", "Reading three reports, spotting the errors and writing every dispute by hand doesn't scale past a handful of clients."],
  ["Clients go quiet.", "They sign up excited, then stop opening emails. Chasing approvals, signatures and mail receipts becomes the job."],
  ["Round two stalls.", "The bureau says “verified.” Knowing which letter comes next, and when, lives in someone's head or a spreadsheet."],
  ["Compliance is on you.", "Disclosures, written agreements, the three-day cancellation and records of every step. Miss one and you're exposed."],
  ["Funding is the real goal.", "Your clients want capital for their business, but most credit software stops at repair and leaves the funding conversation to you."],
  ["Generic software, generic look.", "Your clients trust your name. Sending them to someone else's branded portal weakens the relationship you built."],
];

const FEATURES: { eyebrow: string; title: string; body: string[]; img?: [string, number, number, string]; list?: string[] }[] = [
  {
    eyebrow: "Your brand, front and center", title: "Your logo and colors on every client page",
    body: ["Clients sign up through your own link and see your name, your logo and your colors from the first page to the last. The agreements they sign name your company.", "You keep the relationship. Leverage IQ stays in the background."],
    img: ["/screens/op-branded.webp", 1100, 660, "A client dashboard branded for a sample tax firm"],
  },
  {
    eyebrow: "The audit, done for you", title: "Every account checked across all three bureaus",
    body: ["Upload a client's 3-bureau report and Leverage IQ flags what doesn't add up: conflicting dates and balances, re-aged collections, items past the reporting limit, duplicate accounts and more.", "Each finding comes with the plain-English reason and the Fair Credit Reporting Act section behind it, so you can explain it to your client in a sentence."],
    img: ["/screens/audit.webp", 1100, 604, "An account with three findings, each with the reason and the law"],
  },
  {
    eyebrow: "Dispute rounds, built in", title: "The right letter, in the right order, every time",
    body: ["Round one asks each bureau to verify. After that, the bureau's answer decides the next letter: a method-of-verification demand, a deletion demand when they miss the deadline, a direct dispute to the creditor, then a final demand.", "Identity theft gets its own block request, and items that reappear after deletion are caught and disputed as reinsertions. Strongest items go first, with no more than five accounts per letter."],
    img: ["/screens/letter.webp", 1100, 1010, "A dispute letter with each item's facts hidden in the preview"],
  },
  {
    eyebrow: "Less chasing", title: "A work queue for today, and reminders that do the chasing",
    body: ["Your console shows exactly what needs doing: letters ready to mail, responses past due, clients ready for their next round and funding requests.", "Clients approve and mail their own letters. When something is waiting on them, they get an email or text reminder automatically, at the right time and no more than they need."],
    img: ["/screens/op-queue.webp", 1100, 597, "Operator work queue and client list"],
  },
  {
    eyebrow: "Bring your book of business", title: "Invite your client list in minutes",
    body: ["Paste a list or upload a CSV from your client software. Each person gets a personal invitation from your company with their details filled in.", "Track who opened it and who joined. Invitations go by email with your address and an unsubscribe link, as the law requires."],
    img: ["/screens/op-invites.webp", 1100, 979, "Invite page showing invited, opened and joined clients"],
  },
  {
    eyebrow: "Repair to funding", title: "Earn a share when your clients get funded",
    body: ["When a client's profile is ready, they request a funding review right inside your branded portal. The Leverage IQ funding program takes it from there.", "You follow every deal from request to funded, and you earn a share of the commission on the deals that close, under the terms of your agreement."],
    img: ["/screens/op-funding.webp", 1100, 385, "Funding pipeline with a funded deal; the share amount is hidden"],
  },
  {
    eyebrow: "Compliance tools", title: "The safeguards are built into the workflow",
    body: ["Every client goes through the same steps, in the same order, with a record of each one."],
    list: [
      "The federal rights disclosure is delivered on its own, before any agreement",
      "One-click e-signatures with time, IP address and document fingerprint",
      "The three-day cancellation period is enforced: no dispute work starts before it ends",
      "Clients confirm every letter is true before it can be mailed",
      "Only items flagged as errors, or that the client says are wrong, are ever disputed",
      "A permanent activity record for every client",
    ],
  },
];

const WHO: [string, string][] = [
  ["Tax professionals", "Your clients already trust you with their finances once a year. Give them a reason to stay with you all year, and a path to the business funding many of them ask you about."],
  ["Credit repair firms", "Run more clients with the same team. The audit, the letters and the follow-up rounds are handled, so your people spend their time on clients, not paperwork."],
  ["Funding brokers", "Clients who aren't fundable yet don't have to be a dead end. Put them on a guided path today, and bring them back when their profile is ready."],
];

const FAQ: [string, string][] = [
  ["Do my clients pay Leverage IQ?", "No. Leverage IQ doesn't charge your clients anything. Your plan covers your company. If you choose to charge your clients for credit services, the Credit Repair Organizations Act and your state's laws apply to you, including the rule against charging before services are fully performed."],
  ["Am I a credit repair organization?", "If you offer credit services to clients, you may be, and some states require registration or a bond. Leverage IQ gives you compliance tools, but it isn't legal advice. Check with an attorney about your state."],
  ["How does the funding revenue share work?", "When one of your clients requests a funding review and is funded through the Leverage IQ funding program, you earn a share of the commission on that deal. The terms are set out in your agreement, and you can follow every deal on your Funding page."],
  ["What do my clients do, and what do I do?", "Clients upload their report, confirm their findings, freeze the secondary bureaus, approve each letter and mail it. You oversee everything from your console: what's waiting, what's late, who's ready for funding."],
  ["Can I use my own branding?", "Yes. Add your logo and button color, and your clients see your company on every page. You also get your own sign-up link to share."],
  ["Can I cancel?", "Yes, any time, from the Billing page. Your clients keep access to their own accounts and documents."],
];

export function PartnersPage({ legalName, address }: { legalName: string; address: string }) {
  return (
    <div className="sp">
      <header className="sp-top">
        <div className="sp-in sp-row">
          <img src="/wordmark.png" alt={PRODUCT} width={720} height={119} className="sp-mark" />
          <nav className="sp-row" style={{ gap: 18 }}>
            <a href="#how" className="sp-link">How it works</a>
            <a href="#pricing" className="sp-link">Pricing</a>
            <Link href="/console/login" className="sp-link">Sign in</Link>
            <Link href={SIGNUP} className="btn accent">Get started</Link>
          </nav>
        </div>
      </header>

      <section className="sp-hero">
        <div className="sp-in">
          <div className="sp-eyebrow">For tax pros, credit repair firms &amp; funding brokers</div>
          <h1>Offer credit repair &amp; funding <em>under your own brand.</em></h1>
          <p className="sp-lead">{PRODUCT} audits your clients' credit reports, builds dispute letters in rounds, keeps every client moving with automatic reminders, and opens a path to business funding, all inside a portal with your name on it. You keep the relationship.</p>
          <CTA dark />
          <ul className="sp-trust"><li>Your logo and colors</li><li>Letters in rounds</li><li>Automatic client reminders</li><li>Funding revenue share</li></ul>
          <div className="pp-hero-shots">
            <figure className="sp-shot sp-hero-shot pp-back"><img src="/screens/op-branded.webp" width={1100} height={660} alt="A client dashboard branded for a sample tax firm" /></figure>
            <figure className="sp-shot pp-front"><img src="/screens/op-queue.webp" width={1100} height={597} alt="Operator work queue" /></figure>
          </div>
          <p className="pp-caption">Sample company with made-up data.</p>
        </div>
      </section>

      <section className="sp-sec" id="problem">
        <div className="sp-in">
          <h2>Adding credit services shouldn't mean adding headcount</h2>
          <p className="sp-sub">Your clients need better credit and access to capital. Delivering it yourself usually runs into the same problems.</p>
          <div className="sp-pains">{PAINS.map(([h, p]) => <div className="sp-pain" key={h}><h3>{h}</h3><p>{p}</p></div>)}</div>
          <p className="sp-bridge">The demand is there. What's missing is a system that does the work and keeps your name on it.</p>
        </div>
      </section>

      <section className="sp-sec sp-dark" id="how">
        <div className="sp-in sp-center">
          <div className="sp-eyebrow">The solution</div>
          <h2>{PRODUCT} is the engine. <em>You're the brand.</em></h2>
          <p className="sp-sub">The audit, the letters, the rounds, the reminders and the funding path run in the background. Your clients see you, and you see everything.</p>
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
            {f.img ? <Shot src={f.img[0]} w={f.img[1]} h={f.img[2]} alt={f.img[3]} /> : (
              <ul className="pp-checks">{f.list!.map((x) => <li key={x}>{x}</li>)}</ul>
            )}
          </div>
        </section>
      ))}

      <section className="sp-sec sp-dark">
        <div className="sp-in">
          <h2 className="sp-center">Up and running in an afternoon</h2>
          <ol className="sp-steps">
            {[
              ["Create your company", "Sign up and add your legal name and address. We set up your account with you."],
              ["Make it yours", "Upload your logo, pick your color, and link your own lessons to each step if you have them."],
              ["Invite your clients", "Paste or upload your client list. Each person gets a personal invite from your company."],
              ["Watch it run", "Clients work through their journey. Your queue shows what needs you, and funding requests come to you."],
            ].map(([h, p], i) => <li key={h}><span className="sp-num">{i + 1}</span><h3>{h}</h3><p>{p}</p></li>)}
          </ol>
          <div className="sp-center"><CTA dark /></div>
        </div>
      </section>

      <section className="sp-sec">
        <div className="sp-in">
          <h2 className="sp-center">Built for professionals who already have the relationship</h2>
          <div className="sp-pains" style={{ marginTop: 30 }}>{WHO.map(([h, p]) => <div className="sp-pain" key={h}><h3>{h}</h3><p>{p}</p></div>)}</div>
          <div className="sp-who" style={{ marginTop: 18 }}>
            <div className="sp-who-yes">
              <h3>A fit if you</h3>
              <ul>
                <li>Want to offer credit help and funding without hiring a disputes team.</li>
                <li>Have clients who trust you and want more from you than one service.</li>
                <li>Care about doing it by the book, with records to show for it.</li>
              </ul>
            </div>
            <div className="sp-who-no">
              <h3>Not a fit if you</h3>
              <ul>
                <li>Want to dispute accurate information or promise score increases.</li>
                <li>Plan to charge clients before the work is done. The law forbids it.</li>
                <li>Want a tool you don't have to oversee. Your clients are still your responsibility.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="sp-sec sp-alt" id="pricing">
        <div className="sp-in">
          <h2 className="sp-center">Everything included</h2>
          <div className="sp-prices">
            <div className="sp-price sp-price-main">
              <div className="sp-eyebrow">For your company</div>
              <ul>
                <li>Your logo, colors and sign-up link</li><li>Three-bureau audits and dispute letters in rounds</li>
                <li>Work queue, client files and activity records</li><li>Automatic client reminders and sign-up alerts</li>
                <li>Bulk client invites</li><li>Reading of bureau replies</li><li>Staff logins for your team</li>
                <li>Funding pipeline and revenue share</li>
              </ul>
              <p className="sp-small">Leverage IQ never charges your clients.</p>
            </div>
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
          <h2>Your clients trust you. <em>Give them more.</em></h2>
          <p className="sp-sub">Set up your branded portal today and invite your first clients this week.</p>
          <CTA dark />
          <p className="sp-note-dark" style={{ marginTop: 18 }}>Looking for help with your own credit? <Link href="/" style={{ color: "#fff" }}>Start here instead</Link>.</p>
        </div>
      </section>

      <footer className="sp-foot">
        <div className="sp-in">
          <p>Leverage IQ provides software and compliance tools; it does not provide legal advice. You are responsible for following the federal and state laws that apply to your business, including the Credit Repair Organizations Act. No client result, score change or funding approval is guaranteed. Revenue share applies only to deals funded through the Leverage IQ funding program, under the terms of your agreement.</p>
          <p>{PRODUCT} · {legalName} · {address} · <Link href="/console/login">Sign in</Link> · <Link href="/">For individuals</Link> · <LegalLinks /></p>
        </div>
      </footer>
    </div>
  );
}
