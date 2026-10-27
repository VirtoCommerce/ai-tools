// plugins/vc-test/lib/plan-run.mjs — approved strategy + registry + capabilities → run-plan.json (spec §4.1, §5.2).
// CLI: node plugins/vc-test/lib/plan-run.mjs --strategy <test-strategy.md> --key <KEY>   (exit 2 when refused)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf, workDir } from "./paths.mjs";
import { INSTANCE_PREFIX, loadRegistry, readStrategy } from "./strategy-artifacts.mjs";

const APPROVED = new Set(["APPROVED", "CHANGED", "AUTO"]);
const MAX_BROWSER_LANES = 3;
// Where each per-row template's instances come from. A prior bug needs nothing (`needs: []`), so it runs in the first
// wave, drawing its browser lane from the same pool — and the same ≤ 3 per wave — as the scenarios.
const INSTANCES = {
  scenario: { noun: "scenarios", key: "scenario", list: (st) => (st.scenarios ?? []).map((sc) => ({ name: sc.s, proof: sc.proof, item: sc })) },
  "prior-bug": { noun: "prior bugs", key: "bug", list: (st) => (st.priorBugs ?? []).map((b) => ({ name: b.pb, proof: b.proof, item: b })) },
};

export function planRun({ strategy, registry, capabilities }) {
  if (!APPROVED.has(strategy.status)) return { ok: false, errors: [`round ${strategy.round}: strategy is not approved (Status: ${strategy.status ?? "missing"})`] };
  // `append` writes `Status: AUTO` before the strategy agent completes the section: a run stopped in between must not
  // plan an ungated section, whatever order the command runs its steps in.
  if (strategy.tbd) return { ok: false, errors: [`round ${strategy.round}: ${strategy.tbd} line(s) still read 'TBD — strategy agent' — the strategy agent has not completed the section (gate it with check-strategy.mjs first)`] };
  // A per-row template (`per`) is instantiated from its own table of the round — `### Scenarios` as `scenario:S-n`,
  // `### Prior bugs` as `bug:PB-n` — never from its Artifacts row, whose RUN/SKIP only has to agree with that table.
  const templates = registry.artifacts.filter((e) => e.per && INSTANCES[e.per]);
  const byRow = new Map(registry.artifacts.filter((e) => e.row && !e.per).map((e) => [e.row, e]));
  const isTemplateRow = (r) => templates.some((t) => r.row === t.row);
  const unread = strategy.rows.filter((r) => r.decision === null && !(r.row in registry.rows_not_run) && !isTemplateRow(r));
  if (unread.length) return { ok: false, errors: unread.map((r) => `${r.row}: decision "${r.cell ?? ""}" is neither RUN nor SKIP — the cell must start with one of them`) };
  const selected = new Map();
  const notRun = [];
  for (const r of strategy.rows.filter((x) => x.decision === "RUN" && !isTemplateRow(x))) {
    const entry = byRow.get(r.row);
    if (entry) selected.set(entry.id, { entry, order: r.order });
    else notRun.push({ row: r.row, reason: registry.rows_not_run[r.row] ?? "not in the vc-test registry" });
  }
  const errors = [];
  for (const tpl of templates) {
    const { list, noun, key } = INSTANCES[tpl.per];
    const items = list(strategy);
    if (strategy.rows.some((r) => r.row === tpl.row && r.decision === "SKIP") && items.length) errors.push(`${tpl.row} row is SKIP but the table lists ${noun} (U62)`);
    for (const it of items) {
      const proof = tpl.proofs?.[it.proof];
      const id = `${INSTANCE_PREFIX[tpl.per]}:${it.name}`;
      if (!proof) errors.push(`${it.name}: Proof "${it.proof}" is not one of ${Object.keys(tpl.proofs ?? {}).join(", ")}`);
      else if (selected.has(id)) errors.push(`${it.name}: listed twice in the ${tpl.row} table`);
      else {
        // A browser proof draws its lane from the pool at wave placement; a lane without its MCP server is not in it.
        const pool = proof.lanes?.filter((l) => capabilities[`mcp:${l.slice("browser:".length)}`]);
        if (pool && !pool.length) errors.push(`${id}: needs one of ${proof.lanes.map((l) => `mcp:${l.slice("browser:".length)}`).join(", ")}, which this install does not have`);
        const { proofs, per, ...rest } = tpl;
        selected.set(id, { entry: { ...rest, id, row: null, lane: null, requires: proof.requires }, order: null, instanceOf: tpl.row, [key]: it.item, ...(pool ? { pool } : {}) });
      }
    }
  }
  // A derived artifact follows an artifact id or a row name ("Scenarios" = at least one scenario instantiated).
  const active = (d) => selected.has(d) || [...selected.values()].some((s) => s.instanceOf === d);
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
  // A fixed-lane entry is placed before an instance (a scenario, a prior bug) of the same base wave, so an instance takes
  // a lane the others left free.
  const ordered = [...selected.keys()].sort((a, b) => baseWave(a) - baseWave(b) || !!selected.get(a).instanceOf - !!selected.get(b).instanceOf || byId(a, b));
  const wave = new Map();
  const browserCount = [];
  const lanesIn = []; // wave -> lanes taken: two browser entries never share one (one browser session per agent)
  // Scenarios that write the same setting never share a wave. A scenario that writes a GLOBAL setting, or a setting of a
  // SHARED store (any store but one the run created, `store:new-…`), runs alone in its wave — no other scenario, no
  // ac-checks, nothing: the flipped value would falsify what its wave-mates observe (and a second global window could
  // not open). An entry with `missing` is not dispatched, so it takes no room.
  const writeKey = (w) => `${w.scope}/${w.name}`;
  const writersIn = [];
  const clash = (w, sc) => (writersIn[w] ?? []).some((o) => o.writes.some((x) => sc.writes.some((y) => writeKey(x) === writeKey(y))));
  const shared = (x) => x.scope === "global" || (x.scope.startsWith("store:") && !x.scope.startsWith("store:new-"));
  const isGlobal = (s) => !!s.scenario?.writes.some(shared);
  const runningIn = []; // wave -> how many dispatched entries it holds
  const globalIn = []; // wave -> it holds a writer of shared state
  for (const id of ordered) {
    const s = selected.get(id);
    let w = 1 + Math.max(0, ...needsOf(s).map((n) => wave.get(n)));
    const browser = (s.pool || s.entry.lane?.startsWith("browser:")) && !s.missing;
    const freeLane = (x) => (s.pool ? s.pool.find((l) => !lanesIn[x]?.has(l)) : !lanesIn[x]?.has(s.entry.lane));
    const alone = (x) => s.missing || (isGlobal(s) ? !runningIn[x] : !globalIn[x]);
    while ((browser && ((browserCount[w] ?? 0) >= MAX_BROWSER_LANES || !freeLane(w))) || (s.scenario && clash(w, s.scenario)) || !alone(w)) w++;
    if (browser) {
      s.lane = s.pool ? freeLane(w) : s.entry.lane;
      browserCount[w] = (browserCount[w] ?? 0) + 1;
      (lanesIn[w] ??= new Set()).add(s.lane);
    }
    if (s.scenario) (writersIn[w] ??= []).push(s.scenario);
    if (!s.missing) runningIn[w] = (runningIn[w] ?? 0) + 1;
    if (isGlobal(s)) globalIn[w] = true;
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
