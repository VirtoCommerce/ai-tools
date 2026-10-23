// plugins/vc-test/lib/scenario-rows.mjs — merges the per-scenario row files into testing-checklist.md (B20). A scenario
// agent writes only <RUN_DIR>/scenarios/S-n.rows.md, so no two agents ever write one file; after each wave the
// orchestrator runs this, alone, and the rows land under `## Scenario results`, which ends the checklist.
// CLI: node plugins/vc-test/lib/scenario-rows.mjs merge --run-dir <RUN_DIR> --ids S-1,S-3[,visual]
//   S-n takes only its own `| SC-<n>.<m> |` rows; `visual` (the orchestrator's visual.rows.md) only `| VIS-<m> |` rows.
//   Blank lines are dropped — a blank line ends the table for triage. The checklist's trailing blank lines are cut so
//   the first row follows the table directly.
//   exit 0: all merged; 1: usage, or no checklist / no `## Scenario results`; 2: an id with no rows file or no row
//   (`missing`), or a line that is not that id's row (`refused`, not merged) — every good row is merged all the same.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf } from "./paths.mjs";

const rowRe = (id) => (id === "visual" ? /^\|\s*VIS-\d+\s*\|/ : new RegExp(`^\\|\\s*SC-${/^S-(\d+)$/.exec(id)[1]}\\.\\d+\\s*\\|`));

export function mergeRows({ runDir, ids }) {
  const file = join(runDir, "testing-checklist.md");
  if (!existsSync(file)) return { code: 1, out: { error: `no ${file}` } };
  const text = readFileSync(file, "utf8");
  if (!/^## Scenario results\s*$/m.test(text)) return { code: 1, out: { error: `${file} has no "## Scenario results" table` } };
  const merged = {}, missing = [], refused = [], rows = [];
  for (const id of ids) {
    const f = join(runDir, "scenarios", `${id}.rows.md`);
    const lines = existsSync(f) ? readFileSync(f, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
    const own = lines.filter((l) => rowRe(id).test(l));
    for (const l of lines.filter((x) => !own.includes(x))) refused.push(`${id}: ${l.slice(0, 80)}`);
    if (!own.length) missing.push(id);
    else { merged[id] = own.length; rows.push(...own); }
  }
  if (rows.length) writeFileSync(file, `${text.replace(/\s+$/, "")}\n${rows.join("\n")}\n`);
  return { code: missing.length || refused.length ? 2 : 0, out: { merged, missing, refused } };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cmd] = process.argv.slice(2);
  const runDir = argOf(process.argv, "run-dir");
  const ids = (argOf(process.argv, "ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (cmd !== "merge" || !runDir || !ids.length || ids.some((id) => id !== "visual" && !/^S-\d+$/.test(id))) {
    console.error("usage: scenario-rows.mjs merge --run-dir <RUN_DIR> --ids S-1,S-3[,visual]");
    process.exit(1);
  }
  const r = mergeRows({ runDir, ids });
  console.log(JSON.stringify(r.out));
  process.exit(r.code);
}
