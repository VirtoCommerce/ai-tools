// .claude/skills/ticket-context/lib/check-bundle.mjs — the gate (design §6). Six rules; an empty list passes.
import { existsSync } from "node:fs";
import { isCounted } from "./deploy.mjs";
import { SCHEMA } from "./gap.mjs";
import { validateDef } from "./schema.mjs";
import { hasScrubMarker, scanStrings } from "./scrub.mjs";

const SCRUBBED_KINDS = new Set(["har", "log", "trace"]);
const ref = (p) => `${p.repo}#${p.number}`;
const lc = (s) => String(s).toLowerCase();

export function checkBundle(bundle, prep, { secrets = new Set() } = {}) {
  // 1 — shape
  const errors = validateDef(bundle, SCHEMA, "bundle").map((e) => `schema: ${e}`);
  if (errors.length) return errors;

  // 2 — every outcome is complete
  for (const m of bundle.materials) {
    if (m.outcome === "finding" && !(m.finding?.trim() && m.source?.trim())) errors.push(`outcome: ${m.ref} is a finding without text or source`);
    if (m.outcome === "GAP" && !m.reason) errors.push(`outcome: ${m.ref} is a GAP without a reason`);
  }

  // 3 — nothing the tracker listed is missing (Q1)
  const matRefs = new Set(bundle.materials.map((m) => m.ref));
  for (const it of prep.inventory) if (!matRefs.has(it.ref)) errors.push(`inventory: ${it.ref} has no outcome in the bundle`);
  const prRefs = new Set(bundle.change.prs.map((p) => lc(ref(p))));
  for (const p of prep.prs) if (!prRefs.has(lc(p.ref))) errors.push(`inventory: PR ${p.ref} has no entry in the bundle`);

  // 4 — deployment is proven or recorded, and every non-YES has its blocker line
  // Counted = not context-only and not closed without merge; an over-cap PR counts and is UNKNOWN (unchecked).
  const counted = bundle.change.prs.filter(isCounted);
  if (!counted.length && bundle.change.chain_deployed !== "NONE") errors.push(`deployment: no PR is counted, so chain_deployed must be NONE, not ${bundle.change.chain_deployed}`);
  if (counted.length && bundle.change.chain_deployed === "NONE") errors.push("deployment: PRs are counted, so chain_deployed cannot be NONE");
  if (bundle.change.chain_deployed === "YES" && counted.some((p) => p.deployed !== "YES")) errors.push("deployment: chain_deployed is YES while a counted PR is not YES");
  for (const p of counted) if (p.deployed !== "YES" && !bundle.blockers.some((b) => b.startsWith(`NOT DEPLOYED: ${ref(p)} — `) || b.startsWith(`DEPLOYMENT UNKNOWN: ${ref(p)} — `))) errors.push(`deployment: ${ref(p)} is ${p.deployed} with no line in blockers[]`);

  // 5 — a HAR/log/trace that was read was read scrubbed
  const inv = new Map(prep.inventory.map((i) => [i.ref, i]));
  for (const m of bundle.materials) {
    const it = inv.get(m.ref);
    if (!SCRUBBED_KINDS.has(it?.kind ?? m.kind) || m.outcome !== "finding") continue; // the inventory's kind, never the agent's label
    if (!it?.scrubbed || !it.local_path || !existsSync(it.local_path) || !hasScrubMarker(it.local_path)) errors.push(`scrub: ${m.ref} was read without a scrubbed-file marker`);
  }

  // 6 — the one artifact that outlives the run carries no secret
  const hits = scanStrings(bundle, secrets);
  if (hits.length) errors.push(`secret: the bundle contains ${hits.join(", ")} — the value is not printed`);
  return errors;
}
