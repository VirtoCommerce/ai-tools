// .claude/skills/qa-test-strategy/lib/check-strategy.mjs — the script half of SKILL.md §Gate. Reads the LAST
// "## Round N" section of test-strategy.md and checks it against the bundle, computing the floors itself from that
// bundle (never a floors file a doer hands it). The clauses that need judgment (7 project-risk mitigations,
// 9 observable exit criteria) stay the model's inline check.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeFloors, domainMapTextOf, isAbandoned, p01NamesOf, readJsonOrExit } from "./floors.mjs";

const CAP = 120; // lines per round section (D9)
const lastRound = (md) => { const i = md.lastIndexOf("\n## Round "); return i < 0 ? "" : md.slice(i + 1); };
// A heading counts only as the template writes it: a renamed one ("### Risk register") is missing, never matched.
const HEADING = (h) => new RegExp(`^### ${h}[ \\t]*$`, "m");
const block = (sec, heading) => { const m = new RegExp(`^### ${heading}[ \\t]*\\n([\\s\\S]*?)(?=\\n### |(?![\\s\\S]))`, "m").exec(sec); return m ? m[1] : ""; };
const REQUIRED = [["Risks", 4], ["Approach per risk", 4], ["Artifacts", 6], ["Out of scope", 2]]; // heading, the clause that reads it
// A table line that is not a separator (`|---|`, `|:--|--:|` alike); the first one left is the header row.
const rows = (text) => text.split("\n").filter((l) => /^\|/.test(l) && !/^[\s|:-]+$/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim())).slice(1);
const ARTIFACTS_FOR = { F1: ["Test model", "Exploratory"], F2: ["Test model", "Exploratory"], F3: ["Visual lane"], F8: ["Visual lane"],
  F5: ["Coverage triage + regression"], F10: ["Test model"], F11: ["Test model"] };

export function checkStrategy(md, bundle, { domainMapText = null, p01Names } = {}) {
  if (bundle?.schema !== "ticket-context/1") return { round: 0, errors: ["0: bundle is not a ticket-context/1 bundle"] };
  md = String(md).replace(/\r\n?/g, "\n"); // a CRLF checkout (core.autocrlf) reads the same as the LF file
  const floors = computeFloors(bundle, { domainMapText, ...(p01Names ? { p01Names } : {}) });
  const errors = [];
  const sec = lastRound(md);
  const head = /^## Round (\d+)/.exec(sec);
  const round = head ? Number(head[1]) : 0;
  if (!head) return { round, errors: ["1: no '## Round N' section"] };
  if (round > 3) errors.push(`1: round ${round} — a fourth round is refused (D6)`);
  for (const [h, clause] of REQUIRED) if (!HEADING(h).test(sec)) errors.push(`${clause}: no '### ${h}' heading — the gate reads the template's headings only`);

  const levelOf = (s) => { const m = /^\W*(critical|high|medium|low)\b/i.exec(s); return m ? m[1].toLowerCase() : null; };
  const risks = rows(block(sec, "Risks")).map(([r, what, source, , level]) => ({ r, what, source: source ?? "", level: levelOf(level ?? "") }));
  const approach = rows(block(sec, "Approach per risk")).map(([r, technique, oracle, layer, lane, effort]) => ({ r, technique: technique ?? "", oracle: oracle ?? "", lane: lane ?? "", effort: effort ?? "" }));
  const artifacts = new Map(rows(block(sec, "Artifacts")).map(([name, decision]) => [name, decision ?? ""]));
  const outOfScope = block(sec, "Out of scope");
  const cited = risks.map((x) => x.source).join("\n") + "\n" + outOfScope;

  for (const ac of bundle.acs ?? []) if (!new RegExp(`\\b${ac.id}\\b`).test(cited)) errors.push(`2: ${ac.id} maps to no risk and is not out of scope`);
  // A hotspot is `owner/repo:path:line`; SKILL.md and the template cite it as `path:line`, so either form counts.
  for (const p of (bundle.change?.prs ?? []).filter((x) => !x.context_only && !x.gap && !isAbandoned(x)))
    for (const h of p.hotspots ?? []) {
      const short = String(h.source).replace(/^[^:]*:/, "");
      if (!cited.includes(h.source) && !cited.includes(short)) errors.push(`3: hotspot ${h.source} maps to no risk and is not out of scope`);
    }

  if (HEADING("Risks").test(sec) && !risks.length) errors.push("4: the Risks table has no data rows");
  for (const x of risks) if (x.level === null) errors.push(`4: ${x.r} Level is not Critical/High/Medium/Low`);
  const registered = new Set(risks.map((x) => x.r));
  for (const x of risks) {
    const a = approach.find((y) => y.r === x.r);
    if (!a) { errors.push(`4: ${x.r} has no approach row`); continue; }
    if (!a.technique || !a.oracle || !a.lane) errors.push(`4: ${x.r} approach row lacks a technique, oracle or lane`);
    if (!/^\W*(low|medium|high)\b/i.test(a.effort)) errors.push(`4: ${x.r} effort "${a.effort}" is not low|medium|high`);
  }
  for (const a of approach) if (!registered.has(a.r)) errors.push(`4: approach row ${a.r} names no registered risk`);
  for (const a of approach) if (/\{HYPOTHESIS\}/.test(a.oracle) && !/\b(EXPLORE|MODEL)\b/.test(a.technique)) errors.push(`5: ${a.r} decides on a {HYPOTHESIS} oracle`);

  const firedLine = (/^Floors fired:([^\n]*)/m.exec(sec)?.[1] ?? "").split(/not fired:/i)[0];
  const fired = floors.floors.filter((f) => f.fired).map((f) => f.id);
  const running = (name) => /^RUN\b/i.test((artifacts.get(name) ?? "").trim());
  for (const id of fired) {
    if (!new RegExp(`\\b${id}\\b`).test(firedLine)) errors.push(`6: ${id} fired but is not on the 'Floors fired:' line`);
    for (const name of ARTIFACTS_FOR[id] ?? []) if (!running(name)) errors.push(`6: ${id} fired but '${name}' is not RUN (SKIP, N/A, missing or other)`);
    if ((id === "F10" || id === "F11") && !approach.some((a) => /\bMODEL\b/.test(a.technique))) errors.push(`6: ${id} fired but no risk has technique MODEL`);
  }
  const high = risks.filter((x) => x.level === "high" || x.level === "critical");
  if (high.length && (!running("Test model") || !running("Exploratory"))) errors.push(`6b: ${high.map((x) => x.r).join(", ")} High/Critical ⇒ Test model and Exploratory run (F1)`);
  for (const x of high) { const a = approach.find((y) => y.r === x.r); if (a && /\{HYPOTHESIS\}/.test(a.oracle) && !/\bMODEL\b/.test(a.technique)) errors.push(`6c: ${x.r} High/Critical on {HYPOTHESIS} needs MODEL (M1)`); }
  if (fired.includes("F6") && !/Deployed:\s*NO\b/.test(sec)) errors.push("6d: F6 fired but the header does not say 'Deployed: NO'");

  const lanes = new Set(approach.map((a) => a.lane.split("·")[0].trim()).filter(Boolean));
  if (lanes.size > 3 && !/^Lanes sequenced:/m.test(sec)) errors.push(`8: ${lanes.size} browser lanes and no 'Lanes sequenced:' line`);
  const lines = sec.trimEnd().split("\n").length;
  if (lines > CAP) errors.push(`10: round section is ${lines} lines (cap ${CAP})`);
  return { round, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? null : process.argv[i + 1]; };
  if (!arg("strategy") || !arg("bundle")) { console.error("usage: check-strategy.mjs --strategy <md> --bundle <json>"); process.exit(1); }
  let md;
  try { md = readFileSync(arg("strategy"), "utf8"); } catch (e) { console.error(`check-strategy.mjs: cannot read ${arg("strategy")} (${e.code ?? e.message})`); process.exit(2); }
  const bundle = readJsonOrExit(arg("bundle"), "check-strategy.mjs");
  const res = checkStrategy(md, bundle, { domainMapText: domainMapTextOf(bundle), p01Names: p01NamesOf() });
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.errors.length ? 1 : 0);
}
