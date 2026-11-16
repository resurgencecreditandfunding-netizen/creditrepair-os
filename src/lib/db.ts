import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hashPassword } from "./password";

// Loaded through getBuiltinModule so the bundler does not try to resolve it.
const sqlite = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'direct', legal_name TEXT
);
CREATE TABLE IF NOT EXISTS operators (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL
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
CREATE TABLE IF NOT EXISTS monitoring_services (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, blurb TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL,
  detail TEXT NOT NULL, at TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);
`;

/** First console login. Set ADMIN_EMAIL and ADMIN_PASSWORD; demo mode falls back to a known login. */
function seedAdmin(d: DatabaseSync) {
  if (d.prepare("SELECT 1 FROM operators LIMIT 1").get()) return;
  const demo = process.env.DEMO_MODE === "1";
  const email = process.env.ADMIN_EMAIL ?? (demo ? "admin@demo.local" : undefined);
  const password = process.env.ADMIN_PASSWORD ?? (demo ? "demo-console" : undefined);
  if (!email || !password) return;
  d.prepare("INSERT INTO operators (id, tenant_id, email, name, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(randomUUID(), "tenant_default", email.toLowerCase(), "Platform admin", hashPassword(password), "platform", new Date().toISOString());
}

const g = globalThis as unknown as { __cfoDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (g.__cfoDb) return g.__cfoDb;
  const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new sqlite.DatabaseSync(file);
  d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  d.exec(SCHEMA);
  try { d.exec("ALTER TABLE tenants ADD COLUMN legal_name TEXT"); } catch { /* column already exists */ }
  // The platform's own tenant. BRAND_NAME is the product name; LEGAL_NAME is the contracting company.
  d.prepare("INSERT OR IGNORE INTO tenants (id, slug, name, address, kind, legal_name) VALUES (?,?,?,?,?,?)").run(
    "tenant_default", "default",
    process.env.BRAND_NAME ?? "CreditOS",
    process.env.BRAND_ADDRESS ?? "220 Sheila Ave, Daytona Beach, FL 32114",
    "direct",
    process.env.LEGAL_NAME ?? "Resurgence Consulting Services Incorporated",
  );
  seedAdmin(d);
  g.__cfoDb = d;
  return d;
}
