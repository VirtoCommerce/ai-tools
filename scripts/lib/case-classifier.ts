/**
 * Per-CASE lane classification — the single decision point for "can the runner execute
 * this row, or does it need a browser agent?"
 *
 * WHY THIS EXISTS. Lane routing is a SUITE-level decision today, and the rule is
 * all-or-nothing: `ci/lib/lane-classifier.ts` sends a suite to the fast path only when
 * EVERY non-empty `Steps` cell carries a runner op tag. That rule is right for its job —
 * handing a runner a row it cannot parse manufactures BLOCKED cases that read as product
 * failures — but its cost is measured: **188 machine-ready rows in 14 mixed suites** ride
 * the browser lane because a handful of their siblings are prose. Suite 050h is the
 * clearest case: 29 of 34 rows are runner-native, and one explicitly-Manual case
 * (WISH-009) sends all 34 through a browser agent.
 *
 * The point is not mainly speed. At the measured ~29% artefactual-BLOCKED rate for long
 * agent sessions, roughly 54 of those 188 rows currently return BLOCKED for reasons about
 * HOW they ran — a contaminated cart, a drifted session — rather than about the product.
 * Routing them to the runner turns those into real verdicts.
 *
 * THE CLASSIFIER DELEGATES TO THE EXECUTOR'S OWN PARSER. It does not pattern-match tags
 * with a private regex: it calls `parseSteps` / `validateStepBlocks` (the modules
 * `scripts/graphql/graphql-runner.ts` itself uses) and `parseAssertions` /
 * `classifyPredicateScoreability` (the modules that score its verdicts). A static verdict
 * derived from a second, similar-looking implementation is exactly how a classifier and a
 * runtime drift apart, and the failure mode is a case routed to a runner that cannot run
 * it. Same reason `lint-test-cases.ts` T-005 delegates rather than re-deriving.
 *
 * FAIL-CLOSED. Every uncertainty routes to `browser`, which is the status quo — so a
 * classifier bug costs the wall-clock saving, never a verdict. Being wrong the other way
 * (claiming a row is machine-ready when it is not) produces a BLOCKED that looks like a
 * product failure, which is the expensive direction.
 */
import { parseSteps, validateStepBlocks, type StepBlock } from "./graphql-case-parser.js";
import { classifyPredicateScoreability, parseAssertions } from "./graphql-assertions.js";
import {
  classifyUiScoreability,
  hasUiDriverTag,
  parseUiAssertions,
  parseUiSteps,
  validateUiSteps,
  type UiStep,
} from "./ui-step-parser.js";

/**
 * Bumped whenever a routing decision changes. Recorded in every lanes file so a stale
 * plan can be detected rather than silently followed.
 */
export const CLASSIFIER_VERSION = "1.2.0";

/**
 * Where a case is dispatched. `machine` and `browser` EXECUTE; `manual` and `deprecated` do
 * not — they are the two opt-out lanes, kept apart because they mean different things and a
 * merged count would lie. `manual` is "a person runs this"; `deprecated` is "nobody runs
 * this, ever again". Same reason `report-executability.ts` keeps UNROUTABLE out of `browser`.
 */
export type CaseLane = "machine" | "browser" | "manual" | "deprecated";

/** Reason codes — a closed vocabulary, deliberately not prose. */
export type BlockerCode =
  | "EX-002" // no Steps to execute
  | "EX-003" // runner op blocks are structurally invalid (unmatched OP/EXEC, undeclared label)
  | "EX-010" // a step line the executor's parser cannot type
  | "EX-011" // no runner op at all — this is browser prose
  | "EX-101" // no scoreable assertion: the runner would have nothing to judge
  | "EX-102" // an assertion the runner cannot score
  | "EX-200" // explicitly Manual — a human decision, respected
  | "EX-201" // explicitly Deprecated — retired, so it must not be executed OR scored
  | "EX-300"; // compiles under the UI grammar, but no executor is wired for that family yet

/**
 * Which executor family a case's steps belong to. Decided per case from the step tags, never
 * from the suite: `042` is a UI suite whose cases are UI-family, `050i` is GraphQL-family, and a
 * UI case may contain `[GQL-*]` setup steps without changing family (that is the design — state
 * setup through xAPI, verification through the DOM).
 *
 * `"none"` means neither family's driver tags are present: browser prose, the corpus's 84%.
 */
export type ExecutorFamily = "gql" | "ui" | "none";

export interface CaseVerdict {
  id: string;
  lane: CaseLane;
  /** Empty exactly when `lane === "machine"`. `code` + the offending token, never prose. */
  blockers: Array<{ code: BlockerCode; detail: string }>;
  /** Which grammar the case was judged against. */
  family: ExecutorFamily;
}

/**
 * A UI-family case that compiles cleanly and would run deterministically the moment a
 * `ui-runner` exists. Its lane is still `browser`, because there is no executor for it yet.
 *
 * This is deliberately a COUNT rather than a lane. `machine-lane.ts` dispatches every
 * `lane === "machine"` case to `graphql-runner --case`, so calling a UI case machine today would
 * send it to a runner that cannot parse it — a BLOCKED that reads as a product failure, the
 * expensive direction of being wrong. Reporting it as `EX-300` instead keeps the operational
 * behaviour identical while making the number visible: "how much would a ui-runner actually
 * buy" becomes a measurement taken before the runner is built, rather than a projection.
 */
export function isUiReady(v: CaseVerdict): boolean {
  return v.family === "ui" && v.blockers.length === 1 && v.blockers[0].code === "EX-300";
}

/** The columns the classifier reads. A subset of the enriched CSV, so tests need no fixture file. */
export interface ClassifiableRow {
  ID: string;
  Steps: string;
  Assertions: string;
  Automation_Status?: string;
}

const RUNNER_OP_KINDS = new Set<StepBlock["kind"]>([
  "GQL-OP",
  "GQL-EXEC",
  "REST",
  "REST-OP",
  "REST-EXEC",
]);

/**
 * `Manual` and `Deprecated` are the ONLY field values that route a case, and only in the
 * opt-out direction. `Automation_Status` carries 23 distinct values across the corpus
 * (case-dupes, free text like `'Draft (SERIAL — isolate; restore ALL after)'`), so it cannot
 * be trusted to route anything positively — but an explicit `Manual` is a human saying "a
 * person runs this", and overriding that with a compiler verdict would be the wrong kind of
 * clever. Suite 050h's WISH-009 is the worked example.
 *
 * Matching is EXACT (trim + case-fold), never a substring or a prefix, because excluding a
 * case is the one decision this module makes that runs AGAINST fail-closed: everywhere else
 * doubt costs a browser slot, here it would cost coverage. `'Draft (was Manual)'` and
 * `'Deprecated pending review'` are therefore not matches — they fall through to the compiler,
 * which is the safe direction. `lint-test-cases.ts` S-006 + the `suites:lint` case-variant
 * ratchet are what keep the column to the canonical spellings in the first place.
 */
function statusOptOut(row: ClassifiableRow): "manual" | "deprecated" | null {
  const v = (row.Automation_Status ?? "").trim().toLowerCase();
  if (v === "manual") return "manual";
  if (v === "deprecated") return "deprecated";
  return null;
}

/**
 * Judge a UI-family case against the UI grammar.
 *
 * Same three rules as the GraphQL branch, for the same reasons: every step line must type
 * (an untypeable line would be skipped at runtime, so the case would report a verdict on a
 * subset of its own steps), the step list must be structurally runnable, and EVERY assertion
 * must be scoreable rather than one of them.
 *
 * `[GQL]` steps inside a UI case are handed to the GraphQL parser — this module never has two
 * implementations of one grammar.
 */
function classifyUiCase(id: string, row: ClassifiableRow, steps: readonly UiStep[]): CaseVerdict {
  const blockers: CaseVerdict["blockers"] = [];

  for (const s of steps) {
    if (s.tag === "UNKNOWN") blockers.push({ code: "EX-010", detail: s.reason.slice(0, 80) });
  }
  for (const err of validateUiSteps(steps)) {
    // validateUiSteps repeats each UNKNOWN reason; keep the structural findings only so one bad
    // line is not counted twice.
    if (!steps.some((s) => s.tag === "UNKNOWN" && s.reason.slice(0, 80) === err.slice(0, 80))) {
      blockers.push({ code: "EX-003", detail: err });
    }
  }

  // Delegated: the GraphQL half of a UI case is validated by the GraphQL parser.
  const gqlLines = steps.filter((s) => s.tag === "GQL").map((s) => s.raw);
  if (gqlLines.length > 0) {
    for (const err of validateStepBlocks(parseSteps(gqlLines.join("\n")))) {
      blockers.push({ code: "EX-003", detail: `[GQL] ${err}` });
    }
  }

  const assertions = parseUiAssertions(row.Assertions ?? "");
  if (assertions.length === 0) {
    blockers.push({ code: "EX-101", detail: "no scoreable assertion" });
  }
  for (const a of assertions) {
    const score = classifyUiScoreability(a);
    if (score === "unparseable") {
      blockers.push({ code: "EX-102", detail: a.tag === "UNKNOWN" ? a.reason.slice(0, 80) : a.raw.slice(0, 40) });
    } else if (score === "delegated") {
      // `[STATE]` is a GraphQL predicate. Ask the scorer that owns it; do not assume.
      const { assertions: gqlAssertions } = parseAssertions(a.tag === "STATE" ? a.expr : "");
      if (gqlAssertions.length === 0) {
        blockers.push({ code: "EX-102", detail: `[STATE] ${a.raw.slice(0, 40)}` });
      }
      for (const ga of gqlAssertions) {
        if (classifyPredicateScoreability(ga) !== "scoreable") {
          blockers.push({ code: "EX-102", detail: `[STATE] ${ga.predicate.slice(0, 40)}` });
        }
      }
    }
  }

  if (blockers.length > 0) return { id, lane: "browser", blockers, family: "ui" };

  // It compiles — but there is no executor for it yet, so the lane does NOT change. See isUiReady.
  return {
    id,
    lane: "browser",
    blockers: [{ code: "EX-300", detail: "compiles under the UI grammar; ui-runner not implemented" }],
    family: "ui",
  };
}

export function classifyCase(row: ClassifiableRow): CaseVerdict {
  const id = (row.ID ?? "").trim();
  const blockers: CaseVerdict["blockers"] = [];

  // Both opt-outs are checked BEFORE any parsing: a retired case's steps and assertions may
  // describe an API that no longer exists (050m's SR-GQL-029 says so in its own title —
  // "statuses[] arg removed"), so compiling them is at best wasted work and at worst a verdict
  // about a surface nobody intends to support. Measured on 050m: three Deprecated rows ran, two
  // "passed" while asserting nothing meaningful and one FAILed against the suite's pass rate and
  // was triaged as a fixable assertion defect.
  const optOut = statusOptOut(row);
  if (optOut === "manual") {
    return { id, lane: "manual", blockers: [{ code: "EX-200", detail: "Automation_Status=Manual" }], family: "none" };
  }
  if (optOut === "deprecated") {
    return {
      id,
      lane: "deprecated",
      blockers: [{ code: "EX-201", detail: "Automation_Status=Deprecated" }],
      family: "none",
    };
  }

  const steps = (row.Steps ?? "").trim();
  if (!steps) {
    return { id, lane: "browser", blockers: [{ code: "EX-002", detail: "empty Steps" }], family: "none" };
  }

  // Family is decided by which driver TAGS are present — not by whether their operands parse.
  // Deciding it from a successful parse made family membership depend on authoring quality, so
  // the worst-written cases were filed under the wrong grammar and reported with the wrong
  // blocker codes (042's checkout, payment and GA4 cases, measured). A UI driver wins over
  // GraphQL steps: a case that both clicks and queries is a UI case with GraphQL setup, which is
  // the intended shape.
  if (hasUiDriverTag(row.Steps)) return classifyUiCase(id, row, parseUiSteps(row.Steps));

  const blocks = parseSteps(row.Steps);

  // A line the executor's own parser could not type. It would be silently skipped at
  // runtime, so the case would report a verdict on a subset of its own steps.
  for (const b of blocks) {
    if (b.kind === "UNKNOWN") blockers.push({ code: "EX-010", detail: b.tag || b.raw.slice(0, 40) });
  }

  if (!blocks.some((b) => RUNNER_OP_KINDS.has(b.kind))) {
    blockers.push({ code: "EX-011", detail: "no [GQL-OP]/[GQL-EXEC]/[REST*] block" });
  }

  for (const err of validateStepBlocks(blocks)) blockers.push({ code: "EX-003", detail: err });

  // Assertions: EVERY predicate must be scoreable, not merely one of them.
  //
  // The runner's verdict is `failed === 0 && results.length > 0 ? PASS`. A case mixing one
  // scoreable predicate with three prose ones would therefore PASS on the strength of the
  // one — a false green earned by the runner not understanding the other three. This is
  // the same "silence is never a pass" rule `layout-runner.ts` enforces at runtime, applied
  // one step earlier so the row never reaches the runner at all. `info` assertions
  // ({OBSERVED}/{HYPOTHESIS} evidence journal) are not predicates and are excluded.
  const { assertions } = parseAssertions(row.Assertions ?? "");
  if (assertions.length === 0) {
    blockers.push({ code: "EX-101", detail: "no scoreable assertion" });
  }
  for (const a of assertions) {
    if (classifyPredicateScoreability(a) !== "scoreable") {
      blockers.push({ code: "EX-102", detail: `[${a.kind}] ${a.predicate.slice(0, 40)}` });
    }
  }

  return { id, lane: blockers.length === 0 ? "machine" : "browser", blockers, family: "gql" };
}

export interface SuiteLanes {
  machine: string[];
  browser: string[];
  manual: string[];
  /** Retired cases: dispatched nowhere, but LISTED — a plan must still account for them. */
  deprecated: string[];
  verdicts: CaseVerdict[];
}

/** Classify a whole suite, preserving CSV row order within each lane. */
export function classifySuiteCases(rows: readonly ClassifiableRow[]): SuiteLanes {
  const verdicts = rows.map(classifyCase);
  return {
    machine: verdicts.filter((v) => v.lane === "machine").map((v) => v.id),
    browser: verdicts.filter((v) => v.lane === "browser").map((v) => v.id),
    manual: verdicts.filter((v) => v.lane === "manual").map((v) => v.id),
    deprecated: verdicts.filter((v) => v.lane === "deprecated").map((v) => v.id),
    verdicts,
  };
}

/** Blocker-code tally, cheapest-to-fix first — the burn-down view. */
/**
 * Cases per blocker code. Takes only the field it reads, so a caller counting codes it already
 * has does not have to fabricate a whole verdict (id, lane and family it would have to invent)
 * just to satisfy the signature — an invented field is a lie the typechecker would then bless.
 */
export function blockerHistogram(
  verdicts: readonly { readonly blockers: readonly { readonly code: BlockerCode }[] }[],
): Array<{ code: BlockerCode; count: number }> {
  const counts = new Map<BlockerCode, number>();
  for (const v of verdicts) {
    // Count a case once per distinct code, not once per occurrence.
    for (const code of new Set(v.blockers.map((b) => b.code))) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);
}
