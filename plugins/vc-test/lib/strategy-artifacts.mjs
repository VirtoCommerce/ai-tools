// plugins/vc-test/lib/strategy-artifacts.mjs — reads the approved round of test-strategy.md and the artifact registry.
// The section, block and row parsing mirrors .claude/skills/qa-test-strategy/lib/check-strategy.mjs, so a file its
// gate accepts reads the same here.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = dirname(fileURLToPath(import.meta.url));

const lastRound = (md) => { const i = md.lastIndexOf("\n## Round "); return i < 0 ? (md.startsWith("## Round ") ? md : "") : md.slice(i + 1); };
const block = (sec, heading) => { const m = new RegExp(`^### ${heading}[ \\t]*\\n([\\s\\S]*?)(?=\\n### |(?![\\s\\S]))`, "m").exec(sec); return m ? m[1] : ""; };
const rows = (text) => text.split("\n").filter((l) => /^\|/.test(l) && !/^[\s|:-]+$/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim())).slice(1);

function decisionOf(cell) {
  const decision = /^SKIP\b/i.test(cell) ? "SKIP" : /^RUN\b/i.test(cell) ? "RUN" : null;
  const order = decision === "RUN" ? (/\bFIRST\b/.exec(cell)?.[0] ?? /\bALONGSIDE\b/.exec(cell)?.[0] ?? null) : null;
  const reason = decision === "SKIP" ? cell.replace(/^SKIP\s*(?:—|-|:)?\s*/i, "").trim() : "";
  return { decision, order, reason };
}

export function readStrategy(md) {
  const sec = lastRound(String(md).replace(/\r\n?/g, "\n"));
  const head = /^## Round (\d+)/.exec(sec);
  const status = /^Status:\s*(APPROVED|CHANGED|AUTO|DRAFT)\b/m.exec(sec)?.[1] ?? null;
  const table = rows(block(sec, "Artifacts")).map(([row, cell]) => ({ row, ...decisionOf(cell ?? "") }));
  return { round: head ? Number(head[1]) : 0, status, rows: table };
}

export function loadRegistry(path = join(LIB, "artifacts.json")) {
  const { artifacts, rows_not_run } = JSON.parse(readFileSync(path, "utf8"));
  return { artifacts, rows_not_run };
}
