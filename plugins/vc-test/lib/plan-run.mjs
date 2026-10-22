// plugins/vc-test/lib/plan-run.mjs — approved strategy + registry + capabilities → run-plan.json (spec §4.1, §5.2).
// CLI: node plugins/vc-test/lib/plan-run.mjs --strategy <test-strategy.md> --key <KEY>   (exit 2 when refused)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf, workDir } from "./paths.mjs";
import { loadRegistry, readStrategy } from "./strategy-artifacts.mjs";

const APPROVED = new Set(["APPROVED", "CHANGED", "AUTO"]);
const MAX_BROWSER_LANES = 3;

export function planRun({ strategy, registry, capabilities }) {
  if (!APPROVED.has(strategy.status)) return { ok: false, errors: [`round ${strategy.round}: strategy is not approved (Status: ${strategy.status ?? "missing"})`] };
  const byRow = new Map(registry.artifacts.filter((e) => e.row).map((e) => [e.row, e]));
  const selected = new Map();
  const notRun = [];
  for (const r of strategy.rows.filter((x) => x.decision === "RUN")) {
    const entry = byRow.get(r.row);
    if (entry) selected.set(entry.id, { entry, order: r.order });
    else notRun.push({ row: r.row, reason: registry.rows_not_run[r.row] ?? "not in the vc-test registry" });
  }
  for (const e of registry.artifacts) if (e.derivedFrom && selected.has(e.derivedFrom)) selected.set(e.id, { entry: e, order: null });

  const errors = [];
  for (const { entry } of selected.values()) {
    for (const cap of entry.requires) if (!capabilities[cap]) errors.push(`${entry.row ?? entry.id}: needs ${cap}, which this install does not have`);
  }
  if (errors.length) return { ok: false, errors };

  const needsOf = ({ entry, order }) => {
    const needs = [...entry.needs, ...(entry.order === "strategy" && order === "ALONGSIDE" ? ["checklist"] : [])];
    return needs.filter((n) => selected.has(n));
  };
  const base = new Map();
  const baseWave = (id) => {
    if (!base.has(id)) base.set(id, 1 + Math.max(0, ...needsOf(selected.get(id)).map(baseWave)));
    return base.get(id);
  };
  const ordered = [...selected.keys()].sort((a, b) => baseWave(a) - baseWave(b) || a.localeCompare(b));
  const wave = new Map();
  const browserCount = [];
  for (const id of ordered) {
    const s = selected.get(id);
    let w = 1 + Math.max(0, ...needsOf(s).map((n) => wave.get(n)));
    if (s.entry.lane?.startsWith("browser:")) {
      while ((browserCount[w] ?? 0) >= MAX_BROWSER_LANES) w++;
      browserCount[w] = (browserCount[w] ?? 0) + 1;
    }
    wave.set(id, w);
  }
  const waves = [];
  for (const id of ordered) {
    const w = wave.get(id) - 1;
    (waves[w] ??= []).push({ id, lane: selected.get(id).entry.lane, run: selected.get(id).entry.run });
  }
  return { ok: true, waves: waves.filter(Boolean).map((w) => w.sort((a, b) => a.id.localeCompare(b.id))), notRun };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [file, key] = [argOf(process.argv, "strategy"), argOf(process.argv, "key")];
  if (!file || !key) { console.error("usage: plan-run.mjs --strategy <test-strategy.md> --key <KEY>"); process.exit(1); }
  const dir = workDir(key);
  const capabilities = JSON.parse(readFileSync(join(dir, "capabilities.json"), "utf8"));
  const plan = planRun({ strategy: readStrategy(readFileSync(file, "utf8")), registry: loadRegistry(), capabilities });
  const out = join(dir, "run-plan.json");
  writeFileSync(out, JSON.stringify({ ticket: key, strategy: file, createdAt: new Date().toISOString(), ...plan }, null, 2) + "\n");
  console.log(JSON.stringify({ path: out, ...plan }));
  process.exit(plan.ok ? 0 : 2);
}
