import { db } from "./db";
import { freezeProgress } from "./freeze";
import { listMonitoring } from "./console";
import { site } from "./notify";
import { currentFindings, directPriceCents, getLetters, getReports, getTenant, needsPayment } from "./store";

/**
 * Stage-based follow-up emails. Each sequence covers one place people stall, starts when they reach it,
 * and stops the moment they move on. The copy leans on a few honest levers:
 *   - their own numbers (errors found, letters ready): specific beats general
 *   - progress already made (goal-gradient: people speed up near the finish)
 *   - the open loop of an unfinished task, and what staying stuck costs
 *   - removing friction: exact steps, real time estimates, one link straight to the step
 *   - a respectful "should we stop?" last email
 * No guarantees, no invented statistics or testimonials, no fake deadlines.
 */
type Row = Record<string, any>;
const H = 3_600_000;

export interface Ctx {
  first: string; company: string; isDirect: boolean;
  link: (path: string) => string; monitorUrl: string | null;
  errors: number; letters: number; items: number; price: string;
  reviewed: boolean; freezesLeft: number; freezesTotal: number;
  signed: boolean; hasReport: boolean;
}
export interface Email { subject: string; body: string; sms?: string }
export interface Sequence {
  key: "finish_signup" | "get_report" | "review_freeze" | "unlock_letters";
  name: string;
  /** When the person entered this stage (ISO), or null when they are not in it. */
  since: (c: Row) => string | null;
  /** Where the email's button takes them. */
  path: (c: Row) => string;
  steps: { after: number; write: (x: Ctx) => Email }[];
}

const first = (n: string) => n.trim().split(/\s+/)[0] || "there";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Sent to everyone the moment they register, before any follow-up. No ask, no pressure: it shows the whole road,
 * who does what, and where it leads, so every later email lands on someone who already knows the plan.
 */
export const WELCOME = (x: Ctx): Email => {
  const done = (b: boolean) => (b ? " (done)" : "");
  return {
    subject: `Welcome, ${x.first}. Here's where this is going`,
    body: `Hi ${x.first},

Welcome to ${x.company}. There's nothing you need to do from this email. I just want you to see the whole road before you take the next step.

WHERE THIS GOES
A credit profile that's accurate, so when you apply for business funding, lenders judge the real you: not a late payment that never happened, not a balance that's wrong, not an account that isn't yours.

HOW YOU GET THERE
About 30 minutes of your time, spread over a few sittings:

1. Sign your agreement. 2 minutes, free to start, cancel any time.${done(x.signed)}
2. Upload your 3-bureau credit report. About 10 minutes. We read every account on Equifax, Experian and TransUnion and compare them side by side.${done(x.hasReport)}
3. Review what we found. Each possible error is explained in plain English, with the law behind it. You decide what's accurate and what isn't.${done(x.reviewed)}
4. Freeze the secondary bureaus. Free, about 15 minutes, and it protects you while your disputes are open.
5. Get your dispute letters. Written for your specific errors, in the right order, strongest first, citing the Fair Credit Reporting Act. You print and mail them.
6. Round by round. We track every 30-day deadline, read the bureaus' replies and prepare the next round when it's needed.
7. Funding. As your profile improves, your business funding options open up.

WHO DOES WHAT
We do the heavy lifting: reading the reports, spotting the errors, writing the letters, tracking the deadlines, planning the next round. You make the decisions and put the letters in the mail. You stay in control the whole way.
${x.isDirect ? `
WHAT IT COSTS
Starting is free. When your letters are ready, you can preview them first, then unlock them, and every later round, with one payment of ${x.price}. No subscription. You only pay once you can see exactly what you're getting.
` : ""}
THE HONEST PART
Nobody can promise you a specific score, and accurate information can't be removed. What the law does require is that everything on your report be accurate and verifiable. That's the standard we hold every item to.

${x.signed ? `Whenever you're ready, pick up where you left off: ${x.link("/dashboard")}` : `Whenever you're ready, step 1 is waiting: ${x.link("/start/sign")}`}

If you have a question, just reply. A real person reads these.`,
  };
};

export const SEQUENCES: Sequence[] = [
  {
    key: "finish_signup", name: "Started but didn't sign",
    since: (c) => (!c.signed_at ? c.created_at : null),
    path: () => "/start/sign",
    steps: [
      { after: 2 * H, write: (x) => ({
        subject: `${x.first}, you're one click from your free audit`,
        body: `Hi ${x.first},

You started your account with ${x.company} but stopped just before signing your agreement.

That signature is the only thing standing between you and your audit. Once it's done, we check every account on all three of your credit reports and show you exactly what looks wrong, and why.

It takes about two minutes, it's free to start, and you can cancel any time.

Finish signing: ${x.link("/start/sign")}`,
        sms: `${x.company}: ${x.first}, you're one click from your free credit audit. Finish signing: ${x.link("/start/sign")}`,
      }) },
      { after: 24 * H, write: (x) => ({
        subject: "Your audit is ready to start",
        body: `Hi ${x.first},

A quick thought: errors on a credit report don't announce themselves. They sit there quietly, and every application you make in the meantime is judged with them in place.

Here's what happens the moment you sign:
1. You upload your 3-bureau report.
2. We compare how Equifax, Experian and TransUnion report each account and flag what doesn't add up.
3. You see each finding in plain English, with the law behind it.

You've already done the hard part by starting. Finish in two minutes: ${x.link("/start/sign")}`,
      }) },
      { after: 72 * H, write: (x) => ({
        subject: "Should we close your file?",
        body: `Hi ${x.first},

I haven't seen you finish signing up, so I'll keep this short.

If now isn't the right time, that's completely fine. This is the last reminder you'll get about it.

But if you started because you want your credit in shape for business funding, the path is still open, and it starts with one click: ${x.link("/start/sign")}

Either way, I'm rooting for you.`,
      }) },
    ],
  },
  {
    key: "get_report", name: "Signed, no report yet",
    since: (c) => (c.signed_at && !getReports(c.id).length ? c.signed_at : null),
    path: () => "/report",
    steps: [
      { after: 20 * H, write: (x) => ({
        subject: "Step 2: get your 3-bureau report (about 10 minutes)",
        body: `Hi ${x.first},

You're signed up. Nice work. The next step is the one that unlocks everything else: your 3-bureau credit report.

Here's exactly how:
1. ${x.monitorUrl ? `Sign up for credit monitoring here: ${x.monitorUrl}` : "Sign in to any credit monitoring service that shows all three bureaus."}
2. Open your full 3-bureau report and save it as a PDF (Print, then "Save as PDF").
3. Upload it here: ${x.link("/report")}

That's it. Within a minute of uploading, you'll see every possible error we find.`,
        sms: `${x.company}: ${x.first}, next step is your 3-bureau report. Upload it here: ${x.link("/report")}`,
      }) },
      { after: 72 * H, write: (x) => ({
        subject: "Why we need all three reports",
        body: `Hi ${x.first},

Here's something most people don't know: the same account is often reported differently by each bureau. Different dates, different balances, sometimes different statuses.

Those differences are some of the clearest errors there are, and you can only spot them by putting all three reports side by side. That's exactly what we do the moment your report is uploaded.

Your report is the missing piece: ${x.link("/report")}`,
      }) },
      { after: 144 * H, write: (x) => ({
        subject: "Is something stuck?",
        body: `Hi ${x.first},

You haven't uploaded your report yet, so I want to make sure nothing is in the way.

- No monitoring account? ${x.monitorUrl ? `You can sign up here: ${x.monitorUrl}. ` : ""}You can also use your free reports from annualcreditreport.com.
- Not sure how to save it? Open the full report, choose Print, then "Save as PDF."
- Upload says it can't read the file? Save it as a PDF and try again.

Once it's in, you're one review away from your dispute letters: ${x.link("/report")}`,
      }) },
    ],
  },
  {
    key: "review_freeze", name: "Report in, not reviewed or frozen",
    since: (c) => {
      const r = db().prepare("SELECT MIN(created_at) at FROM reports WHERE client_id = ?").get(c.id) as Row;
      return r?.at && (!c.report_reviewed_at || !c.freeze_done_at) ? r.at : null;
    },
    path: (c) => (c.report_reviewed_at ? "/freeze" : "/report"),
    steps: [
      { after: 20 * H, write: (x) => ({
        subject: x.errors ? `We found ${plural(x.errors, "possible error")} on your reports` : "Your report is checked. One step left",
        body: `Hi ${x.first},

${x.errors ? `Your audit is done. We found ${plural(x.errors, "possible error")} across your three credit reports, each with the reason and the law behind it.` : "Your audit is done and your report is on file."}

${x.reviewed
  ? `You've reviewed your report. Now freeze the secondary bureaus (${plural(x.freezesLeft, "company", "companies")} left). It's free and takes about 15 minutes: ${x.link("/freeze")}`
  : `Take ten minutes to look them over. Mark anything that's actually accurate, tell us about anything else that's wrong, then confirm at the bottom: ${x.link("/report")}`}

After that, your dispute letters are built for you.`,
        sms: `${x.company}: ${x.first}, ${x.errors ? `we found ${plural(x.errors, "possible error")} on your reports` : "your report is checked"}. Next step: ${x.link(x.reviewed ? "/freeze" : "/report")}`,
      }) },
      { after: 72 * H, write: (x) => ({
        subject: "You're closer than you think",
        body: `Hi ${x.first},

Look at how far you've come: account created, agreement signed, report uploaded and audited.

${x.reviewed
  ? `The only thing left before your letters is freezing ${plural(x.freezesLeft, "secondary bureau")}. A freeze is free, doesn't touch your scores, and helps protect you while your disputes are open.`
  : `Two short steps stand between you and your letters: a quick review of your findings, then freezing the secondary bureaus.`}

Pick up right where you left off: ${x.link(x.reviewed ? "/freeze" : "/report")}`,
      }) },
      { after: 144 * H, write: (x) => ({
        subject: "Those errors won't fix themselves",
        body: `Hi ${x.first},

Here's the uncomfortable truth about credit report errors: the bureaus don't go looking for them. An inaccurate item stays until someone disputes it.

${x.errors ? `You have ${plural(x.errors, "possible error")} flagged and ready to challenge.` : "Your report is ready to go."} The work of finding them is done. What's left takes less time than a lunch break.

Finish your ${x.reviewed ? "freeze step" : "review"}: ${x.link(x.reviewed ? "/freeze" : "/report")}`,
      }) },
    ],
  },
  {
    key: "unlock_letters", name: "Letters ready, not unlocked",
    since: (c) => {
      if (!needsPayment(c)) return null;
      const r = db().prepare("SELECT MIN(created_at) at FROM letters WHERE client_id = ? AND status = 'draft'").get(c.id) as Row;
      return r?.at ?? null;
    },
    path: () => "/disputes",
    steps: [
      { after: 3 * H, write: (x) => ({
        subject: `Your ${plural(x.letters, "dispute letter")} ${x.letters === 1 ? "is" : "are"} ready`,
        body: `Hi ${x.first},

Your ${plural(x.letters, "letter")} ${x.letters === 1 ? "is" : "are"} written: one for each bureau, covering ${plural(x.items, "item")}, with the strongest first and the Fair Credit Reporting Act section that applies to each one.

You can preview exactly how they read right now. When you're ready, unlock all of them, plus every later round, with one payment of ${x.price}. No subscription.

See your letters: ${x.link("/disputes")}`,
        sms: `${x.company}: ${x.first}, your ${plural(x.letters, "dispute letter")} ${x.letters === 1 ? "is" : "are"} ready to preview. ${x.link("/disputes")}`,
      }) },
      { after: 48 * H, write: (x) => ({
        subject: "The 30-day clock hasn't started yet",
        body: `Hi ${x.first},

Once a bureau receives your dispute, it generally has 30 days to investigate. That clock only starts when your letter arrives.

Your letters are finished and waiting. Every day they sit is a day the clock hasn't started.

Unlock them for ${x.price}, approve them, print and mail. We track every deadline from there and prepare your next round when the answers come back.

Start the clock: ${x.link("/disputes")}`,
      }) },
      { after: 120 * H, write: (x) => ({
        subject: `${x.price}, or do it yourself?`,
        body: `Hi ${x.first},

A fair question: why pay ${x.price} when you can dispute errors yourself for free? You can, and that's your right.

Here's what the ${x.price} covers:
- Your letters for this round, written for your specific errors
- Every later round: method of verification, creditor disputes and final demands, as you need them
- Deadline tracking and reading of the bureaus' replies
- No monthly fees, ever

The first letter is the easy part. Round two is where doing it alone gets hard, and that's what this is for.

Your letters: ${x.link("/disputes")}`,
      }) },
      { after: 216 * H, write: (x) => ({
        subject: "Last note about your letters",
        body: `Hi ${x.first},

This is the last reminder I'll send about your dispute letters.

They'll stay in your account, ready whenever you are. If something is holding you back, a question about the letters, the price or the process, just reply and tell me.

Your letters: ${x.link("/disputes")}`,
      }) },
    ],
  },
];

/** The sequence a client is in right now, if any. Earlier stages win. */
export function sequenceFor(c: Row): { seq: Sequence; since: string } | null {
  if (c.status !== "active") return null;
  for (const seq of SEQUENCES) {
    if (seq.key === "unlock_letters" && c.tenant_id !== "tenant_default") continue;
    const since = seq.since(c);
    if (since) return { seq, since };
  }
  return null;
}

export function contextFor(c: Row, link: (path: string) => string): Ctx {
  const t = getTenant(c.tenant_id);
  const drafts = (getLetters(c.id) as Row[]).filter((l) => l.status === "draft");
  const fz = freezeProgress(c);
  const partner = listMonitoring()[0];
  return {
    first: first(c.name), company: t.name, isDirect: t.id === "tenant_default", link,
    monitorUrl: partner ? `${site()}/go/${partner.id}` : null,
    errors: currentFindings(c.id).length, letters: drafts.length,
    items: drafts.reduce((n, l) => n + l.cases.length, 0),
    price: (() => { const p = c.price_cents || (t.id === "tenant_default" ? directPriceCents() : 0); return `$${(p / 100).toFixed(p % 100 ? 2 : 0)}`; })(),
    reviewed: !!c.report_reviewed_at, freezesLeft: fz.total - fz.addressed, freezesTotal: fz.total,
    signed: !!c.signed_at, hasReport: getReports(c.id).length > 0,
  };
}

/** Sample values for previewing the emails. */
export const SAMPLE_CTX: Ctx = {
  first: "Jordan", company: "Leverage IQ", isDirect: true, link: (p) => `https://leverageiq100.com${p}`,
  monitorUrl: "https://leverageiq100.com/go/partner", errors: 6, letters: 3, items: 11, price: "$37",
  reviewed: false, freezesLeft: 5, freezesTotal: 5, signed: false, hasReport: false,
};

// ---------- records ----------
export const sentSteps = (clientId: string, key: string) =>
  (db().prepare("SELECT step, sent_at FROM sequence_sends WHERE client_id = ? AND seq = ? ORDER BY step").all(clientId, key) as Row[]);
export function recordSend(clientId: string, key: string, step: number, at: string) {
  db().prepare("INSERT OR IGNORE INTO sequence_sends (client_id, seq, step, sent_at) VALUES (?,?,?,?)").run(clientId, key, step, at);
}

export const welcomeSentAt = (clientId: string) =>
  (db().prepare("SELECT sent_at FROM sequence_sends WHERE client_id = ? AND seq = 'welcome'").get(clientId) as Row | undefined)?.sent_at as string | undefined;
export const welcomeCount = () => (db().prepare("SELECT count(*) n FROM sequence_sends WHERE seq = 'welcome'").get() as Row).n as number;

/** Sent per email, and how many of those people have since moved past that stage. */
export function sequenceStats() {
  const rows = db().prepare("SELECT s.seq, s.step, s.client_id FROM sequence_sends s").all() as Row[];
  return SEQUENCES.map((seq) => ({
    key: seq.key, name: seq.name,
    steps: seq.steps.map((_, i) => {
      const sent = rows.filter((r) => r.seq === seq.key && r.step === i);
      const moved = sent.filter((r) => {
        const c = db().prepare("SELECT * FROM clients WHERE id = ?").get(r.client_id) as Row | undefined;
        return c && sequenceFor(c)?.seq.key !== seq.key;
      }).length;
      return { step: i + 1, sent: sent.length, moved };
    }),
  }));
}
