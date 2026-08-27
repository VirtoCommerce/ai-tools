#!/usr/bin/env -S npx tsx
/**
 * `npm run suites:lanes -- <suiteId|csvPath>` — split ONE suite's cases between the machine
 * lane and a browser agent, before either runs.
 *
 * WHAT THIS REPLACES. Lane routing is all-or-nothing today: a suite reaches the fast path
 * only if EVERY non-empty `Steps` cell carries a runner op tag. Measured, that strands
 * **169 machine-ready rows in 10 suites** on the browser lane — 050d sends 46 runner-native
 * cases through a browser agent because 3 of its 49 are prose, and 087 occupies a browser
 * slot to run zero browser cases (12 machine + 3 explicitly Manual).
 *
 * The saving is real but secondary. At the measured ~29% artefactual-BLOCKED rate for long
 * agent sessions, roughly 54 of those 169 rows currently come back BLOCKED for reasons about
 * HOW they ran — a contaminated cart, a drifted session — not about the product. Those turn
 * into real verdicts.
 *
 * OUTPUT, and why there are two files:
 *
 *   suite-{ID}-lanes.json           the plan: which case goes where, and WHY not for the
 *                                   rest (blocker codes). `merge-suite-lanes.ts` treats this
 *                                   as authoritative, so a lane that dies quietly surfaces
 *                                   as BLOCKED instead of shrinking the suite.
 *   suite-{ID}-resolved.browser.csv only the browser rows. The agent is handed a smaller
 *                                   file rather than being asked to skip rows — a filter it
 *                                   applies itself is a rule it can drift from, and its
 *                                   session shrinks by 80-95% on the mixed suites, which is
 *                                   what removes the long-session context decay that
 *                                   produces blanket-status JSON.
 *
 * The machine lane runs against the ORIGINAL suite CSV, not a filtered copy: the runner
 * selects by id (`--case <csv>:<ID>`) and resolves `@td()` / `{{VAR}}` itself, so handing it
 * an already-resolved file would resolve twice.
 *
 * Usage:
 *   npm run suites:lanes -- 050h                          # plan into the run dir
 *   npm run suites:lanes -- 050h --csv <resolved.csv>      # browser file from a resolved CSV
 *   npm run suites:lanes -- 050h --run-id REG-… --json
 *   npm run suites:lanes -- --all                          # corpus survey, writes nothing
 *
 * Exit codes: 0 planned · 1 the suite cannot be planned (unknown id, unreadable CSV)
 * · 2 the CSV header is not the canonical 15 columns.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import {
  COLUMNS,
  describeHeaderMismatch,
  isCanonicalHeader,
  parseSuite,
  serialiseRows,
  type Row,
} from "../test-cases/append-test-cases-to-suite.js";
import { loadManifest, type ManifestSuite } from "../../ci/lib/suite-manifest.js";
import {
  blockerHistogram,
  classifySuiteCases,
  CLASSIFIER_VERSION,
  type BlockerCode,
  type CaseLane,
  type ClassifiableRow,
} from "../../scripts/lib/case-classifier.js";

interface Args {
  target: string;
  csv?: string;
  runId?: string;
  out?: string;
  json: boolean;
  all: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args = argv.filter((a) => a !== "--");
  const value = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
  };
  return {
    target: args.find((a) => !a.startsWith("--")) ?? "",
    csv: value("csv"),
    runId: value("run-id") ?? process.env.RUN_ID,
    out: value("out"),
    json: args.includes("--json"),
    all: args.includes("--all"),
    dryRun: args.includes("--dry-run"),
  };
}

function resolveSuite(target: string, manifest: ReturnType<typeof loadManifest>): ManifestSuite | { id: string; file: string; name: string } | null {
  const byId = manifest.suites.find((s) => s.id === target);
  if (byId) return byId;
  if (target.endsWith(".csv") && existsSync(target)) {
    const byFile = manifest.suites.find((s) => s.file === target.split("\\").join("/"));
    return byFile ?? { id: target.replace(/.*?(\d+[a-z]*)-.*/, "$1"), file: target, name: target };
  }
  return null;
}

/**
 * A legacy 11-column header is FATAL here, not a warning. The shared
 * `describeHeaderMismatch` owns the comparison (and the BOM strip); this wrapper owns only the
 * reaction, which for a lane planner is to refuse: `parseSuite` maps fields POSITIONALLY, so on
 * such a file the legacy `Steps` lands in `Test_Data` and `Expected Result` lands in `Steps`,
 * and the classifier would confidently route rows on the strength of the wrong cells. Eleven
 * suites still carry that header; none of them is one of the ten mixed suites this exists for,
 * so refusing costs nothing and guessing would cost correctness.
 */
function refuseLegacyHeader(raw: string, file: string): void {
  const mismatch = describeHeaderMismatch(raw);
  if (!mismatch) return;
  console.error(`[suites:lanes] ${file} ${mismatch}`);
  console.error(
    `parseSuite maps fields positionally, so classifying this file would route cases on the wrong columns.`,
  );
  console.error(`Migrate the header first — never route a legacy-header suite.`);
  process.exit(2);
}

interface LanesFile {
  suiteId: string;
  suiteName: string;
  runId: string;
  classifierVersion: string;
  /** The CSV the MACHINE lane must run against — unresolved, the runner resolves it. */
  machineSourceCsv: string;
  /** The filtered CSV the browser agent gets. Empty when there are no browser rows. */
  browserCsv: string;
  /**
   * `machine + browser` is what actually runs. `manual` and `deprecated` are the two
   * non-executing lanes and are counted SEPARATELY — folding a retired case into `manual`
   * would claim a human is expected to run it.
   */
  counts: { total: number; machine: number; browser: number; manual: number; deprecated: number };
  planned: Array<{ id: string; lane: CaseLane }>;
  /** Why each non-machine case is not machine — the burn-down input. */
  blockers: Array<{ id: string; codes: string[]; details: string[] }>;
}

function planOne(suite: { id: string; file: string; name: string }, args: Args): { lanes: LanesFile; rows: Row[] } {
  const sourceRaw = readFileSync(suite.file, "utf-8");
  refuseLegacyHeader(sourceRaw, suite.file);

  // Classification reads the tag grammar, which resolution does not change — so it can run
  // on either copy. The browser CSV must come from the RESOLVED one when given.
  const browserSourcePath = args.csv ?? suite.file;
  const browserRaw = readFileSync(browserSourcePath, "utf-8");
  refuseLegacyHeader(browserRaw, browserSourcePath);

  const rows = parseSuite(browserRaw.replace(/^\uFEFF/, "")).rows;
  const result = classifySuiteCases(rows as unknown as ClassifiableRow[]);

  const outDir = args.out ?? (args.runId ? join("reports", "regression", args.runId) : join("reports", "regression", "lanes"));
  const browserRows = rows.filter((r) => result.browser.includes(r.ID));

  const lanes: LanesFile = {
    suiteId: suite.id,
    suiteName: suite.name,
    runId: args.runId ?? "",
    classifierVersion: CLASSIFIER_VERSION,
    machineSourceCsv: suite.file,
    browserCsv: browserRows.length > 0 ? join(outDir, `suite-${suite.id}-resolved.browser.csv`) : "",
    counts: {
      total: rows.length,
      machine: result.machine.length,
      browser: result.browser.length,
      manual: result.manual.length,
      deprecated: result.deprecated.length,
    },
    planned: result.verdicts.map((v) => ({ id: v.id, lane: v.lane })),
    blockers: result.verdicts
      .filter((v) => v.blockers.length > 0)
      .map((v) => ({
        id: v.id,
        codes: [...new Set(v.blockers.map((b) => b.code))],
        details: v.blockers.map((b) => b.detail),
      })),
  };

  if (!args.dryRun && !args.all) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `suite-${suite.id}-lanes.json`), JSON.stringify(lanes, null, 2) + "\n", "utf-8");
    if (browserRows.length > 0) {
      // Canonical header + only the browser rows, serialised by the same writer the append
      // tool uses so quoting cannot drift.
      writeFileSync(lanes.browserCsv, `${COLUMNS.join(",")}\n${serialiseRows(browserRows)}`, "utf-8");
    }
  }

  return { lanes, rows: rows as Row[] };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest();

  if (args.all) {
    // Corpus survey: which suites would gain from per-case routing. Writes nothing.
    const rows: Array<{ id: string; machine: number; browser: number; manual: number; deprecated: number; name: string }> = [];
    for (const s of manifest.suites) {
      try {
        const raw = readFileSync(s.file, "utf-8").replace(/^\uFEFF/, "");
        if (!isCanonicalHeader(raw)) continue;
        const r = classifySuiteCases(parseSuite(raw).rows as unknown as ClassifiableRow[]);
        if (r.machine.length > 0 && r.browser.length + r.manual.length + r.deprecated.length > 0) {
          rows.push({
            id: s.id,
            machine: r.machine.length,
            browser: r.browser.length,
            manual: r.manual.length,
            deprecated: r.deprecated.length,
            name: s.name,
          });
        }
      } catch {
        /* unparsable suites are reported by suites:lint, not here */
      }
    }
    rows.sort((a, b) => b.machine - a.machine);
    if (args.json) {
      console.log(JSON.stringify({ classifierVersion: CLASSIFIER_VERSION, mixed: rows }, null, 2));
      return;
    }
    const stranded = rows.reduce((sum, r) => sum + r.machine, 0);
    console.log(`Mixed suites: ${rows.length} — ${stranded} machine-ready cases share a file with prose cases\n`);
    console.log("  suite   machine  browser  manual  deprec  name");
    for (const r of rows) {
      console.log(
        `  ${r.id.padEnd(7)} ${String(r.machine).padStart(7)} ${String(r.browser).padStart(8)} ` +
          `${String(r.manual).padStart(7)} ${String(r.deprecated).padStart(7)}  ${r.name.slice(0, 40)}`,
      );
    }
    return;
  }

  if (!args.target) {
    console.error("Usage: npm run suites:lanes -- <suiteId|csvPath> [--csv <resolved.csv>] [--run-id <id>] [--out <dir>] [--json]");
    console.error("       npm run suites:lanes -- --all        # corpus survey, writes nothing");
    process.exit(1);
  }

  const suite = resolveSuite(args.target, manifest);
  if (!suite) {
    console.error(`[suites:lanes] unknown suite "${args.target}" — not a manifest id and not an existing CSV path.`);
    process.exit(1);
  }

  const { lanes } = planOne(suite as { id: string; file: string; name: string }, args);

  if (args.json) {
    console.log(JSON.stringify(lanes, null, 2));
    return;
  }

  const { total, machine, browser, manual, deprecated } = lanes.counts;
  console.log(`=== Lane plan: ${lanes.suiteId} ${lanes.suiteName} ===`);
  console.log(
    `${total} cases → ${machine} machine · ${browser} browser · ${manual} manual · ${deprecated} deprecated`,
  );
  if (browser === 0 && machine > 0) {
    console.log(`This suite needs NO browser slot: every case is runner-native or an explicit opt-out.`);
  }
  if (deprecated > 0) {
    console.log(
      `${deprecated} retired case(s) are excluded from BOTH lanes (EX-201) and will be merged as SKIPPED.`,
    );
  }
  if (lanes.blockers.length > 0) {
    console.log(`\nWhy the rest are not machine-executable (cases per code):`);
    const hist = blockerHistogram(
      lanes.blockers.map((b) => ({ blockers: b.codes.map((code) => ({ code: code as BlockerCode })) })),
    );
    for (const h of hist) console.log(`  ${h.code}  ${h.count}`);
  }
  if (!args.dryRun) {
    console.log(`\nWrote suite-${lanes.suiteId}-lanes.json${lanes.browserCsv ? ` and ${lanes.browserCsv}` : ""}`);
  }
}

// Same CLI guard as the rest of scripts/: importing this module must not run it.
const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();

export { planOne, refuseLegacyHeader, type LanesFile };
