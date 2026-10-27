// plugins/vc-test/lib/strategy-artifacts.mjs — reads the approved round of test-strategy.md and the artifact registry.
// The section, block and row parsing mirrors skills/qa-test-strategy/lib/check-strategy.mjs, so a file its
// gate accepts reads the same here.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = dirname(fileURLToPath(import.meta.url));

export const lastRound = (md) => { const i = md.lastIndexOf("\n## Round "); return i < 0 ? (md.startsWith("## Round ") ? md : "") : md.slice(i + 1); };
export const block = (sec, heading) => { const m = new RegExp(`^### ${heading}[ \\t]*\\n([\\s\\S]*?)(?=\\n### |(?![\\s\\S]))`, "m").exec(sec); return m ? m[1] : ""; };
export const rows = (text) => text.split("\n").filter((l) => /^\|/.test(l) && !/^[\s|:-]+$/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim())).slice(1);

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

// The `### Prior bugs` table rounds.mjs append writes in a round ≥ 2: | PB | Bug | Severity | Found | Reproduction | R |.
// Bug is `<tracker key or B-n> — <title>`; Reproduction `spec <path>`, `package <path>` or `none`. Its proof: a `.spec`
// runs through the runner (`spec`), a package on a browser lane (`browser`); `none` needs no lane and no capability —
// it is still dispatched, and comes back `BLOCKED — no reproduction recorded` (never silently dropped, never a refused
// plan). Any other text keeps its own word as the proof, which the planner refuses as no proof of the template.
const proofOf = (reproduction) => (/^spec\s+\S/i.test(reproduction) ? "spec" : /^package\s+\S/i.test(reproduction) ? "browser"
  : /^none$/i.test(reproduction) ? "none" : (reproduction.split(/\s+/)[0] || "missing").toLowerCase());
function priorBugsOf(sec) {
  return rows(block(sec, "Prior bugs")).filter((c) => /^PB-\d+$/.test(c[0] ?? "")).map((c) => {
    const reproduction = c[4] ?? "";
    return { pb: c[0], key: (c[1] ?? "").split(/\s+—\s+/)[0].trim(), severity: c[2] ?? "", reproduction, r: (c[5] ?? "").trim(), proof: proofOf(reproduction) };
  });
}

/** The per-row templates of the registry and the plan-entry prefix of their instances (`scenario:S-n`, `bug:PB-n`). */
export const INSTANCE_PREFIX = { scenario: "scenario", "prior-bug": "bug" };
/** The registry template an instance id (`scenario:S-2`, `bug:PB-1`) belongs to, and its row id; null for any other id. */
export function instanceOf(registry, id) {
  const m = /^([a-z-]+):([A-Z]+-\d+)$/.exec(id);
  const per = m && Object.keys(INSTANCE_PREFIX).find((p) => INSTANCE_PREFIX[p] === m[1]);
  const template = per && registry.artifacts.find((e) => e.per === per);
  return template ? { template, name: m[2] } : null;
}

export function readStrategy(md) {
  const sec = lastRound(String(md).replace(/\r\n?/g, "\n"));
  const head = /^## Round (\d+)/.exec(sec);
  const status = /^Status:\s*(APPROVED|CHANGED|AUTO|DRAFT)\b/m.exec(sec)?.[1] ?? null;
  const table = rows(block(sec, "Artifacts")).map(([row, cell]) => ({ row, ...decisionOf(cell ?? ""), cell: cell ?? "" }));
  const scenarios = rows(block(sec, "Scenarios")).filter((c) => /^S-\d+$/.test(c[0] ?? ""))
    .map((c) => ({ s: c[0], cls: Number(c[1]), proof: (c[6] ?? "").toLowerCase(), exploratory: /^exploratory/i.test(c[4] ?? ""), writes: writesOf(c[7]) }));
  return { round: head ? Number(head[1]) : 0, status, rows: table, scenarios, priorBugs: priorBugsOf(sec) };
}

export function loadRegistry(path = join(LIB, "artifacts.json")) {
  const { artifacts, rows_not_run, orchestrator } = JSON.parse(readFileSync(path, "utf8"));
  return { artifacts, rows_not_run, orchestrator };
}
