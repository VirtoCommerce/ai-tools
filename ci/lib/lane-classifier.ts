// Lane classification: which executor owns a suite.
//
// Kept out of `ci/run-regression.ts` so it can be unit-tested without importing a CLI that
// launches a regression run, and so the interactive orchestrator can share the same rule
// rather than re-deriving it from prose.
//
// CI previously had NO fast path at all: every runner-native GraphQL suite (`050*`, `075c`,
// `086`) went through an LLM driving a browser in headless mode, competing for the very slots
// the browser suites need — while a `scripts/graphql/graphql-runner.ts` that can execute them
// deterministically already existed.

import { existsSync, readFileSync } from "fs";
import { isAbsolute, join } from "path";
// LaneKind is owned by the scheduler (it is a scheduling concept) and re-exported here so
// callers need only one import. Defining it twice would let the two copies drift the first
// time a lane is added.
import type { LaneKind } from "./scheduler.ts";

export type { LaneKind };

/** The subset of a suite's config lane classification reads. */
export interface LaneClassifiable {
  file: string;
  runner?: string;
}

/** `Steps` is the 9th column of the 15-column enriched schema. */
const STEPS_INDEX = 8;

/**
 * Non-empty `Steps` cells from a suite CSV, WITHOUT a strict record parse.
 *
 * The corpus has four header variants on disk — 64 quoted, 37 unquoted, 12 UTF-8 BOM'd, and
 * 11 in a legacy 11-column schema — and a lane decision still has to be made for a file a
 * strict parser would throw on. So this walks the raw text tracking quote state, the same
 * parser-independent discipline `extractExistingIds` uses in the canonical CSV helper.
 *
 * A row with too few fields yields nothing rather than a wrong cell, which is what keeps a
 * legacy 11-column file (whose 9th field is `References`, not `Steps`) from being read as
 * runner-native.
 */
export function extractStepsCells(csv: string): string[] {
  const text = csv.replace(/^\uFEFF/, "");
  const cells: string[] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  const endRow = (): void => {
    row.push(field);
    field = "";
    if (row.length > STEPS_INDEX) {
      const value = row[STEPS_INDEX].trim();
      if (value && value !== "Steps") cells.push(value); // skip the header row
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      endRow();
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) endRow();

  return cells;
}

/**
 * Executable op tags — the ones that actually SEND something, taken from what
 * `scripts/lib/graphql-case-parser.ts` `isStepTag` implements rather than from prose.
 *
 * `.claude/agents/regression-orchestrator.md` Step 1.5 describes the rule as
 * "`[GQL-OP `/`[GQL-EXEC `", which is a shorthand narrower than the runner: the parser also
 * handles `REST-OP` / `REST-EXEC` / `REST`. Suite 050l is the case that exposes it — 56
 * `[GQL-OP]` and 65 `[REST-OP]` occurrences, so a GraphQL-only test sends the whole suite to a
 * browser it does not need. Matching the runner's real vocabulary is the point: the doc is a
 * summary, the parser is the contract.
 *
 * Deliberately excluded are the tags that only SUPPORT an op — `AUTH`, `GQL-VARS`,
 * `GQL-CAPTURE`, `REST-CAPTURE`, `GQL-ENDPOINT`, `WAIT`, `SETUP`, `TEARDOWN`. A cell holding
 * only those does no work and must not count as runner-native.
 */
const RUNNER_OP_RE = /\[(?:GQL-OP|GQL-EXEC|REST-OP|REST-EXEC|REST)[\s\]]/i;

/** True when EVERY non-empty Steps cell carries an executable runner op. */
export function isRunnerNative(csv: string): boolean {
  const steps = extractStepsCells(csv);
  if (steps.length === 0) return false;
  return steps.every((cell) => RUNNER_OP_RE.test(cell));
}

/**
 * Which lane owns this suite.
 *
 * The runner-native rule is deliberately the STRICT one `.claude/agents/test-runner-agent.md`
 * Phase 0 and `.claude/agents/regression-orchestrator.md` Step 1.5 use: EVERY non-empty Steps
 * cell must carry a runner tag.
 *
 * A weaker "has runner tags and no UI tags" test looks equivalent and is not. Suite 050d has
 * 46 runner-native cases out of 49 and the other 3 carry neither GraphQL nor UI tags; under the
 * weaker rule the whole suite goes to the runner, which cannot parse those 3 and exits 2 ->
 * BLOCKED. Handing a case to an executor that cannot run it manufactures a phantom blocker.
 *
 * The cost of the strict rule is real and known: 188 already-machine-executable rows sit inside
 * 14 MIXED suites and still take the browser lane wholesale — one explicitly manual case in
 * 050h sends all 34 of its cases there. Per-case routing is the fix, and it is a separate piece
 * of work; until then this is the honest trade rather than a silent one.
 */
export function classifyLane(config: LaneClassifiable, suitesRoot = join("regression", "suites")): LaneKind {
  if (config.runner) return "deterministic";

  // `file` arrives either repo-relative (manifest: "regression/suites/...") or already
  // suites-relative (SUITE_MAP strips the prefix). An absolute path is passed straight
  // through — joining it onto suitesRoot silently produced "regression/suites/tmp/..." and
  // classified every such suite `browser` because the file "did not exist".
  const suitePath = isAbsolute(config.file) || config.file.startsWith("regression/")
    ? config.file
    : join(suitesRoot, config.file);
  if (!existsSync(suitePath)) return "browser";

  try {
    return isRunnerNative(readFileSync(suitePath, "utf-8")) ? "fastpath" : "browser";
  } catch {
    return "browser";
  }
}
