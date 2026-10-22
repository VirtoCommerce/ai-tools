// plugins/vc-test/lib/score-scenarios.mjs — ranks the generator's candidate scenarios by bug likelihood × cost of failure
// and keeps the ones a run can afford (spec U61, U68, B18, B19). Deterministic: the generator proposes, this decides.
// CLI: node plugins/vc-test/lib/score-scenarios.mjs --key <KEY> --candidates <file> [--change-map <file>] [--bundle <file>] [--max <n>]
//   writes <WORK>/scenarios.json and prints the `### Scenarios` table; exit 2 when no candidate survives.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// PENDING: this prototype imports the schema validator from .claude/skills/ticket-context/lib/ (the skill stays where it is);
// moving a copy of it into this plugin is not done yet.
import { validateDef } from "../../../.claude/skills/ticket-context/lib/schema.mjs";
import { KEY_RE, argOf, currentEnv, outputRoot, workDir } from "./paths.mjs";

const SCHEMA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "scenarios.schema.json"), "utf8"));

export const MAX_SCENARIOS = 12; // B19, until O7 sets a token budget
export const LIKELIHOOD_CAP = 5;
export const WEIGHTS = { "state-in-memory": 3, "new-door": 2, "setting-other-consumers": 2, "prior-bug": 2, untested: 1 };
export const IMPACT = { access: 5, money: 5, data: 4, "order-state": 4, "buyer-path": 3, none: 1 };
// The strategy gate's clause 12 pattern, duplicated here rather than imported from .claude/ (the validator import above is the one exception).
export const STATE_IN_MEMORY = /\b(limit(?:er|s)?|attempts?|counter|throttl\w*|rate[- ]?limit\w*|cach(?:e|ed|ing)|lockout|locked out|in[- ]memory|session state)\b/i;

// A signal is a claim the likelihood rests on; two kinds can be checked against the inputs, so they are.
function signalProblem(sig, { hotspots, untested }) {
  if (sig.kind === "state-in-memory") {
    const h = hotspots.find((x) => x.id === sig.ref || x.source === sig.ref);
    if (!h) return `state-in-memory ref "${sig.ref}" is not a change-map hotspot`;
    if (!STATE_IN_MEMORY.test(h.risk ?? "")) return `state-in-memory ref "${sig.ref}": hotspot ${h.id}'s risk does not name state held in memory`;
  }
  if (sig.kind === "untested" && !untested.has(sig.ref.trim())) return `untested ref "${sig.ref}" is not in the bundle's change.prs[].untested`;
  return null;
}

export function scoreScenarios({ candidates, changeMap, bundle, max = MAX_SCENARIOS }) {
  if (!Number.isInteger(max) || max < 1) throw new Error("max must be a positive integer");
  const ctx = {
    hotspots: changeMap?.hotspots ?? [],
    untested: new Set((bundle?.change?.prs ?? []).flatMap((p) => p.untested ?? []).map((u) => String(u).trim())),
  };
  const rejected = [];
  const ok = [];
  const seen = new Set();
  for (const [i, cand] of (candidates ?? []).entries()) {
    const id = cand?.id ?? `#${i + 1}`;
    if (seen.has(id)) { rejected.push({ id, reason: `duplicate id ${id}` }); continue; }
    seen.add(id);
    const errors = validateDef(cand, SCHEMA, "candidate");
    if (errors.length) { rejected.push({ id, reason: `invalid candidate: ${errors.join("; ")}` }); continue; }
    if (cand.exploratory && cand.cls !== 3) { rejected.push({ id, reason: "exploratory must be class 3" }); continue; }
    const problem = cand.signals.map((s) => signalProblem(s, ctx)).find(Boolean);
    if (problem) { rejected.push({ id, reason: problem }); continue; }
    const likelihood = Math.min(LIKELIHOOD_CAP, cand.signals.reduce((n, s) => n + WEIGHTS[s.kind], 0));
    const impact = IMPACT[cand.zone];
    ok.push({
      ...cand, likelihood, impact, score: likelihood * impact,
      needsGlobalWindow: cand.writes.some((w) => w.scope === "global"),
      needsOperatorStore: !cand.storeCreated && cand.writes.some((w) => w.scope.startsWith("store:")),
    });
  }

  // The free class-3 scenario is always kept and takes a slot; the rest fill by score, a tie going to the class
  // with the fewest scenarios so far.
  const picked = ok.filter((c) => c.exploratory).slice(0, Math.max(0, max));
  const left = ok.filter((c) => !picked.includes(c));
  const perClass = new Map();
  for (const p of picked) perClass.set(p.cls, (perClass.get(p.cls) ?? 0) + 1);
  while (picked.length < max && left.length) {
    const top = Math.max(...left.map((c) => c.score));
    const next = left.filter((c) => c.score === top).reduce((a, b) => ((perClass.get(b.cls) ?? 0) < (perClass.get(a.cls) ?? 0) ? b : a));
    left.splice(left.indexOf(next), 1);
    picked.push(next);
    perClass.set(next.cls, (perClass.get(next.cls) ?? 0) + 1);
  }
  const selected = picked.map((c, i) => ({ c, i })).sort((a, b) => b.c.score - a.c.score || a.i - b.i)
    .map(({ c }, i) => ({ s: `S-${i + 1}`, ...c }));
  const ranked = selected.filter((s) => !s.exploratory); // the free scenario is kept whatever it scores, so it sets no cut
  const cut = ranked.length ? Math.min(...ranked.map((s) => s.score)) : 0;
  const notSelected = ok.filter((c) => !picked.includes(c)).sort((a, b) => b.score - a.score)
    .map((c) => ({ id: c.id, reason: `does not fit the ${max}-scenario budget: score ${c.score} against a cut of ${cut}` }));
  const warnings = selected.some((s) => s.exploratory) ? [] : ["no class-3 exploratory scenario selected"];
  return { selected, notSelected, rejected, warnings };
}

const brief = (ref) => (ref.length > 70 ? `${ref.slice(0, 67)}...` : ref); // an untested ref is a whole sentence
const cell = (v) => String(v).replace(/\s*\n\s*/g, " ").replace(/\|/g, "/").trim();

// The B18 table. `R-?` is a placeholder: the generator runs before the strategy writes its risks, and the strategy
// writer replaces it with the scenario's R-n (gate clause 13 requires every scenario to cite one).
export function renderScenarios({ selected, notSelected = [], rejected = [], candidates }) {
  const lines = ["### Scenarios", "", "| S | Class | What it does | Bug it hunts | Why likely | Score | Proof | Writes |", "|---|---|---|---|---|---|---|---|"];
  for (const s of selected) {
    const why = `${s.signals.map((g) => `${g.kind} (${brief(g.ref)})`).join(", ") || "no signal"} · R-?`;
    const writes = s.writes.length ? s.writes.map((w) => `${w.scope}/${w.name}`).join(";") : "—";
    lines.push(`| ${[s.s, s.cls, s.title, s.hunts, why, s.score, s.proof, writes].map(cell).join(" | ")} |`);
  }
  const byId = new Map((candidates ?? selected).map((c) => [c.id, c]));
  if (notSelected.length) {
    lines.push("", "**Not selected** (each is listed in the verdict as not tested, with its residual risk):");
    for (const n of notSelected) {
      const c = byId.get(n.id);
      lines.push(`- ${n.id}${c ? ` (class ${c.cls}) ${cell(c.title)} — hunts: ${cell(c.hunts)}` : ""} — ${n.reason}`);
    }
  }
  if (rejected.length) {
    lines.push("", "**Rejected** (a signal the inputs do not support, or a malformed candidate — fix the generator):");
    for (const r of rejected) lines.push(`- ${r.id} — ${r.reason}`);
  }
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [key, candPath] = [argOf(process.argv, "key"), argOf(process.argv, "candidates")];
  if (!key || !candPath || !KEY_RE.test(key)) { console.error("usage: score-scenarios.mjs --key <KEY> --candidates <file> [--change-map <file>] [--bundle <file>] [--max <n>]"); process.exit(1); }
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  const work = workDir(key);
  const doc = read(candPath);
  if (!Array.isArray(doc?.candidates)) { console.error(`${candPath}: expected { "candidates": [...] }`); process.exit(1); }
  const changeMap = read(argOf(process.argv, "change-map") ?? join(work, "change-map.json"));
  const bundle = read(argOf(process.argv, "bundle") ?? join(outputRoot(), ".vc-fix", "context", key, `bundle-${currentEnv()}.json`));
  const max = argOf(process.argv, "max") ? Number(argOf(process.argv, "max")) : MAX_SCENARIOS;
  if (!Number.isInteger(max) || max < 1) { console.error("--max must be a positive integer"); process.exit(1); }
  const result = scoreScenarios({ candidates: doc.candidates, changeMap, bundle, max });
  writeFileSync(join(work, "scenarios.json"), JSON.stringify(result, null, 2));
  for (const w of result.warnings) console.error(`warning: ${w}`);
  console.log(renderScenarios({ ...result, candidates: doc.candidates }));
  process.exit(result.selected.length ? 0 : 2);
}
