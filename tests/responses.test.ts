import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "liq-up-"));
let resp: typeof import("@/lib/responses"), files: typeof import("@/lib/files"), store: typeof import("@/lib/store"), db: typeof import("@/lib/db").db, sample: typeof import("@/lib/sample");
const meta = { ip: "203.0.113.1", userAgent: "test" };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
let id: string, letter: any;
/** A streamed Messages API reply carrying one text block. */
function sse(text: string) {
  const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const body = ev("message_start", { message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } })
    + ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } })
    + ev("content_block_delta", { index: 0, delta: { type: "text_delta", text } })
    + ev("content_block_stop", { index: 0 })
    + ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } })
    + ev("message_stop", {});
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}
beforeAll(async () => {
  resp = await import("@/lib/responses"); files = await import("@/lib/files"); store = await import("@/lib/store"); db = (await import("@/lib/db")).db; sample = await import("@/lib/sample");
  id = store.createClient({ tenant: "default", name: "Jordan Rivers", email: "j@example.com", phone: "", address: "1 Main", city: "Daytona Beach", state: "FL", zip: "32114", dob: "1988-04-12", ssnLast4: "1234", businessStage: "operating", fundingGoal: "" });
  store.ackDisclosure(id, meta); store.signContract(id, "Jordan Rivers", meta);
  db().prepare("UPDATE clients SET signed_at='2026-01-05T12:00:00Z', report_reviewed_at='2026-01-06', freeze_done_at='2026-01-06' WHERE id=?").run(id);
  store.saveReport(id, sample.sampleReport());
  store.buildRound(id);
  letter = (store.getLetters(id) as any[]).find((l) => l.recipient_bureau === "EQ");
  store.attestLetter(id, letter.id); store.markMailed(id, letter.id, "T1", "2026-01-12");
  letter = store.getLetter(id, letter.id);
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.ANTHROPIC_API_KEY; });

describe("uploaded files", () => {
  it("are identified by their content, not their name", () => {
    expect(files.sniff(PNG)).toBe("image/png");
    expect(files.sniff(Buffer.from("%PDF-1.7 ..."))).toBe("application/pdf");
    expect(files.sniff(Buffer.from("<html><script>"))).toBeNull();
    expect(() => files.saveFile({ clientId: id, kind: "x", filename: "evil.pdf", bytes: Buffer.from("<script>") })).toThrow(/PDF, or a photo/);
  });
});

describe("bureau replies", () => {
  it("are only accepted for mailed letters", async () => {
    const draft = (store.getLetters(id) as any[]).find((l) => l.status === "draft");
    await expect(resp.uploadResponse(id, draft.id, { filename: "r.png", bytes: PNG }, "consumer")).rejects.toThrow(/mailed/);
  });
  it("are kept with the letter even when they cannot be read", async () => {
    const r = await resp.uploadResponse(id, letter.id, { filename: "reply.png", bytes: PNG }, "consumer");
    expect(r.error).toMatch(/not switched on/);
    expect(files.filesFor(id, letter.id)).toHaveLength(1);
  });
  it("are read into suggestions that only become results once confirmed", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const n = letter.cases.length;
    // a model reply that deletes item 1, verifies item 2, says nothing about the rest, and invents item 99
    const items = [{ n: 1, outcome: "deleted", quote: "has been deleted" }, { n: 2, outcome: "verified", quote: "verified as reported" }, { n: 99, outcome: "deleted", quote: "x" }];
    vi.stubGlobal("fetch", vi.fn(async () => sse(JSON.stringify({ sender: "Equifax", frivolous: false, items }))));
    const r = await resp.uploadResponse(id, letter.id, { filename: "reply.png", bytes: PNG }, "consumer");
    expect(r.error).toBeNull();
    const fresh = store.getLetter(id, letter.id) as any;
    const s = resp.pendingSuggestions(fresh, files.filesFor(id, letter.id));
    expect(Object.values(s).map((x) => x.outcome)).toEqual(["deleted", "verified"]);
    expect(fresh.cases.every((c: any) => !c.outcome)).toBe(true); // nothing recorded yet
    expect(resp.confirmSuggestions(id, letter.id, files.filesFor(id, letter.id), "consumer")).toBe(2);
    const after = store.getLetter(id, letter.id) as any;
    expect(after.cases.filter((c: any) => c.outcome).length).toBe(2);
    expect(n).toBeGreaterThan(2);
  });
  it("treat a frivolous notice as applying to every item the reply did not settle", () => {
    const reading = resp.parseReading({ sender: "TransUnion", frivolous: true, items: [{ n: 1, outcome: "deleted", quote: "removed" }, { n: 2, outcome: "maybe", quote: "" }] }, [1, 2, 3]);
    expect(reading.items).toEqual([{ n: 1, outcome: "deleted", quote: "removed" }, { n: 2, outcome: null, quote: "" }]);
    expect(Object.values(resp.suggest(reading, ["a", "b", "c"])).map((x) => x.outcome)).toEqual(["deleted", "frivolous", "frivolous"]);
  });
});
