import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// Loaded through getBuiltinModule so the bundler does not try to resolve it.
const sqlite = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'direct'
);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
  address TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, zip TEXT NOT NULL,
  dob TEXT NOT NULL, ssn_last4 TEXT NOT NULL, business_stage TEXT NOT NULL, funding_goal TEXT,
  status TEXT NOT NULL DEFAULT 'active', disclosure_ack_at TEXT, signed_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agreements (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, doc_key TEXT NOT NULL, doc_version TEXT NOT NULL,
  doc_title TEXT NOT NULL, doc_body TEXT NOT NULL, doc_hash TEXT NOT NULL, kind TEXT NOT NULL,
  signed_name TEXT, ip TEXT, user_agent TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, pulled_at TEXT NOT NULL, source TEXT NOT NULL,
  data TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assertions (
  client_id TEXT NOT NULL, item_type TEXT NOT NULL, item_id TEXT NOT NULL, reason TEXT NOT NULL,
  note TEXT, at TEXT NOT NULL, PRIMARY KEY (client_id, item_type, item_id)
);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, item_type TEXT NOT NULL, item_id TEXT NOT NULL,
  item_label TEXT NOT NULL, bureau TEXT NOT NULL, furnisher TEXT, is_collection INTEGER NOT NULL DEFAULT 0,
  round INTEGER NOT NULL, step TEXT NOT NULL, status TEXT NOT NULL, findings TEXT NOT NULL,
  resolution TEXT, last_mailed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (client_id, item_type, item_id, bureau)
);
CREATE TABLE IF NOT EXISTS letters (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, recipient_type TEXT NOT NULL, recipient_name TEXT NOT NULL,
  recipient_bureau TEXT, round INTEGER NOT NULL, step TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL, attested_at TEXT, mailed_at TEXT, tracking TEXT, due_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS letter_cases (
  letter_id TEXT NOT NULL, case_id TEXT NOT NULL, outcome TEXT, outcome_at TEXT,
  PRIMARY KEY (letter_id, case_id)
);
CREATE TABLE IF NOT EXISTS audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL,
  detail TEXT NOT NULL, at TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);
`;

const g = globalThis as unknown as { __cfoDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (g.__cfoDb) return g.__cfoDb;
  const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new sqlite.DatabaseSync(file);
  d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  d.exec(SCHEMA);
  d.prepare("INSERT OR IGNORE INTO tenants (id, slug, name, address, kind) VALUES (?,?,?,?,?)").run(
    "tenant_default", "default",
    process.env.BRAND_NAME ?? "CreditOS",
    process.env.BRAND_ADDRESS ?? "[Company street address, city, state, ZIP]",
    "direct",
  );
  g.__cfoDb = d;
  return d;
}
