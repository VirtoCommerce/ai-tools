// The review plan: how many agents read what. One agent per unit would put about a hundred agents on
// a big change; each costs a full context of reading. So the units of one cluster share agents by the
// kind of work (behaviour needs judgement, rules is a checklist), and the agents are filled in order of
// what breaks worst until the mode's budget is used: first one correctness owner for the core of the
// change and every R3 cluster, then the specialist passes. The budget counts every agent the review
// starts, the map, seams and refutation included. What does not fit is listed, never silently
// skipped: the coverage report names it.

import {
  BEHAVIOUR_MAX_FILES,
  CORE_MIN_SHARE,
  CORE_MAX_CLUSTERS,
  PLAN_BEHAVIOUR_LENSES,
  PLAN_BUDGET,
  PLAN_CONTRACT_LENSES,
  PLAN_FLOW_LENSES,
  PLAN_OVERHEAD,
  PLAN_RULES_LENSES,
  PLAN_RULES_PACK,
  SMALL_CLUSTER_FILES,
  TEST_LIKE,
  TIERS,
} from "./zones.mjs";

const MODEL = { global: "inherit", flow: "inherit", consumers: "inherit", "ui-kit": "inherit", behaviour: "inherit", contract: "inherit", single: "inherit", rules: "cheap", styles: "inherit", trivial: "cheap", mechanical: "cheap", map: "inherit", seams: "inherit", refute: "inherit" };
const KIND_ORDER = ["global", "behaviour", "flow", "consumers", "ui-kit", "styles", "contract", "rules", "trivial", "single", "mechanical"];
const tierN = (t) => TIERS.indexOf(t);
const maxTier = (us) => TIERS[Math.max(...us.map((u) => tierN(u.tier)))];

function agent(kind, us, extra = {}) {
  return {
    kind,
    model: MODEL[kind],
    lenses: [...new Set(us.map((u) => u.lens))],
    units: us.map((u) => u.id),
    files: [...new Set(us.flatMap((u) => u.files))],
    tier: maxTier(us),
    diffFiles: [...new Set(us.map((u) => u.diffFile))],
    ...extra,
  };
}

// Every cluster holding CORE_MIN_SHARE of the change's changed lines (added and deleted, any non-R0 file
// but tests and mechanical ones: a schema JSON or a deletion is what a PR is about as much as new code),
// the largest always, at most CORE_MAX_CLUSTERS. A share and not a running total: a cluster of 8% of
// a big PR is part of what it is for, however many larger clusters come before it.
export function coreClusters(clusters, files) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const weight = (f) => (f && !TEST_LIKE.test(f.path) && !f.mechanical && f.tier !== "R0" && f.tier !== 0 ? f.added + f.deleted : 0);
  const sized = clusters.map((c) => ({ key: c.key, n: c.files.reduce((sum, p) => sum + weight(byPath.get(p)), 0) }));
  const total = sized.reduce((s, c) => s + c.n, 0);
  if (!total) return [];
  const ranked = sized.filter((x) => x.n).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  return ranked.filter((c, i) => i === 0 || c.n >= total * CORE_MIN_SHARE).slice(0, CORE_MAX_CLUSTERS).map((c) => c.key);
}

const clusterOfScope = (scope) => scope.replace(/^cluster /, "").replace(/ \(no flow\)$/, "");

const subjectOf = (p) => p.replace(/__snapshots__\//, "").replace(/\.snap$/, "").replace(/\.(test|spec)(-d)?\.(ts|tsx|js)$/, "");

// One cluster's behaviour into agents of at most BEHAVIOUR_MAX_FILES files: each test right after the
// file it tests, then the sequence cut into even parts, so a part reads its code with its tests.
function packBehaviour(key, us, core) {
  const testUnits = us.filter((u) => u.lens === "tests");
  const codeFiles = [...new Set(us.filter((u) => u.lens !== "tests").flatMap((u) => u.files))];
  const tests = [...new Set(testUnits.flatMap((u) => u.files))];
  const bySubject = new Map();
  for (const t of tests) bySubject.set(subjectOf(t), [...(bySubject.get(subjectOf(t)) ?? []), t]);
  const seq = [];
  for (const p of codeFiles) {
    seq.push(p);
    const subject = p.replace(/\.(ts|tsx|js|vue)$/, "");
    seq.push(...(bySubject.get(subject) ?? []));
    bySubject.delete(subject);
  }
  seq.push(...[...bySubject.values()].flat());
  const parts = Math.max(1, Math.ceil(seq.length / BEHAVIOUR_MAX_FILES));
  const size = Math.ceil(seq.length / parts);
  const chunks = [...Array(parts)].map((_, i) => seq.slice(i * size, (i + 1) * size)).filter((c) => c.length);
  return chunks.map((chunk, i) => {
    const mine = new Set(chunk);
    const a = agent("behaviour", us.filter((u) => u.files.some((p) => mine.has(p))), { cluster: chunks.length > 1 ? `${key} (${i + 1}/${chunks.length})` : key, core: core.includes(key) });
    return { ...a, files: chunk };
  });
}

// Small clusters of one tier into agents of at most BEHAVIOUR_MAX_FILES files, largest first.
function packSmall(small) {
  const groups = [...small].map(([key, us]) => ({ key, us, tier: maxTier(us), files: new Set(us.flatMap((u) => u.files)).size }));
  groups.sort((a, b) => tierN(b.tier) - tierN(a.tier) || b.files - a.files || a.key.localeCompare(b.key));
  const out = [];
  let pack = [];
  const flush = () => {
    if (pack.length) out.push(agent("behaviour", pack.flatMap((g) => g.us), { cluster: pack.map((g) => g.key).join(" + "), core: false }));
    pack = [];
  };
  for (const g of groups) {
    const files = pack.reduce((n, x) => n + x.files, 0);
    if (pack.length && (pack[0].tier !== g.tier || files + g.files > BEHAVIOUR_MAX_FILES)) flush();
    pack.push(g);
  }
  flush();
  return out;
}

// Flow agents that read the same files ask their questions in one pass.
function mergeSameFiles(agents) {
  const byFiles = new Map();
  for (const a of agents) {
    const key = [...a.files].sort().join("\n");
    const prev = byFiles.get(key);
    if (!prev) byFiles.set(key, a);
    else byFiles.set(key, { ...prev, lenses: [...new Set([...prev.lenses, ...a.lenses])], units: [...prev.units, ...a.units], tier: maxTier([prev, a]), diffFiles: [...new Set([...prev.diffFiles, ...a.diffFiles])] });
  }
  return [...byFiles.values()];
}

// L and XL: agents built from the units.
function largeAgents(units, core) {
  const real = units.filter((u) => u.id);
  const out = [];
  const global = real.filter((u) => u.kind === "global");
  // architecture and design read the same condensed view, so one agent runs both.
  if (global.length) out.push({ ...agent("global", global), diffFiles: [global[0].diffFile] });
  // Behaviour: one cluster per agent. A flow lens's files that no flow joins ride along with their
  // cluster's behaviour agent; with no such agent they get their own.
  const behaviour = new Map();
  for (const u of real.filter((x) => PLAN_BEHAVIOUR_LENSES.includes(x.lens))) {
    const key = clusterOfScope(u.scope);
    behaviour.set(key, [...(behaviour.get(key) ?? []), u]);
  }
  const flows = [];
  for (const u of real.filter((x) => x.kind === "flow")) {
    const key = / \(no flow\)$/.test(u.scope) ? clusterOfScope(u.scope) : null;
    if (key && behaviour.has(key)) behaviour.get(key).push(u);
    else flows.push(agent("flow", [u]));
  }
  out.push(...mergeSameFiles(flows));
  // Small clusters outside the core share agents by tier; the rest get theirs, cut to size.
  const small = new Map();
  for (const [key, us] of behaviour) {
    const files = new Set(us.flatMap((u) => u.files)).size;
    if (core.includes(key) || files > SMALL_CLUSTER_FILES) out.push(...packBehaviour(key, us, core));
    else small.set(key, us);
  }
  out.push(...packSmall(small));
  out.push(...real.filter((u) => u.kind === "consumers").map((u) => agent("consumers", [u])));
  out.push(...real.filter((u) => u.lens === "ui-kit").map((u) => agent("ui-kit", [u])));
  // Styles of R2 and R3 files (tokens, presets, the kit, global styles) is judgement about how a value
  // spreads through presets, dark mode and forks: the session's model. The rest of the rules work,
  // R1 styles included, is checklist work for the cheaper one.
  const rulesUnits = real.filter((u) => PLAN_RULES_LENSES.includes(u.lens));
  const heavyStyles = (u) => u.lens === "styles" && tierN(u.tier) >= tierN("R2");
  out.push(...rulesAgents(rulesUnits.filter(heavyStyles), "styles"));
  out.push(...rulesAgents(rulesUnits.filter((u) => !heavyStyles(u))));
  out.push(...real.filter((u) => u.lens === "trivial").map((u) => agent("trivial", [u])));
  return out;
}

// Rules: the units of one cluster together, then up to PLAN_RULES_PACK clusters and files of one
// tier per agent, biggest first.
function rulesAgents(units, kind = "rules") {
  const byCluster = new Map();
  for (const u of units) {
    const key = clusterOfScope(u.scope);
    byCluster.set(key, [...(byCluster.get(key) ?? []), u]);
  }
  const groups = [...byCluster.values()].map((us) => ({ us, tier: maxTier(us), files: new Set(us.flatMap((u) => u.files)).size }));
  groups.sort((a, b) => tierN(b.tier) - tierN(a.tier) || b.files - a.files);
  const out = [];
  let pack = [];
  const flush = () => {
    if (pack.length) out.push(agent(kind, pack.flatMap((g) => g.us)));
    pack = [];
  };
  for (const g of groups) {
    const files = pack.reduce((n, x) => n + x.files, 0);
    if (pack.length && (pack[0].tier !== g.tier || pack.length >= PLAN_RULES_PACK.clusters || files + g.files > PLAN_RULES_PACK.files)) flush();
    pack.push(g);
  }
  flush();
  return out;
}

// Priority: a correctness owner before any second opinion. The global view and the core's behaviour,
// then R3 behaviour, then the R3 specialist passes (flows, consumers, kit), then the same for R2,
// rules of R3 and R2, then R1, then R0 and the trivial sweep.
export function rank(a) {
  if (a.kind === "global" || (a.kind === "behaviour" && a.core)) return 0;
  if (a.kind === "trivial" || a.tier === "R0") return 9;
  if (a.kind === "rules") return a.tier === "R1" ? 8 : 6;
  if (a.kind === "styles") return a.tier === "R3" ? 2 : 5;
  const behaviour = a.kind === "behaviour";
  if (a.tier === "R3") return behaviour ? 1 : 2;
  if (a.tier === "R2") return behaviour ? 3 : a.kind === "flow" ? 4 : 5;
  return 7;
}

// S: one agent, every chosen lens. M: one agent per kind of work that has a lens; tests are read once,
// by the behaviour agent.
function smallAgents(mode, chosen, files, tier) {
  if (!chosen.length) return [];
  const all = files.filter((f) => !f.mechanical).map((f) => f.path);
  const code = all.filter((p) => !TEST_LIKE.test(p));
  const make = (kind, lenses, paths) => ({ kind, model: MODEL[kind], lenses, units: ["full"], files: paths, tier, diffFiles: ["full.diff"] });
  if (mode === "S") return [make("single", chosen, all)];
  const behaviour = chosen.filter((l) => PLAN_BEHAVIOUR_LENSES.includes(l) || PLAN_FLOW_LENSES.includes(l));
  const contract = chosen.filter((l) => PLAN_CONTRACT_LENSES.includes(l));
  const rules = chosen.filter((l) => !behaviour.includes(l) && !contract.includes(l));
  // An R2 or R3 change with styles in the rules agent's lenses runs that agent on the session's model.
  const rulesAgent = { ...make("rules", rules, code), ...(rules.includes("styles") && tierN(tier) >= tierN("R2") ? { model: MODEL.styles } : {}) };
  return [make("behaviour", behaviour, all), make("contract", contract, code), rulesAgent].filter((a) => a.lenses.length && a.files.length);
}

// A change with nothing for the code lenses: one cheap agent checks the mechanical groups'
// representatives, the trivial sweep runs if R0 files are left.
function gateAgents(gate, mechanicalGroups, files, tier) {
  const reps = mechanicalGroups.flatMap((g) => (g.representative ? [g.representative] : g.files.slice(0, 1)));
  const r0 = files.filter((f) => !f.mechanical).map((f) => f.path);
  const out = [];
  if (reps.length) out.push({ kind: "mechanical", model: MODEL.mechanical, lenses: [], units: ["mechanical"], files: reps, tier, diffFiles: ["full.diff"] });
  if (gate.lenses.includes("trivial") && r0.length) out.push({ kind: "trivial", model: MODEL.trivial, lenses: ["trivial"], units: ["full"], files: r0, tier, diffFiles: ["full.diff"] });
  return out;
}

// mode: { id }; chosen: lens ids that run; units: buildUnits output or null; clusters, files: as in
// the result; tier: the change's tier; gates: reviewGates output; budget: every agent, overhead included.
export function reviewPlan({ mode, chosen, units, files, clusters = [], tier, budget = null, gates = [], mechanicalGroups = [] }) {
  const total = budget ?? PLAN_BUDGET[mode.id];
  const overheadKinds = PLAN_OVERHEAD[mode.id] ?? [];
  const overhead = overheadKinds.slice(0, Math.max(0, total - 1)).map((kind) => ({ kind, model: MODEL[kind] }));
  const cap = Math.max(1, total - overhead.length);
  const core = coreClusters(clusters, files);
  const gate = gates.find((g) => g.id === "mechanical-only" || g.id === "no-non-trivial");
  const built = gate ? gateAgents(gate, mechanicalGroups, files, tier) : units ? largeAgents(units, core) : smallAgents(mode.id, chosen, files, tier);
  const ordered = built
    .map((a, i) => ({ a, i }))
    .sort((x, y) => rank(x.a) - rank(y.a) || KIND_ORDER.indexOf(x.a.kind) - KIND_ORDER.indexOf(y.a.kind) || tierN(y.a.tier) - tierN(x.a.tier) || y.a.files.length - x.a.files.length || x.i - y.i)
    .map((x) => x.a);
  const agents = [];
  const dropped = [];
  for (const a of ordered) {
    if (agents.length < cap) agents.push({ id: `a${agents.length + 1}`, ...a });
    else dropped.push({ ...a, reason: "over budget" });
  }
  return { mode: mode.id, budget: total, core, agents, overhead, dropped };
}

export function planLine(plan) {
  const units = plan.dropped.reduce((n, d) => n + d.units.length, 0);
  const core = plan.core.length ? `; core: ${plan.core.join(", ")}` : "";
  const extra = plan.overhead.length ? ` + ${plan.overhead.map((o) => o.kind).join(", ")}` : "";
  return `Plan: ${plan.agents.length} review agent(s)${extra} = ${plan.agents.length + plan.overhead.length} of budget ${plan.budget}${core}; ${units} unit(s) over budget${units ? ", listed in coverage" : ""}.`;
}
