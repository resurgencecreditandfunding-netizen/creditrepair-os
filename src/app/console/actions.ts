"use server";

import { redirect } from "next/navigation";
import { parseReportFile } from "@/lib/ai";
import * as ops from "@/lib/console";
import { endOpSession, requireOperator, startOpSession } from "@/lib/opsession";
import * as store from "@/lib/store";
import { Outcome } from "@/lib/types";
import { validateReport } from "@/lib/validate";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, kind: "error" | "ok", msg: string): never => redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const actor = (op: ops.Operator) => `operator:${op.email}`;

// Failed sign-ins per email, held in memory. Replace with a shared store when running more than one server.
const attempts = new Map<string, { n: number; until: number }>();

export async function signIn(f: FormData) {
  const email = s(f, "email").toLowerCase();
  const a = attempts.get(email);
  if (a && a.n >= 5 && a.until > Date.now()) back("/console/login", "error", "Too many attempts. Try again in 15 minutes.");
  const op = ops.verifyOperator(email, s(f, "password"));
  if (!op) {
    attempts.set(email, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 15 * 60_000 });
    return back("/console/login", "error", "Email or password is incorrect.");
  }
  attempts.delete(email);
  await startOpSession(op.id);
  redirect(op.role === "platform" ? "/console/admin" : "/console");
}
export async function signOutOperator() { await endOpSession(); redirect("/console/login"); }

/** Every client action re-checks that this operator's company owns the client. */
async function guard(f: FormData) {
  const op = await requireOperator();
  const clientId = s(f, "clientId");
  try { ops.clientFor(op, clientId); } catch { redirect("/console"); }
  return { op, clientId, path: `/console/clients/${clientId}` };
}

export async function opPrepareLetters(f: FormData) {
  const { clientId, path } = await guard(f);
  let n = 0;
  try { n = store.buildRound(clientId); } catch (e) { back(path, "error", message(e)); }
  back(path, "ok", n ? `${n} letter${n > 1 ? "s" : ""} drafted. The client must approve each one before it can be mailed.` : "Nothing new to draft.");
}
export async function opUploadReport(f: FormData) {
  const { op, clientId, path } = await guard(f);
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) back(path, "error", "Choose a file first.");
  const upload = file as File;
  try {
    const report = /\.json$/i.test(upload.name)
      ? validateReport(JSON.parse(await upload.text()))
      : await parseReportFile({ name: upload.name, type: upload.type, bytes: Buffer.from(await upload.arrayBuffer()) });
    store.saveReport(clientId, report, actor(op));
  } catch (e) { back(path, "error", message(e)); }
  back(path, "ok", "Report saved and audited.");
}
export async function opMailLetter(f: FormData) {
  const { op, clientId, path } = await guard(f);
  const lp = `${path}/letters/${s(f, "id")}`;
  if (!s(f, "tracking")) back(lp, "error", "Enter the certified mail tracking number.");
  try { store.markMailed(clientId, s(f, "id"), s(f, "tracking"), undefined, actor(op)); } catch (e) { back(lp, "error", message(e)); }
  redirect(lp);
}
export async function opSaveOutcome(f: FormData) {
  const { op, clientId, path } = await guard(f);
  const lp = `${path}/letters/${s(f, "id")}`;
  if (!s(f, "outcome")) back(lp, "error", "Choose a result.");
  try { store.recordOutcome(clientId, s(f, "id"), s(f, "caseId"), s(f, "outcome") as Outcome, actor(op)); } catch (e) { back(lp, "error", message(e)); }
  redirect(lp);
}
export async function opAddNote(f: FormData) {
  const { op, clientId, path } = await guard(f);
  try { ops.addNote(op, clientId, s(f, "text")); } catch (e) { back(path, "error", message(e)); }
  redirect(path);
}
export async function opFundingHandled(f: FormData) {
  const { op, clientId } = await guard(f);
  ops.markFundingHandled(op, clientId);
  redirect(s(f, "return") === "client" ? `/console/clients/${clientId}` : "/console");
}

export async function addTenant(f: FormData) {
  const op = await requireOperator();
  try { ops.createTenant(op, { name: s(f, "name"), slug: s(f, "slug"), legalName: s(f, "legalName"), address: s(f, "address"), kind: s(f, "kind") || "credit_repair" }); }
  catch (e) { back("/console/settings", "error", message(e)); }
  back("/console/settings", "ok", "Company added. Share its sign-up link and create a login for its staff.");
}
export async function addOperator(f: FormData) {
  const op = await requireOperator();
  if (!ops.canManage(op)) back("/console/settings", "error", "You do not have permission to add logins.");
  const tenantId = ops.isPlatform(op) ? s(f, "tenantId") : op.tenant_id;
  const role = s(f, "role") === "admin" ? "admin" : "staff";
  try { ops.createOperator({ tenantId, email: s(f, "email"), name: s(f, "name"), password: s(f, "password"), role }); }
  catch (e) { back("/console/settings", "error", message(e)); }
  back("/console/settings", "ok", "Login created.");
}

export async function addMonitoringService(f: FormData) {
  const op = await requireOperator();
  try { ops.addMonitoring(op, { name: s(f, "name"), url: s(f, "url"), blurb: s(f, "blurb") }); }
  catch (e) { back("/console/settings", "error", message(e)); }
  back("/console/settings", "ok", "Credit monitoring partner added. Clients now see it when they connect a report.");
}
export async function removeMonitoringService(f: FormData) {
  const op = await requireOperator();
  try { ops.removeMonitoring(op, s(f, "id")); } catch (e) { back("/console/settings", "error", message(e)); }
  back("/console/settings", "ok", "Partner removed.");
}

// ---------- company sign-up and subscription ----------
async function origin() {
  // Your own domain if set, otherwise the address Render assigns.
  const fixed = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (fixed) return fixed.replace(/\/$/, "");
  const h = await (await import("next/headers")).headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}
export async function registerCompany(f: FormData) {
  const billing = await import("@/lib/billing");
  if (!billing.billingConfigured()) back("/console/signup", "error", "Sign-up is not open yet.");
  if (f.get("terms") !== "on") back("/console/signup", "error", "Please confirm the compliance statement.");
  let made: { tenantId: string; operatorId: string };
  try {
    made = ops.registerCompany({ company: s(f, "company"), legalName: s(f, "legalName"), address: s(f, "address"), kind: s(f, "kind"), name: s(f, "name"), email: s(f, "email"), password: s(f, "password") });
  } catch (e) { return back("/console/signup", "error", message(e)); }
  void (await import("@/lib/notify")).operatorEvent(made.tenantId, "registered");
  await startOpSession(made.operatorId);
  redirect("/console/billing");
}
export async function subscribe() {
  const op = await requireOperator({ allowUnpaid: true });
  const billing = await import("@/lib/billing");
  let url = "";
  try { url = await billing.createCheckout(store.getTenant(op.tenant_id), op.email, await origin()); } catch (e) { back("/console/billing", "error", message(e)); }
  redirect(url);
}
export async function manageBilling() {
  const op = await requireOperator({ allowUnpaid: true });
  if (!ops.canManage(op)) back("/console/billing", "error", "Ask your company admin to manage billing.");
  const billing = await import("@/lib/billing");
  let url = "";
  try { url = await billing.createPortal(store.getTenant(op.tenant_id), await origin()); } catch (e) { back("/console/billing", "error", message(e)); }
  redirect(url);
}

// ---------- owner controls ----------
async function adminAction(path: string, okMsg: string, run: (op: ops.Operator, admin: typeof import("@/lib/admin")) => void) {
  const op = await requireOperator();
  try { run(op, await import("@/lib/admin")); } catch (e) { back(path, "error", message(e)); }
  back(path, "ok", okMsg);
}
export async function suspendCompany(f: FormData) {
  const on = s(f, "to") === "1";
  await adminAction("/console/admin", on ? "Company suspended. Its staff are locked out and it cannot take new clients." : "Company reinstated.", (op, a) => a.setSuspended(op, s(f, "id"), on));
}
export async function compCompany(f: FormData) {
  const on = s(f, "to") === "1";
  await adminAction("/console/admin", on ? "Company now has free access." : "Company now needs a subscription.", (op, a) => a.setComped(op, s(f, "id"), on));
}
export async function editCompany(f: FormData) {
  await adminAction("/console/admin", "Company details saved. New client contracts will use them.", (op, a) => a.updateCompany(op, s(f, "id"), { name: s(f, "name"), legalName: s(f, "legalName"), address: s(f, "address") }));
}
export async function resetLoginPassword(f: FormData) {
  await adminAction("/console/settings", "Password changed. Give the new password to that person.", (op, a) => a.resetPassword(op, s(f, "id"), s(f, "password")));
}
export async function removeLogin(f: FormData) {
  await adminAction("/console/settings", "Login removed.", (op, a) => a.removeLogin(op, s(f, "id")));
}

// ---------- sign-up alerts and the freeze list ----------
export async function saveAlerts(f: FormData) {
  const op = await requireOperator();
  if (!ops.canManage(op)) back("/console/settings", "error", "Ask your company admin to change alerts.");
  const n = await import("@/lib/notify");
  try { n.setAlertSettings(op.tenant_id, { email: s(f, "email"), phone: s(f, "phone"), all: ops.isPlatform(op) ? s(f, "scope") !== "direct" : undefined }); }
  catch (e) { back("/console/settings", "error", message(e)); }
  back("/console/settings", "ok", "Alert settings saved.");
}
export async function testAlerts() {
  const op = await requireOperator();
  const n = await import("@/lib/notify");
  try { await n.sendTestAlert(op.tenant_id); } catch (e) { back("/console/settings", "error", message(e)); }
  back("/console/settings", "ok", "Test alert sent. Check your email and phone.");
}
export async function addFreezeBureau(f: FormData) {
  const op = await requireOperator();
  try { (await import("@/lib/freeze")).addFreezeBureau(op, { name: s(f, "name"), url: s(f, "url"), note: s(f, "note") }); }
  catch (e) { back("/console/settings", "error", message(e)); }
  back("/console/settings", "ok", "Bureau added to the freeze step.");
}
export async function removeFreezeBureau(f: FormData) {
  const op = await requireOperator();
  try { (await import("@/lib/freeze")).removeFreezeBureau(op, s(f, "id")); } catch (e) { back("/console/settings", "error", message(e)); }
  back("/console/settings", "ok", "Bureau removed from the freeze step.");
}

export async function runRemindersNow() {
  const op = await requireOperator();
  if (!ops.isPlatform(op)) back("/console", "error", "Only the platform owner can do this.");
  const r = await (await import("@/lib/reminders")).runReminders();
  back("/console/admin", "ok", r.skipped ? `Reminders not sent: ${r.skipped}.` : `Checked ${r.checked} clients. Sent ${r.sent} reminder${r.sent === 1 ? "" : "s"}${r.failed ? `, ${r.failed} failed` : ""}.`);
}

export async function opUploadReply(f: FormData) {
  const { op, clientId, path } = await guard(f);
  const lp = `${path}/letters/${s(f, "id")}`;
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) back(lp, "error", "Choose a file first.");
  const { uploadResponse } = await import("@/lib/responses");
  let r: Awaited<ReturnType<typeof uploadResponse>>;
  try { r = await uploadResponse(clientId, s(f, "id"), { filename: (file as File).name, bytes: Buffer.from(await (file as File).arrayBuffer()) }, actor(op)); }
  catch (e) { return back(lp, "error", message(e)); }
  back(lp, r.error ? "error" : "ok", r.error ?? (r.reading ? "Reply read. Check the suggested results, then confirm." : "Reply saved with this letter."));
}
export async function opConfirmReply(f: FormData) {
  const { op, clientId, path } = await guard(f);
  const lp = `${path}/letters/${s(f, "id")}`;
  const { confirmSuggestions } = await import("@/lib/responses");
  const { filesFor } = await import("@/lib/files");
  let n = 0;
  try { n = confirmSuggestions(clientId, s(f, "id"), filesFor(clientId, s(f, "id")), actor(op)); } catch (e) { back(lp, "error", message(e)); }
  back(lp, "ok", `${n} result${n === 1 ? "" : "s"} recorded.`);
}
