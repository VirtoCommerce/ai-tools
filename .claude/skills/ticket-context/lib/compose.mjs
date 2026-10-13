// .claude/skills/ticket-context/lib/compose.mjs — a deterministic merge (design §5 step 5). No model composes
// the bundle; a model's omission stays an omission, so gate rule 3 can name it.
import { SCHEMA } from "./gap.mjs";
import { validateDef } from "./schema.mjs";

export const OUT_FILES = Object.freeze({ ticket: "ticket.out.json", materials: "materials.out.json", change: "change.out.json",
  join: "join.out.json", deploy: "deploy.json", known: "known.json", kb: "kb.out.json" });

export function checkAgentOutputs(outs) {
  const errors = [];
  for (const [mode, def] of [["ticket", "ticketOut"], ["materials", "materialsOut"], ["change", "changeOut"], ["join", "joinOut"]]) {
    for (const e of validateDef(outs[mode], SCHEMA, def)) errors.push(`${mode}: ${e}`);
  }
  return errors;
}

// GitHub owner/repo are case-insensitive: an agent entry is matched to prepare's PR on the lower-cased repo#number.
const prKey = (repo, number) => `${repo}#${number}`.toLowerCase();
// The only keys taken from the CHANGE agent. Identity (repo, number, state, merged, head_sha), context_only and
// gap come from prepare's data: an agent that misreports a PR as merged must not move redeploy or the gate.
const ANALYTICAL = Object.freeze(["layers", "operations", "endpoints", "settings", "tests_changed", "untested", "fate", "ci", "open_threads", "threads"]);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const isChangeGap = (g) => g.where === "change" || g.where.startsWith("change.");

export function compose(prep, outs) {
  const { ticket: t, materials: m, change: c, join: j, deploy: d, known: k } = outs;

  // Script-derived GAPs are ground truth about what was read: a model's output never replaces them.
  const invRefs = new Set(prep.inventory.map((it) => it.ref));
  const agentMats = new Map(m.materials.filter((x) => invRefs.has(x.ref)).map((x) => [x.ref, x]));
  const invented = m.materials.filter((x) => !invRefs.has(x.ref)).map((x) => ({ where: x.ref, reason: "not-found", detail: "the agent reported an input the inventory does not list" }));
  const byRef = new Map();
  for (const it of prep.inventory) {
    if (it.gap) byRef.set(it.ref, { ref: it.ref, kind: it.kind, outcome: "GAP", reason: it.gap.reason, ...(it.gap.detail ? { detail: it.gap.detail } : {}) });
    else if (it.needs_connector && !it.local_path) byRef.set(it.ref, { ref: it.ref, kind: it.kind, outcome: "GAP", reason: "connector-unavailable", detail: "not read by the skill runner (step 1)" });
    else if (agentMats.has(it.ref)) byRef.set(it.ref, agentMats.get(it.ref));
  }
  const materials = [...byRef.values()];

  const agentPrs = new Map();
  for (const p of c.prs) { const key = prKey(p.repo, p.number); if (!agentPrs.has(key)) agentPrs.set(key, p); }
  const dep = new Map((d.prs ?? []).map((p) => [p.ref, p]));
  const prs = [];
  for (const p of prep.prs) {
    // A whole-PR gap from prepare wins over any agent entry; a context-only PR is not change surface, so the agent's entry for it (if any) is ignored too.
    const a = (p.gap || p.context_only) ? undefined : agentPrs.get(prKey(p.repo, p.number));
    if (!a && !p.gap && !p.context_only) continue; // the agent left it out: gate rule 3 names it
    const identity = { repo: p.repo, number: p.number, state: p.state || "unknown", merged: !!p.merged, head_sha: p.head_sha ?? "" };
    const analysis = a ? pick(a, ANALYTICAL) : { layers: {}, operations: [], endpoints: [], settings: [], tests_changed: [], untested: [],
      fate: p.gap ? `not analysed (${p.gap.reason})` : "context only — not change surface", ci: "not read", open_threads: 0 };
    const dp = dep.get(p.ref);
    const fallback = p.gap?.reason === "over-cap" ? "over-cap — not checked" : p.context_only ? "context only — not change surface" : "deployment not checked";
    prs.push({ ...identity, ...analysis, ...(p.gap ? { gap: p.gap } : {}), context_only: !!p.context_only,
      artifact: dp?.artifact ?? null, deployed: dp?.deployed ?? "UNKNOWN", deployed_reason: dp?.deployed_reason ?? fallback });
  }

  // Block 5: gaps[] is the one list — every block's gaps, then each materials GAP row and each whole-PR gap whose
  // `where` is not listed yet (an inventory item's gap and its material row share the ref, so neither is doubled).
  const gaps = [...prep.gaps, ...prep.prs.flatMap((p) => p.gaps ?? []), ...t.gaps, ...m.gaps, ...invented, ...c.gaps, ...(d.gaps ?? []), ...(k.gaps ?? [])];
  const listed = new Set(gaps.map((g) => g.where));
  const addOnce = (g) => { if (!listed.has(g.where)) { listed.add(g.where); gaps.push(g); } };
  for (const row of materials) if (row.outcome === "GAP" && row.reason) addOnce({ where: row.ref, reason: row.reason, ...(row.detail ? { detail: row.detail } : {}) });
  for (const p of prep.prs) if (p.gap) addOnce(p.gap);
  // No PR found is a visible gap even when CHANGE did not run or did not say so (rung 4 is the agent's to add).
  // Context-only PRs (deployment manifest, tooling) are not change surface, so "only those" is "none found" too.
  if (!prs.some((p) => !p.context_only) && !gaps.some(isChangeGap)) {
    gaps.push({ where: "change", reason: "not-found", detail: prs.length ? "no product pull request found on rungs 1–3 — only context-only PRs" : "no pull request found on rungs 1–3 of the ladder" });
  }

  return {
    schema: "ticket-context/1", ticket: prep.ticket, tracker: prep.tracker,
    fetched_at: prep.fetched_at, ticket_updated: prep.ticket_updated, freshness_key: prep.freshness_key,
    acs: t.acs, signals: t.signals, epic: prep.epic, siblings: t.siblings, layer_guess: t.layer_guess, domains_guess: t.domains_guess,
    materials, design: m.design,
    change: { rung: prep.rung, prs, chain_deployed: d.chain_deployed ?? "NONE", ac_to_diff: j.ac_to_diff, diff_to_ac: j.diff_to_ac, hidden_behaviour: c.hidden_behaviour },
    known: { ...k.known, kb: outs.kb?.kb ?? [] },
    gaps,
    questions: [...t.questions, ...m.questions, ...c.questions, ...j.questions],
    embedded_instructions: [...t.embedded_instructions, ...m.embedded_instructions, ...c.embedded_instructions],
    blockers: d.blockers ?? [],
  };
}
