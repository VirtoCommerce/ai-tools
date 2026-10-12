// scripts/preflight/render.ts — the ONE output form (spec §8a). Claude prints this verbatim;
// it never composes its own table. JSON (--json) is what consumers store.
import { isUnknown, type EnvFacts } from "../lib/env-facts.ts";
import type { Check } from "./policy.ts";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
}

function formatPlatformTheme(declared: any, label: string): string {
  if (!declared?.[label.toLowerCase()]) return `${label} UNKNOWN`;
  return `${label} ${declared[label.toLowerCase()]} (declared)`;
}

/** The live platform version when the Admin page gave one; else the declared one, labelled as such. */
function formatPlatform(f: EnvFacts): string {
  const live = isUnknown(f.deployed) ? null : f.deployed.platform;
  if (typeof live === "string") return `Platform ${live} (deployed)`;
  return formatPlatformTheme(isUnknown(f.declared) ? null : f.declared, "Platform");
}

function buildLine(f: EnvFacts): string {
  const d = isUnknown(f.declared) ? null : f.declared;
  const platform = formatPlatform(f);
  const theme = formatPlatformTheme(d, "Theme");
  const drift = isUnknown(f.drift) ? "drift: UNKNOWN" : `drift: ${f.drift.length ? plural(f.drift.length, "module") : "none"}`;
  const ledger = isUnknown(f.ledger) ? "ledger: UNKNOWN" : f.ledger.stale === null ? "ledger: UNKNOWN" : `ledger: ${f.ledger.stale ? "stale" : "fresh"}`;
  return `${platform} · ${theme} · ${drift} · ${ledger}`;
}

export function renderHuman(meta: { env: string; for: string; ticket?: string; at: Date }, facts: EnvFacts, checks: Check[]): string {
  const okN = checks.filter((c) => c.status === "OK").length;
  const block = checks.filter((c) => c.status === "BLOCK").length;
  const warn = checks.filter((c) => c.status === "WARN").length;
  const unknown = checks.filter((c) => c.status === "UNKNOWN").length;
  const scope = meta.ticket ? `${meta.for} ${meta.ticket}` : meta.for;
  const d = isUnknown(facts.declared) ? null : facts.declared;

  if (block + warn + unknown === 0) {
    const platform = formatPlatform(facts);
    const theme = formatPlatformTheme(d, "Theme");
    return `Preflight · ${meta.env} · ${scope} · ${platform} · ${theme} · READY (${plural(okN, "check")} OK)\n`;
  }

  const verdict = block > 0 ? "NOT READY" : "READY";
  const rows = checks.filter((c) => c.status !== "OK");
  // Sort non-OK rows: BLOCK → WARN → UNKNOWN, stable within a status
  const statusOrder = { "BLOCK": 0, "WARN": 1, "UNKNOWN": 2 };
  rows.sort((a, b) => (statusOrder[a.status as keyof typeof statusOrder] ?? 3) - (statusOrder[b.status as keyof typeof statusOrder] ?? 3));
  // Escape cell values before computing widths
  const escapedRows = rows.map((r) => ({
    ...r,
    id: escapeCell(r.id), // component:<input> carries user input
    found: escapeCell(r.found),
    who: r.who ? escapeCell(r.who) : "—",
    do: r.do ? escapeCell(r.do) : "—",
  }));
  const w = {
    status: Math.max(7, ...escapedRows.map((r) => r.status.length)),
    id: Math.max(5, ...escapedRows.map((r) => r.id.length)),
    found: Math.max(5, ...escapedRows.map((r) => r.found.length)),
    who: Math.max(3, ...escapedRows.map((r) => r.who.length)),
  };
  const line = (n: string, s: string, id: string, found: string, who: string, todo: string) =>
    `| ${n} | ${s.padEnd(w.status)} | ${id.padEnd(w.id)} | ${found.padEnd(w.found)} | ${who.padEnd(w.who)} | ${todo} |`;
  const out = [
    `Preflight · ${meta.env} · ${scope} · ${meta.at.toISOString().slice(0, 16).replace("T", " ")}`,
    `Build: ${buildLine(facts)}`,
    "",
    `${verdict} — ${plural(block, "blocker")} · ${plural(warn, "warning")}${unknown ? ` · ${unknown} unknown` : ""} · ${plural(okN, "check")} OK`,
    "",
    line("#", "Status", "Check", "Found", "Who", "Do"),
    `|---|${"-".repeat(w.status + 2)}|${"-".repeat(w.id + 2)}|${"-".repeat(w.found + 2)}|${"-".repeat(w.who + 2)}|----|`,
    ...escapedRows.map((r, k) => line(String(k + 1), r.status, r.id, r.found, r.who, r.do)),
  ];
  return out.join("\n") + "\n";
}
