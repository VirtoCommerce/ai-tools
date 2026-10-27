// plugins/vc-test/lib/trace.mjs — fills the last round's `### Reconciliation` table of test-strategy.md from the result
// rows of testing-checklist.md, so a risk's result is read off its rows by a script, never copied by hand (SKILL.md §Reconcile).
// A result row (`C-n`, `SC-n.m`, `VIS-n`, `PIX-n`, a prior bug's `PB-n`) belongs to a risk when its Ref names `R<n>` (`PB-1 · R3`), or (an `SC-`/`VIS-`/`PIX-` row only) names `S-<n>` whose
// `### Scenarios` row's Why likely ends `· R<n>`. In a `C-n` or `PB-n` row an `S-n` attributes nothing: ignored, never unknown.
// A PB row's Result (`PASS — FIXED`, `FAIL <severity> — NOT FIXED: …`, `BLOCKED — <why>`) is read like any other row's. A Ref naming an R or S the round does not have is reported.
// CLI: node plugins/vc-test/lib/trace.mjs reconcile --strategy <test-strategy.md> --checklist <testing-checklist.md>
//        [--run-plan <run-plan.json>] [--bundle <bundle.json>] [--write]
//   prints { unresulted, capped, unknownRefs, acsWithoutRow }; --write replaces the table's rows (idempotent).
//   exit 0: every risk has a result, no unknown Ref, every AC of the bundle has a row; 2: one of those is not true;
//   1: usage, an unreadable file, no `## Round`, or no `### Reconciliation` table to write into.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { argOf } from "./paths.mjs";
import { block, lastRound, rows as tableRows } from "./strategy-artifacts.mjs";

const ROW_ID = /^(?:C-\d+|SC-\d+\.\d+|VIS-\d+|PIX-\d+|PB-\d+)$/;
const SEVERITY = ["Critical", "High", "Medium", "Low"];
const lf = (s) => String(s).replace(/\r\n?/g, "\n");
// A cell may hold an escaped pipe; split only on the unescaped ones.
const cellsOf = (line) => line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim().replace(/\\\|/g, "|"));
const named = (ref, re) => [...String(ref).matchAll(re)].map((m) => m[1]);
// `R-3` is the prose spelling of `R3` (the command and floors write `R-n`): both name the same risk.
const risksIn = (ref) => named(ref, /(?<![\w-])R-?(\d+)(?![\w-])/g).map((n) => `R${n}`);
const scenariosIn = (ref) => named(ref, /(?<![\w-])(S-\d+)(?![\w-])/g);
const namesAc = (ref, id) => new RegExp(`(?<![\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(ref);

function resultRows(checklistMd) {
  return lf(checklistMd).split("\n").filter((l) => /^\|/.test(l.trim())).map((l) => cellsOf(l.trim()))
    .filter((c) => ROW_ID.test(c[0] ?? "")).map((c) => {
      const res = /^(PASS|FAIL|BLOCKED)\b\s*(?:[—–:-]\s*)?(.*)$/i.exec(c[5] ?? "");
      return { id: c[0], ref: c[1] ?? "", status: res?.[1].toUpperCase() ?? null, detail: (res?.[2] ?? "").trim(), raw: c[5] ?? "" };
    });
}

// The first word of a FAIL's detail, punctuation aside: `High: …`, `(Critical)` and `— Medium` all name a severity.
const severityOf = (detail) => SEVERITY.findIndex((s) => s.toLowerCase() === /\p{L}+/u.exec(detail)?.[0].toLowerCase());
// A row whose Result is not PASS, FAIL or BLOCKED (empty, `SKIP — <capability>`, `N/A`) proves nothing.
const unproved = (list) => list.filter((r) => !r.status);

// FAIL <worst severity> > BLOCKED > PASS; null when no row has any result written.
function verdictOf(list) {
  if (!list.some((r) => r.status || r.raw)) return null;
  const fails = list.filter((r) => r.status === "FAIL");
  if (fails.length) {
    const worst = fails.map((r) => severityOf(r.detail)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
    return worst === undefined ? "FAIL" : `FAIL ${SEVERITY[worst]}`;
  }
  // A PASS beside a BLOCKED or an unproved row is not a PASS: that row is an unproved part of the risk.
  return list.some((r) => r.status === "BLOCKED") || unproved(list).length ? "BLOCKED" : "PASS";
}

export function reconcile({ strategyMd, checklistMd, runPlan = null, acs = [] }) {
  const sec = lastRound(lf(strategyMd));
  const risks = tableRows(block(sec, "Risks")).filter((c) => /^R\d+$/.test(c[0] ?? "")).map((c) => ({ r: c[0], level: c[4] ?? "" }));
  const approach = new Map(tableRows(block(sec, "Approach per risk")).map((c) => [c[0], { technique: c[1] ?? "", lane: (c[4] ?? "").split("·")[0].trim() }]));
  // Why likely ends with `· R<n>` (one or several); only that trailing group assigns the scenario to a risk.
  const scenarioRisks = new Map(tableRows(block(sec, "Scenarios")).filter((c) => /^S-\d+$/.test(c[0] ?? ""))
    .map((c) => [c[0], risksIn(/(?:[·,/]\s*R\d+\s*)+$/.exec(c[4] ?? "")?.[0] ?? "")]));
  const missingOf = new Map((runPlan?.waves ?? []).flat().filter((e) => e.missing && /^scenario:S-\d+$/.test(e.id ?? ""))
    .map((e) => [e.id.slice("scenario:".length), [].concat(e.missing).join(", ")]));
  const results = resultRows(checklistMd);
  const known = new Set(risks.map((x) => x.r));

  // In a `C-n` row an `S-n` is a change-map suspicion (briefs/checklist.md), and a `PB-n` row is attributed by its R<n>
  // alone: neither resolves an `S-n`. Only the scenario rows (`SC-`, `VIS-`, `PIX-`) resolve one to a Scenarios row.
  const scenarioRow = (row) => /^(?:SC|VIS|PIX)-/.test(row.id);
  const scenariosOf = (row) => (scenarioRow(row) ? scenariosIn(row.ref) : []);
  const owners = (row) => new Set([...risksIn(row.ref), ...scenariosOf(row).flatMap((s) => scenarioRisks.get(s) ?? [])]);
  const out = risks.map(({ r, level }) => {
    const mine = results.filter((row) => owners(row).has(r));
    const scenarios = [...scenarioRisks].filter(([, rs]) => rs.includes(r)).map(([s]) => s);
    const a = approach.get(r);
    const result = verdictOf(mine);
    const notRun = scenarios.filter((s) => missingOf.has(s)).map((s) => `not run: needs ${missingOf.get(s)}`);
    const blocked = mine.filter((x) => x.status === "BLOCKED").map((x) => x.detail || "blocked");
    const noResult = result === null ? [] : unproved(mine).map((x) => `${x.id}: ${x.raw || "no result"}`);
    const parts = [...blocked, ...noResult, ...notRun];
    return {
      r, level,
      planned: [scenarios.join(", "), a?.technique, a?.lane].filter(Boolean).join(" · ") || "—",
      ran: mine.map((x) => x.id).join(", ") || "—",
      result,
      deviation: parts.length ? parts.join("; ") : result === null ? "no result" : "—",
    };
  });

  const knownS = new Set(scenarioRisks.keys());
  const unknownRefs = results.filter((row) => risksIn(row.ref).some((x) => !known.has(x)) || scenariosOf(row).some((x) => !knownS.has(x)))
    .map((row) => ({ id: row.id, ref: row.ref }));
  return {
    rows: out,
    unresulted: out.filter((x) => x.result === null).map((x) => x.r),
    capped: out.some((x) => /^(Critical|High)$/i.test(x.level) && (x.result === null || x.result === "BLOCKED")),
    unknownRefs,
    acs: acs.map(({ id }) => {
      const mine = results.filter((row) => namesAc(row.ref, id));
      return { ac: id, rows: mine.map((x) => x.id), result: verdictOf(mine) };
    }),
  };
}

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
export function writeReconciliation(strategyMd, rows) {
  const crlf = /\r\n/.test(strategyMd);
  const text = lf(strategyMd);
  const sec = lastRound(text);
  const start = text.length - sec.length;
  const heading = /^### Reconciliation.*$/m.exec(sec);
  if (!sec || !heading) throw new Error("no `### Reconciliation` table in the last round");
  const lines = sec.slice(heading.index + heading[0].length + 1).split("\n");
  // Blank lines between the heading and its table stay where they are; the table starts after them.
  let s = 0;
  while (s < lines.length && !lines[s].trim()) s++;
  let n = s;
  while (n < lines.length && /^\|/.test(lines[n])) n++;
  const head = n - s >= 2 ? lines.slice(s, s + 2) : ["| R | Planned | Ran (item ids · charter · lane · case ids) | Result | Deviation — reason |", "|---|---|---|---|---|"];
  const body = rows.map((x) => `| ${[x.r, x.planned, x.ran, x.result ?? "—", x.deviation].map(cell).join(" | ")} |`);
  const next = [...lines.slice(0, s), ...head, ...body, ...lines.slice(n)].join("\n");
  const full = text.slice(0, start) + sec.slice(0, heading.index + heading[0].length + 1) + next;
  return crlf ? full.replace(/\n/g, "\r\n") : full;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cmd] = process.argv.slice(2);
  const [strategy, checklist, planPath, bundle] = ["strategy", "checklist", "run-plan", "bundle"].map((n) => argOf(process.argv, n));
  if (cmd !== "reconcile" || !strategy || !checklist) {
    console.error("usage: trace.mjs reconcile --strategy <test-strategy.md> --checklist <testing-checklist.md> [--run-plan <p>] [--bundle <p>] [--write]");
    process.exit(1);
  }
  try {
    const strategyMd = readFileSync(strategy, "utf8");
    if (!lastRound(lf(strategyMd))) { console.error(`${strategy} has no "## Round" section`); process.exit(1); }
    const r = reconcile({
      strategyMd, checklistMd: readFileSync(checklist, "utf8"),
      runPlan: planPath ? JSON.parse(readFileSync(planPath, "utf8")) : null,
      acs: bundle ? (JSON.parse(readFileSync(bundle, "utf8")).acs ?? []) : [],
    });
    if (process.argv.includes("--write")) writeFileSync(strategy, writeReconciliation(strategyMd, r.rows));
    const acsWithoutRow = r.acs.filter((a) => !a.rows.length).map((a) => a.ac);
    console.log(JSON.stringify({ unresulted: r.unresulted, capped: r.capped, unknownRefs: r.unknownRefs, acsWithoutRow }));
    process.exit(r.unresulted.length || r.unknownRefs.length || acsWithoutRow.length ? 2 : 0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
