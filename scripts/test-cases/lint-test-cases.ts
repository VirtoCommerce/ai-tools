/**
 * Static linter for enriched-CSV regression suites — the deterministic core of
 * `/qa-review-tests`. It mechanises the rules that need no live browser and no
 * human judgment, so the skill shrinks to the one dimension that genuinely
 * needs a browser (Dimension 8: Environment Verification) plus the fuzzy-edge
 * calls.
 *
 * Coverage (rule IDs from review-criteria.md):
 *   Dim 1 Structure      S-001..S-007
 *   Dim 2 Determinism    D-001..D-006
 *   Dim 3 Completeness   C-001..C-008
 *   Dim 4 Testability    T-001..T-003 T-005   (T-004 needs tool-availability judgment — skipped)
 *                        T-005 = unscoreable prose in an EVALUATED assertion
 *                        (runner-native GraphQL cases only; grammar verdict
 *                        delegated to lib/graphql-assertions.ts)
 *   Dim 5 Data Validity  DV-001 DV-002 DV-003 DV-013 DV-019
 *                        (DV-006..012/016/020 need schema/value judgment — skipped, noted)
 *   Dim 6 BL/ECL         BL-001 REQ-001 (BL-002/004/005 need knowledge-file cross-ref — skipped)
 *   Dim 7 Duplication    DUP-001 DUP-004 (DUP-002/003 are cross-suite — skipped)
 *   Dim 9 Technique      TC-001
 *   Dim 10 Grounding     GRD-001 (GRD-002 invented-literal needs judgment — skipped)
 *   Dim 11 Triangulation TRI-000 audit-stamp staleness ONLY
 *                        (TRI-001..006 verdicts need docs+live+source → the skill)
 *
 * Dimension 8, and the LIVE half of Dimension 10 (grounding {HYPOTHESIS}/{SPEC}
 * to {OBSERVED} against the deployed build), are intentionally NOT here — they
 * require a live browser and are the skill's remaining judgment slots.
 *
 * Dimension 11 is the same shape: this script decides only the DETERMINISTIC
 * half — "when was this row last triangulated?" (TRI-000, read off the `Audited:`
 * stamp in References). Whether an assertion's expected behavior is still TRUE
 * needs the three axes and is /qa-review-tests --triangulate's judgment slot.
 * `parseAuditStamp` is exported so scripts/test-cases/audit-queue.ts reads the
 * stamp through the same parser instead of re-deriving the format.
 *
 * Reuses scripts/append-test-cases-to-suite.ts (parseSuite/COLUMNS),
 * scripts/lib/graphql-case-parser.ts (parseSteps/validateStepBlocks) and
 * scripts/lib/graphql-assertions.ts (parseAssertions/classifyPredicateScoreability)
 * so the schema, the GraphQL step-structure rules, and the assertion grammar all
 * stay single-sourced with the runner that executes them.
 *
 * Usage:
 *   npx tsx scripts/lint-test-cases.ts <suite.csv> [--json] [--fail-on=Blocker|Critical|High|Medium]
 *
 * Exit code: 0 if no finding at/above the fail-on severity (default High); 1 otherwise.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { COLUMNS, parseSuite, type Row } from "./append-test-cases-to-suite.js";
import { parseSteps, validateStepBlocks } from "../lib/graphql-case-parser.js";
import { classifyPredicateScoreability, parseAssertions } from "../lib/graphql-assertions.js";

type Severity = "Blocker" | "Critical" | "High" | "Medium" | "Informational";
const SEVERITY_ORDER: Severity[] = ["Informational", "Medium", "High", "Critical", "Blocker"];

interface Finding {
  rule: string;
  severity: Severity;
  caseId: string;
  message: string;
}

/**
 * The set of legal `{{VAR}}` tokens, DERIVED from the repo's own env sources —
 * never transcribed (`.claude/rules/test-data.md` §GOLDEN RULE). A hand-listed
 * copy went stale at 16 names while the real surface was 66, so every valid
 * token outside the list (e.g. `{{MULTI_ORG_USER_EMAIL}}`, defined in all three
 * committed env layers) was reported as a phantom DV-001 / C-002.
 *
 * Sources, in the same layering the runtime loader uses (`config.js`):
 *   - every committed `.env.*` layer (identity/URL vars; secrets are never here)
 *   - `templates/.env*.template` — secret NAMES only; values are read from the
 *     gitignored `.env.local` at runtime and are deliberately not touched here.
 *
 * Per-env suffix promotion (`config.js`: `KEY_<TESTENV>` → `KEY`) is handled by
 * inferring the suffix set instead of listing it: a stem shared by two or more
 * suffixed template names (`USER_EMAIL_QA` / `_STAGING` / `_PROD` → `USER_EMAIL`)
 * is itself a legal base token.
 */
function deriveKnownVars(): Set<string> {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const names = new Set<string>();
  const declared = (file: string): string[] => {
    if (!existsSync(file)) return [];
    return readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/)?.[1])
      .filter((n): n is string => Boolean(n));
  };

  // Committed per-env layers: .env.defaults + .env.<env>. The gitignored local
  // overrides (.env.local, .env.backup, .env.*.local) are machine-specific — a
  // suite must never depend on a token that exists only on one developer's box.
  const envLayers = readdirSync(repoRoot).filter(
    (f) => f.startsWith(".env") && !/\.(local|backup|example|template)$/.test(f) && !f.endsWith(".local"),
  );
  for (const f of envLayers) for (const n of declared(join(repoRoot, f))) names.add(n);

  // Secret NAMES from the templates (never their values).
  const templateDir = join(repoRoot, "templates");
  const templates = existsSync(templateDir)
    ? readdirSync(templateDir).filter((f) => f.startsWith(".env"))
    : [];
  const templateNames: string[] = [];
  for (const f of templates) templateNames.push(...declared(join(templateDir, f)));
  for (const n of templateNames) names.add(n);

  // Infer promoted stems rather than hardcoding the suffix list.
  const stemCounts = new Map<string, number>();
  for (const n of templateNames) {
    const stem = n.replace(/_[A-Z][A-Z0-9]*$/, "");
    if (stem !== n) stemCounts.set(stem, (stemCounts.get(stem) ?? 0) + 1);
  }
  for (const [stem, count] of stemCounts) if (count >= 2) names.add(stem);

  return names;
}

const KNOWN_VARS = deriveKnownVars();
const CANONICAL_PRIORITIES = new Set(["Critical", "High", "Medium", "Low"]);
const ALIAS_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const HIGH_PRIORITIES = new Set(["Critical", "High", "P0", "P1"]);
const AUTOMATION_STATUSES = new Set([
  "Draft", "Reviewed", "Automated", "Manual", "Semi-Automated",
  // "Deprecated" — a case explicitly retired (superseded/redundant, kept only for
  // traceability) but not deleted, e.g. 050m SR-GQL-038 (superseded by SR-GQL-011,
  // VCST-5304/5469 sync 2026-07-17). Never PROMOTED_STATUSES — it's excluded from
  // regression-eligibility by definition, not merely un-reviewed.
  "Deprecated",
]);
// A promoted case (past Draft) must have every assertion grounded (Dim 10 / GRD-001).
const PROMOTED_STATUSES = new Set(["Reviewed", "Automated", "Manual", "Semi-Automated"]);

// PREFIX-NNN, with an optional trailing variant letter (e.g. CFG-GQL-VCST4961-A).
// Requires at least one digit so plain words are rejected.
const ID_RE = /^(?=.*\d)[A-Z0-9]+(?:-[A-Z0-9]+)*-(?:\d+[A-Z]?|[A-Z])$/;
// A step line may carry an ORDINAL prefix ("1. [NAV] …") — the numbered style used by
// many older suites — and still be properly tagged. Anchoring the tag to line start
// made D-001 fire on ~240 correctly-tagged lines across 027+008 alone (262 in 008),
// which made `--fail-on` unusable on any suite using numbered steps.
// A SECTION MARKER may carry a ": description" suffix and mixed case
// ("--- SCREEN: Invite dialog ---"); the old `[A-Z]+`-only form rejected 62 such
// markers in the same two suites. Both are false positives, not test debt — and
// rewriting cases to satisfy the regex would be linter-gaming, not a fix.
const SECTION_MARKER_BODY = /---\s*[A-Za-z][A-Za-z0-9 _-]*(?:\s*:\s*[^\r\n]*?)?\s*---/;
const STEP_TAG_RE = new RegExp(
  `^\\s*(?:\\d+\\.\\s*)?(?:\\[[A-Z][A-Z0-9:_-]*\\b[^\\]]*\\]|${SECTION_MARKER_BODY.source})`,
);
const E2E_MARKER_RE = new RegExp(`^${SECTION_MARKER_BODY.source}$`);
const REFERENCE_RE = /(VCST-\d+|REQ-[A-Z0-9-]+|smoke-baseline|https?:\/\/\S+)/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// DV-003 exemption: `.claude/rules/test-data.md` MANDATES the `AGENT-TEST-` prefix for
// throwaway identities so `/qa-seed-data teardown` can sweep them, and the
// `…$TS_SUFFIX@` / `…NNN@` forms are run-unique placeholders, not fixed credentials.
// Flagging the convention the rules require made DV-003 cry wolf on 40 of the 73 lines
// it fired on — and a rule that flags its own mandated convention trains people to
// ignore the gate. A genuinely fixed address (e.g. a real user's email) still flags.
const THROWAWAY_IDENTITY_RE = /(agent-test|TS_SUFFIX|\$\{?\w*SUFFIX)/i;
const VAGUE_RE = /\b(correctly|properly|as expected|looks good|works fine|works as|displays? properly|successfully)\b/i;
// A QUOTED span is grounded evidence — a verbatim UI/i18n literal — not a vague predicate.
// `[DOM] toast reads 'The user has been successfully blocked'` asserts an exact observed
// string; flagging it T-001 punishes the most precise form of assertion we have. So quoted
// spans are stripped before the vagueness test (same carve-out GRD-002 makes for a
// "grounded literal"). Unquoted prose — "saved successfully", "displayed correctly" — still
// trips T-001. The single-quote arm requires a non-letter on each side so a possessive
// ("the member's role updated correctly") cannot open a span and mask the real finding.
const QUOTED_SPAN_RE = /"[^"]*"|(?<![A-Za-z])'[^']*'(?![A-Za-z])/g;
const stripQuoted = (s: string) => s.replace(QUOTED_SPAN_RE, " ");
const AMBIGUOUS_VERB_RE = /^\s*\[ACT\][^\n]*\b(check|ensure|validate|verify)\b/i;
const COMPOUND_RE = /^\s*\[(?:ACT|NAV)\][^\n]*(?:\band\b|\bthen\b|;)/i;
const MUTATION_HINT_RE = /\b(addItem|removeItem|removeCartItem|createOrder|createQuote|addOrUpdate|updateCart|placeOrder|create[A-Z]\w+|update[A-Z]\w+|delete[A-Z]\w+|place order|add to cart|submit|save|checkout)\b/i;
// Requires an uppercase letter right after the verb (createOrder, updateCart) so this
// cannot match the English past-participle "created"/"updated"/"deleted" that legitimately
// appears in REST/Admin-UI assertion prose ("Verify order created") — see MUTATION_HINT_RE's
// [A-Z] guard above, which this sibling regex had omitted (false-fired C-005 on suites 049/020).
const GRAPHQL_MUTATION_RE = /\b(addItem|removeItem|removeCartItem|createOrder|create[A-Z]\w+|update[A-Z]\w+|delete[A-Z]\w+|merge[A-Z]\w+|clearCart)\b/;
const ORDERING_RE = /\b(after running|following\s+[A-Z]+-\d+|requires?\s+[A-Z]+-\d+\s+to have (?:passed|run)|must be run first|run\s+[A-Z]+-\d+\s+first)\b/i;
// Provenance suffix on an assertion (Dim 10). GROUNDED = may be a hard assertion;
// {HYPOTHESIS} is a guess (question form only); no tag at all = ungrounded.
const PROVENANCE_RE = /\{(?:SPEC|BL|DOC|OBSERVED|HYPOTHESIS)\}/;
const GROUNDED_PROV_RE = /\{(?:SPEC|BL|DOC|OBSERVED)\}/;

/**
 * Dim 11 / TRI-000 — the triangulation audit stamp, written into the free-text
 * `References` column by `/qa-review-tests --triangulate --fix`:
 *
 *   Audited: 2026-08-03 (TCA-2026-08-03); Source: vc-module-x-cart/…:214; Docs: …
 *
 * `References` already carries sibling stamps in exactly this shape (`Synced:
 * VCST-5281 PR#2399 (2026-07-29)`, `Corrected: … (2026-06-26)`), which is why the
 * stamp needs NO new CSV column — the 15-column contract in
 * append-test-cases-to-suite.ts stays untouched.
 *
 * The stamp IS the rotation state: audit-queue.ts sorts suites by their oldest
 * stamp, so there is no ledger file to desync. Only the most recent `Audited:`
 * token is kept per row (the writer replaces, never appends), but this parser
 * takes the MAX across all matches so a row that accumulated two stamps through
 * a bad merge still reports its true latest audit rather than the first one.
 */
const AUDIT_STAMP_RE = /\bAudited:\s*(\d{4}-\d{2}-\d{2})/g;

/** Default staleness window, in days, before an audited row is re-queued. */
export const DEFAULT_STALE_DAYS = 180;

/**
 * Is this a real calendar date? `\d{4}-\d{2}-\d{2}` happily matches `2026-13-45`,
 * and an unvalidated garbage stamp would become the suite's `oldestStamp` and
 * poison the rotation sort in audit-queue.ts (it sorts lexically, so `2026-13-45`
 * would outrank every legitimate date in that year). A malformed stamp is treated
 * as NO stamp — consistently, everywhere — so the row is simply re-audited.
 */
function isRealDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Latest valid `Audited:` date in a References cell, or null when never audited. */
export function parseAuditStamp(references: string): string | null {
  const dates = [...(references ?? "").matchAll(AUDIT_STAMP_RE)]
    .map((m) => m[1])
    .filter(isRealDate)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/**
 * Whole days between an ISO date and `now` (negative for a future stamp). Callers
 * only ever pass a stamp that already cleared `isRealDate`, so there is no NaN
 * branch to handle here.
 */
function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);
}

export interface AuditStaleness {
  unstamped: number;
  stale: number;
  fresh: number;
  /** Oldest stamp present, or null when no row carries one. */
  oldestStamp: string | null;
}

/**
 * Per-suite triangulation-staleness summary. Exported for audit-queue.ts so the
 * rotation and the linter agree on what "stale" means by construction.
 */
export function auditStaleness(rows: Row[], now: Date, staleDays = DEFAULT_STALE_DAYS): AuditStaleness {
  let unstamped = 0, stale = 0, fresh = 0;
  let oldestStamp: string | null = null;
  for (const r of rows) {
    const stamp = parseAuditStamp(r.References);
    if (!stamp) { unstamped++; continue; }
    if (!oldestStamp || stamp < oldestStamp) oldestStamp = stamp;
    if (daysSince(stamp, now) > staleDays) stale++; else fresh++;
  }
  return { unstamped, stale, fresh, oldestStamp };
}

const find = (rule: string, severity: Severity, caseId: string, message: string): Finding => ({
  rule, severity, caseId, message,
});

function lines(cell: string): string[] {
  return (cell ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/**
 * Blank out single/double-quoted spans so a rule can judge a step's STRUCTURE
 * without reading the UI label it targets. Quotes are how the conventions ask
 * authors to name a real control, so their contents are product text, not the
 * author's phrasing — see D-003/D-005.
 */
function withoutQuoted(line: string): string {
  return line.replace(/'[^']*'|"[^"]*"/g, "''");
}

/** Tokens like {{FOO}} captured downstream (`... → FOO`) are not env vars. */
function capturedVars(row: Row): Set<string> {
  const out = new Set<string>();
  const all = COLUMNS.map((c) => row[c]).join("\n");
  for (const m of all.matchAll(/(?:→|->)\s*([A-Z][A-Z0-9_]*)\b/g)) out.add(m[1]);
  return out;
}

function isRunnerGraphql(row: Row): boolean {
  return /\[GQL-OP\b/i.test(row.Steps);
}

function lintRow(row: Row, idx: number, seenIds: Map<string, number>): Finding[] {
  const f: Finding[] = [];
  const id = row.ID || `<row ${idx + 1}>`;
  const push = (rule: string, sev: Severity, msg: string) => f.push(find(rule, sev, id, msg));

  // --- Dimension 1: Structure ---
  if (!row.ID) push("S-002", "Blocker", "missing test case ID");
  else if (!ID_RE.test(row.ID)) push("S-004", "High", `ID "${row.ID}" not in PREFIX-NNN format`);
  if (row.ID) {
    if (seenIds.has(row.ID)) push("S-003", "Blocker", `duplicate ID (also row ${seenIds.get(row.ID)! + 1})`);
    else seenIds.set(row.ID, idx);
  }
  if (!row.Title) push("S-006", "High", "empty Title");
  if (!row.Steps) push("S-006", "High", "empty Steps");
  if (!row.Assertions) push("S-006", "High", "empty Assertions");

  if (!CANONICAL_PRIORITIES.has(row.Priority)) {
    if (ALIAS_PRIORITIES.has(row.Priority))
      push("S-005", "Informational", `non-canonical priority "${row.Priority}" (template canon is Critical|High|Medium|Low)`);
    else
      push("S-005", "High", `invalid priority "${row.Priority}" (expected Critical|High|Medium|Low)`);
  }
  if (row.Automation_Status && !AUTOMATION_STATUSES.has(row.Automation_Status))
    push("S-006", "High", `invalid Automation_Status "${row.Automation_Status}"`);

  const stepLines = lines(row.Steps);
  const assertionLines = lines(row.Assertions);

  // --- Dimension 2: Determinism ---
  if (isRunnerGraphql(row)) {
    // DV-019: delegate GraphQL step-structure to the shared parser.
    const errs = validateStepBlocks(parseSteps(row.Steps));
    for (const e of errs) push("DV-019", "Critical", e);
  } else {
    // D-001: every non-blank step line must carry a tag (UI/Admin/simple cases).
    for (const ln of stepLines) {
      if (E2E_MARKER_RE.test(ln)) continue;
      if (!STEP_TAG_RE.test(ln)) push("D-001", "Critical", `step line lacks a type tag: "${truncate(ln)}"`);
    }
    // D-004: a state-changing [ACT] should be followed by [WAIT].
    for (let i = 0; i < stepLines.length; i++) {
      const ln = stepLines[i];
      if (/^\[ACT\]/i.test(ln) && /\b(click|submit|place|save|checkout|add|proceed|confirm|apply)\b/i.test(ln)) {
        const next = stepLines[i + 1] ?? "";
        if (!/^\[WAIT\]/i.test(next))
          push("D-004", "Critical", `state-changing [ACT] not followed by [WAIT]: "${truncate(ln)}"`);
      }
    }
  }
  for (const ln of stepLines) {
    // D-003/D-005 describe the SHAPE of the step, so they must not read the
    // quoted UI label the step targets. A real control named "I agree to the
    // Terms and Conditions" is one action, but its label contains `and`, and a
    // "Verify email" button contains an assertion verb — judging either on the
    // literal text reported a false compound/ambiguous step and pushed authors
    // toward inventing label text that does not exist in the product.
    const shape = withoutQuoted(ln);
    if (AMBIGUOUS_VERB_RE.test(shape)) push("D-003", "High", `ambiguous verb in step (belongs in Assertions): "${truncate(ln)}"`);
    if (COMPOUND_RE.test(shape)) push("D-005", "High", `compound step (split it): "${truncate(ln)}"`);
    if (/^\[ACT\][^\n]*\b(the\s+\w+\s+(button|link|field|icon|menu|dropdown))\b/i.test(ln) &&
        !/['"]/.test(ln))
      push("D-002", "Critical", `generic element reference (use the label in quotes): "${truncate(ln)}"`);
  }
  // D-006: final-verdict [ASSERT] in Steps (mid-flow gate is allowed → Medium).
  if (stepLines.some((l) => /^\[ASSERT\]/i.test(l)))
    push("D-006", "Medium", "Steps contains [ASSERT] — confirm it gates a step, else move to Assertions");

  // --- Dimension 3: Completeness ---
  if (!row.Preconditions || /^none$/i.test(row.Preconditions.trim()))
    push("C-001", "High", "missing Preconditions (state the required starting state)");
  if (ORDERING_RE.test(row.Preconditions))
    push("C-008", "High", "Preconditions describe prior-case execution, not state (cases must be independent)");

  // C-002: {{VAR}} used in Steps but absent from Test_Data.
  const stepVars = new Set([...row.Steps.matchAll(/\{\{([A-Z][A-Z0-9_]*)\}\}/g)].map((m) => m[1]));
  const dataVars = new Set([...row.Test_Data.matchAll(/\{\{([A-Z][A-Z0-9_]*)\}\}/g)].map((m) => m[1]));
  const captured = capturedVars(row);
  // Env vars (KNOWN_VARS) are resolved globally by the runner — they need not
  // be redeclared per case. C-002 targets undeclared test-specific vars.
  for (const v of stepVars)
    if (!dataVars.has(v) && !captured.has(v) && !KNOWN_VARS.has(v))
      push("C-002", "High", `{{${v}}} used in Steps but not bound in Test_Data`);

  if (assertionLines.length < 2) push("C-003", "High", `only ${assertionLines.length} assertion(s) — need ≥2`);
  // Failure_Signals are comma- OR semicolon-separated (the documented separator).
  const failSignals = row.Failure_Signals.split(/[;,\n]/).map((s) => s.trim()).filter(Boolean);
  if (failSignals.length < 2) push("C-006", "High", `fewer than 2 Failure_Signals (found ${failSignals.length})`);
  if (!row.Cleanup) push("C-007", "Medium", "empty Cleanup (use 'none' if no side effects)");

  // C-004 / C-005: mutations need cross-layer / errors[] checks.
  const hasMutation = MUTATION_HINT_RE.test(row.Steps);
  if (hasMutation && !row.Cross_Layer_Checks.trim())
    push("C-004", "Critical", "Steps mutate state but Cross_Layer_Checks is empty");
  const hasGqlMutation = (isRunnerGraphql(row) && /mutation\b/i.test(row.Steps)) || GRAPHQL_MUTATION_RE.test(row.Steps);
  if (hasGqlMutation && !/errors\s*\[\s*\]|\[ERRORS/i.test(row.Cross_Layer_Checks + row.Assertions))
    push("C-005", "Critical", "GraphQL mutation without an errors[] emptiness check");

  // --- Dimension 4: Testability ---
  for (const a of assertionLines) {
    if (VAGUE_RE.test(stripQuoted(a))) push("T-001", "High", `vague assertion predicate: "${truncate(a)}"`);
    if (/^\[DOM\]/i.test(a) && !/['"]/.test(a) && !/\b(visible|enabled|disabled|hidden|present|absent|checked)\b/i.test(a))
      push("T-002", "High", `[DOM] assertion lacks element/text specifics: "${truncate(a)}"`);
    if (/^\[MATH\]/i.test(a) && !a.includes("="))
      push("T-003", "High", `[MATH] assertion has no formula (=): "${truncate(a)}"`);
  }

  // T-005: an English sentence in a column the GraphQL runner EVALUATES.
  //
  // Scope is deliberately narrow on three axes, because a wide version of this
  // rule is a nuisance rather than a gate:
  //   1. runner-native cases only (`[GQL-OP]` in Steps). A UI case's assertions
  //      are read by an agent, which handles prose fine — flagging those raised
  //      the corpus hit from 15 lines to 184.
  //   2. VERDICT-AFFECTING tags only. parseAssertions() routes [EVIDENCE]/[MATH]/
  //      [ROUNDTRIP]/[ADMIN]/[STOREFRONT]/[EVENT] to `info`, where prose is the
  //      documented use (runner contract §4.7) — and Cross_Layer_Checks,
  //      Failure_Signals, Preconditions and References are never read here at all.
  //      Moving the line into one of those IS the fix.
  //   3. the grammar verdict comes from graphql-assertions.ts, which is the
  //      evaluator itself — see classifyPredicateScoreability's contract. This
  //      rule adds no grammar of its own, so it cannot be stricter than the
  //      runner and cannot drift from it.
  //
  // NOT a {HYPOTHESIS} rule. A tagged hypothesis is legitimate while authoring
  // (that's GRD-001's business); what fails at run time is prose in an evaluated
  // predicate, tagged or not — CAT-GQL-124 carries no {HYPOTHESIS} at all.
  //
  // Critical, not High: like D-001/D-004/DV-019 this is a defect the RUN cannot
  // survive — the case reds regardless of the product, and (worse) the false red
  // hides the real assertions in the same case that passed. It is not a Blocker:
  // Blocker is reserved for identity/parse failures that stop row analysis
  // (S-002/S-003/S-007) plus GRD-001's promoted-{HYPOTHESIS} gate.
  if (isRunnerGraphql(row)) {
    for (const a of parseAssertions(row.Assertions ?? "").assertions) {
      const verdict = classifyPredicateScoreability(a);
      if (verdict === "scoreable") continue;
      const why =
        verdict === "unparseable"
          ? `the runner cannot parse it ("unrecognized ${a.kind} predicate") and FAILs the case`
          : `an operand is prose, so the comparison degrades to "lhs=undefined rhs=undefined" and can never pass`;
      push(
        "T-005",
        "Critical",
        `[${a.kind}] assertion is not scoreable — ${why}. Rewrite it to a predicate ` +
          `(knowledge/api/graphql-test-cases-runner.md §4) or move the prose to Cross_Layer_Checks: ` +
          `"${truncate(a.raw.trim())}"`,
      );
    }
  }

  // --- Dimension 5: Data Validity (regex-based + delegated) ---
  for (const v of stepVars) if (!KNOWN_VARS.has(v) && !captured.has(v))
    push("DV-001", "High", `unknown {{${v}}} token (not a known env var, not runtime-captured)`);
  const scan = `${row.Steps}\n${row.Test_Data}`;
  if (/https?:\/\/(?!\{\{)/i.test(scan)) push("DV-002", "High", "hardcoded URL in Steps/Test_Data (use {{FRONT_URL}}/{{BACK_URL}}/{{ADMIN_URL}})");
  const credScan = lines(row.Steps).filter((l) => /\bfill\b.*(email|password)/i.test(l));
  for (const l of credScan) if (EMAIL_RE.test(l) && !/\{\{/.test(l) && !THROWAWAY_IDENTITY_RE.test(l))
    push("DV-003", "Critical", `hardcoded credential literal: "${truncate(l)}"`);
  // DV-013 (bare GUID/32-hex) is intentionally NOT duplicated here: it is the
  // canonical build gate `npx tsx scripts/validate-td-refs.ts`, which carries
  // the env-constant allowlist (virtual-catalog root, store IDs, sentinel
  // 00000000-…). Reimplementing it inline diverged and false-flagged clean
  // rows, so this linter delegates DV-013 to that gate (noted in the footer).

  // --- Dimension 6: BL/ECL + traceability ---
  if (HIGH_PRIORITIES.has(row.Priority)) {
    if (!row.Business_Rule.trim()) push("BL-001", "Medium", `${row.Priority} case has no Business_Rule (BL-*)`);
    if (!row.References.trim() || !REFERENCE_RE.test(row.References))
      push("REQ-001", "High", `${row.Priority} case lacks a requirement link (VCST-/REQ-/story/smoke-baseline)`);
  }

  // --- Dimension 10: Assertion Grounding (GRD-001) ---
  // Anti-hallucination gate. Provenance is opt-in per case, so the backlog stays
  // green: a fully-untagged legacy case gets only an Informational nudge (below the
  // default --fail-on=High). Once a case is "provenance-adopted" (any assertion
  // carries {SPEC}/{BL}/{DOC}/{OBSERVED}/{HYPOTHESIS}) — i.e. new/touched cases from
  // the generator — the rule bites: an untagged line is High, and a {HYPOTHESIS}
  // line in a PROMOTED (past-Draft) case is a Blocker (must be grounded live via
  // --verify → {OBSERVED}, or by {SPEC}/{BL}/{DOC}, before promotion).
  // GRD-002 (invented literal message string) needs judgment → left to the skill.
  // A fully-untagged legacy case is tallied once at file level in lintCrossRow (a
  // per-case Informational floods the report) — here we only enforce once a case is
  // provenance-adopted (any assertion tagged): new/touched cases from the generator.
  const provAdopted = assertionLines.some((a) => PROVENANCE_RE.test(a));
  const promoted = PROMOTED_STATUSES.has(row.Automation_Status);
  if (provAdopted) {
    for (const a of assertionLines) {
      if (E2E_MARKER_RE.test(a)) continue;
      const hasProv = PROVENANCE_RE.test(a);
      const grounded = GROUNDED_PROV_RE.test(a);
      if (!hasProv)
        push("GRD-001", "High", `assertion missing a provenance tag (case uses provenance elsewhere): "${truncate(a)}"`);
      else if (!grounded && promoted)
        push("GRD-001", "Blocker", `{HYPOTHESIS} assertion cannot be in a ${row.Automation_Status} case — ground it ({SPEC}/{BL}/{DOC}) or run --verify to observe it live: "${truncate(a)}"`);
    }
  }

  return f;
}

function truncate(s: string, n = 70): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Normalised tagged-step token set for Jaccard similarity. */
function stepTokens(steps: string): Set<string> {
  return new Set(
    lines(steps)
      .map((l) => l.replace(/\[[^\]]*\]/g, "").replace(/\{\{[^}]*\}\}/g, "").replace(/@td\([^)]*\)/g, "").toLowerCase().replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Dim 7 (DUP-001 / DUP-004) + Dim 9 (TC-001) + Dim 11 (TRI-000) operate across rows. */
function lintCrossRow(rows: Row[], now = new Date(), staleDays = DEFAULT_STALE_DAYS): Finding[] {
  const f: Finding[] = [];
  const tokenSets = rows.map((r) => stepTokens(r.Steps));
  // DUP-001/004 target UI login/add-to-cart repetition. Runner-native GraphQL
  // cases share [AUTH]/[SETUP]/query scaffolding by design and have no
  // "state from <ID>" reference form, so comparing them is pure noise.
  const dupEligible = rows.map((r) => !isRunnerGraphql(r));

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (!dupEligible[i] || !dupEligible[j]) continue;
      const sim = jaccard(tokenSets[i], tokenSets[j]);
      if (sim > 0.8 && tokenSets[i].size >= 2)
        f.push(find("DUP-001", "Medium", rows[j].ID, `≥80% step overlap with ${rows[i].ID} (${Math.round(sim * 100)}%) — consolidate or differentiate`));
      else if (sim >= 0.7 && tokenSets[i].size >= 3)
        f.push(find("DUP-004", "Medium", rows[j].ID, `repeats ≥70% of ${rows[i].ID}'s setup steps — reference via "state from ${rows[i].ID}"`));
    }
  }

  // Dim 9: TC-001 — positive/negative/boundary mix per Section-parent group.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const parent = (r.Section.split(">").slice(0, 2).join(">").trim()) || r.Section || "(none)";
    (groups.get(parent) ?? groups.set(parent, []).get(parent)!).push(r);
  }
  const NEG = /\b(invalid|error|expired|rejected|fail|denied|unauthor|forbidden|missing|empty|duplicate|negative)\b/i;
  const BOUND = /\b(max|min|maximum|minimum|boundary|limit|zero|first|last|over|exceed|cap|threshold|0\b|page)\b/i;
  for (const [parent, group] of groups) {
    if (group.length < 3) continue;
    const hasNeg = group.some((r) => NEG.test(r.Title));
    const hasPos = group.some((r) => !NEG.test(r.Title));
    const numeric = group.some((r) => /\b(price|quantity|qty|date|length|count|amount|page|discount)\b/i.test(r.Title + r.Steps));
    const hasBound = group.some((r) => BOUND.test(r.Title));
    const missing: string[] = [];
    if (!hasPos) missing.push("positive");
    if (!hasNeg) missing.push("negative");
    if (numeric && !hasBound) missing.push("boundary");
    if (missing.length)
      f.push(find("TC-001", "Medium", group[0].ID, `feature group "${parent}" (${group.length} cases) missing: ${missing.join(", ")}`));
  }

  // Dim 10 (GRD-001) legacy tally — one file-level nudge instead of per-case spam.
  // Backlog-safe: Informational is below the default --fail-on=High gate.
  const legacyUngrounded = rows.filter((r) => r.Assertions.trim() && !PROVENANCE_RE.test(r.Assertions));
  if (legacyUngrounded.length)
    f.push(find("GRD-001", "Informational", legacyUngrounded[0].ID || "<file>",
      `${legacyUngrounded.length} case(s) have no assertion provenance tags (Dim 10) — grounded on next touch/regeneration`));

  // Dim 11 (TRI-000) staleness tally — one file-level signal, same shape as the
  // GRD-001 tally above and for the same reason: a per-case finding would emit
  // ~3,960 rows across the repo on day one. Informational keeps it below the
  // default --fail-on=High gate, so adding this dimension cannot turn the whole
  // suite corpus red and push everyone to --warn-only (which would kill the
  // signal permanently). This is a SCHEDULING signal, not a case defect —
  // audit-queue.ts consumes it to pick each day's suite.
  if (rows.length) {
    const st = auditStaleness(rows, now, staleDays);
    const due = st.unstamped + st.stale;
    if (due)
      f.push(find("TRI-000", "Informational", rows[0].ID || "<file>",
        `${due}/${rows.length} case(s) due for behavioral triangulation (${st.unstamped} never audited, ` +
          `${st.stale} stamped >${staleDays}d ago${st.oldestStamp ? `, oldest ${st.oldestStamp}` : ""}) ` +
          `— run /qa-review-tests --triangulate`));
  }

  return f;
}

function rank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

function main(): void {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("--"));
  const json = argv.includes("--json");
  const failOnArg = (argv.find((a) => a.startsWith("--fail-on=")) ?? "--fail-on=High").split("=")[1] as Severity;
  const failOn = SEVERITY_ORDER.includes(failOnArg) ? failOnArg : "High";
  const staleArg = Number(argv.find((a) => a.startsWith("--stale-days="))?.split("=")[1]);
  const staleDays = Number.isFinite(staleArg) && staleArg > 0 ? staleArg : DEFAULT_STALE_DAYS;

  if (!file) {
    console.error(
      "Usage: lint-test-cases.ts <suite.csv> [--json] [--fail-on=Blocker|Critical|High|Medium] [--stale-days=N]",
    );
    process.exit(1);
  }

  // Strip a UTF-8 BOM — 12 suite CSVs carry one, and it would otherwise be parsed
  // as part of the first header cell ("Invalid Opening Quote" → bogus S-007 Blocker).
  const raw = readFileSync(file, "utf-8").replace(/^﻿/, "");
  const findings: Finding[] = [];

  // S-001: header check (tolerant of quoted/unquoted styles via parseSuite).
  let rows: Row[] = [];
  try {
    const parsed = parseSuite(raw);
    if (parsed.header.join(",") !== COLUMNS.join(","))
      findings.push(find("S-001", "Blocker", "<header>", `header is not the 15-column enriched format: found ${parsed.header.length} cols`));
    rows = parsed.rows;
  } catch (e) {
    // S-007: CSV cannot be field-parsed — a Blocker; row-level analysis aborts.
    findings.push(find("S-007", "Blocker", "<file>", `CSV parse error (unescaped quote / column mismatch): ${(e as Error).message}`));
    report(findings, file, json, failOn);
    return;
  }

  const seenIds = new Map<string, number>();
  rows.forEach((r, i) => findings.push(...lintRow(r, i, seenIds)));
  findings.push(...lintCrossRow(rows, new Date(), staleDays));

  report(findings, file, json, failOn);
}

function report(findings: Finding[], file: string, json: boolean, failOn: Severity): void {
  const blocking = findings.filter((x) => rank(x.severity) >= rank(failOn));

  if (json) {
    console.log(JSON.stringify({ file, total: findings.length, blocking: blocking.length, findings }, null, 2));
  } else {
    const counts = SEVERITY_ORDER.slice().reverse()
      .map((s) => [s, findings.filter((x) => x.severity === s).length] as const)
      .filter(([, n]) => n > 0);
    console.log(`\n${file}`);
    console.log(`  ${findings.length} finding(s): ${counts.map(([s, n]) => `${n} ${s}`).join(", ") || "none"}`);
    for (const s of SEVERITY_ORDER.slice().reverse()) {
      const group = findings.filter((x) => x.severity === s);
      for (const x of group) console.log(`  [${x.severity}] ${x.rule} ${x.caseId}: ${x.message}`);
    }
    console.log(
      `\n  Static dims 1-7,9,10 + TRI-000 only. Run alongside: \`npm run graphql:lint-labels -- <csv>\` (DV-019) and ` +
        `\`npx tsx scripts/validate-td-refs.ts\` (DV-013). Dimension 8 (live env) and the live half of Dim 10 ` +
        `(grounding {HYPOTHESIS}/{SPEC} → {OBSERVED}) need a browser via /qa-review-tests --verify. Dimension 11 ` +
        `verdicts (TRI-001..006 — is the asserted behavior still TRUE?) need docs+live+source via ` +
        `/qa-review-tests --triangulate; TRI-000 above only reports WHEN each row was last audited. Schema rules ` +
        `DV-006..012/016/020, GRD-002 (invented literal), and BL-002/004/005 need knowledge-file/LLM judgment.`,
    );
  }
  process.exit(blocking.length > 0 ? 1 : 0);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
