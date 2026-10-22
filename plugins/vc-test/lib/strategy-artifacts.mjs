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
  // The first FIRST/ALONGSIDE the cell names, in any case, that is not negated ("ALONGSIDE, not FIRST").
  const order = decision === "RUN"
    ? ([...cell.matchAll(/\b(FIRST|ALONGSIDE)\b/gi)].find((m) => !/\bnot\s+$/i.test(cell.slice(0, m.index)))?.[1].toUpperCase() ?? null)
    : null;
  const reason = decision === "SKIP" ? cell.replace(/^SKIP\s*(?:—|-|:)?\s*/i, "").trim() : "";
  return { decision, order, reason };
}

// The `### Scenarios` table score-scenarios.mjs renders: | S | Class | What | Bug | Why | Score | Proof | Writes |.
// Writes is "—" or `scope/name` joined by ";" — split each at its FIRST "/" (a store id carries none).
function writesOf(cell) {
  return String(cell ?? "").split(";").map((w) => w.trim()).filter((w) => w && w !== "—").map((w) => {
    const i = w.indexOf("/");
    return i < 0 ? { scope: w, name: "" } : { scope: w.slice(0, i), name: w.slice(i + 1) };
  });
}

export function readStrategy(md) {
  const sec = lastRound(String(md).replace(/\r\n?/g, "\n"));
  const head = /^## Round (\d+)/.exec(sec);
  const status = /^Status:\s*(APPROVED|CHANGED|AUTO|DRAFT)\b/m.exec(sec)?.[1] ?? null;
  const table = rows(block(sec, "Artifacts")).map(([row, cell]) => ({ row, ...decisionOf(cell ?? ""), cell: cell ?? "" }));
  const scenarios = rows(block(sec, "Scenarios")).filter((c) => /^S-\d+$/.test(c[0] ?? ""))
    .map((c) => ({ s: c[0], cls: Number(c[1]), proof: (c[6] ?? "").toLowerCase(), writes: writesOf(c[7]) }));
  return { round: head ? Number(head[1]) : 0, status, rows: table, scenarios };
}

export function loadRegistry(path = join(LIB, "artifacts.json")) {
  const { artifacts, rows_not_run } = JSON.parse(readFileSync(path, "utf8"));
  return { artifacts, rows_not_run };
}
