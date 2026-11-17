import Anthropic from "@anthropic-ai/sdk";
import { validateReport } from "./validate";
import { CreditReport } from "./types";

/**
 * Where AI is used, and where it is not.
 * The decision about WHAT to dispute and WHICH round comes next is made by fixed rules
 * (audit.ts, rounds.ts). Claude reads documents and improves wording. It never adds a claim.
 */
const MODEL = "claude-opus-5-5";
export const aiEnabled = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

async function ask(system: string, content: Anthropic.Beta.BetaMessageContentParam): Promise<string | null> {
  const client = new Anthropic();
  const msg = await client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system,
    messages: [{ role: "user", content }],
  }).finalMessage();
  if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") return null;
  return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim() || null;
}

/** Every dollar amount, date, statute section and item header in the letter. */
export function factTokens(text: string): string[] {
  const patterns = [
    /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,
    /(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}/g,
    /§§? ?\d+[A-Za-z]?(?:\([a-zA-Z0-9]+\))*/g,
    /\d+ (?:U\.S\.C\.|C\.F\.R\.) § ?[\d.]+[a-z]?(?:-\d+)?/g,
    /ITEM \d+: [^\n]+/g,
    /XXX-XX-\d{4}/g,
  ];
  return [...new Set(patterns.flatMap((p) => text.match(p) ?? []))];
}

/**
 * Rewrites a letter in the consumer's own plain voice. The result is accepted only if every
 * fact in the original is still present; otherwise the original is kept.
 */
export async function rewordLetter(body: string): Promise<{ body: string; changed: boolean; reason?: string }> {
  if (!aiEnabled()) return { body, changed: false, reason: "AI is not configured." };
  const out = await ask(
    `You help a consumer put a credit dispute letter into their own plain, direct words so it does not read like a form letter.
Rules:
- Keep every fact, amount, date, account label, legal citation, and request exactly as given. Add no new claim, reason, threat, or fact.
- Keep the address blocks, the RE block, every "ITEM n:" header line, the Enclosures line, and the signature unchanged.
- Vary sentence structure and wording of the surrounding prose only. First person, polite, firm, no legal jargon beyond the citations already present.
- Output the letter text only.`,
    body,
  );
  if (!out) return { body, changed: false, reason: "The AI did not return a letter." };
  const missing = factTokens(body).filter((t) => !out.includes(t));
  if (missing.length) return { body, changed: false, reason: `Rewording was rejected because it dropped: ${missing.slice(0, 3).join("; ")}` };
  return { body: out, changed: true };
}

const SCHEMA_HINT = `{
  "pulledAt": "YYYY-MM-DD",
  "scores": { "EQ": 0, "EX": 0, "TU": 0 },            // only bureaus present in the document
  "personal": { "EQ": { "names": [], "addresses": [], "employers": [] } },
  "accounts": [{
    "id": "a1", "creditor": "", "accountMask": "****1234",
    "kind": "revolving|installment|mortgage|auto|student|collection|other",
    "originalCreditor": "", "isMedical": false, "responsibility": "individual|joint|authorized_user",
    "bureaus": { "EQ": {
      "status": "current|late|chargeoff|collection|repossession|bankruptcy|settled|paid|closed",
      "balance": 0, "pastDue": 0, "creditLimit": 0,
      "dateOpened": "YYYY-MM-DD", "dateClosed": "YYYY-MM-DD", "dofd": "YYYY-MM-DD", "lastReported": "YYYY-MM-DD",
      "lates": [{ "month": "YYYY-MM", "days": 30 }]
    } }
  }],
  "inquiries": [{ "id": "i1", "bureau": "EQ", "creditor": "", "date": "YYYY-MM-DD" }],
  "publicRecords": [{ "id": "p1", "type": "bankruptcy_ch7|bankruptcy_ch13", "filed": "YYYY-MM-DD", "bureaus": ["EQ"] }]
}`;

const TRANSCRIBE = `You transcribe consumer credit reports into JSON. Transcribe only what the document states.
- Never guess or fill in a value. Omit any optional field the document does not show.
- If a date shows only month and year, use the first day of that month.
- One entry per account; put each bureau's version of the account under "bureaus".
- Output a single JSON object matching this shape and nothing else:
${SCHEMA_HINT}`;

/** Turns a saved web page into plain text, dropping scripts, styles and markup. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(td|th)>/gi, " | ").replace(/<(br|\/tr|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/ *\n\s*/g, "\n").trim();
}

const MAX_TEXT = 1_500_000; // characters; larger files are refused rather than cut short

/**
 * Reads a report downloaded from a credit monitoring service (PDF, or a saved web page)
 * into the structured form the audit rules work on.
 */
export async function parseReportFile(file: { name: string; type: string; bytes: Buffer }): Promise<CreditReport> {
  if (!aiEnabled()) throw new Error("Report reading is not switched on yet. The platform needs an AI key before reports can be uploaded.");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  let content: Anthropic.Beta.BetaMessageContentParam;
  if (isPdf) {
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.bytes.toString("base64") } },
      { type: "text", text: "Transcribe this credit report." },
    ];
  } else {
    const raw = file.bytes.toString("utf8");
    const text = /<html|<body|<table|<div/i.test(raw) ? htmlToText(raw) : raw;
    if (text.length < 200) throw new Error("That file does not contain a readable report. Save the full report page as PDF or HTML and try again.");
    if (text.length > MAX_TEXT) throw new Error("That file is too large to read in one pass. Save the report as PDF instead.");
    content = `Transcribe this credit report.\n\n<report>\n${text}\n</report>`;
  }
  const out = await ask(TRANSCRIBE, content);
  if (!out) throw new Error("The report could not be read. Try saving it as PDF and uploading again.");
  let parsed: unknown;
  try { parsed = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)); }
  catch { throw new Error("The report could not be read. Try saving it as PDF and uploading again."); }
  const report = validateReport(parsed);
  return { ...report, source: `${isPdf ? "PDF" : "saved page"} (read by AI)` };
}

// ---------- bureau responses ----------
export type ReadOutcome = "deleted" | "corrected" | "verified";
export interface ResponseReading {
  sender: string | null;
  frivolous: boolean;
  items: { n: number; outcome: ReadOutcome | null; quote: string }[];
}

/**
 * Reads a bureau's or furnisher's reply and suggests a result for each item that was disputed.
 * The client confirms every suggestion before anything is recorded.
 */
export async function readResponse(file: { mime: string; bytes: Buffer }, items: { n: number; label: string }[]): Promise<ResponseReading> {
  if (!aiEnabled()) throw new Error("Reading responses is not switched on yet. Record each result by hand below.");
  const media: Anthropic.Beta.BetaContentBlockParam = file.mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.bytes.toString("base64") } }
    : { type: "image", source: { type: "base64", media_type: file.mime as "image/jpeg" | "image/png" | "image/webp", data: file.bytes.toString("base64") } };
  const out = await ask(
    `You read replies from credit bureaus and creditors to a consumer's dispute letter. For each disputed item listed, decide what the reply says happened to it.
- "deleted": the reply says the item was deleted or removed.
- "corrected": the reply says the item was updated or modified, but is still on the report.
- "verified": the reply says the item was verified, remains, or is accurate as reported.
- null: the reply does not mention the item, or you cannot tell. Never guess.
Set "frivolous" to true only if the reply says the dispute is frivolous or irrelevant, or that the bureau will not investigate.
Quote the exact short phrase from the reply that supports each decision (empty string when null).
Output only JSON: {"sender": string|null, "frivolous": boolean, "items": [{"n": number, "outcome": "deleted"|"corrected"|"verified"|null, "quote": string}]}`,
    [media, { type: "text", text: `Disputed items:\n${items.map((i) => `${i.n}. ${i.label}`).join("\n")}` }],
  );
  if (!out) throw new Error("The response could not be read. Record each result by hand below.");
  let raw: any;
  try { raw = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)); } catch { throw new Error("The response could not be read. Record each result by hand below."); }
  return parseReading(raw, items.map((i) => i.n));
}

/** Keeps only well-formed answers about items that were actually in the letter. */
export function parseReading(raw: any, valid: number[]): ResponseReading {
  const ok = new Set(["deleted", "corrected", "verified"]);
  const items = (Array.isArray(raw?.items) ? raw.items : [])
    .filter((x: any) => valid.includes(Number(x?.n)))
    .map((x: any) => ({ n: Number(x.n), outcome: ok.has(x.outcome) ? x.outcome : null, quote: typeof x.quote === "string" ? x.quote.slice(0, 300) : "" }));
  return { sender: typeof raw?.sender === "string" ? raw.sender.slice(0, 120) : null, frivolous: raw?.frivolous === true, items };
}
