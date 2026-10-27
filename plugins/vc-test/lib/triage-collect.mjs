// plugins/vc-test/lib/triage-collect.mjs — the ticket-mode collector of /qa-triage-results: ported from the
// former ticket mode of scripts/lib/regression-triage.ts; this repository's regression half stays there.
//
// A /qa-test or /qa-test-fast run's checklist, exploratory and visual findings have no RUN_ID: they live as rows of the
// ticket's testing-checklist.md (the run's single durable record — every lane's condition is a row with a verdict).
// This reads that file, extracts every non-passing row (FAIL / BLOCKED / SKIPPED) with its screenshots and authored
// row, fingerprints it and groups the issues into classifier batches. It contains NO classification judgment — that is
// the classifier's (skills/qa-triage-results). No fingerprint store, no history: a checklist item is not a regression
// case and has no cross-run outcome series.
//
// CLI: node plugins/vc-test/lib/triage-collect.mjs --ticket <KEY|ticket-dir> [--max-batch N]
//   prints the packet { source: "checklist", ticketDir, environment, issueCount, byStatus: { FAIL, BLOCKED, SKIPPED },
//   advisoryCount, unresulted, batchCount, maxPerBatch, batches }.
//   exit 0: the packet printed; 2: usage; 1: no testing-checklist.md found (stderr names the run folders searched).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { currentEnv } from "./paths.mjs";
import { priorRunDirs, sessionRun, ticketOfRunDir } from "../scripts/lib/run-dir.mjs";

/** @typedef {"PASS"|"FAIL"|"BLOCKED"|"SKIPPED"|"PENDING"|"UNKNOWN"} Verdict */
/**
 * One non-passing checklist row, as the classifier reads it.
 * @typedef {object} IssueInput
 * @property {string} fingerprint
 * @property {"checklist"} source
 * @property {Verdict} status The verdict that made this a triage issue: FAIL | BLOCKED | SKIPPED.
 * @property {string} suiteId `checklist-<letter>` of the section's `<letter>. ` prefix, else `checklist`.
 * @property {string} suiteName The section heading.
 * @property {string} environment
 * @property {string} caseId The row's `#` / `id` cell.
 * @property {string} title
 * @property {string} evidence The Result cell.
 * @property {string[]} consoleErrors
 * @property {string|null} tracePath
 * @property {object|null} trace
 * @property {string[]} screenshots Ticket-dir-relative paths of the `screenshots/` files the row names or whose name carries the item id.
 * @property {string|null} harPath
 * @property {Record<string,string>|null} csvRow The checklist table row, keyed by the table's headers.
 * @property {boolean} flaky
 * @property {number} priorRuns
 */
/**
 * A batch of issues from the same section + status — one classifier call each.
 * @typedef {object} IssueBatch
 * @property {string} key `${suiteId}::${status}#${chunkIndex}`
 * @property {string} suiteId
 * @property {string} suiteName
 * @property {Verdict} status
 * @property {number} count
 * @property {IssueInput[]} issues
 */

const CHECKLIST_FILE = "testing-checklist.md";

// ---------------------------------------------------------------------------
// Normalization + fingerprinting
// ---------------------------------------------------------------------------

/**
 * Collapse a raw assertion / stack frame into a stable signature so data-driven variance (GUIDs, numbers, URLs,
 * quoted values) does not perturb the fingerprint.
 * @param {string} s
 * @returns {string}
 */
export function normalizeSignature(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<guid>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .replace(/["'`].*?["'`]/g, "<v>")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stable 12-char fingerprint for a failure within (env, suite, case, locus). Used to DEDUP identical failures (same
 * case failing the same way) — the signature is part of the key on purpose.
 * @param {string} env
 * @param {string} suiteId
 * @param {string} caseId
 * @param {string} signature
 * @returns {string}
 */
export function fingerprintFailure(env, suiteId, caseId, signature) {
  const norm = `${env}|${suiteId}|${caseId}|${signature}`;
  return createHash("md5").update(norm).digest("hex").slice(0, 12);
}

/**
 * The newest HAR archive of a browser lane (reference only — never inlined), else the lane's har folder, else null.
 * @param {string} browser
 * @returns {string|null}
 */
function harPathForBrowser(browser) {
  const b = (browser || "").toLowerCase();
  const lane = b.includes("firefox") ? "firefox" : b.includes("edge") ? "edge" : b.includes("chrom") ? "chrome" : "";
  if (!lane) return null;
  const dir = join("test-results", lane, "har");
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    const hars = readdirSync(dir)
      .filter((f) => /\.har$/i.test(f))
      .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b2) => b2.m - a.m);
    if (hars.length) return join(dir, hars[0].f); // newest lane archive
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Ticket mode — a /qa-test or /qa-test-fast run's testing-checklist.md
// ---------------------------------------------------------------------------

/**
 * Leading verdict word of a Result/Verdict cell → the issue status it triages as, or null when the row is not an
 * issue. Advisory outcomes (`vs. DESIGN` DRIFT / UNSPEC / KNOWN_DIVERGENCE, WAIVED) never block, so they are not triaged.
 * @param {string} cell
 * @returns {"FAIL"|"BLOCKED"|"SKIPPED"|"PASS"|"ADVISORY"|null}
 */
export function checklistVerdict(cell) {
  const u = String(cell ?? "").replace(/[*_`]/g, "").trim().toUpperCase();
  if (!u) return null;
  if (/^(FAIL(ED)?|NOT[- ]BUILT|MISSING)\b/.test(u)) return "FAIL";
  if (/^(BLOCKED|INCONCLUSIVE)\b/.test(u)) return "BLOCKED";
  if (/^(NOT[- ]RUN|SKIP(PED)?)\b/.test(u)) return "SKIPPED";
  if (/^PASS(ED)?\b/.test(u)) return "PASS";
  if (/^(DRIFT|ADVISORY|UNSPEC|KNOWN_DIVERGENCE|WAIVED|N\/A)\b/.test(u)) return "ADVISORY";
  return null;
}

/** @param {string} line @returns {string[]} */
function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/**
 * Resolve a ticket key or a ticket folder path to the folder holding its checklist: this session's bound run folder
 * for the ticket and env, else the env's run folder, else a folder from before the env level (run-dir.mjs). Another
 * env's folder never answers — its checklist describes another deployment. Throws, naming the run folders searched,
 * when there is none.
 * @param {string} arg
 * @param {string} [env]
 * @returns {string}
 */
export function resolveTicketDir(arg, env = process.env.TEST_ENV ?? "vcst") {
  if (!arg) throw new Error("collect --ticket needs a ticket key or a ticket folder");
  if (existsSync(join(arg, CHECKLIST_FILE))) return arg;
  const ticket = arg.toUpperCase();
  const bound = sessionRun();
  if (bound && bound.ticket === ticket && bound.env === env && existsSync(join(bound.dir, CHECKLIST_FILE))) return bound.dir;
  const newest = (/** @type {string[]} */ dirs) => dirs
    .filter((d) => existsSync(join(d, CHECKLIST_FILE)))
    .sort((a, b) => statSync(join(b, CHECKLIST_FILE)).mtimeMs - statSync(join(a, CHECKLIST_FILE)).mtimeMs);
  const runs = priorRunDirs({ ticket });
  const hits = [...newest(runs.filter((r) => r.env === env).map((r) => r.dir)), ...newest(runs.filter((r) => r.env === null).map((r) => r.dir))];
  if (!hits.length) {
    const searched = runs.length ? `searched ${runs.map((r) => r.dir).join(", ")}` : `no run folder for ${ticket}`;
    throw new Error(`No ${CHECKLIST_FILE} in a run folder of ${ticket} for ${env} (${searched})`);
  }
  return hits[0]; // newest checklist wins when a ticket spans sprints
}

/**
 * @typedef {object} ChecklistRead
 * @property {IssueInput[]} issues
 * @property {string[]} unresulted Item ids whose Result cell is empty or unreadable — a join-gate gap, never a pass.
 * @property {number} advisoryCount
 */

/**
 * Every non-passing checklist row (FAIL / BLOCKED / SKIPPED) as an IssueInput. A table counts when its header has a
 * `Result` or `Verdict` column. The LAST row for an item id wins, so a later `## Round` re-test supersedes the first
 * pass. Screenshots are the ticket's `screenshots/` files named in the row, or whose name carries the item id as a token.
 * @param {string} ticketDir
 * @param {string} [env]
 * @returns {ChecklistRead}
 */
export function readChecklistIssues(ticketDir, env = process.env.TEST_ENV ?? "vcst") {
  const ticket = ticketOfRunDir(ticketDir) ?? "";
  const lines = readFileSync(join(ticketDir, CHECKLIST_FILE), "utf-8").split(/\r?\n/);
  const shotsDir = join(ticketDir, "screenshots");
  const shots = existsSync(shotsDir) ? readdirSync(shotsDir).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f)) : [];
  /** @type {Map<string, { status: string|null, issue: IssueInput }>} */
  const rows = new Map();
  let section = "";
  /** @type {string[]|null} */
  let header = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{2,3}\s/.test(line)) { section = line.replace(/^#+\s*/, "").trim(); header = null; continue; }
    if (!line.trim().startsWith("|")) { header = null; continue; }
    if (!header) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) { header = splitRow(line); i++; }
      continue;
    }
    const resIdx = header.findIndex((h) => /^(result|verdict)$/i.test(h.replace(/[*_]/g, "")));
    if (resIdx === -1) continue;
    const idIdx = Math.max(0, header.findIndex((h) => /^(#|id)$/i.test(h)));
    const cells = splitRow(line);
    const id = (cells[idIdx] ?? "").replace(/[*_`]/g, "").trim();
    if (!id) continue;
    // A row with an extra empty cell (`… | data || PASS …`) shifts its result right — take the
    // first non-empty cell from the Result column on.
    const result = cells.slice(resIdx).find((c) => c.length > 0) ?? "";
    const status = checklistVerdict(result);
    /** @type {Record<string,string>} */
    const csvRow = {};
    header.forEach((h, k) => { csvRow[h] = k === resIdx ? result : cells[k] ?? ""; });
    const named = [...line.matchAll(/([\w.-]+\.(?:png|jpe?g|webp|gif))/gi)].map((m) => m[1].toLowerCase());
    const idTok = id.toLowerCase();
    const screenshots = shots
      .filter((f) => named.includes(f.toLowerCase()) || f.toLowerCase().split(/[-_.]/).includes(idTok))
      .map((f) => `screenshots/${f}`);
    const lane = /playwright-(chrome|edge|firefox)/i.exec(section)?.[1] ?? "";
    const letter = /^([A-Z])\.\s/.exec(section)?.[1];
    const suiteId = letter ? `checklist-${letter}` : "checklist";
    rows.set(id, {
      status,
      issue: {
        fingerprint: fingerprintFailure(env, `${ticket}:${suiteId}`, id, normalizeSignature(result).slice(0, 120)),
        source: "checklist",
        status: status === "ADVISORY" || status === null ? "UNKNOWN" : /** @type {Verdict} */ (status),
        suiteId,
        suiteName: section,
        environment: env,
        caseId: id,
        title: cells[idIdx + 1] ?? "",
        evidence: result,
        consoleErrors: [],
        tracePath: null,
        trace: null,
        screenshots,
        harPath: harPathForBrowser(lane),
        csvRow,
        flaky: false,
        priorRuns: 0,
      },
    });
  }
  /** @type {ChecklistRead} */
  const out = { issues: [], unresulted: [], advisoryCount: 0 };
  for (const [id, r] of rows) {
    if (r.status === "FAIL" || r.status === "BLOCKED" || r.status === "SKIPPED") out.issues.push(r.issue);
    else if (r.status === "ADVISORY") out.advisoryCount++;
    else if (r.status === null) out.unresulted.push(id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Batching for triage
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_BATCH = 25;

/**
 * Group issues into classifier batches by (suiteId, status): rows of the same section that came back the same way
 * usually share a root cause, so one classifier call can cover them in shared context instead of N calls. Each group is
 * chunked to at most `maxPerBatch` so a huge group never produces an unbounded prompt. Batches are sorted
 * largest-first. The classifier still emits a per-row verdict — batching is about shared context, not one shared class.
 * @param {IssueInput[]} issues
 * @param {number} [maxPerBatch]
 * @returns {IssueBatch[]}
 */
export function groupIssues(issues, maxPerBatch = DEFAULT_MAX_BATCH) {
  /** @type {Map<string, IssueInput[]>} */
  const byGroup = new Map();
  for (const i of issues) {
    const g = `${i.suiteId}::${i.status}`;
    const arr = byGroup.get(g) ?? [];
    arr.push(i);
    byGroup.set(g, arr);
  }
  /** @type {IssueBatch[]} */
  const batches = [];
  for (const [g, arr] of byGroup) {
    const [suiteId, status] = g.split("::");
    for (let start = 0, chunk = 0; start < arr.length; start += maxPerBatch, chunk++) {
      const slice = arr.slice(start, start + maxPerBatch);
      batches.push({
        key: `${g}#${chunk}`,
        suiteId,
        suiteName: slice[0]?.suiteName ?? "",
        status: /** @type {Verdict} */ (status),
        count: slice.length,
        issues: slice,
      });
    }
  }
  return batches.sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const ti = argv.indexOf("--ticket");
  const ticketArg = ti === -1 ? undefined : argv[ti + 1];
  if (!ticketArg || ticketArg.startsWith("--")) {
    console.error("usage: triage-collect.mjs --ticket <KEY|ticket-dir> [--max-batch N]");
    process.exitCode = 2;
    return;
  }
  const maxIdx = argv.indexOf("--max-batch");
  const maxPerBatch = maxIdx !== -1 ? Math.max(1, Number(argv[maxIdx + 1]) || DEFAULT_MAX_BATCH) : DEFAULT_MAX_BATCH;
  const env = currentEnv();
  let ticketDir;
  try { ticketDir = resolveTicketDir(ticketArg, env); } catch (e) { console.error(e.message); process.exitCode = 1; return; }
  const { issues, unresulted, advisoryCount } = readChecklistIssues(ticketDir, env);
  const batches = groupIssues(issues, maxPerBatch);
  console.log(JSON.stringify({
    source: "checklist",
    ticketDir,
    environment: env,
    issueCount: issues.length,
    byStatus: {
      FAIL: issues.filter((i) => i.status === "FAIL").length,
      BLOCKED: issues.filter((i) => i.status === "BLOCKED").length,
      SKIPPED: issues.filter((i) => i.status === "SKIPPED").length,
    },
    advisoryCount,
    unresulted,
    batchCount: batches.length,
    maxPerBatch,
    batches,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
