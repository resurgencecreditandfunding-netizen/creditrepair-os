import { fmt, today } from "./dates";
import { freezeProgress } from "./freeze";
import { fundingStatus } from "./funding";
import { canServe, cancelDeadline, currentFindings, getCases, getLetters, getLog, getReports, serviceStartDate } from "./store";

type Row = Record<string, any>;
/** Step keys and titles in order, for settings screens that list every step. */
export const STEPS: [string, string][] = [
  ["account", "Create your account"], ["sign", "Sign your agreement"], ["monitor", "Get your 3-bureau report"], ["upload", "Upload your report"],
  ["review", "Review your report"], ["freeze", "Freeze the secondary bureaus"], ["wait", "3-day review period ends"], ["unlock_letters", "Preview and unlock your letters (direct clients)"], ["approve", "Approve your round 1 letters"],
  ["mail", "Mail your letters"], ["responses", "Bureaus respond"], ["rounds", "Follow-up rounds as needed"], ["unlock", "Funding unlocks"], ["fund", "Lift your freezes and get funded"],
];
export type StepStatus = "done" | "current" | "next" | "upcoming" | "skipped";
export interface Step { key: string; title: string; detail: string; status: StepStatus; href?: string; cta?: string }

/** The client's path from sign-up to funding, with each step's state worked out from their record. */
export function journey(client: Row) {
  const reports = getReports(client.id);
  const cases = getCases(client.id);
  const letters = getLetters(client.id) as Row[];
  const log = getLog(client.id);
  const freezes = freezeProgress(client);
  const funding = fundingStatus(reports[0] ?? null, reports.at(-1) ?? null, today());
  const r1 = letters.filter((l) => l.round === 1);
  const open = cases.filter((c) => !["resolved", "exhausted"].includes(c.status));
  const nothingToDispute = !!client.report_reviewed_at && !!client.freeze_done_at && !cases.length && !currentFindings(client.id).length;
  const drafts = letters.filter((l) => l.status === "draft").length;
  const toMail = letters.filter((l) => l.status === "attested").length;
  const due = letters.filter((l) => l.status === "mailed").map((l) => l.due_at as string).sort()[0];
  const waiting = !canServe(client);

  const raw: (Omit<Step, "status"> & { done: boolean; skip?: boolean })[] = [
    { key: "account", title: "Create your account", detail: "You're in.", done: true },
    { key: "sign", title: "Sign your agreement", detail: "Free service, cancel any time.", done: !!client.signed_at },
    { key: "monitor", title: "Get your 3-bureau report", detail: "Sign up with a credit monitoring service so you can download all three bureaus.",
      done: reports.length > 0 || log.some((e) => e.action === "monitoring_link_opened"), href: "/report", cta: "Get my report" },
    { key: "upload", title: "Upload your report", detail: "Save the full report as a PDF and upload it. We audit it automatically.", done: reports.length > 0, href: "/report", cta: "Upload report" },
    { key: "review", title: "Review your report", detail: "Check what we found. Mark anything accurate, and tell us about anything else that is wrong.",
      done: !!client.report_reviewed_at, href: "/report", cta: "Review report" },
    { key: "freeze", title: "Freeze the secondary bureaus", detail: `Free freezes at ${freezes.total} smaller reporting companies before disputing. ${freezes.addressed} of ${freezes.total} done.`,
      done: !!client.freeze_done_at, href: "/freeze", cta: "Start freezes" },
    { key: "wait", title: "3-day review period ends", detail: client.signed_at ? `Federal law gives you until ${fmt(cancelDeadline(client.signed_at.slice(0, 10)))} to cancel. Letters can go out from ${fmt(serviceStartDate(client))}.` : "Starts when you sign.",
      done: !!client.signed_at && !waiting },
    ...((client.price_cents ?? 0) > 0 ? [{ key: "unlock_letters", title: "Preview and unlock your letters",
      detail: `Preview how your letters read for free, then unlock every letter, every round, for $${(client.price_cents / 100).toFixed(client.price_cents % 100 ? 2 : 0)} once.`,
      done: !!client.paid_at, skip: nothingToDispute, href: "/disputes", cta: drafts ? "Preview my letters" : "Prepare my letters" }] : []),
    { key: "approve", title: "Approve your round 1 letters", detail: drafts ? `${drafts} letter${drafts > 1 ? "s" : ""} waiting for you to read and approve.` : "We write one letter per bureau. You read and approve each one.",
      done: r1.some((l) => l.attested_at), skip: nothingToDispute, href: "/disputes", cta: drafts ? "Review letters" : "Prepare letters" },
    { key: "mail", title: "Mail your letters", detail: toMail ? `${toMail} approved letter${toMail > 1 ? "s" : ""} ready to print and send by certified mail.` : "Print, sign and send by certified mail, then enter the tracking number.",
      done: r1.some((l) => l.mailed_at), skip: nothingToDispute, href: "/disputes", cta: "Mail letters" },
    { key: "responses", title: "Bureaus respond", detail: due ? `Responses are due by ${fmt(due)}. Record each result when it arrives.` : "Bureaus have 30 days to investigate. Record each result when it arrives.",
      done: r1.length > 0 && r1.every((l) => l.status === "closed"), skip: nothingToDispute, href: "/disputes", cta: "Record results" },
    { key: "rounds", title: "Follow-up rounds as needed", detail: open.length ? `${open.length} item${open.length > 1 ? "s" : ""} still open. Each answer decides the next round.` : "Items the bureaus verify move to the next round.",
      done: cases.length > 0 && open.length === 0, skip: nothingToDispute, href: "/disputes", cta: "Next round" },
    { key: "unlock", title: "Funding unlocks", detail: funding.unlocked ? funding.reason : `${funding.reason}${funding.current !== null ? ` ${funding.pointsToGo} points to go.` : ""}`,
      done: funding.unlocked, href: "/funding", cta: "See funding" },
    { key: "fund", title: "Lift your freezes and get funded", detail: "Lift the freezes lenders check, then request your funding review.",
      done: log.some((e) => e.action === "funding_review_requested"), href: "/funding", cta: "Request review" },
  ];

  let seenCurrent = false, seenNext = false;
  const steps: Step[] = raw.map(({ done, skip, ...s }) => {
    if (skip && !done) return { ...s, status: "skipped" };
    if (done) return { ...s, status: "done" };
    if (!seenCurrent) { seenCurrent = true; return { ...s, status: "current" }; }
    if (!seenNext) { seenNext = true; return { ...s, status: "next" }; }
    return { ...s, status: "upcoming" };
  });
  const finished = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  return { steps, finished, total: steps.length, current: steps.find((s) => s.status === "current") ?? null };
}
