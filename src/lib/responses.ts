import { parseReading, readResponse, ResponseReading } from "./ai";
import { getFile, readFile, saveFile, setMeta } from "./files";
import { getLetter, log, recordOutcome } from "./store";
import type { Outcome } from "./types";

type Row = Record<string, any>;

/** Saves the reply to a letter and, when AI is on, reads it into suggested results. Never records anything by itself. */
export async function uploadResponse(clientId: string, letterId: string, file: { filename: string; bytes: Buffer }, actor: string) {
  const letter = getLetter(clientId, letterId) as Row | undefined;
  if (!letter || !["mailed", "closed"].includes(letter.status)) throw new Error("Upload a response only for a letter that was mailed.");
  const doc = saveFile({ clientId, letterId, kind: "bureau_response", filename: file.filename, bytes: file.bytes });
  log(clientId, actor, "response_uploaded", { letterId, documentId: doc.id });
  const open = (letter.cases as Row[]).filter((c) => !c.outcome);
  if (!open.length) return { documentId: doc.id, reading: null as ResponseReading | null, error: null as string | null };
  try {
    const reading = await readResponse({ mime: doc.mime, bytes: readFile(getFile(doc.id)!) }, open.map((c, i) => ({ n: i + 1, label: `${c.item_label} (${c.bureau})` })));
    const suggestions = suggest(reading, open.map((c) => c.id));
    setMeta(doc.id, { reading, suggestions });
    return { documentId: doc.id, reading, error: null };
  } catch (e) {
    return { documentId: doc.id, reading: null, error: (e as Error).message };
  }
}

/** Case id → suggested outcome. A frivolous notice applies to every item the reply did not otherwise settle. */
export function suggest(reading: ResponseReading, caseIds: string[]): Record<string, { outcome: Outcome; quote: string }> {
  const out: Record<string, { outcome: Outcome; quote: string }> = {};
  caseIds.forEach((id, i) => {
    const r = reading.items.find((x) => x.n === i + 1);
    if (r?.outcome) out[id] = { outcome: r.outcome, quote: r.quote };
    else if (reading.frivolous) out[id] = { outcome: "frivolous", quote: "Reply says the dispute is frivolous or will not be investigated" };
  });
  return out;
}

/** The newest reading for a letter whose suggestions still apply to unrecorded items. */
export function pendingSuggestions(letter: Row, docs: Row[]): Record<string, { outcome: Outcome; quote: string }> {
  const open = new Set((letter.cases as Row[]).filter((c) => !c.outcome).map((c) => c.id));
  for (const d of [...docs].reverse()) {
    const s = d.meta ? JSON.parse(d.meta).suggestions : null;
    if (s) return Object.fromEntries(Object.entries(s as Record<string, { outcome: Outcome; quote: string }>).filter(([id]) => open.has(id)));
  }
  return {};
}

export function confirmSuggestions(clientId: string, letterId: string, docs: Row[], actor: string) {
  const letter = getLetter(clientId, letterId) as Row;
  const s = pendingSuggestions(letter, docs);
  for (const [caseId, v] of Object.entries(s)) recordOutcome(clientId, letterId, caseId, v.outcome, actor);
  return Object.keys(s).length;
}
export { parseReading };
