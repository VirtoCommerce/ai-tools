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
 *     (`findManifestDisagreements`); hard-fails on an ORPHAN CSV (on disk, no manifest
 *     entry — it can never be selected, so it never runs and no gate sees it drift)
 *     silently never run
 *   - **globally unique case IDs**: hard-fails if one case ID appears in more
 *     than one suite CSV (`findDuplicateCaseIds`)
 *   - hard-fails (XREF-001, ratcheted) when a case's Preconditions depend on a case
 *     that lives in a DIFFERENT suite CSV (`findCrossFileCaseRefs`)
 *   - hard-fails (S-006, ratcheted) on an `Automation_Status` outside the canonical
 *     vocabulary (`findAutomationStatusDrift`); a case-variant of a canonical value is
 *     fatal with no baseline, because per-case lane routing reads an exact `Manual`
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
import { COLUMNS, extractExistingIds, isCanonicalHeader, parseSuite } from "./append-test-cases-to-suite.js";
import { AUTOMATION_STATUSES } from "./lint-test-cases.js";
import { CLASSIFIER_VERSION } from "../lib/case-classifier.js";
import { classifySuiteCases, type ClassifiableRow } from "../lib/case-classifier.js";

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
  /**
   * DERIVED (never hand-authored): the suite performs clicks, so `playwright-firefox`
   * cannot run it. Reconciled from the CSV by `regenerate()` below.
   */
  clickDriven?: boolean;
  /**
   * DERIVED (never hand-authored): how this suite's cases split between the machine lane, a
   * browser agent, explicit Manual, and explicit Deprecated — per
   * `scripts/lib/case-classifier.ts`. Reconciled from the CSV by `regenerate()` below, the same
   * way `testCount` and `clickDriven` are, so the planner and the executability report read one
   * recorded answer instead of re-classifying 127 CSVs. Present only when a suite has at least
   * one machine case; a suite that is 100% browser carries nothing, for the same reason
   * `clickDriven` is present only when true. `deprecated` is omitted when zero, so recording it
   * does not manufacture drift on the ~120 suites that have retired no case.
   */
  lanes?: { machine: number; browser: number; manual: number; deprecated?: number };
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
    /**
     * The `CLASSIFIER_VERSION` the per-suite `lanes` counts were recorded under.
     *
     * Without it the executability ratchet cannot tell a determinism REGRESSION from a
     * legitimate RE-BASELINE. It compares live counts against the manifest, so a commit that
     * both changes the classifier and refreshes the counts moves the baseline down alongside the
     * fact, and the drop becomes invisible: classifier 1.1.0 -> 1.2.0 with machine 559 -> 555
     * reported `OK`. Recording the version makes the re-baseline a visible decision instead of a
     * side effect.
     */
    classifierVersion?: string;
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
/** `root` is parameterised so the orphan gate can be unit-tested against a fixture corpus
 * rather than only against the real one — the same reason `allSuiteCsvs` and
 * `findDuplicateCaseIds` take it. */
export function findManifestDisagreements(
  manifest: Manifest,
  root?: string,
): { dupIds: string[]; orphans: string[] } {
  const byId = new Map<string, string[]>();
  for (const s of manifest.suites) {
    byId.set(s.id, [...(byId.get(s.id) ?? []), s.file]);
  }
  const dupIds = [...byId.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([id, files]) => `id "${id}" declared ${files.length}× — only the last runs: ${files.join(", ")}`);

  const declared = new Set(manifest.suites.map((s) => s.file.split(sep).join("/")));
  const orphans = allSuiteCsvs(root).filter((f) => !declared.has(f));

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
 * XREF-001 — a case's `Preconditions` must not depend on a case that lives in a
 * DIFFERENT suite CSV.
 *
 * Why this is a gate and not a style note. A suite is the unit of dispatch: the
 * scheduler hands one CSV to one runner, and two suites can run on different
 * browser lanes, in either order, or one without the other (`smoke` runs 042 and
 * not 029). So "Admin logged in (BSM-001 passed)" written in a suite that does
 * NOT contain BSM-001 is not a precondition at all — it is a wish. The case runs
 * with whatever state the lane happens to hold, and the failure surfaces as a
 * BLOCKED or, worse, as a pass that depended on luck.
 *
 * `check-smoke-gates.ts` structurally cannot catch this: it builds its case-ID
 * set as the UNION of the sibling CSVs in a directory, precisely so a checklist
 * can span them — which means a reference from one sibling into another passes
 * SG-001 as valid. This rule is the dual of `findDuplicateCaseIds` above: that
 * one says an ID belongs to exactly one file, this one says a DEPENDENCY may not
 * leave it.
 *
 * A token is only treated as a reference when it resolves to a real case ID
 * somewhere in the corpus, so prose that merely looks like an ID (`BL-AUTH-005`,
 * `ECL-13.2`, `VCST-5089`) can never produce a false positive.
 *
 * Rows are read BY HEADER NAME, never by position: 11 suites still carry a
 * legacy 11-column header, and a positional read would silently score their
 * `Expected Result` column as `Preconditions`.
 */
const XREF_CASE_REF_RE = /\b([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*)-(\d{2,4})\b/g;

export interface CrossFileRef {
  file: string;
  caseId: string;
  ref: string;
  refFile: string;
}

export function findCrossFileCaseRefs(root?: string): CrossFileRef[] {
  const files = allSuiteCsvs(root);
  const owner = new Map<string, string>();
  for (const file of files) {
    for (const id of extractExistingIds(readFileSync(file, "utf-8"))) owner.set(id, file);
  }

  const out: CrossFileRef[] = [];
  for (const file of files) {
    let rows: Array<Record<string, string>>;
    try {
      rows = parseCsv(readFileSync(file, "utf-8"), {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
      }) as Array<Record<string, string>>;
    } catch {
      continue; // unparsable CSVs are reported by lintSuiteCsvs, not here
    }
    for (const row of rows) {
      const pre = String(row.Preconditions ?? "");
      if (!pre) continue;
      const caseId = String(row.ID ?? "").trim();
      for (const m of pre.matchAll(XREF_CASE_REF_RE)) {
        const ref = `${m[1]}-${m[2]}`;
        if (ref === caseId) continue;
        const refFile = owner.get(ref);
        if (!refFile || refFile === file) continue;
        out.push({ file, caseId: caseId || "<no id>", ref, refFile });
      }
    }
  }
  return out;
}

/**
 * S-006 corpus ratchet — `Automation_Status` must come from the canonical vocabulary.
 *
 * The vocabulary was ALREADY declared (`AUTOMATION_STATUSES` in `lint-test-cases.ts`) and
 * already checked as a High finding — but only per file, by a linter nothing runs across the
 * corpus. So the rule existed and the enforcement did not, and 22 distinct values
 * accumulated: `Not Automated`, `None`, `synced`, `generated`, `runner`, `validated`,
 * `verified`, `Quarantined`, `needs-review`, `ready`, plus case-dupes and one free-text
 * `'Draft (SERIAL — isolate; restore ALL after)'` that encodes real execution semantics
 * nothing reads.
 *
 * This matters more than tidiness now: per-case lane routing treats an exact `Manual` (EX-200)
 * or an exact `Deprecated` (EX-201) as an explicit opt-out from execution, so the column
 * carries routing weight. A value that merely LOOKS like a canonical one is the dangerous
 * case, which is why a case-variant is fatal with no baseline: the 39 that existed
 * (`manual` ×22, `deprecated` ×11, `automated` ×6) were normalised, since changing case is
 * definitionally value-preserving.
 *
 * The remaining 325 are NOT mechanical. Whether `Semi-Automated` means Manual or Draft,
 * whether `Quarantined` is a skip — each is a decision with test-coverage consequences, and
 * this repo's own rule is that deprecation and authoring stay human. So they are baselined per
 * value: a listed value may not GROW, and an unlisted one fails. Same ratchet shape as
 * `CSV_LINT_BASELINE` / `XREF_BASELINE`. (One of these questions HAS since been decided:
 * whether a `Deprecated` case should still run — it must not, per EX-201. That is a decision
 * about the canonical value, though, so it changes nothing in this baseline.)
 */
const AUTOMATION_STATUS_BASELINE: Record<string, number> = {
  "Draft (SERIAL — isolate; restore ALL after)": 1,
  Generated: 9,
  None: 63,
  "Not Automated": 86,
  Quarantined: 11,
  generated: 38,
  "needs-review": 4,
  ready: 3,
  runner: 28,
  synced: 45,
  validated: 26,
  verified: 11,
};

export interface StatusDrift {
  /** A value that is a case-variant of a canonical one — always fatal, never baselined. */
  caseVariants: Array<{ value: string; canonical: string; count: number }>;
  /** A non-canonical value that is absent from the baseline, or above its baselined count. */
  newOrGrown: Array<{ value: string; count: number; allowed: number }>;
  /** A baselined value that has shrunk — progress; lower the baseline. */
  shrunk: Array<{ value: string; count: number; allowed: number }>;
}

export function findAutomationStatusDrift(root?: string): StatusDrift {
  const counts = new Map<string, number>();
  for (const file of allSuiteCsvs(root)) {
    const raw = readFileSync(file, "utf-8").replace(/^\uFEFF/, "");
    // A legacy-header suite is skipped, not guessed at: `parseSuite` maps positionally, so on
    // an 11-column file this column would read whatever sits at index 14.
    if (!isCanonicalHeader(raw)) continue;
    let rows;
    try {
      rows = parseSuite(raw).rows;
    } catch {
      continue; // reported by lintSuiteCsvs
    }
    for (const row of rows) {
      const value = (row.Automation_Status ?? "").trim();
      if (!value || AUTOMATION_STATUSES.has(value)) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  const drift: StatusDrift = { caseVariants: [], newOrGrown: [], shrunk: [] };
  for (const [value, count] of counts) {
    const canonical = [...AUTOMATION_STATUSES].find((c) => c.toLowerCase() === value.toLowerCase());
    if (canonical) {
      drift.caseVariants.push({ value, canonical, count });
      continue;
    }
    const allowed = AUTOMATION_STATUS_BASELINE[value] ?? 0;
    if (count > allowed) drift.newOrGrown.push({ value, count, allowed });
    else if (count < allowed) drift.shrunk.push({ value, count, allowed });
  }
  for (const [value, allowed] of Object.entries(AUTOMATION_STATUS_BASELINE)) {
    if (!counts.has(value)) drift.shrunk.push({ value, count: 0, allowed });
  }
  return drift;
}

/**
 * XREF-001 burn-down baseline: per-file count of PRE-EXISTING cross-file
 * dependencies. A ratchet, not an exemption — the same shape and the same reason
 * as `CSV_LINT_BASELINE` above. 101 of these were already in the corpus when the
 * rule was written, so hard-failing on day one would have meant everyone runs
 * `--warn-only` and the signal dies. A file NOT listed here must have ZERO, and
 * a listed file may never grow. Goal: keep this empty.
 */
const XREF_BASELINE: Record<string, number> = {
  "regression/suites/Backend/configurable-products/052-configurable-products-admin.csv": 2,
  "regression/suites/Backend/customer/027-customer-orgs-invites.csv": 2,
  "regression/suites/Backend/customer/027b-customer-org-roles.csv": 1,
  "regression/suites/Backend/graphql/050b2-graphql-xcart-items.csv": 1,
  "regression/suites/Backend/graphql/050b5-graphql-xcart-validation.csv": 2,
  "regression/suites/Backend/graphql/050d-graphql-xprofile.csv": 3,
  "regression/suites/Backend/graphql/050h-graphql-wishlist.csv": 1,
  "regression/suites/Backend/graphql/050l-graphql-push.csv": 1,
  "regression/suites/Backend/graphql/050m-graphql-sales-rep.csv": 3,
  "regression/suites/Backend/loyalty/075c-loyalty-product-points-earning.csv": 1,
  "regression/suites/Backend/marketing/025-marketing-coupons-api.csv": 3,
  "regression/suites/Backend/news/084-news-articles.csv": 2,
  "regression/suites/Backend/page-builder/060-page-builder-design-content.csv": 2,
  "regression/suites/Backend/pricing/054-pricing-logic.csv": 1,
  "regression/suites/Backend/sales-rep/092-sales-rep-admin.csv": 1,
  "regression/suites/Backend/sales-rep/092b-sales-rep-admin-embedded-app.csv": 2,
  "regression/suites/Backend/smoke/078-backend-smoke-tests.csv": 1,
  "regression/suites/Backend/whitelabeling/067-whitelabeling-admin.csv": 10,
  "regression/suites/Frontend/b2b/011b-b2b-company-e2e.csv": 1,
  "regression/suites/Frontend/cart/028-cart-core.csv": 1,
  "regression/suites/Frontend/configurable-products/072-configurable-products-ui.csv": 1,
  "regression/suites/Frontend/cross-cutting/043-google-analytics.csv": 1,
  "regression/suites/Frontend/customer-reviews/088-customer-reviews-storefront.csv": 1,
  "regression/suites/Frontend/loyalty/083-loyalty-catalog.csv": 3,
  "regression/suites/Frontend/loyalty/083b-loyalty-mixed-cart-order.csv": 3,
  "regression/suites/Frontend/payment/040a-payment-skyflow.csv": 2,
  "regression/suites/Frontend/sales-rep/089-sales-rep-my-customers-storefront.csv": 7,
  "regression/suites/Frontend/sales-rep/090-sales-rep-my-sales-reps-storefront.csv": 1,
  "regression/suites/Frontend/sales-rep/091-sales-rep-customer-profile-storefront.csv": 28,
  "regression/suites/Frontend/sales-rep/093-sales-rep-hub-dashboard-storefront.csv": 7,
  "regression/suites/Frontend/search/004-search-core.csv": 1,
  "regression/suites/Frontend/smoke/042-smoke-tests.csv": 2,
};

/**
 * Strict-parse every suite CSV that EXISTS, with the repo's canonical settings
 * (bom + strict column count + strict quotes — same as graphql-runner.ts `loadCase` /
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

/**
 * Does this suite click? DERIVED from the CSV, because the rule it feeds is currently prose
 * in three separate places (`.claude/rules/agents.md`, the manifest's
 * `defaults._comment_fallbackChain`, and `browserPool[1].constraint`) and is therefore
 * re-derived by hand on every scheduling decision.
 *
 * The rule: `playwright-firefox` cannot click on this storefront or the AngularJS Admin SPA —
 * `browser_click` resolves the element and then times out on Playwright's actionability gate,
 * on fully-visible non-moving elements. Confirmed 6x independently; the root cause is in the
 * `@playwright/mcp` layer, not Firefox (raw playwright-core + firefox clicks the same
 * reproducer fine). So a firefox placement on a click-driven suite costs a WHOLE wasted
 * attempt, and the scheduler must queue for a chromium lane rather than downgrade.
 *
 * `[ACT]` ALONE IS NOT THE SIGNAL. The tag is overloaded: in a storefront suite it means
 * click/fill (`test-runner-tags.md` maps it to browser_click/fill/select), but in an API suite
 * it means "perform this HTTP request" — suite 049 (Platform API) has 37 `[ACT]` lines and
 * every one of them is a REST call (`[ACT] POST {{BACK_URL}}/api/pricing/evaluate ...`).
 * A bare presence test therefore marks the whole API layer click-driven and needlessly bars it
 * from a perfectly usable firefox lane. The recorded run REG-2026-08-24-1806 has a human
 * making exactly this call by hand and getting it right: suite 049 on firefox, noted
 * "REST/HTTP tags only, no clicking - safe on firefox". This derivation must agree with them.
 *
 * So: an `[ACT]` line counts only when it reads as a UI interaction and NOT as an HTTP call.
 * `[PRE:*]` primitives that drive the UI (sign-in, org switch, cart reset, sign-out) count
 * unconditionally — those always click.
 *
 * Returns null when the CSV cannot be read, so the declared value is kept rather than cleared
 * — same discipline as `actualCaseCount`.
 */
const UI_PREFLIGHT_RE = /\[PRE:(SIGNIN_AS|SWITCH_ORG|RESET_CART|SIGNOUT)\b/i;
/** An `[ACT]` whose payload is an HTTP request, not a UI gesture. */
const ACT_IS_HTTP_RE = /^\[ACT[\]:]?\s*(?:GET|POST|PUT|PATCH|DELETE|HEAD)\b|^\[ACT[\]:]?[^\n]*(?:\{\{BACK_URL\}\}|\/api\/|graphql)/i;
/** An `[ACT]` that names a UI gesture. */
const ACT_IS_UI_RE =
  /^\[ACT[\]:]?[^\n]*\b(click|tap|fill|type|enter|select|choose|hover|check|uncheck|toggle|drag|drop|upload|press|scroll|open|expand|collapse|submit|add to cart|sign in|log in)\b/i;

/**
 * Per-suite lane split, delegated to the ONE classifier (`scripts/lib/case-classifier.ts`)
 * that the machine lane itself uses. Returns null when the suite cannot be read or carries a
 * legacy 11-column header — `parseSuite` maps positionally, so classifying such a file would
 * route cases on the wrong columns, and a null keeps whatever the manifest already declares
 * rather than zeroing a suite nobody can read.
 */
export function derivesLaneCounts(
  file: string,
): { machine: number; browser: number; manual: number; deprecated?: number } | null {
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf-8").replace(/^\uFEFF/, "");
  if (!isCanonicalHeader(raw)) return null;
  try {
    const r = classifySuiteCases(parseSuite(raw).rows as unknown as ClassifiableRow[]);
    const counts = { machine: r.machine.length, browser: r.browser.length, manual: r.manual.length };
    // Omitted when zero: adding `deprecated: 0` to every suite would rewrite ~120 manifest
    // entries that retired no case, so the drift report would say nothing about the change.
    return r.deprecated.length > 0 ? { ...counts, deprecated: r.deprecated.length } : counts;
  } catch {
    return null;
  }
}

export function derivesClickDriven(file: string): boolean | null {
  if (!existsSync(file)) return null;
  let csv: string;
  try {
    csv = readFileSync(file, "utf-8");
  } catch {
    return null;
  }
  if (UI_PREFLIGHT_RE.test(csv)) return true;
  for (const line of csv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^\[ACT[\]:]/i.test(trimmed)) continue;
    if (ACT_IS_HTTP_RE.test(trimmed)) continue;
    if (ACT_IS_UI_RE.test(trimmed)) return true;
  }
  return false;
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
  const clickDrift: string[] = [];
  const laneDrift: string[] = [];
  const reconciled = sortedSuites.map((s) => {
    let next = s;

    const actual = actualCaseCount(s.file);
    if (actual !== null && actual !== s.testCount) {
      countDrift.push(`${s.id}: testCount ${s.testCount} -> ${actual}`);
      next = { ...next, testCount: actual };
    }

    // clickDriven is derived, so the manifest carries the answer and the scheduler does not
    // have to re-read 124 CSVs (or re-derive the firefox rule from prose) on every run.
    //
    // Convention: the field is PRESENT only when true. Writing an explicit `false` on the 39
    // firefox-safe suites would be 39 lines of noise, and a manifest where one suite says
    // `false` while 38 say nothing invites a reader to think the difference means something.
    // So a true->false transition DELETES the key rather than setting it.
    const clicks = derivesClickDriven(s.file);
    if (clicks !== null && clicks !== (s.clickDriven ?? false)) {
      clickDrift.push(`${s.id}: clickDriven ${s.clickDriven ?? false} -> ${clicks}`);
      if (clicks) {
        next = { ...next, clickDriven: true };
      } else {
        const { clickDriven: _dropped, ...rest } = next;
        next = rest as Suite;
      }
    }

    // Lane split, derived from the same classifier the runner lane uses. Recorded so
    // `regression:plan` and `suites:executability` read one answer rather than each
    // re-classifying the corpus — and so a DROP in machine cases is visible as manifest drift.
    const lanes = derivesLaneCounts(s.file);
    if (lanes !== null) {
      const declared = next.lanes;
      const same =
        declared &&
        declared.machine === lanes.machine &&
        declared.browser === lanes.browser &&
        declared.manual === lanes.manual &&
        (declared.deprecated ?? 0) === (lanes.deprecated ?? 0);
      if (lanes.machine === 0) {
        if (declared) {
          laneDrift.push(`${s.id}: lanes dropped (no machine cases)`);
          const { lanes: _dropped, ...rest } = next;
          next = rest as Suite;
        }
      } else if (!same) {
        const show = (l: { machine: number; browser: number; manual: number; deprecated?: number }) =>
          `${l.machine}/${l.browser}/${l.manual}${l.deprecated ? `/${l.deprecated}dep` : ""}`;
        laneDrift.push(`${s.id}: lanes ${declared ? show(declared) : "(none)"} -> ${show(lanes)}`);
        next = { ...next, lanes };
      }
    }

    return next;
  });

  const next: Manifest = {
    ...manifest,
    _meta: {
      ...manifest._meta,
      generated: today,
      totalSuites: reconciled.length,
      // Stamped alongside the lane counts it describes, so the two can never disagree about
      // which classifier produced them.
      classifierVersion: CLASSIFIER_VERSION,
    },
    suites: reconciled,
  };

  const drift: string[] = [];
  if (manifest._meta.totalSuites !== next._meta.totalSuites) {
    drift.push(`_meta.totalSuites (${manifest._meta.totalSuites} -> ${next._meta.totalSuites})`);
  }
  if (manifest._meta.classifierVersion !== next._meta.classifierVersion) {
    drift.push(
      `_meta.classifierVersion (${manifest._meta.classifierVersion ?? "unrecorded"} -> ${next._meta.classifierVersion})`,
    );
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
  if (laneDrift.length > 0) {
    drift.push(
      laneDrift.length <= 6
        ? laneDrift.join(", ")
        : `${laneDrift.length} suites with stale lanes (${laneDrift.slice(0, 4).join(", ")}, …)`,
    );
  }
  if (clickDrift.length > 0) {
    drift.push(
      clickDrift.length <= 6
        ? clickDrift.join(", ")
        : `${clickDrift.length} suites with stale clickDriven (${clickDrift.slice(0, 4).join(", ")}, …)`,
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

  // An orphan CSV is now FATAL, not a warning. It used to warn, and suite 096
  // (`Backend/import-export/096-backup-restore.csv`, 75 cases) sat orphaned for weeks as a
  // result: on disk, never selected by any group, invisible to every gate that iterates the
  // manifest — so it could neither run nor rot detectably. A warning in a command whose
  // normal output already carries warnings is indistinguishable from silence. The corpus was
  // brought to zero orphans when 096 was registered, so there is no burn-down set here (the
  // same reasoning as `findDuplicateCaseIds`).
  if (orphans.length > 0) {
    console.error(`[suites:lint] FAIL — ${orphans.length} suite CSV(s) on disk with no manifest entry:`);
    for (const o of orphans) console.error(`  - ${o}`);
    console.error(`A suite absent from the manifest can never be selected, so it never runs and no`);
    console.error(`gate can see it drift. Fix by adding a manifest entry (and a \`selections\` reference`);
    console.error(`if it should run), or by deleting the CSV if it is genuinely dead.`);
    process.exit(1);
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

  // XREF-001: a dependency may not leave its suite CSV. Ratcheted against
  // XREF_BASELINE — a file absent from the baseline must have zero.
  const xrefs = findCrossFileCaseRefs();
  const xrefByFile = new Map<string, CrossFileRef[]>();
  for (const x of xrefs) xrefByFile.set(x.file, [...(xrefByFile.get(x.file) ?? []), x]);
  const xrefNew: string[] = [];
  const xrefStale: string[] = [];
  for (const [file, refs] of xrefByFile) {
    const allowed = XREF_BASELINE[file] ?? 0;
    if (refs.length > allowed) {
      for (const r of refs.slice(0, 6)) {
        xrefNew.push(
          `${r.file}: ${r.caseId} depends on ${r.ref}, which lives in ${r.refFile}` +
            (allowed > 0 ? ` (baseline allows ${allowed}, found ${refs.length})` : ""),
        );
      }
      if (refs.length > 6) xrefNew.push(`${file}: … and ${refs.length - 6} more`);
    } else if (refs.length < allowed) {
      xrefStale.push(`${file} (baseline ${allowed}, now ${refs.length})`);
    }
  }
  for (const file of Object.keys(XREF_BASELINE)) {
    if (!xrefByFile.has(file)) xrefStale.push(`${file} (baseline ${XREF_BASELINE[file]}, now 0)`);
  }
  if (xrefStale.length > 0) {
    console.warn(
      `[suites:lint] XREF-001 burn-down progress — lower these XREF_BASELINE entries: ${xrefStale.join(", ")}`,
    );
  }
  if (Object.keys(XREF_BASELINE).length > 0) {
    const total = Object.values(XREF_BASELINE).reduce((a, b) => a + b, 0);
    console.warn(
      `[suites:lint] XREF-001 backlog: ${total} pre-existing cross-suite dependency(ies) baselined across ` +
        `${Object.keys(XREF_BASELINE).length} suite(s) — fix + de-baseline to shrink.`,
    );
  }
  if (xrefNew.length > 0) {
    console.error(`[suites:lint] FAIL — XREF-001: ${xrefNew.length} new cross-suite dependency(ies):`);
    for (const e of xrefNew) console.error(`  - ${e}`);
    console.error(
      `A suite is the unit of dispatch: two suites can run on different lanes, in either order, or`,
    );
    console.error(
      `one without the other. A precondition naming a case from another CSV is therefore never`,
    );
    console.error(
      `established — the case runs on whatever state the lane happens to hold. Fix by restating the`,
    );
    console.error(
      `requirement as STATE the runner can establish itself ("Admin logged in as {{ADMIN}} (suite`,
    );
    console.error(`setup)"), or by moving the depended-on case into the same suite.`);
    process.exit(1);
  }

  // S-006 corpus ratchet: Automation_Status must come from the canonical vocabulary.
  const status = findAutomationStatusDrift();
  if (status.shrunk.length > 0) {
    console.warn(
      `[suites:lint] Automation_Status burn-down progress — lower these AUTOMATION_STATUS_BASELINE ` +
        `entries: ${status.shrunk.map((s) => `${s.value} (${s.allowed} -> ${s.count})`).join(", ")}`,
    );
  }
  const statusBacklog = Object.values(AUTOMATION_STATUS_BASELINE).reduce((a, b) => a + b, 0);
  if (statusBacklog > 0) {
    console.warn(
      `[suites:lint] Automation_Status backlog: ${statusBacklog} case(s) across ` +
        `${Object.keys(AUTOMATION_STATUS_BASELINE).length} non-canonical value(s) baselined — each needs a ` +
        `human decision (is "Quarantined" a skip? is "Semi-Automated" Manual or Draft?), so they are not ` +
        `auto-mapped. Note the canonical "Deprecated" IS decided: it runs nowhere (EX-201).`,
    );
  }
  if (status.caseVariants.length > 0) {
    console.error(`[suites:lint] FAIL — ${status.caseVariants.length} case-variant(s) of a canonical Automation_Status:`);
    for (const v of status.caseVariants) {
      console.error(`  - "${v.value}" (${v.count} case(s)) should be "${v.canonical}"`);
    }
    console.error(`Per-case lane routing treats an exact "Manual" as the explicit opt-out, so a value that`);
    console.error(`only LOOKS canonical routes differently from the one it appears to be. Changing case is`);
    console.error(`value-preserving, so this is never baselined — fix it.`);
    process.exit(1);
  }
  if (status.newOrGrown.length > 0) {
    console.error(`[suites:lint] FAIL — ${status.newOrGrown.length} Automation_Status value(s) new or grown:`);
    for (const v of status.newOrGrown) {
      console.error(
        `  - "${v.value}": ${v.count} case(s)` +
          (v.allowed > 0 ? ` (baseline allows ${v.allowed})` : ` — not a canonical value and not baselined`),
      );
    }
    console.error(`Legal values: ${[...AUTOMATION_STATUSES].join(", ")} (or empty).`);
    console.error(`If this value is genuinely needed, add it to AUTOMATION_STATUSES in lint-test-cases.ts`);
    console.error(`— the ONE place the vocabulary is declared — not to the baseline.`);
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
