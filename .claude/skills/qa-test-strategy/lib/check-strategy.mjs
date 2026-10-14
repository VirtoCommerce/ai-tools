// .claude/skills/qa-test-strategy/lib/check-strategy.mjs — the script half of SKILL.md §Gate. Reads the LAST
// "## Round N" section of test-strategy.md and checks it against the bundle and floors.mjs's output. The clauses
// that need judgment (7 project-risk mitigations, 9 observable exit criteria) stay the model's inline check.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CAP = 120; // lines per round section (D9)
const lastRound = (md) => { const i = md.lastIndexOf("\n## Round "); return i < 0 ? "" : md.slice(i + 1); };
const block = (sec, heading) => { const m = new RegExp(`### ${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n### |$)`).exec(sec); return m ? m[1] : ""; };
const rows = (text) => text.split("\n").filter((l) => /^\|\s*[^-|\s]/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim())).slice(1);
const ARTIFACTS_FOR = { F1: ["Test model", "Exploratory"], F2: ["Test model", "Exploratory"], F3: ["Visual lane"], F8: ["Visual lane"],
  F5: ["Coverage triage + regression"], F10: ["Test model"], F11: ["Test model"] };

export function checkStrategy(md, bundle, floors) {
  const errors = [];
  const sec = lastRound(md);
  const head = /^## Round (\d+)/.exec(sec);
  const round = head ? Number(head[1]) : 0;
  if (!head) return { round, errors: ["1: no '## Round N' section"] };
  if (round > 3) errors.push(`1: round ${round} — a fourth round is refused (D6)`);

  const risks = rows(block(sec, "Risks")).map(([r, what, source, , level]) => ({ r, what, source: source ?? "", level: level ?? "" }));
  const approach = rows(block(sec, "Approach per risk")).map(([r, technique, oracle, layer, lane, effort]) => ({ r, technique: technique ?? "", oracle: oracle ?? "", lane: lane ?? "", effort: effort ?? "" }));
  const artifacts = new Map(rows(block(sec, "Artifacts")).map(([name, decision]) => [name, decision ?? ""]));
  const outOfScope = block(sec, "Out of scope");
  const cited = risks.map((x) => x.source).join("\n") + "\n" + outOfScope;

  for (const ac of bundle.acs ?? []) if (!new RegExp(`\\b${ac.id}\\b`).test(cited)) errors.push(`2: ${ac.id} maps to no risk and is not out of scope`);
  for (const p of (bundle.change?.prs ?? []).filter((x) => !x.context_only && !x.gap))
    for (const h of p.hotspots ?? []) if (!cited.includes(h.source)) errors.push(`3: hotspot ${h.source} maps to no risk and is not out of scope`);

  const registered = new Set(risks.map((x) => x.r));
  for (const x of risks) {
    const a = approach.find((y) => y.r === x.r);
    if (!a) { errors.push(`4: ${x.r} has no approach row`); continue; }
    if (!a.technique || !a.oracle || !a.lane) errors.push(`4: ${x.r} approach row lacks a technique, oracle or lane`);
    if (!/^(low|medium|high)$/i.test(a.effort)) errors.push(`4: ${x.r} effort "${a.effort}" is not low|medium|high`);
  }
  for (const a of approach) if (!registered.has(a.r)) errors.push(`4: approach row ${a.r} names no registered risk`);
  for (const a of approach) if (/\{HYPOTHESIS\}/.test(a.oracle) && !/\b(EXPLORE|MODEL)\b/.test(a.technique)) errors.push(`5: ${a.r} decides on a {HYPOTHESIS} oracle`);

  const firedLine = (/^Floors fired:([^\n]*)/m.exec(sec)?.[1] ?? "").split("not fired:")[0];
  const fired = (floors.floors ?? []).filter((f) => f.fired).map((f) => f.id);
  const skipped = (name) => /^SKIP/i.test(artifacts.get(name) ?? "SKIP");
  for (const id of fired) {
    if (!new RegExp(`\\b${id}\\b`).test(firedLine)) errors.push(`6: ${id} fired but is not on the 'Floors fired:' line`);
    for (const name of ARTIFACTS_FOR[id] ?? []) if (skipped(name)) errors.push(`6: ${id} fired but '${name}' is SKIP or missing`);
    if ((id === "F10" || id === "F11") && !approach.some((a) => /\bMODEL\b/.test(a.technique))) errors.push(`6: ${id} fired but no risk has technique MODEL`);
  }
  const high = risks.filter((x) => /^(high|critical)$/i.test(x.level));
  if (high.length && (skipped("Test model") || skipped("Exploratory"))) errors.push(`6b: ${high.map((x) => x.r).join(", ")} High/Critical ⇒ Test model and Exploratory run (F1)`);
  for (const x of high) { const a = approach.find((y) => y.r === x.r); if (a && /\{HYPOTHESIS\}/.test(a.oracle) && !/\bMODEL\b/.test(a.technique)) errors.push(`6c: ${x.r} High/Critical on {HYPOTHESIS} needs MODEL (M1)`); }
  if (fired.includes("F6") && !/Deployed:\s*NO/.test(sec)) errors.push("6d: F6 fired but the header does not say 'Deployed: NO'");

  const lanes = new Set(approach.map((a) => a.lane.split("·")[0].trim()).filter(Boolean));
  if (lanes.size > 3 && !/^Lanes sequenced:/m.test(sec)) errors.push(`8: ${lanes.size} browser lanes and no 'Lanes sequenced:' line`);
  const lines = sec.trimEnd().split("\n").length;
  if (lines > CAP) errors.push(`10: round section is ${lines} lines (cap ${CAP})`);
  return { round, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? null : process.argv[i + 1]; };
  if (!arg("strategy") || !arg("bundle") || !arg("floors")) { console.error("usage: check-strategy.mjs --strategy <md> --bundle <json> --floors <json>"); process.exit(1); }
  const res = checkStrategy(readFileSync(arg("strategy"), "utf8"), JSON.parse(readFileSync(arg("bundle"), "utf8")), JSON.parse(readFileSync(arg("floors"), "utf8")));
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.errors.length ? 1 : 0);
}
