"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseReportFile, rewordLetter } from "@/lib/ai";
import { sampleReport, simulateRefresh } from "@/lib/sample";
import { currentClient, endSession, requestMeta, requireClient, startSession } from "@/lib/session";
import { goodStanding } from "@/lib/billing";
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
    dob: s(f, "dob"), ssnLast4: s(f, "ssnLast4"), businessStage: s(f, "businessStage"), fundingGoal: s(f, "fundingGoal"),
  });
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
  back("/disputes", "ok", n ? `${n} letter${n > 1 ? "s" : ""} drafted for your review.` : "Nothing new to send right now.");
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

export async function requestFunding() {
  const c = await requireClient();
  store.log(c.id, "consumer", "funding_review_requested", { goal: c.funding_goal });
  back("/funding", "ok", "Request received. Funding options are optional and you are under no obligation.");
}
export async function cancel() {
  const c = await requireClient();
  store.cancelService(c.id);
  back("/documents", "ok", "Your services are cancelled. No charge applies.");
}
export async function signOut() { await endSession(); redirect("/"); }
