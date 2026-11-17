"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SOURCE_COOKIE } from "@/lib/attribution";
import { parseReportFile, rewordLetter } from "@/lib/ai";
import { sampleReport, simulateRefresh } from "@/lib/sample";
import { currentClient, endSession, requestMeta, requireClient, startSession } from "@/lib/session";
import { goodStanding } from "@/lib/billing";
import * as freeze from "@/lib/freeze";
import * as notify from "@/lib/notify";
import * as store from "@/lib/store";
import { ItemType, Outcome } from "@/lib/types";
import { validateReport } from "@/lib/validate";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, kind: "error" | "ok", msg: string): never => redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export async function startOnboarding(f: FormData) {
  const required = ["name", "email", "address", "city", "state", "zip", "dob", "ssnLast4", "businessStage"];
  if (required.some((k) => !s(f, k))) back("/start", "error", "Please fill in every required field.");
  if (!/^\d{4}$/.test(s(f, "ssnLast4"))) back("/start", "error", "Enter the last 4 digits of your Social Security number.");
  if (!goodStanding(store.getTenant(s(f, "tenant") || "default"))) back("/start", "error", "This company is not accepting new clients right now.");
  const id = store.createClient({
    tenant: s(f, "tenant") || "default", name: s(f, "name"), email: s(f, "email"), phone: s(f, "phone"),
    address: s(f, "address"), city: s(f, "city"), state: s(f, "state").toUpperCase(), zip: s(f, "zip"),
    dob: s(f, "dob"), ssnLast4: s(f, "ssnLast4"), businessStage: s(f, "businessStage"), fundingGoal: s(f, "fundingGoal"), smsOptIn: f.get("smsOptIn") === "on", source: (await cookies()).get(SOURCE_COOKIE)?.value ?? null,
  });
  if (s(f, "invite")) (await import("@/lib/invites")).markJoined(s(f, "invite"), id);
  const meta = await import("@/lib/meta");
  meta.saveMatch("clients", id, await (await import("@/lib/meta-request")).currentMatch());
  void meta.consumerEvent(id, "Lead");
  await startSession(id);
  redirect("/start/disclosure");
}

export async function acknowledgeDisclosure() {
  const c = await currentClient();
  if (!c) redirect("/start");
  store.ackDisclosure(c.id, await requestMeta());
  redirect("/start/sign");
}

export async function signAll() {
  const c = await currentClient();
  if (!c) redirect("/start");
  store.signContract(c.id, c.name, await requestMeta());
  void notify.clientSigned(c.id); // sent in the background; a failed alert never blocks the sign-up
  void import("@/lib/reminders").then((r) => r.welcome(c.id));
  void import("@/lib/meta").then((m) => m.consumerEvent(c.id, "CompleteRegistration"));
  redirect("/dashboard");
}

export async function loadSample() {
  const c = await requireClient();
  if (!store.DEMO) back("/report", "error", "Sample data is only available in demo mode.");
  store.saveReport(c.id, sampleReport());
  redirect("/report");
}

export async function demoRefresh() {
  const c = await requireClient();
  const prev = store.getReports(c.id).at(-1);
  if (!store.DEMO || !prev) back("/report", "error", "Refresh is only simulated in demo mode.");
  const deleted = store.getCases(c.id).filter((x) => x.resolution?.startsWith("Deleted"))
    .map((x) => ({ itemType: x.item_type, itemId: x.item_id, bureau: x.bureau }));
  store.saveReport(c.id, simulateRefresh(prev!, deleted));
  redirect("/dashboard");
}

export async function uploadReport(f: FormData) {
  const c = await requireClient();
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) back("/report", "error", "Choose a file first.");
  const upload = file as File;
  try {
    const report = /\.json$/i.test(upload.name)
      ? validateReport(JSON.parse(await upload.text()))
      : await parseReportFile({ name: upload.name, type: upload.type, bytes: Buffer.from(await upload.arrayBuffer()) });
    store.saveReport(c.id, report);
  } catch (e) { back("/report", "error", message(e)); }
  redirect("/report");
}

export async function stateItem(f: FormData) {
  const c = await requireClient();
  const reason = s(f, "reason");
  if (!reason) back("/report", "error", "Choose what is wrong with the item.");
  if (reason === "other" && !s(f, "note")) back("/report", "error", "Please describe what is inaccurate.");
  store.setAssertion(c.id, s(f, "itemType") as ItemType, s(f, "itemId"), reason, s(f, "note"));
  revalidatePath("/report");
}
export async function clearItem(f: FormData) {
  const c = await requireClient();
  store.clearAssertion(c.id, s(f, "itemType") as ItemType, s(f, "itemId"));
  revalidatePath("/report");
}

export async function prepareLetters() {
  const c = await requireClient();
  let n = 0;
  try { n = store.buildRound(c.id); } catch (e) { back("/disputes", "error", message(e)); }
  const queued = store.getCases(c.id).some((x) => x.status === "pending_letter");
  back("/disputes", "ok", n ? `${n} letter${n > 1 ? "s" : ""} drafted for your review.`
    : queued ? "Your remaining items are queued. Each bureau gets one letter at a time, so they go out once the open letter to that bureau is answered." : "Nothing new to send right now.");
}
export async function approveLetter(f: FormData) {
  const c = await requireClient();
  const id = s(f, "id");
  if (f.get("attest") !== "on") back(`/disputes/${id}`, "error", "Tick the box to confirm the statement before approving.");
  store.attestLetter(c.id, id);
  redirect(`/disputes/${id}`);
}
export async function discardLetter(f: FormData) {
  const c = await requireClient();
  store.discardDraft(c.id, s(f, "id"));
  redirect("/disputes");
}
export async function reword(f: FormData) {
  const c = await requireClient();
  const id = s(f, "id");
  const letter = store.getLetter(c.id, id) as { body: string } | undefined;
  if (!letter) redirect("/disputes");
  let result: Awaited<ReturnType<typeof rewordLetter>>;
  try { result = await rewordLetter(letter!.body); } catch (e) { return back(`/disputes/${id}`, "error", `AI rewording failed: ${message(e)}`); }
  if (!result.changed) back(`/disputes/${id}`, "error", result.reason ?? "No change was made.");
  store.setLetterBody(c.id, id, result.body, "ai");
  back(`/disputes/${id}`, "ok", "Reworded. Every fact, amount, date and citation was checked against the original.");
}
export async function mailLetter(f: FormData) {
  const c = await requireClient();
  const id = s(f, "id");
  try { store.markMailed(c.id, id, s(f, "tracking")); } catch (e) { back(`/disputes/${id}`, "error", message(e)); }
  redirect(`/disputes/${id}`);
}
export async function saveOutcome(f: FormData) {
  const c = await requireClient();
  const id = s(f, "id");
  if (!s(f, "outcome")) back(`/disputes/${id}`, "error", "Choose a result.");
  try { store.recordOutcome(c.id, id, s(f, "caseId"), s(f, "outcome") as Outcome); } catch (e) { back(`/disputes/${id}`, "error", message(e)); }
  redirect(`/disputes/${id}`);
}

export async function requestFunding(f: FormData) {
  const c = await requireClient();
  if (freeze.freezeProgress(c).frozen > 0 && f.get("lifted") !== "on") back("/funding", "error", "Confirm that you have lifted your freezes first. Lenders cannot see a frozen report.");
  const { requestDeal } = await import("@/lib/funding-deals");
  if (requestDeal(c).created) void notify.fundingRequested(c.id);
  back("/funding", "ok", "Request received. Funding options are optional and you are under no obligation.");
}
export async function cancel() {
  const c = await requireClient();
  store.cancelService(c.id);
  back("/documents", "ok", "Your services are cancelled. No charge applies.");
}
export async function signOut() { await endSession(); redirect("/"); }

// ---------- review and freeze steps ----------
export async function reviewDone() {
  const c = await requireClient();
  try { freeze.markReviewed(c.id); } catch (e) { back("/report", "error", message(e)); }
  redirect("/freeze");
}
export async function recordFreeze(f: FormData) {
  const c = await requireClient();
  const status = s(f, "status") === "skipped" ? "skipped" : "frozen";
  try { freeze.setFreeze(c.id, s(f, "bureauId"), status, s(f, "confirmation")); } catch (e) { back("/freeze", "error", message(e)); }
  redirect("/freeze");
}
export async function undoFreeze(f: FormData) {
  const c = await requireClient();
  try { freeze.clearFreeze(c.id, s(f, "bureauId")); } catch (e) { back("/freeze", "error", message(e)); }
  redirect("/freeze");
}

// ---------- client sign-in by link ----------
const signinTries = new Map<string, { n: number; until: number }>();
export async function requestSignIn(f: FormData) {
  const contact = s(f, "contact");
  if (!contact) back("/login", "error", "Enter the email or mobile number you signed up with.");
  const key = contact.toLowerCase();
  const t = signinTries.get(key);
  if (t && t.n >= 5 && t.until > Date.now()) back("/login", "error", "Too many requests. Try again in an hour.");
  signinTries.set(key, { n: (t && t.until > Date.now() ? t.n : 0) + 1, until: Date.now() + 3600_000 });
  const { sendSignInLinks } = await import("@/lib/signin");
  const out = await sendSignInLinks(contact);
  if (out.demoLinks?.length) redirect(out.demoLinks[0].url.replace(/^https?:\/\/[^/]*/, ""));
  back("/login", "ok", contact.includes("@") ? "If that email matches an account, a sign-in link is on its way. Check your inbox and spam folder." : "If that number matches an account, a sign-in link is on its way by text.");
}
export async function completeSignIn(f: FormData) {
  const { redeemToken } = await import("@/lib/signin");
  const id = redeemToken(s(f, "token"));
  if (!id) back("/login", "error", "That link has expired or was already used. Request a new one.");
  await startSession(id!);
  redirect("/dashboard");
}

export async function setReminderPrefs(f: FormData) {
  const c = await requireClient();
  const { setPrefs } = await import("@/lib/reminders");
  setPrefs(c.id, { reminders: f.get("reminders") === "on", texts: f.get("texts") === "on" });
  back("/documents", "ok", "Reminder settings saved.");
}

// ---------- bureau replies ----------
export async function uploadReply(f: FormData) {
  const c = await requireClient();
  const id = s(f, "id"), path = `/disputes/${id}`;
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) back(path, "error", "Choose a file first.");
  const { uploadResponse } = await import("@/lib/responses");
  let r: Awaited<ReturnType<typeof uploadResponse>>;
  try { r = await uploadResponse(c.id, id, { filename: (file as File).name, bytes: Buffer.from(await (file as File).arrayBuffer()) }, "consumer"); }
  catch (e) { return back(path, "error", message(e)); }
  back(path, r.error ? "error" : "ok", r.error ?? (r.reading ? "Reply read. Check the suggested results below, then confirm." : "Reply saved with this letter."));
}
export async function confirmReply(f: FormData) {
  const c = await requireClient();
  const id = s(f, "id");
  const { confirmSuggestions } = await import("@/lib/responses");
  const { filesFor } = await import("@/lib/files");
  let n = 0;
  try { n = confirmSuggestions(c.id, id, filesFor(c.id, id), "consumer"); } catch (e) { back(`/disputes/${id}`, "error", message(e)); }
  back(`/disputes/${id}`, "ok", `${n} result${n === 1 ? "" : "s"} recorded.`);
}

export async function unsubscribe(f: FormData) {
  const ok = (await import("@/lib/invites")).optOut(s(f, "i"));
  redirect(`/unsubscribe?done=${ok ? 1 : 0}`);
}

// ---------- $37 letters gate (direct clients) ----------
async function siteOrigin() {
  const fixed = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (fixed) return fixed.replace(/\/$/, "");
  const h = await (await import("next/headers")).headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}
export async function unlockLetters() {
  const c = await requireClient();
  const { startCheckout } = await import("@/lib/paywall");
  let url = "";
  try { url = await startCheckout(c, await siteOrigin()); } catch (e) { back("/disputes", "error", message(e)); }
  void import("@/lib/meta").then((m) => m.consumerEvent(c.id, "InitiateCheckout", c.price_cents / 100));
  redirect(url);
}

// ---------- privacy choices ----------
export async function optOutBrowser() {
  const { OPTOUT_COOKIE } = await import("@/lib/meta-request");
  (await cookies()).set(OPTOUT_COOKIE, "1", { path: "/", maxAge: 365 * 86400, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  const c = await currentClient();
  if (c) (await import("@/lib/meta")).optOut("clients", c.id);
  back("/privacy/choices", "ok", "Done. This browser is opted out.");
}
export async function optOutEmail(f: FormData) {
  const email = s(f, "email");
  if (!email.includes("@")) back("/privacy/choices", "error", "Enter a valid email address.");
  (await import("@/lib/meta")).optOutByEmail(email);
  back("/privacy/choices", "ok", "Done. If that email is on an account, we will no longer send events about it to Meta.");
}
