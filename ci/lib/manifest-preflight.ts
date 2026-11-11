// Fail-fast manifest validation, run BEFORE the first suite is dispatched.
//
// A broken manifest entry must surface as a config error before planning, not mid-run as a test
// failure. Suite `048c` is the standing example: it carries `"agent": "none"` because
// `scripts/layout/layout-runner.ts` executes it deterministically, so no agent definition exists.
// (The headless runner that first hit this, `ci/run-regression.ts`, was removed by VCST-6637.)
//
// Two rules encoded here:
//   * a suite is valid if it has a CSV AND (a deterministic `runner` OR an agent definition);
//     a `runner` suite needs no agent, which is the whole fix for 048c.
//   * report EVERY problem, not the first — discovering the 40th suite's missing agent after
//     fixing the 3rd is the failure mode this replaces.
//
// `fileExists` is injected so `scripts/unit/suite-preflight.test.ts` can exercise the rules
// without a filesystem.

export interface PreflightSuite {
  id: string;
  /** Path as the runner resolves it (repo-relative). */
  csvPath: string;
  /** Manifest `agent`. `"none"` is treated as absent — it is a marker, not an agent. */
  agent?: string;
  /** Manifest `runner` (e.g. `layout-runner`). Presence means no agent is required. */
  runner?: string;
  /** Path the agent definition would live at, when `agent` is set. */
  agentPath?: string;
}

export type PreflightProblemKind = "missing-csv" | "missing-agent" | "no-executor";

export interface PreflightProblem {
  suiteId: string;
  kind: PreflightProblemKind;
  detail: string;
}

/** `"none"` is a manifest marker meaning "no agent executes this", not an agent name. */
export const AGENT_NONE = "none";

export function hasDeterministicRunner(suite: PreflightSuite): boolean {
  return typeof suite.runner === "string" && suite.runner.trim().length > 0;
}

function declaresAgent(suite: PreflightSuite): boolean {
  const agent = suite.agent?.trim();
  return !!agent && agent !== AGENT_NONE;
}

/**
 * Validate every selected suite. Returns all problems found; an empty array means the
 * selection is dispatchable.
 */
export function preflightManifest(
  suites: readonly PreflightSuite[],
  opts: { fileExists: (path: string) => boolean },
): PreflightProblem[] {
  const problems: PreflightProblem[] = [];

  for (const suite of suites) {
    if (!opts.fileExists(suite.csvPath)) {
      problems.push({
        suiteId: suite.id,
        kind: "missing-csv",
        detail: `suite CSV not found: ${suite.csvPath}`,
      });
    }

    if (hasDeterministicRunner(suite)) continue; // a runner suite needs no agent

    if (!declaresAgent(suite)) {
      problems.push({
        suiteId: suite.id,
        kind: "no-executor",
        detail: `no executor: agent is "${suite.agent ?? "(unset)"}" and no \`runner\` is declared`,
      });
      continue;
    }

    if (suite.agentPath && !opts.fileExists(suite.agentPath)) {
      problems.push({
        suiteId: suite.id,
        kind: "missing-agent",
        detail: `agent definition not found: ${suite.agentPath}`,
      });
    }
  }

  return problems;
}

/** One-line-per-problem rendering for the console, grouped so the list is scannable. */
export function formatPreflightProblems(problems: readonly PreflightProblem[]): string {
  if (problems.length === 0) return "";
  const lines = [`Manifest preflight found ${problems.length} problem(s):`];
  for (const p of problems) lines.push(`  [${p.kind}] suite ${p.suiteId}: ${p.detail}`);
  return lines.join("\n");
}
