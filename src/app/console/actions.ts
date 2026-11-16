"use server";

import { redirect } from "next/navigation";
import { parseReportPdf } from "@/lib/ai";
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
  redirect("/console");
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
    const isPdf = upload.type === "application/pdf" || upload.name.toLowerCase().endsWith(".pdf");
    const report = isPdf ? await parseReportPdf(Buffer.from(await upload.arrayBuffer()).toString("base64")) : validateReport(JSON.parse(await upload.text()));
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
