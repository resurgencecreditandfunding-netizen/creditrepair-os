import { today } from "./dates";
import { dealsFor } from "./funding-deals";
import { fundingStatus } from "./funding";
import { getCases, getReports } from "./store";

type Row = Record<string, any>;
export type WinKind = "deleted" | "points" | "unlocked" | "funded";
export interface Win { kind: WinKind; big: string; line: string }

/** Milestones a client can share. Computed from their record; nothing here is a claim we cannot back up. */
export function winsFor(client: Row): Win[] {
  const out: Win[] = [];
  const deleted = getCases(client.id).filter((c) => c.resolution?.startsWith("Deleted")).length;
  const reports = getReports(client.id);
  const f = fundingStatus(reports[0] ?? null, reports.at(-1) ?? null, today());
  if (deleted > 0) out.push({ kind: "deleted", big: String(deleted), line: `inaccurate item${deleted > 1 ? "s" : ""} deleted from my credit reports` });
  if (f.gain >= 10) out.push({ kind: "points", big: `+${f.gain}`, line: "points on my middle credit score" });
  if (f.unlocked) out.push({ kind: "unlocked", big: "Unlocked", line: "my business funding options" });
  if (dealsFor(client.id).some((d) => d.status === "funded")) out.push({ kind: "funded", big: "Funded", line: "my business got the capital it needed" });
  return out;
}
