import { createHash, randomUUID } from "node:crypto";
import { auditReport } from "./audit";
import { addBusinessDays, addDays, fmt, today } from "./dates";
import { LAW } from "./law";
import { db } from "./db";
import { Brand, contractDocs, disclosureDoc } from "./documents";
import { composeLetter, LetterCase } from "./letters";
import { byPriority, caseKey, countsTowardCap, dueDate, firstStep, groupFindings, MAX_ITEMS_PER_LETTER, nextStep, STEP_ROUND } from "./rounds";
import {
  Assertion, Bureau, BUREAU_NAME, CreditReport, Finding, ItemType, Outcome, Step,
} from "./types";

export const DEMO = process.env.DEMO_MODE === "1";
const now = () => new Date().toISOString();
type Row = Record<string, any>;

// ---------- audit log (hash chained so later edits are detectable) ----------
export function log(clientId: string | null, actor: string, action: string, detail: unknown = {}) {
  const d = db();
  const prev = (d.prepare("SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1").get() as Row | undefined)?.hash ?? "genesis";
  const at = now(), body = JSON.stringify(detail);
  const hash = createHash("sha256").update([prev, clientId, actor, action, body, at].join("|")).digest("hex");
  d.prepare("INSERT INTO audit_log (client_id, actor, action, detail, at, prev_hash, hash) VALUES (?,?,?,?,?,?,?)")
    .run(clientId, actor, action, body, at, prev, hash);
}
export function getLog(clientId: string) {
  return db().prepare("SELECT * FROM audit_log WHERE client_id = ? ORDER BY seq DESC LIMIT 200").all(clientId) as Row[];
}

// ---------- tenants and clients ----------
export function getTenant(slugOrId: string): Row {
  const d = db();
  return (d.prepare("SELECT * FROM tenants WHERE slug = ? OR id = ?").get(slugOrId, slugOrId)
    ?? d.prepare("SELECT * FROM tenants WHERE slug = 'default'").get()) as Row;
}
export const brandOf = (client: Row): Brand => { const t = getTenant(client.tenant_id); return { name: t.name, address: t.address, legalName: t.legal_name }; };

export interface NewClient {
  tenant: string; name: string; email: string; phone: string; address: string; city: string; state: string;
  zip: string; dob: string; ssnLast4: string; businessStage: string; fundingGoal: string; smsOptIn?: boolean;
}
export function createClient(c: NewClient) {
  const id = randomUUID();
  db().prepare(`INSERT INTO clients (id, tenant_id, name, email, phone, address, city, state, zip, dob, ssn_last4, business_stage, funding_goal, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, getTenant(c.tenant).id, c.name, c.email, c.phone, c.address, c.city,
    c.state, c.zip, c.dob, c.ssnLast4, c.businessStage, c.fundingGoal, now());
  if (c.smsOptIn && c.phone) db().prepare("UPDATE clients SET sms_opt_in_at = ? WHERE id = ?").run(now(), id);
  log(id, "consumer", "account_created", { businessStage: c.businessStage, textOptIn: !!(c.smsOptIn && c.phone) });
  return id;
}
export const getClient = (id: string) => db().prepare("SELECT * FROM clients WHERE id = ?").get(id) as Row | undefined;

// ---------- disclosures and signatures ----------
interface Meta { ip: string; userAgent: string }
function saveAgreement(clientId: string, doc: { key: string; version: string; title: string; body: string; hash: string }, kind: string, name: string | null, m: Meta) {
  db().prepare(`INSERT INTO agreements (id, client_id, doc_key, doc_version, doc_title, doc_body, doc_hash, kind, signed_name, ip, user_agent, at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), clientId, doc.key, doc.version, doc.title, doc.body, doc.hash, kind, name, m.ip, m.userAgent, now());
}
/** Step 1: the CROA disclosure is delivered on its own, before any contract is shown. */
export function ackDisclosure(clientId: string, m: Meta) {
  const doc = disclosureDoc();
  saveAgreement(clientId, doc, "acknowledged", null, m);
  db().prepare("UPDATE clients SET disclosure_ack_at = ? WHERE id = ?").run(now(), clientId);
  log(clientId, "consumer", "croa_disclosure_acknowledged", { hash: doc.hash });
}
export const cancelDeadline = (signedDate: string) => addBusinessDays(signedDate, 3);
/** Step 2: one click signs every contract document with the same adopted signature. */
export function signContract(clientId: string, signedName: string, m: Meta) {
  const client = getClient(clientId)!;
  if (!client.disclosure_ack_at) throw new Error("The disclosure must be acknowledged before the contract can be signed.");
  const docs = contractDocs(brandOf(client), cancelDeadline(today()));
  for (const doc of docs) saveAgreement(clientId, doc, "signed", signedName, m);
  db().prepare("UPDATE clients SET signed_at = ? WHERE id = ?").run(now(), clientId);
  log(clientId, "consumer", "contract_signed", { signedName, docs: docs.map((x) => ({ key: x.key, hash: x.hash })) });
}
export const getAgreements = (clientId: string) =>
  db().prepare("SELECT * FROM agreements WHERE client_id = ? ORDER BY at").all(clientId) as Row[];

/** CROA § 404: no services until the 3-business-day cancellation period has ended. */
export function serviceStartDate(client: Row): string | null {
  if (!client.signed_at) return null;
  return addDays(cancelDeadline(client.signed_at.slice(0, 10)), 1);
}
export function canServe(client: Row) {
  if (client.status !== "active" || !client.signed_at) return false;
  return DEMO || today() >= serviceStartDate(client)!;
}
export function cancelService(clientId: string) {
  const d = db();
  d.prepare("UPDATE clients SET status = 'cancelled' WHERE id = ?").run(clientId);
  d.prepare("DELETE FROM letter_cases WHERE letter_id IN (SELECT id FROM letters WHERE client_id = ? AND status IN ('draft','attested'))").run(clientId);
  d.prepare("DELETE FROM letters WHERE client_id = ? AND status IN ('draft','attested')").run(clientId);
  log(clientId, "consumer", "service_cancelled");
}

// ---------- reports ----------
export function getReports(clientId: string): CreditReport[] {
  return (db().prepare("SELECT data FROM reports WHERE client_id = ? ORDER BY created_at").all(clientId) as Row[])
    .map((r) => JSON.parse(r.data));
}
export function saveReport(clientId: string, report: CreditReport, actor = "system") {
  const d = db();
  d.prepare("INSERT INTO reports (id, client_id, pulled_at, source, data, created_at) VALUES (?,?,?,?,?,?)")
    .run(randomUUID(), clientId, report.pulledAt, report.source, JSON.stringify(report), now());
  log(clientId, actor, "report_saved", { source: report.source, scores: report.scores, accounts: report.accounts.length });

  // A deleted item that is back on the new report was reinserted: reopen it at the reinsertion step.
  for (const c of getCases(clientId).filter((x) => x.status === "resolved" && x.resolution?.startsWith("Deleted"))) {
    if (!itemPresent(report, c.item_type, c.item_id, c.bureau)) continue;
    const fact = {
      code: "REINSERTED", source: "system", itemType: c.item_type, itemId: c.item_id, itemLabel: c.item_label, bureau: c.bureau,
      severity: "high", action: "delete", title: "Deleted item reinserted",
      fact: `This item was deleted from my file on ${fmt(c.updated_at.slice(0, 10))} after my dispute. It has been put back without the certification and five-day notice the law requires.`,
      statutes: [LAW.REINSERTION],
    };
    d.prepare("UPDATE cases SET status='pending_letter', step='REINSERTION', round=?, resolution=NULL, findings=?, updated_at=? WHERE id=?")
      .run(STEP_ROUND.REINSERTION, JSON.stringify([fact, ...c.findings.filter((f) => f.code !== "REINSERTED")]), now(), c.id);
    log(clientId, "system", "reinsertion_detected", { caseId: c.id, item: c.item_label, bureau: c.bureau });
  }
  // An open case whose item no longer appears with that bureau has been deleted.
  for (const c of getCases(clientId).filter((x) => !["resolved", "exhausted"].includes(x.status))) {
    if (!itemPresent(report, c.item_type, c.item_id, c.bureau)) {
      d.prepare("UPDATE cases SET status='resolved', resolution=?, updated_at=? WHERE id=?")
        .run("Deleted (no longer on the new report)", now(), c.id);
      d.prepare("UPDATE letter_cases SET outcome='deleted', outcome_at=? WHERE case_id=? AND outcome IS NULL").run(now(), c.id);
      log(clientId, "system", "case_resolved_by_report", { caseId: c.id, item: c.item_label, bureau: c.bureau });
    }
  }
  closeFinishedLetters(clientId);
}
function itemPresent(r: CreditReport, type: ItemType, id: string, bureau: Bureau) {
  if (type === "account") return !!r.accounts.find((a) => a.id === id)?.bureaus[bureau];
  if (type === "inquiry") return r.inquiries.some((i) => i.id === id);
  if (type === "public_record") return !!r.publicRecords.find((p) => p.id === id)?.bureaus.includes(bureau);
  const [b, kind, ...rest] = id.split("|");
  return !!r.personal[b as Bureau]?.[`${kind}s` as "names"]?.includes(rest.join("|"));
}

// ---------- what the consumer tells us ----------
export function getAssertions(clientId: string) {
  return db().prepare("SELECT * FROM assertions WHERE client_id = ?").all(clientId) as Row[];
}
/** reason "accurate" means: the consumer confirms the item is right, so it is never disputed. */
export function setAssertion(clientId: string, itemType: ItemType, itemId: string, reason: string, note: string) {
  db().prepare(`INSERT INTO assertions (client_id, item_type, item_id, reason, note, at) VALUES (?,?,?,?,?,?)
    ON CONFLICT (client_id, item_type, item_id) DO UPDATE SET reason=excluded.reason, note=excluded.note, at=excluded.at`)
    .run(clientId, itemType, itemId, reason, note, now());
  log(clientId, "consumer", "item_statement", { itemType, itemId, reason, note });
}
export function clearAssertion(clientId: string, itemType: ItemType, itemId: string) {
  db().prepare("DELETE FROM assertions WHERE client_id=? AND item_type=? AND item_id=?").run(clientId, itemType, itemId);
  log(clientId, "consumer", "item_statement_removed", { itemType, itemId });
}

export function currentFindings(clientId: string): Finding[] {
  const report = getReports(clientId).at(-1);
  if (!report) return [];
  const rows = getAssertions(clientId);
  const accurate = new Set(rows.filter((r) => r.reason === "accurate").map((r) => `${r.item_type}:${r.item_id}`));
  const assertions: Assertion[] = rows.filter((r) => r.reason !== "accurate")
    .map((r) => ({ itemType: r.item_type, itemId: r.item_id, reason: r.reason, note: r.note ?? undefined }));
  return auditReport(report, assertions, today()).filter((f) => !accurate.has(`${f.itemType}:${f.itemId}`));
}

// ---------- cases, rounds, letters ----------
export function getCases(clientId: string) {
  return (db().prepare("SELECT * FROM cases WHERE client_id = ? ORDER BY created_at").all(clientId) as Row[])
    .map((c) => ({ ...c, findings: JSON.parse(c.findings) as Finding[] })) as (Row & { findings: Finding[] })[];
}
export function getLetters(clientId: string) {
  const d = db();
  return (d.prepare("SELECT * FROM letters WHERE client_id = ? ORDER BY created_at DESC").all(clientId) as Row[]).map((l) => ({
    ...l,
    cases: d.prepare(`SELECT c.*, lc.outcome FROM letter_cases lc JOIN cases c ON c.id = lc.case_id WHERE lc.letter_id = ?`).all(l.id) as Row[],
  }));
}
export function getLetter(clientId: string, id: string) { return getLetters(clientId).find((l: Row) => l.id === id); }

/**
 * Opens a round 1 case for every new finding, then drafts one letter per recipient
 * for every case that is waiting for its next letter.
 */
export function buildRound(clientId: string): number {
  const client = getClient(clientId)!;
  if (!canServe(client)) throw new Error("Services cannot begin until the cancellation period has ended.");
  if (!client.report_reviewed_at) throw new Error("Review your credit report before letters are prepared.");
  if (!client.freeze_done_at) throw new Error("Complete the secondary bureau freeze step before letters are prepared.");
  const d = db();
  const report = getReports(clientId).at(-1);
  if (!report) return 0;
  const grouped = groupFindings(currentFindings(clientId));
  const existing = new Map(getCases(clientId).map((c) => [caseKey({ itemType: c.item_type, itemId: c.item_id, bureau: c.bureau }), c]));

  for (const [key, findings] of grouped) {
    const f = findings[0], prior = existing.get(key);
    if (!prior) {
      const acct = f.itemType === "account" ? report.accounts.find((a) => a.id === f.itemId) : undefined;
      d.prepare(`INSERT INTO cases (id, client_id, item_type, item_id, item_label, bureau, furnisher, is_collection, round, step, status, findings, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'pending_letter',?,?,?)`)
        .run(randomUUID(), clientId, f.itemType, f.itemId, f.itemLabel, f.bureau, acct?.creditor ?? null,
          acct?.kind === "collection" ? 1 : 0, STEP_ROUND[firstStep(findings)], firstStep(findings), JSON.stringify(findings), now(), now());
    } else if (prior.status === "pending_letter" && prior.step !== "REINSERTION") {
      d.prepare("UPDATE cases SET findings=?, updated_at=? WHERE id=?").run(JSON.stringify(findings), now(), prior.id);
    }
  }
  // A case not yet mailed whose basis has gone (consumer confirmed it accurate) is dropped.
  for (const [key, c] of existing) {
    if (c.status === "pending_letter" && c.round === 1 && !c.last_mailed_at && !grouped.has(key)) d.prepare("DELETE FROM cases WHERE id=?").run(c.id);
  }

  const pending = draftableCases(clientId);
  const groups = new Map<string, typeof pending>();
  for (const c of pending) {
    const k = `${recipientOf(c)}|${c.step}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  // Strongest items first; past the per-letter limit, items wait for the next letter to this recipient.
  const batches = new Map<string, typeof pending>();
  for (const [k, list] of groups) {
    const sorted = [...list].sort((a, b) => byPriority({ itemType: a.item_type, findings: a.findings }, { itemType: b.item_type, findings: b.findings }));
    let counted = 0;
    batches.set(k, sorted.filter((c) => !countsTowardCap(c.item_type) || ++counted <= MAX_ITEMS_PER_LETTER));
  }
  for (const [k, cases] of batches) {
    const [recipientType, who, step] = k.split("|") as ["cra" | "furnisher", string, Step];
    const recipientName = recipientType === "cra" ? BUREAU_NAME[who as Bureau] : who;
    const body = composeLetter({
      client: { name: client.name, address: client.address, city: client.city, state: client.state, zip: client.zip, dob: client.dob, ssnLast4: client.ssn_last4 },
      step, date: today(), recipientType, recipientName, recipientBureau: recipientType === "cra" ? (who as Bureau) : undefined,
      cases: cases.map((c): LetterCase => ({
        itemType: c.item_type, itemLabel: c.item_label, bureau: c.bureau, findings: c.findings,
        isCollection: !!c.is_collection, priorMailedAt: c.last_mailed_at,
      })),
    });
    const id = randomUUID();
    d.prepare(`INSERT INTO letters (id, client_id, recipient_type, recipient_name, recipient_bureau, round, step, body, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,'draft',?)`).run(id, clientId, recipientType, recipientName, recipientType === "cra" ? who : null, STEP_ROUND[step], step, body, now());
    for (const c of cases) {
      d.prepare("INSERT INTO letter_cases (letter_id, case_id) VALUES (?,?)").run(id, c.id);
      d.prepare("UPDATE cases SET status='in_letter', updated_at=? WHERE id=?").run(now(), c.id);
    }
    log(clientId, "system", "letter_drafted", { letterId: id, recipient: recipientName, step, items: cases.length });
  }
  return batches.size;
}

// One open letter per bureau or company at a time: a second dispute while one is pending invites a "duplicate" dismissal.
const recipientOf = (c: Row) => c.step === "FURNISHER_DIRECT" ? `furnisher|${c.furnisher}` : `cra|${c.bureau}`;
/** Cases waiting for a letter whose bureau or company has no letter open right now. */
export function draftableCases(clientId: string) {
  const busy = new Set((db().prepare("SELECT recipient_type, recipient_name, recipient_bureau FROM letters WHERE client_id = ? AND status IN ('draft','attested','mailed')").all(clientId) as Row[])
    .map((l) => l.recipient_type === "cra" ? `cra|${l.recipient_bureau}` : `furnisher|${l.recipient_name}`));
  return getCases(clientId).filter((c) => c.status === "pending_letter" && !busy.has(recipientOf(c)));
}

export const ATTESTATION =
  "I have read this letter. To the best of my knowledge, each item in it is inaccurate, incomplete, or cannot be verified, and every statement in it is true. I approve sending it in my name.";

function ownLetter(clientId: string, id: string) {
  const l = db().prepare("SELECT * FROM letters WHERE id=? AND client_id=?").get(id, clientId) as Row | undefined;
  if (!l) throw new Error("Letter not found.");
  return l;
}
export function attestLetter(clientId: string, id: string) {
  const l = ownLetter(clientId, id);
  if (l.status !== "draft") return;
  db().prepare("UPDATE letters SET status='attested', attested_at=? WHERE id=?").run(now(), id);
  log(clientId, "consumer", "letter_attested", { letterId: id, statement: ATTESTATION, bodyHash: createHash("sha256").update(l.body).digest("hex") });
}
export function discardDraft(clientId: string, id: string) {
  const l = ownLetter(clientId, id);
  if (!["draft", "attested"].includes(l.status)) return;
  const d = db();
  d.prepare("UPDATE cases SET status='pending_letter' WHERE id IN (SELECT case_id FROM letter_cases WHERE letter_id=?)").run(id);
  d.prepare("DELETE FROM letter_cases WHERE letter_id=?").run(id);
  d.prepare("DELETE FROM letters WHERE id=?").run(id);
  log(clientId, "consumer", "letter_discarded", { letterId: id });
}
export function setLetterBody(clientId: string, id: string, body: string, actor: string) {
  const l = ownLetter(clientId, id);
  if (l.status !== "draft") throw new Error("Only a draft can be changed.");
  db().prepare("UPDATE letters SET body=? WHERE id=?").run(body, id);
  log(clientId, actor, "letter_reworded", { letterId: id });
}
export function markMailed(clientId: string, id: string, tracking: string, mailedAt = today(), actor = "consumer") {
  const l = ownLetter(clientId, id);
  if (l.status !== "attested") throw new Error("A letter must be approved by the consumer before it is mailed.");
  const d = db();
  d.prepare("UPDATE letters SET status='mailed', mailed_at=?, tracking=?, due_at=? WHERE id=?").run(mailedAt, tracking, dueDate(l.step, mailedAt), id);
  d.prepare("UPDATE cases SET status='awaiting_response', last_mailed_at=?, updated_at=? WHERE id IN (SELECT case_id FROM letter_cases WHERE letter_id=?)").run(mailedAt, now(), id);
  log(clientId, actor, "letter_mailed", { letterId: id, tracking, mailedAt });
}
export function recordOutcome(clientId: string, letterId: string, caseId: string, outcome: Outcome, actor = "consumer") {
  const l = ownLetter(clientId, letterId);
  if (l.status !== "mailed") throw new Error("Results can only be recorded for a mailed letter.");
  if (outcome === "no_response" && !DEMO && today() <= l.due_at) throw new Error(`The response deadline (${l.due_at}) has not passed yet.`);
  const d = db();
  const c = d.prepare("SELECT * FROM cases WHERE id=? AND client_id=?").get(caseId, clientId) as Row;
  const next = nextStep(l.step, outcome, c.item_type);
  d.prepare("UPDATE letter_cases SET outcome=?, outcome_at=? WHERE letter_id=? AND case_id=?").run(outcome, now(), letterId, caseId);
  if (next === "resolved") d.prepare("UPDATE cases SET status='resolved', resolution=?, updated_at=? WHERE id=?").run(outcome === "deleted" ? "Deleted" : "Corrected", now(), caseId);
  else if (next === "exhausted") d.prepare("UPDATE cases SET status='exhausted', resolution=?, updated_at=? WHERE id=?").run("All rounds used. Consider a consumer statement or an attorney.", now(), caseId);
  else d.prepare("UPDATE cases SET status='pending_letter', step=?, round=?, updated_at=? WHERE id=?").run(next, STEP_ROUND[next], now(), caseId);
  log(clientId, actor, "outcome_recorded", { letterId, caseId, outcome, next });
  closeFinishedLetters(clientId);
}
function closeFinishedLetters(clientId: string) {
  db().prepare(`UPDATE letters SET status='closed' WHERE client_id=? AND status='mailed'
    AND NOT EXISTS (SELECT 1 FROM letter_cases lc WHERE lc.letter_id = letters.id AND lc.outcome IS NULL)`).run(clientId);
}
