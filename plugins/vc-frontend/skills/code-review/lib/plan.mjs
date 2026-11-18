// The review plan: how many agents read what. One agent per unit would put about a hundred agents on
// a big change; each costs a full context of reading. So lenses that read the same cluster share one
// agent, and the agents are filled riskiest first until the mode's budget is used. What
// does not fit is listed, never silently skipped: the coverage report names it.

import { PLAN_BUDGET, PLAN_CONTRACT_LENSES, PLAN_FLOW_LENSES, PLAN_LOCAL_LENSES, TIERS } from "./zones.mjs";

const OVERHEAD = ["map", "seams", "refute per finding"];
const tierN = (t) => TIERS.indexOf(t);
const byTierThenSize = (a, b) => tierN(b.tier) - tierN(a.tier) || b.files.length - a.files.length || a.units[0].localeCompare(b.units[0]);

function agent(lenses, units, files, tier, diffFiles) {
  return { lenses: [...new Set(lenses)], units, files: [...new Set(files)], tier, diffFiles: [...new Set(diffFiles)] };
}

// Groups of agents in priority order; within a group the order is already decided.
function lAndXlGroups(units) {
  const real = units.filter((u) => u.id);
  const global = real.filter((u) => u.kind === "global");
  const groups = [];
  // architecture and design read the same condensed view, so one agent runs both.
  if (global.length) groups.push([agent(global.map((u) => u.lens), global.map((u) => u.id), global.flatMap((u) => u.files), maxTier(global), [global[0].diffFile])]);
  const one = (u) => agent([u.lens], [u.id], u.files, u.tier, [u.diffFile]);
  groups.push(real.filter((u) => u.kind === "flow").map(one).sort(byTierThenSize));
  groups.push(real.filter((u) => u.kind === "consumers").map(one).sort(byTierThenSize));
  groups.push(real.filter((u) => u.lens === "ui-kit").map(one).sort(byTierThenSize));
  // Local lenses on the same cluster share one agent; its lenses are the ones the cluster called for.
  // A tests unit keyed like a cluster joins it, so the code and its tests are read together.
  const byScope = new Map();
  for (const u of real.filter((x) => PLAN_LOCAL_LENSES.includes(x.lens))) {
    const key = u.scope.replace(/^cluster /, "");
    if (!byScope.has(key)) byScope.set(key, []);
    byScope.get(key).push(u);
  }
  groups.push([...byScope.values()].map((us) => agent(us.map((u) => u.lens), us.map((u) => u.id), us.flatMap((u) => u.files), maxTier(us), us.map((u) => u.diffFile))).sort(byTierThenSize));
  groups.push(real.filter((u) => u.lens === "trivial").map(one));
  return groups;
}

const maxTier = (us) => TIERS[Math.max(...us.map((u) => tierN(u.tier)))];

// S and M read full.diff. M runs a lens per agent; past the budget the lenses share agents by kind.
function smallGroups(mode, chosen, files, tier, budget) {
  if (!chosen.length) return [];
  const all = files.filter((f) => !f.mechanical).map((f) => f.path);
  const make = (lenses) => agent(lenses, ["full"], all, tier, ["full.diff"]);
  if (mode === "S") return [[make(chosen)]];
  const kinds = [chosen.filter((l) => PLAN_CONTRACT_LENSES.includes(l)), chosen.filter((l) => PLAN_FLOW_LENSES.includes(l))];
  kinds.push(chosen.filter((l) => !kinds.flat().includes(l)));
  if (chosen.length <= budget) return [kinds.flat().map((l) => make([l]))];
  return [kinds.filter((ls) => ls.length).map(make)];
}

// mode: { id }; chosen: lens ids that run; units: buildUnits output or null; files: result files.
export function reviewPlan({ mode, chosen, units, files, tier, budget = null }) {
  const cap = budget ?? PLAN_BUDGET[mode.id];
  const groups = units ? lAndXlGroups(units) : smallGroups(mode.id, chosen, files, tier, cap);
  // Riskier work first across groups: every R3 unit before any R2 one. The group order (global,
  // flows, consumers, ui-kit, local, trivial) only breaks ties within a tier, and the order inside a
  // group stays as built.
  const ordered = groups.flatMap((g, gi) => g.map((a, ai) => ({ a, gi, ai }))).sort((x, y) => tierN(y.a.tier) - tierN(x.a.tier) || x.gi - y.gi || x.ai - y.ai);
  const agents = [];
  const dropped = [];
  for (const { a } of ordered) {
    if (agents.length < cap) agents.push({ id: `a${agents.length + 1}`, ...a });
    else dropped.push({ ...a, reason: "over budget" });
  }
  return { mode: mode.id, budget: cap, agents, dropped, overhead: OVERHEAD };
}

export function planLine(plan) {
  const units = plan.dropped.reduce((n, d) => n + d.units.length, 0);
  return `Plan: ${plan.agents.length} review agent(s) (budget ${plan.budget}) + map + seams; ${units} unit(s) over budget${units ? ", listed in coverage" : ""}.`;
}
