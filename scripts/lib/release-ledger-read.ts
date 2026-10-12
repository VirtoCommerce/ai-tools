// scripts/lib/release-ledger-read.ts — read-only view of release-ledger.md for the pre-flight core.
// The ledger is GENERATED (scripts/maintenance/refresh-release-ledger.mjs); this reads its two
// machine-shaped parts — §1's table and §2's per-month rows — and never edits it.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const LEDGER_PATH = ".claude/knowledge/domain/release-ledger.md";

export interface LedgerLatest { component: string; latest: string; since: string; repo: string }
export interface LedgerRow { month: string; feature: string; component: string; version: string; repo: string; breaking: boolean }
export interface Ledger { generated: string | null; staleAfterDays: number | null; latest: LedgerLatest[]; rows: LedgerRow[] }

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const isRow = (line: string) => line.trim().startsWith("|") && !/^\|\s*-/.test(line.trim());
const unTick = (s: string) => s.replace(/`/g, "").trim();

function section(text: string, startRe: RegExp): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return end < 0 ? rest : rest.slice(0, end);
}

export function parseLedger(text: string): Ledger {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const generated = /^generated:\s*(\S+)/m.exec(fm)?.[1] ?? null;
  const staleRaw = /^stale_after_days:\s*(\d+)/m.exec(fm)?.[1];

  const latest: LedgerLatest[] = [];
  for (const line of section(text, /^## 1\./)) {
    if (!isRow(line)) continue;
    const [component, l, since, repo] = cells(line);
    if (!component || component === "Component") continue;
    latest.push({ component, latest: unTick(l), since, repo: unTick(repo) });
  }

  const rows: LedgerRow[] = [];
  let month = "";
  for (const line of section(text, /^## 2\./)) {
    const m = /^### (\d{4}-\d{2})/.exec(line);
    if (m) { month = m[1]; continue; }
    if (!isRow(line) || !month) continue;
    const [feature, comp] = cells(line);
    // A feature can ship in several components ("[Customer 3.1014.0](…) + [Frontend 2.53.0](…)"): one row each.
    for (const link of (comp ?? "").matchAll(/\[(.+?) (\d[^\]]*)\]\(https:\/\/github\.com\/[^/]+\/([^/]+)\/releases\/tag\/[^)]+\)/g))
      rows.push({ month, feature, component: link[1], version: link[2], repo: link[3], breaking: /BREAKING/.test(feature) });
  }

  return { generated, staleAfterDays: staleRaw ? Number(staleRaw) : null, latest, rows };
}

export function readLedger(root: string = REPO_ROOT): Ledger | null {
  const p = join(root, LEDGER_PATH);
  return existsSync(p) ? parseLedger(readFileSync(p, "utf8")) : null;
}
