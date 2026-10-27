// plugins/vc-test/lib/scenario-rows.mjs — merges the per-scenario row files into testing-checklist.md (B20). A scenario
// agent writes only <RUN_DIR>/scenarios/S-n.rows.md, so no two agents ever write one file; after each wave the
// orchestrator runs this, alone, and the rows land under `## Scenario results`, which ends the checklist.
// CLI: node plugins/vc-test/lib/scenario-rows.mjs merge --run-dir <RUN_DIR> --ids S-1,S-3[,PB-1][,visual][,pixel]
//   S-n takes only its own `| SC-<n>.<m> |` rows; PB-n (a prior bug's re-run, briefs/bug-rerun.md) only its `| PB-<n> |` row; `visual` (the Visual lane's visual.rows.md) only `| VIS-<m> |` rows;
//   `pixel` (the orchestrator's PIXEL items, pixel.rows.md) only `| PIX-<m> |` rows — two files, so the lane and the
//   orchestrator never write one file in the same wave. The LAST row of an id in its file wins (a correction is the
//   same id added again): a row whose id the checklist already holds replaces that line when it differs (`replaced`),
//   so merging an id again after a later wave or a send-back never duplicates it.
//   Blank lines are dropped — a blank line ends the table for triage. The checklist's trailing blank lines are cut so
//   the first row follows the table directly.
//   exit 0: all merged; 1: usage, or no checklist / no `## Scenario results`; 2: an id with no rows file or no row
//   (`missing`), or a line that is not that id's row (`refused`, not merged) — every good row is merged all the same.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf } from "./paths.mjs";

const OWN_PREFIX = { visual: "VIS", pixel: "PIX" };
const rowRe = (id) => (OWN_PREFIX[id] ? new RegExp(`^\\|\\s*${OWN_PREFIX[id]}-\\d+\\s*\\|`)
  : /^PB-\d+$/.test(id) ? new RegExp(`^\\|\\s*${id}\\s*\\|`)
  : new RegExp(`^\\|\\s*SC-${/^S-(\d+)$/.exec(id)[1]}\\.\\d+\\s*\\|`));
const rowId = (line) => /^\|\s*([^|]+?)\s*\|/.exec(line)?.[1];

export function mergeRows({ runDir, ids }) {
  const file = join(runDir, "testing-checklist.md");
  if (!existsSync(file)) return { code: 1, out: { error: `no ${file}` } };
  const text = readFileSync(file, "utf8");
  if (!/^## Scenario results\s*$/m.test(text)) return { code: 1, out: { error: `${file} has no "## Scenario results" table` } };
  const body = text.replace(/\s+$/, "").split(/\r?\n/);
  const at = new Map(); // row id -> its line in the checklist (-1: added by this merge)
  body.forEach((l, i) => { const k = rowId(l.trim()); if (k && !at.has(k)) at.set(k, i); });
  const merged = {}, replaced = {}, missing = [], refused = [], rows = [];
  for (const id of ids) {
    const f = join(runDir, "scenarios", `${id}.rows.md`);
    const lines = existsSync(f) ? readFileSync(f, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
    const own = lines.filter((l) => rowRe(id).test(l));
    for (const l of lines.filter((x) => !own.includes(x))) refused.push(`${id}: ${l.slice(0, 80)}`);
    if (!own.length) { missing.push(id); continue; }
    const last = new Map(); // first-seen order, the last row of each id
    for (const l of own) last.set(rowId(l), l);
    for (const [k, l] of last) {
      if (!at.has(k)) { at.set(k, -1); rows.push(l); merged[id] = (merged[id] ?? 0) + 1; }
      else if (at.get(k) >= 0 && body[at.get(k)].trim() !== l) { body[at.get(k)] = l; replaced[id] = (replaced[id] ?? 0) + 1; }
    }
  }
  if (rows.length || Object.keys(replaced).length) writeFileSync(file, `${[...body, ...rows].join("\n")}\n`);
  return { code: missing.length || refused.length ? 2 : 0, out: { merged, replaced, missing, refused } };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cmd] = process.argv.slice(2);
  const runDir = argOf(process.argv, "run-dir");
  const ids = (argOf(process.argv, "ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (cmd !== "merge" || !runDir || !ids.length || ids.some((id) => !OWN_PREFIX[id] && !/^(?:S|PB)-\d+$/.test(id))) {
    console.error("usage: scenario-rows.mjs merge --run-dir <RUN_DIR> --ids S-1,S-3[,PB-1][,visual][,pixel]");
    process.exit(1);
  }
  const r = mergeRows({ runDir, ids });
  console.log(JSON.stringify(r.out));
  process.exit(r.code);
}
