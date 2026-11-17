import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db";

type Row = Record<string, any>;
export const MAX_UPLOAD = 15 * 1024 * 1024;
/** Kept next to the database, so on the host it lives on the persistent disk. */
const dir = () => process.env.UPLOAD_DIR ?? path.join(path.dirname(process.env.DATABASE_PATH && process.env.DATABASE_PATH !== ":memory:" ? process.env.DATABASE_PATH : path.join(process.cwd(), "data", "x")), "uploads");

/** Identifies the file from its first bytes, not its name, so a renamed file cannot pass as another type. */
export function sniff(b: Buffer): "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export function saveFile(f: { clientId: string; letterId?: string | null; kind: string; filename: string; bytes: Buffer; allow?: string[] }) {
  if (f.bytes.length > MAX_UPLOAD) throw new Error("That file is over 15 MB. Take a smaller photo or save it as a PDF.");
  const mime = sniff(f.bytes);
  if (!mime || (f.allow && !f.allow.includes(mime))) throw new Error("Upload a PDF, or a photo saved as JPG, PNG or WebP.");
  const id = randomUUID();
  fs.mkdirSync(dir(), { recursive: true });
  const file = path.join(dir(), id);
  fs.writeFileSync(file, f.bytes, { mode: 0o600 });
  db().prepare("INSERT INTO documents (id, client_id, letter_id, kind, filename, mime, size, path, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(id, f.clientId, f.letterId ?? null, f.kind, f.filename.replace(/[^\w. -]/g, "_").slice(0, 120) || "file", mime, f.bytes.length, id, new Date().toISOString());
  return { id, mime };
}
export const getFile = (id: string) => db().prepare("SELECT * FROM documents WHERE id = ?").get(id) as Row | undefined;
export const readFile = (doc: Row) => fs.readFileSync(path.join(dir(), path.basename(doc.path)));
export const filesFor = (clientId: string, letterId?: string) =>
  (letterId ? db().prepare("SELECT * FROM documents WHERE client_id = ? AND letter_id = ? ORDER BY created_at").all(clientId, letterId)
    : db().prepare("SELECT * FROM documents WHERE client_id = ? ORDER BY created_at").all(clientId)) as Row[];
export const setMeta = (id: string, meta: unknown) => db().prepare("UPDATE documents SET meta = ? WHERE id = ?").run(JSON.stringify(meta), id);
