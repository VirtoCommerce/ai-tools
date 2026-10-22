// .claude/skills/qa-test-strategy/lib/check-strategy.mjs — the script half of SKILL.md §Gate. Reads the LAST
// "## Round N" section of test-strategy.md and checks it against the bundle, computing the floors itself from that
// bundle (never a floors file a doer hands it). The clauses that need judgment (7 project-risk mitigations,
// 9 observable exit criteria) stay the model's inline check.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeFloors, domainMapTextOf, isAbandoned, p01NamesOf, readJsonOrExit } from "./floors.mjs";

const CAP = 120; // lines per round section (D9)
// A lane that opens no browser, by its leading word. Every other lane counts toward the three of agents.md §Parallel
// Execution — an unrecognised name (`msedge`, `Lane A`) counts, so a new browser name can never slip past clause 8.
const NON_BROWSER_LANE = /^(?:(?:api|rest|graphql|xapi|scripts?|node|cli|shell|unit|newman|postman|none)\b|n\/a\b|[—–-]\s*$)/i;
const lastRound = (md) => { const i = md.lastIndexOf("\n## Round "); return i < 0 ? "" : md.slice(i + 1); };
// A heading counts only as the template writes it: a renamed one ("### Risk register") is missing, never matched.
const HEADING = (h) => new RegExp(`^### ${h}[ \\t]*$`, "m");
const block = (sec, heading) => { const m = new RegExp(`^### ${heading}[ \\t]*\\n([\\s\\S]*?)(?=\\n### |(?![\\s\\S]))`, "m").exec(sec); return m ? m[1] : ""; };
const REQUIRED = [["Risks", 4], ["Approach per risk", 4], ["Artifacts", 6], ["Out of scope", 2]]; // heading, the clause that reads it
// A table line that is not a separator (`|---|`, `|:--|--:|` alike); the first one left is the header row.
const rows = (text) => text.split("\n").filter((l) => /^\|/.test(l) && !/^[\s|:-]+$/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim())).slice(1);
// No floor maps to "Test model": the model runs if and only if a risk has technique MODEL (6e, M9), and the floors
// that used to force it now force a MODEL risk instead (MODEL_RISK_FOR; F1's half is 6c).
const ARTIFACTS_FOR = { F1: ["Exploratory"], F2: ["Exploratory"], F3: ["Visual lane"], F8: ["Visual lane"],
  F5: ["Coverage triage + regression"], F12: ["Exploratory"] };
// A fired floor here needs its OWN risk: Source carries the token `floor:<id>`, technique is MODEL (M10). A risk carries
// at most one such token. A fixed token, not a bare id, so a passing mention of "F10" in prose never counts.
const MODEL_RISK_FOR = { F2: "a purpose", F10: "an org-context", F11: "a configuration" };

export function checkStrategy(md, bundle, { domainMapText = null, p01Names, changeMap = null, changeMapPath = null } = {}) {
  if (bundle?.schema !== "ticket-context/1") return { round: 0, errors: ["0: bundle is not a ticket-context/1 bundle"] };
  md = String(md).replace(/\r\n?/g, "\n"); // a CRLF checkout (core.autocrlf) reads the same as the LF file
  const floors = computeFloors(bundle, { domainMapText, changeMap, ...(p01Names ? { p01Names } : {}) });
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
  const isModel = (r) => /\bMODEL\b/.test(approach.find((a) => a.r === r)?.technique ?? "");
  const names = (x, id) => new RegExp(`\\bfloor:${id}\\b`).test(x.source);
  // vc-test (a change map is given) runs no regression (vc-test spec U7, §5.3): F5 then asks for the cases at risk and
  // the follow-up in Out of scope (6h), not for the regression row.
  const vcTest = changeMap !== null;
  const requiredFor = (id) => (vcTest && id === "F5" ? [] : ARTIFACTS_FOR[id] ?? []);
  for (const id of fired) {
    if (!new RegExp(`\\b${id}\\b`).test(firedLine)) errors.push(`6: ${id} fired but is not on the 'Floors fired:' line`);
    for (const name of requiredFor(id)) if (!running(name)) errors.push(`6: ${id} fired but '${name}' is not RUN (SKIP, N/A, missing or other)`);
    if (MODEL_RISK_FOR[id] && !risks.some((x) => names(x, id) && isModel(x.r)))
      errors.push(`6: ${id} fired but no risk carries floor:${id} in its Source with technique MODEL (${MODEL_RISK_FOR[id]} risk, M10)`);
  }
  const high = risks.filter((x) => x.level === "high" || x.level === "critical");
  if (high.length && !running("Exploratory")) errors.push(`6b: ${high.map((x) => x.r).join(", ")} High/Critical ⇒ Exploratory runs (F1)`);
  for (const x of high) { const a = approach.find((y) => y.r === x.r); if (a && /\{HYPOTHESIS\}/.test(a.oracle) && !isModel(x.r)) errors.push(`6c: ${x.r} High/Critical on {HYPOTHESIS} needs MODEL (M1)`); }
  if (fired.includes("F6") && !/Deployed:\s*NO\b/.test(sec)) errors.push("6d: F6 fired but the header does not say 'Deployed: NO'");
  const modelRisks = risks.filter((x) => isModel(x.r)).map((x) => x.r);
  if (modelRisks.length && !running("Test model")) errors.push(`6e: ${modelRisks.join(", ")} technique MODEL ⇒ Test model is RUN (M9)`);
  if (!modelRisks.length && running("Test model")) errors.push("6e: Test model is RUN but no risk has technique MODEL — SKIP — no MODEL risk (M9)");
  // 6g: F12 reads a file the caller passes, so the header names it and the gate must be given the same one — otherwise
  // leaving --change-map off the gate would turn F12 off unseen.
  const cm = /^Change map:[ \t]*(.*)$/m.exec(sec)?.[1].trim() ?? "";
  const named = cm && !/^none\b/i.test(cm) ? cm : null;
  if (named && !changeMapPath) errors.push(`6g: the header names change map ${named} but the gate was not given it (--change-map)`);
  else if (!named && changeMapPath) errors.push(`6g: the gate was given --change-map ${changeMapPath} but no 'Change map:' line names it`);
  else if (named && resolve(named) !== resolve(changeMapPath)) errors.push(`6g: the header names change map ${named}, the gate was given ${changeMapPath}`);
  if (vcTest && running("Coverage triage + regression")) errors.push("6h: 'Coverage triage + regression' is RUN, but regression is not run by vc-test (U7) — SKIP it and list the cases at risk in Out of scope");
  if (vcTest && fired.includes("F5") && !/\/qa-regression\b/.test(outOfScope)) errors.push("6h: F5 fired under vc-test (U7) — Out of scope lists the cases at risk, their residual risk and the follow-up `/qa-regression <suites>`");
  // The list itself, not just the command: every suite the bundle puts at risk is named in Out of scope (stale ones too —
  // they are at risk, they only never run). F5 fired on doubt has no list; Out of scope then names the failed lookup.
  if (vcTest && fired.includes("F5"))
    for (const s of new Set((bundle.known?.cases_at_risk ?? []).map((c) => c?.suite).filter(Boolean).map(String)))
      if (!new RegExp(`(?<!\\w)${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\w)`).test(outOfScope)) errors.push(`6h: suite ${s} is at risk (known.cases_at_risk) but Out of scope does not name it`);
  for (const x of risks) {
    const own = Object.keys(MODEL_RISK_FOR).filter((id) => names(x, id));
    if (own.length > 1) errors.push(`6f: ${x.r} carries ${own.map((id) => `floor:${id}`).join(" and ")} — one floor, one risk (M10)`);
  }

  // An API, script or `none` lane takes no slot; every other lane does (agents.md §Parallel Execution).
  const lanes = new Set(approach.map((a) => a.lane.split("·")[0].trim()).filter((l) => l && !NON_BROWSER_LANE.test(l)));
  if (lanes.size > 3 && !/^Lanes sequenced:/m.test(sec)) errors.push(`8: ${lanes.size} browser lanes and no 'Lanes sequenced:' line`);
  const lines = sec.trimEnd().split("\n").length;
  if (lines > CAP) errors.push(`10: round section is ${lines} lines (cap ${CAP})`);
  return { round, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? null : process.argv[i + 1]; };
  if (!arg("strategy") || !arg("bundle")) { console.error("usage: check-strategy.mjs --strategy <md> --bundle <json> [--change-map <json>]"); process.exit(1); }
  let md;
  try { md = readFileSync(arg("strategy"), "utf8"); } catch (e) { console.error(`check-strategy.mjs: cannot read ${arg("strategy")} (${e.code ?? e.message})`); process.exit(2); }
  const bundle = readJsonOrExit(arg("bundle"), "check-strategy.mjs");
  const changeMapPath = arg("change-map") || null;
  const changeMap = changeMapPath ? (readJsonOrExit(changeMapPath, "check-strategy.mjs") ?? {}) : null; // a `null` file is a map in doubt
  const res = checkStrategy(md, bundle, { domainMapText: domainMapTextOf(bundle), p01Names: p01NamesOf(), changeMap, changeMapPath });
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.errors.length ? 1 : 0);
}
