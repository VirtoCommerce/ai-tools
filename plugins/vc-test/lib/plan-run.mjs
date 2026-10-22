// plugins/vc-test/lib/plan-run.mjs — approved strategy + registry + capabilities → run-plan.json (spec §4.1, §5.2).
// CLI: node plugins/vc-test/lib/plan-run.mjs --strategy <test-strategy.md> --key <KEY>   (exit 2 when refused)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf, workDir } from "./paths.mjs";
import { loadRegistry, readStrategy } from "./strategy-artifacts.mjs";

const APPROVED = new Set(["APPROVED", "CHANGED", "AUTO"]);
const MAX_BROWSER_LANES = 3;

export function planRun({ strategy, registry, capabilities }) {
  if (!APPROVED.has(strategy.status)) return { ok: false, errors: [`round ${strategy.round}: strategy is not approved (Status: ${strategy.status ?? "missing"})`] };
  // The scenario template (`per: "scenario"`) is instantiated from the strategy's `### Scenarios` table, never from an Artifacts row.
  const tpl = registry.artifacts.find((e) => e.per === "scenario");
  const byRow = new Map(registry.artifacts.filter((e) => e.row && !e.per).map((e) => [e.row, e]));
  const isScenarioRow = (r) => tpl && r.row === tpl.row;
  const unread = strategy.rows.filter((r) => r.decision === null && !(r.row in registry.rows_not_run) && !isScenarioRow(r));
  if (unread.length) return { ok: false, errors: unread.map((r) => `${r.row}: decision "${r.cell ?? ""}" is neither RUN nor SKIP — the cell must start with one of them`) };
  const selected = new Map();
  const notRun = [];
  for (const r of strategy.rows.filter((x) => x.decision === "RUN" && !isScenarioRow(x))) {
    const entry = byRow.get(r.row);
    if (entry) selected.set(entry.id, { entry, order: r.order });
    else notRun.push({ row: r.row, reason: registry.rows_not_run[r.row] ?? "not in the vc-test registry" });
  }
  const errors = [];
  if (tpl) {
    if (strategy.rows.some((r) => r.row === tpl.row && r.decision === "SKIP") && (strategy.scenarios ?? []).length) errors.push(`${tpl.row} row is SKIP but the table lists scenarios (U62)`);
    for (const sc of strategy.scenarios ?? []) {
      const proof = tpl.proofs?.[sc.proof];
      const id = `scenario:${sc.s}`;
      if (!proof) errors.push(`${sc.s}: Proof "${sc.proof}" is not one of ${Object.keys(tpl.proofs ?? {}).join(", ")}`);
      else if (selected.has(id)) errors.push(`${sc.s}: listed twice in the Scenarios table`);
      else {
        // A browser proof draws its lane from the pool at wave placement; a lane without its MCP server is not in it.
        const pool = proof.lanes?.filter((l) => capabilities[`mcp:${l.slice("browser:".length)}`]);
        if (pool && !pool.length) errors.push(`${id}: needs one of ${proof.lanes.map((l) => `mcp:${l.slice("browser:".length)}`).join(", ")}, which this install does not have`);
        const { proofs, per, ...rest } = tpl;
        selected.set(id, { entry: { ...rest, id, row: null, lane: null, requires: proof.requires }, order: null, scenario: sc, ...(pool ? { pool } : {}) });
      }
    }
  }
  // A derived artifact follows an artifact id or a row name ("Scenarios" = at least one scenario instantiated).
  const active = (d) => selected.has(d) || (tpl?.row === d && [...selected.values()].some((s) => s.scenario));
  for (const e of registry.artifacts) if (e.derivedFrom && active(e.derivedFrom)) selected.set(e.id, { entry: e, order: null });

  if (registry.artifacts.some((e) => e.id === "checklist") && !selected.has("checklist")) errors.push("Checklist is not RUN — nothing would decide the ACs");
  for (const s of selected.values()) {
    const missing = s.entry.requires.filter((cap) => !capabilities[cap]);
    // A derived lane is not the strategy's choice, so a missing capability blocks only its rows at run time.
    if (s.entry.derivedFrom && missing.length) s.missing = missing;
    else for (const cap of missing) errors.push(`${s.entry.row ?? s.entry.id}: needs ${cap}, which this install does not have`);
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
  const byId = (a, b) => a.localeCompare(b, "en", { numeric: true });
  // A fixed-lane entry is placed before a scenario of the same base wave, so a scenario takes a lane the others left free.
  const ordered = [...selected.keys()].sort((a, b) => baseWave(a) - baseWave(b) || !!selected.get(a).scenario - !!selected.get(b).scenario || byId(a, b));
  const wave = new Map();
  const browserCount = [];
  const lanesIn = []; // wave -> lanes taken: two browser entries never share one (one browser session per agent)
  // Scenarios that write the same setting never share a wave, and two global writers never do either (one global window at a time).
  const writeKey = (w) => `${w.scope}/${w.name}`;
  const writersIn = [];
  const clash = (w, sc) => (writersIn[w] ?? []).some((o) => o.writes.some((x) => x.scope === "global") && sc.writes.some((x) => x.scope === "global")
    || o.writes.some((x) => sc.writes.some((y) => writeKey(x) === writeKey(y))));
  for (const id of ordered) {
    const s = selected.get(id);
    let w = 1 + Math.max(0, ...needsOf(s).map((n) => wave.get(n)));
    const browser = (s.pool || s.entry.lane?.startsWith("browser:")) && !s.missing;
    const freeLane = (x) => (s.pool ? s.pool.find((l) => !lanesIn[x]?.has(l)) : !lanesIn[x]?.has(s.entry.lane));
    while ((browser && ((browserCount[w] ?? 0) >= MAX_BROWSER_LANES || !freeLane(w))) || (s.scenario && clash(w, s.scenario))) w++;
    if (browser) {
      s.lane = s.pool ? freeLane(w) : s.entry.lane;
      browserCount[w] = (browserCount[w] ?? 0) + 1;
      (lanesIn[w] ??= new Set()).add(s.lane);
    }
    if (s.scenario) (writersIn[w] ??= []).push(s.scenario);
    wave.set(id, w);
  }
  const waves = [];
  for (const id of ordered) {
    const w = wave.get(id) - 1;
    const { entry, missing } = selected.get(id);
    (waves[w] ??= []).push({ id, lane: selected.get(id).lane ?? entry.lane, run: entry.run, ...(selected.get(id).scenario?.exploratory ? { exploratory: true } : {}), ...(missing ? { missing } : {}) });
  }
  return { ok: true, waves: waves.filter(Boolean).map((w) => w.sort((a, b) => byId(a.id, b.id))), notRun };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [file, key] = [argOf(process.argv, "strategy"), argOf(process.argv, "key")];
  if (!file || !key) { console.error("usage: plan-run.mjs --strategy <test-strategy.md> --key <KEY>"); process.exit(1); }
  const dir = workDir(key);
  const capsFile = join(dir, "capabilities.json");
  if (!existsSync(capsFile)) { console.log(JSON.stringify({ ok: false, errors: [`no ${capsFile} — run step 0 (capabilities.mjs) on this env first`] })); process.exit(2); }
  const capabilities = JSON.parse(readFileSync(capsFile, "utf8"));
  const plan = planRun({ strategy: readStrategy(readFileSync(file, "utf8")), registry: loadRegistry(), capabilities });
  const out = join(dir, "run-plan.json");
  writeFileSync(out, JSON.stringify({ ticket: key, strategy: file, createdAt: new Date().toISOString(), ...plan }, null, 2) + "\n");
  console.log(JSON.stringify({ path: out, ...plan }));
  process.exit(plan.ok ? 0 : 2);
}
