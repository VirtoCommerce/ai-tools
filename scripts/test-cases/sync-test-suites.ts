#!/usr/bin/env tsx
/**
 * Validate config/test-suites.json and refresh derivable _meta fields.
 *
 * `selections` holds rule objects (not flat string arrays); consumers expand
 * them at load time. This script only:
 *   - sorts `suites` by id
 *   - refreshes `_meta.totalSuites` and `_meta.generated`
 *   - verifies every rule expands to known suite IDs (and to a non-empty list)
 *   - **manifest integrity**: hard-fails if any declared suite `file` is absent
 *     (`findMissingFiles`), and warns on duplicate ids / orphan CSVs
 *     (`findManifestDisagreements`) — the three ways a declared suite can
 *     silently never run
 *   - **globally unique case IDs**: hard-fails if one case ID appears in more
 *     than one suite CSV (`findDuplicateCaseIds`)
 *   - strict-parses every suite CSV against a burn-down baseline
 *
 * Usage:
 *   npm run suites:sync          rewrite the file
 *   npm run suites:lint          exit 1 if file is out of sync (for CI)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, sep } from "path";
import { fileURLToPath } from "url";
import { parse as parseCsv } from "csv-parse/sync";
import { extractExistingIds } from "./append-test-cases-to-suite.js";

const MANIFEST_PATH = join("config", "test-suites.json");
const CHECK_MODE = process.argv.includes("--check");

/**
 * Strict CSV lint baseline — a BURN-DOWN list of suites whose CSV already fails
 * the strict PARSE (malformed quote-escaping / unquoted commas). This is a
 * ratchet, NOT a permanent exemption: the lint hard-fails on any suite NOT in
 * this set, so new drift is caught immediately. Fix a listed suite and remove
 * its id here — the lint will remind you (a baselined suite that now passes is
 * reported as "stale baseline entry"). Goal: keep this empty.
 *
 * A MISSING FILE is deliberately NOT baselineable — see `lintSuiteCsvs`.
 */
const CSV_LINT_BASELINE = new Set<string>([]);

interface Suite {
  id: string;
  name: string;
  file: string;
  domain: string;
  layer: string;
  concern: string;
  priority: string;
  testCount: number;
  estimatedMinutes: number;
  agent: string;
  tags: string[];
}

type WhereFilter = Partial<Pick<Suite, "domain" | "layer" | "concern" | "priority">> & {
  tag?: string;
  tagAny?: string[];
};

type SelectionRule =
  | { include: string[]; exclude?: string[] }
  | { all: true; exclude?: string[] }
  | { where: WhereFilter; include?: string[]; exclude?: string[] };

interface Manifest {
  $schema?: string;
  _meta: {
    version: string;
    description: string;
    generated: string;
    totalSuites: number;
    [k: string]: unknown;
  };
  defaults: Record<string, unknown>;
  browserPool: unknown[];
  suites: Suite[];
  selections: Record<string, SelectionRule | { _doc?: string }>;
}

function matchesWhere(suite: Suite, where: WhereFilter): boolean {
  if (where.domain && suite.domain !== where.domain) return false;
  if (where.layer && suite.layer !== where.layer) return false;
  if (where.concern && suite.concern !== where.concern) return false;
  if (where.priority && suite.priority !== where.priority) return false;
  if (where.tag && !suite.tags.includes(where.tag)) return false;
  if (where.tagAny && !where.tagAny.some((t) => suite.tags.includes(t))) return false;
  return true;
}

function expandRule(rule: SelectionRule, suites: Suite[]): string[] {
  let ids: string[];
  if ("include" in rule && !("where" in rule) && !("all" in rule)) {
    ids = [...rule.include];
  } else if ("all" in rule) {
    ids = suites.map((s) => s.id);
  } else if ("where" in rule) {
    ids = suites.filter((s) => matchesWhere(s, rule.where)).map((s) => s.id);
    if (rule.include) {
      for (const id of rule.include) if (!ids.includes(id)) ids.push(id);
    }
  } else {
    throw new Error(`Invalid rule: ${JSON.stringify(rule)}`);
  }
  if ("exclude" in rule && rule.exclude) {
    const ex = new Set(rule.exclude);
    ids = ids.filter((id) => !ex.has(id));
  }
  return ids;
}

function validateRules(manifest: Manifest): string[] {
  const errors: string[] = [];
  const allIds = new Set(manifest.suites.map((s) => s.id));
  for (const [name, rule] of Object.entries(manifest.selections)) {
    if (name.startsWith("_")) continue;
    try {
      const ids = expandRule(rule as SelectionRule, manifest.suites);
      if (ids.length === 0) {
        errors.push(`selection "${name}" expands to empty list`);
      }
      for (const id of ids) {
        if (!allIds.has(id)) errors.push(`selection "${name}" references unknown suite "${id}"`);
      }
    } catch (e) {
      errors.push(`selection "${name}": ${(e as Error).message}`);
    }
  }
  return errors;
}

/**
 * Manifest integrity: every declared suite `file` must EXIST on disk. Unlike a
 * strict-parse failure this is NOT baselineable, because it fails silently in the
 * worst possible way — a selection that resolves entirely to missing files runs
 * ZERO cases while the runner still reports a valid selection and a green run.
 * That is exactly how suite 080 (`_release/080-full-regression-release.csv`,
 * deleted in 9dd9f3e3) left the `release` selection a no-op for a month: the
 * check existed, but 080 sat in CSV_LINT_BASELINE, so the lint stayed green.
 * A missing CSV means "delete the entry or restore the file" — never "baseline it".
 */
function findMissingFiles(manifest: Manifest): string[] {
  return manifest.suites
    .filter((s) => !existsSync(s.file))
    .map((s) => `suite ${s.id} (${s.name}): declared file does not exist — ${s.file}`);
}

/**
 * The two OTHER ways the manifest and the CSVs on disk can silently disagree.
 * Both are reported as warnings (not hard failures) because each has a known
 * pre-existing instance whose correct fix is a renumbering decision, not a
 * mechanical one — see the FOLLOW-UP note in `.claude/rules/regression.md`.
 *
 *  - **Duplicate id** — consumers build their suite lookup with
 *    `Object.fromEntries(suites.map(s => [s.id, s]))` (`ci/run-regression.ts`
 *    SUITE_MAP), so on a collision the LAST entry silently wins and the other
 *    CSV never runs. Case IDs must be globally unique for the same reason:
 *    colliding results overwrite each other's failure evidence.
 *  - **Orphan CSV** — a suite file on disk that no manifest entry declares is
 *    unreachable by every selection, so it never runs and nothing says so.
 */
function findManifestDisagreements(manifest: Manifest): { dupIds: string[]; orphans: string[] } {
  const byId = new Map<string, string[]>();
  for (const s of manifest.suites) {
    byId.set(s.id, [...(byId.get(s.id) ?? []), s.file]);
  }
  const dupIds = [...byId.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([id, files]) => `id "${id}" declared ${files.length}× — only the last runs: ${files.join(", ")}`);

  const declared = new Set(manifest.suites.map((s) => s.file.split(sep).join("/")));
  const orphans = allSuiteCsvs().filter((f) => !declared.has(f));

  return { dupIds, orphans };
}

/** Every suite CSV on disk, as forward-slash repo-relative paths. */
export function allSuiteCsvs(root = join("regression", "suites")): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const f = join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.toLowerCase().endsWith(".csv")) out.push(f.split(sep).join("/"));
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

/**
 * Case IDs must be globally unique across the WHOLE corpus, not just within a
 * suite (memory `reference_case_ids_must_be_globally_unique`). Consumers key
 * per-case results and failure evidence by bare case ID — the runner writes
 * `suite-*-results.json` rows and `traces/{TC-ID}-FAIL-trace.json` files, and
 * `scripts/lib/regression-triage.ts` fingerprints by ID — so when two suites
 * both declare `CAT-001`, one run's evidence silently overwrites the other's and
 * a real failure can read as someone else's pass.
 *
 * This is a HARD failure, not a warning: the corpus was cleaned to zero
 * collisions (223 of them, resolved by re-prefixing the admin-side namespaces —
 * `CATA-*`/`ORDA-*`/`SRCHA-*`/`WISH-*`/`SR-EMB-*`/`CPN-SMK-*`/`CFG-XAPI-*` — and
 * renumbering same-domain clashes), so there is no pre-existing debt to
 * baseline and any hit is genuinely new drift.
 *
 * IDs are harvested with `extractExistingIds`' line-start scan rather than a
 * field parse, deliberately: several suites carry unescaped inner double-quotes
 * that strict CSV parsing rejects, and this check must still cover them.
 *
 * A lone CR is promoted to LF first, because `extractExistingIds` splits on
 * `/\r?\n/` and would otherwise treat a bare-CR-terminated file as one giant
 * line — harvesting only its first ID and passing the rest vacuously. Today's
 * corpus is CRLF throughout (`.gitattributes` pins `eol=crlf`) so this changes
 * nothing now; it stops the gate degrading silently if that ever slips.
 */
export function findDuplicateCaseIds(root?: string): string[] {
  const byId = new Map<string, string[]>();
  for (const file of allSuiteCsvs(root)) {
    const text = readFileSync(file, "utf-8").replace(/\r(?!\n)/g, "\n");
    for (const id of extractExistingIds(text)) {
      byId.set(id, [...(byId.get(id) ?? []), file]);
    }
  }
  return [...byId.entries()]
    .filter(([, files]) => files.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, files]) => `case ID "${id}" appears in ${files.length} suites: ${files.join(", ")}`);
}

/**
 * Strict-parse every suite CSV that EXISTS, with the repo's canonical settings
 * (bom + strict column count + strict quotes — same as graphql-runner.ts /
 * review-graphql-labels.ts). Returns errors for suites NOT in the burn-down
 * baseline, plus any baseline entries that now pass (stale — remove them).
 * Missing files are handled by `findMissingFiles`, not here.
 */
function lintSuiteCsvs(manifest: Manifest): { newErrors: string[]; baselineStale: string[] } {
  const newErrors: string[] = [];
  const baselineStale: string[] = [];
  for (const suite of manifest.suites) {
    if (!existsSync(suite.file)) continue; // reported by findMissingFiles
    let problem: string | null = null;
    try {
      parseCsv(readFileSync(suite.file, "utf-8"), {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: false,
        bom: true,
      });
    } catch (e) {
      const err = e as { code?: string; lines?: number; message?: string };
      const at = err.lines !== undefined ? ` @line ${err.lines}` : "";
      problem = `${err.code ?? "PARSE_ERROR"}${at}`;
    }
    const inBaseline = CSV_LINT_BASELINE.has(suite.id);
    if (problem && !inBaseline) newErrors.push(`suite ${suite.id} (${suite.file}): ${problem}`);
    if (!problem && inBaseline) baselineStale.push(suite.id);
  }
  return { newErrors, baselineStale };
}

/**
 * Actual executable case count for a suite CSV = rows carrying a non-empty ID.
 * Returns null when the file is absent or unparseable (a baselined suite), so the
 * caller leaves the declared count alone rather than zeroing it.
 */
function actualCaseCount(file: string): number | null {
  if (!existsSync(file)) return null;
  try {
    const rows = parseCsv(readFileSync(file, "utf-8"), {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    }) as Record<string, string>[];
    if (rows.length === 0) return 0;
    const idCol = Object.keys(rows[0])[0];
    return rows.filter((r) => String(r[idCol] ?? "").trim() !== "").length;
  } catch {
    return null;
  }
}

function regenerate(manifest: Manifest): { next: Manifest; drift: string[] } {
  const sortedSuites = [...manifest.suites].sort((a, b) => a.id.localeCompare(b.id));
  const today = new Date().toISOString().slice(0, 10);

  // testCount reconciliation. This was previously DECLARED in the Suite interface but
  // never compared or written, so `suites:lint` exited 0 while 33 of 120 suites carried
  // a stale count. That is not cosmetic: the regression HTML dashboard reads
  // `testCount` as the run's `totalCases`, so a drifted suite misreports its own
  // denominator — the class of quiet wrongness that makes a pass-rate untrustworthy.
  // Unparseable / missing CSVs (the CSV_LINT_BASELINE burn-down set) return null and
  // keep their declared value, so this guard never zeroes a suite it cannot read.
  const countDrift: string[] = [];
  const reconciled = sortedSuites.map((s) => {
    const actual = actualCaseCount(s.file);
    if (actual === null || actual === s.testCount) return s;
    countDrift.push(`${s.id}: testCount ${s.testCount} -> ${actual}`);
    return { ...s, testCount: actual };
  });

  const next: Manifest = {
    ...manifest,
    _meta: {
      ...manifest._meta,
      generated: today,
      totalSuites: reconciled.length,
    },
    suites: reconciled,
  };

  const drift: string[] = [];
  if (manifest._meta.totalSuites !== next._meta.totalSuites) {
    drift.push(`_meta.totalSuites (${manifest._meta.totalSuites} -> ${next._meta.totalSuites})`);
  }
  const idsBefore = manifest.suites.map((s) => s.id).join(",");
  const idsAfter = next.suites.map((s) => s.id).join(",");
  if (idsBefore !== idsAfter) drift.push("suites order");
  if (countDrift.length > 0) {
    drift.push(
      countDrift.length <= 6
        ? countDrift.join(", ")
        : `${countDrift.length} suites with stale testCount (${countDrift.slice(0, 4).join(", ")}, …)`,
    );
  }

  return { next, drift };
}

function main(): void {
  const raw = readFileSync(MANIFEST_PATH, "utf-8");
  const manifest = JSON.parse(raw) as Manifest;

  // Manifest integrity first: a declared-but-absent CSV makes every downstream
  // signal (selection expansion, testCount, pass rate) silently meaningless.
  const missing = findMissingFiles(manifest);
  if (missing.length > 0) {
    console.error(`[suites:lint] FAIL — ${missing.length} declared suite file(s) missing:`);
    for (const e of missing) console.error(`  - ${e}`);
    console.error(
      `A selection resolving to a missing file runs ZERO cases and still reports success.`,
    );
    console.error(
      `Fix by RESTORING the CSV, or by REMOVING the suite entry (and every \`selections\` reference to its id).`,
    );
    process.exit(1);
  }

  const { dupIds, orphans } = findManifestDisagreements(manifest);
  for (const d of dupIds) console.warn(`[suites:lint] WARN duplicate suite ${d}`);
  for (const o of orphans) {
    console.warn(`[suites:lint] WARN orphan CSV (no manifest entry — never runs): ${o}`);
  }

  // Globally unique case IDs. Runs on every CSV on disk (orphans included), so an
  // undeclared suite can't smuggle a collision in ahead of being wired up.
  const dupCaseIds = findDuplicateCaseIds();
  if (dupCaseIds.length > 0) {
    console.error(`[suites:lint] FAIL — ${dupCaseIds.length} case ID(s) declared in more than one suite:`);
    for (const d of dupCaseIds.slice(0, 25)) console.error(`  - ${d}`);
    if (dupCaseIds.length > 25) console.error(`  … and ${dupCaseIds.length - 25} more`);
    console.error(
      `Per-case results and failure evidence are keyed by bare case ID (suite-*-results.json,`,
    );
    console.error(
      `traces/{TC-ID}-FAIL-trace.json), so a collision lets one suite overwrite another's evidence.`,
    );
    console.error(
      `Fix by re-prefixing the non-canonical side (admin-side namespaces use the -A/…A convention:`,
    );
    console.error(
      `CATA-*, ORDA-*, SRCHA-*) or renumbering into a free range when both suites share one domain.`,
    );
    process.exit(1);
  }

  const errors = validateRules(manifest);
  if (errors.length > 0) {
    console.error(`[suites:lint] FAIL — ${errors.length} rule errors:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  // Strict CSV lint (ratchet + burn-down baseline).
  const { newErrors, baselineStale } = lintSuiteCsvs(manifest);
  if (baselineStale.length > 0) {
    console.warn(
      `[suites:lint] ${baselineStale.length} baselined suite(s) now PASS — remove from CSV_LINT_BASELINE: ${baselineStale.join(", ")}`,
    );
  }
  if (CSV_LINT_BASELINE.size > 0) {
    console.warn(
      `[suites:lint] CSV burn-down backlog: ${CSV_LINT_BASELINE.size} known-malformed suite(s) baselined — fix + de-baseline to shrink.`,
    );
  }
  if (newErrors.length > 0) {
    console.error(`[suites:lint] FAIL — ${newErrors.length} CSV parse error(s) (not in baseline — new drift):`);
    for (const e of newErrors) console.error(`  - ${e}`);
    console.error(`Fix the CSV, or (only if genuinely pre-existing) add its id to CSV_LINT_BASELINE in scripts/sync-test-suites.ts.`);
    process.exit(1);
  }

  const { next, drift } = regenerate(manifest);

  if (CHECK_MODE) {
    if (drift.length > 0) {
      console.error(`[suites:lint] OUT OF SYNC: ${drift.join(", ")}`);
      console.error(`Run \`npm run suites:sync\` to regenerate.`);
      process.exit(1);
    }
    const ruleCount = Object.keys(manifest.selections).filter((k) => !k.startsWith("_")).length;
    console.log(`[suites:lint] OK (${next.suites.length} suites, ${ruleCount} selections)`);
    return;
  }

  if (drift.length === 0 && manifest._meta.generated === next._meta.generated) {
    console.log(`[suites:sync] Already in sync`);
    return;
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
  if (drift.length > 0) {
    console.log(`[suites:sync] Regenerated: ${drift.join(", ")}, generated=${next._meta.generated}`);
  } else {
    console.log(`[suites:sync] Updated generated date to ${next._meta.generated}`);
  }
}

// Only run as a CLI, so unit tests can import `findDuplicateCaseIds` / `allSuiteCsvs`
// without executing the manifest lint (same guard as append-test-cases-to-suite.ts).
const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
