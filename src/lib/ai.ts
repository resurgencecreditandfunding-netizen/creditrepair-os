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

/** Reads a credit report PDF into the structured form the audit rules work on. */
export async function parseReportPdf(base64: string): Promise<CreditReport> {
  if (!aiEnabled()) throw new Error("AI is not configured, so PDF reports cannot be read. Upload a JSON report instead.");
  const out = await ask(
    `You transcribe consumer credit reports into JSON. Transcribe only what the document states.
- Never guess or fill in a value. Omit any optional field the document does not show.
- If a date shows only month and year, use the first day of that month.
- One entry per account; put each bureau's version of the account under "bureaus".
- Output a single JSON object matching this shape and nothing else:
${SCHEMA_HINT}`,
    [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
      { type: "text", text: "Transcribe this credit report." },
    ],
  );
  if (!out) throw new Error("The report could not be read. Try a clearer PDF or upload JSON.");
  const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  const report = validateReport(JSON.parse(json));
  return { ...report, source: "pdf (AI transcription, review before use)" };
}
