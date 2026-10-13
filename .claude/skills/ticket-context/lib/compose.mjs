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

const prRef = (p) => `${p.repo}#${p.number}`;

export function compose(prep, outs) {
  const { ticket: t, materials: m, change: c, join: j, deploy: d, known: k } = outs;

  const byRef = new Map();
  for (const it of prep.inventory) {
    if (it.gap) byRef.set(it.ref, { ref: it.ref, kind: it.kind, outcome: "GAP", reason: it.gap.reason, ...(it.gap.detail ? { detail: it.gap.detail } : {}) });
    else if (it.needs_connector && !it.local_path) byRef.set(it.ref, { ref: it.ref, kind: it.kind, outcome: "GAP", reason: "connector-unavailable", detail: "not read by the skill runner (step 1)" });
  }
  for (const mat of m.materials) byRef.set(mat.ref, mat);

  const agentPrs = new Map(c.prs.map((p) => [prRef(p), p]));
  const dep = new Map((d.prs ?? []).map((p) => [p.ref, p]));
  const prs = [];
  for (const p of prep.prs) {
    const a = agentPrs.get(p.ref);
    if (!a && !p.gap) continue; // the agent left it out: gate rule 3 names it
    const base = a ?? { repo: p.repo, number: p.number, state: p.state ?? "unknown", merged: !!p.merged, head_sha: p.head_sha ?? "", layers: {},
      operations: [], endpoints: [], settings: [], tests_changed: [], untested: [], fate: `not analysed (${p.gap.reason})`, ci: "not read", open_threads: 0, gap: p.gap };
    const dp = dep.get(p.ref);
    const fallback = p.gap?.reason === "over-cap" ? "over-cap — not checked" : p.context_only ? "context only — not change surface" : "deployment not checked";
    prs.push({ ...base, context_only: !!p.context_only, artifact: dp?.artifact ?? null, deployed: dp?.deployed ?? "UNKNOWN", deployed_reason: dp?.deployed_reason ?? fallback });
  }

  return {
    schema: "ticket-context/1", ticket: prep.ticket, tracker: prep.tracker,
    fetched_at: prep.fetched_at, ticket_updated: prep.ticket_updated, freshness_key: prep.freshness_key,
    acs: t.acs, signals: t.signals, epic: prep.epic, siblings: t.siblings, layer_guess: t.layer_guess, domains_guess: t.domains_guess,
    materials: [...byRef.values()], design: m.design,
    change: { rung: prep.rung, prs, chain_deployed: d.chain_deployed ?? "NONE", ac_to_diff: j.ac_to_diff, diff_to_ac: j.diff_to_ac, hidden_behaviour: c.hidden_behaviour },
    known: { ...k.known, kb: outs.kb?.kb ?? [] },
    gaps: [...prep.gaps, ...prep.prs.flatMap((p) => p.gaps ?? []), ...t.gaps, ...m.gaps, ...c.gaps, ...(d.gaps ?? []), ...(k.gaps ?? [])],
    questions: [...t.questions, ...m.questions, ...c.questions, ...j.questions],
    embedded_instructions: [...t.embedded_instructions, ...m.embedded_instructions, ...c.embedded_instructions],
    blockers: d.blockers ?? [],
  };
}
