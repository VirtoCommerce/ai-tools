// Unit tests for ci/lib/manifest-preflight.ts.
//
// The regression being locked out: suite `048c` carries `"agent": "none"` because it is run
// deterministically by `scripts/layout/layout-runner.ts`, and `ci/agents/none.md` does not
// exist. `ci/run-regression.ts` resolved the agent path unconditionally and returned
// `status: "error"` — counted as a REAL failure. `048c` is not excluded from `full` and IS in
// `frontend`, so both selections failed in CI every single run, and the failure looked like a
// test failure rather than a config error.
//
// Also asserted: the real manifest passes preflight. That turns "does CI's selection actually
// have executors" from a runtime discovery hours in, into a static check.
//
// Run: `npx tsx --test scripts/unit/suite-preflight.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatPreflightProblems,
  hasDeterministicRunner,
  preflightManifest,
  type PreflightSuite,
} from "../../ci/lib/manifest-preflight.ts";

/** Pretend every path exists, so only the executor rules are under test. */
const allExist = { fileExists: () => true };
/** Pretend nothing exists. */
const noneExist = { fileExists: () => false };

// ---- the 048c regression -----------------------------------------------------------

test("048c shape passes: a `runner` suite needs no agent definition", () => {
  const suite: PreflightSuite = {
    id: "048c",
    csvPath: "regression/suites/Frontend/cross-cutting/048c-layout-stability.csv",
    agent: "none",
    runner: "layout-runner",
    agentPath: "ci/agents/none.md",
  };
  // Note `fileExists` returns false for the agent path here — that is the whole point.
  assert.deepEqual(preflightManifest([suite], { fileExists: (p) => p.endsWith(".csv") }), []);
});

test("`agent: none` with NO runner is a no-executor problem, not a silent pass", () => {
  const problems = preflightManifest(
    [{ id: "999", csvPath: "a.csv", agent: "none", agentPath: "ci/agents/none.md" }],
    allExist,
  );
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, "no-executor");
  assert.match(problems[0].detail, /none/);
});

test("a declared agent whose definition is missing is reported", () => {
  const problems = preflightManifest(
    [{ id: "042", csvPath: "a.csv", agent: "qa-frontend-expert", agentPath: "ci/agents/qa-frontend-expert.md" }],
    { fileExists: (p) => p.endsWith(".csv") },
  );
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, "missing-agent");
});

test("a missing CSV is reported even when the agent is fine", () => {
  const problems = preflightManifest(
    [{ id: "042", csvPath: "gone.csv", agent: "qa-frontend-expert", agentPath: "ci/agents/qa-frontend-expert.md" }],
    { fileExists: (p) => p.endsWith(".md") },
  );
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, "missing-csv");
});

// ---- report EVERY problem, not the first -------------------------------------------

test("all problems are reported at once", () => {
  const suites: PreflightSuite[] = [
    { id: "001", csvPath: "a.csv", agent: "x", agentPath: "x.md" },
    { id: "002", csvPath: "b.csv", agent: "y", agentPath: "y.md" },
    { id: "003", csvPath: "c.csv", agent: "none" },
  ];
  const problems = preflightManifest(suites, noneExist);
  const ids = new Set(problems.map((p) => p.suiteId));
  assert.deepEqual([...ids].sort(), ["001", "002", "003"]);
  // 001/002: missing csv + missing agent; 003: missing csv + no-executor.
  assert.ok(problems.length >= 5, `expected every problem, got ${problems.length}`);
});

test("formatPreflightProblems renders one scannable line per problem", () => {
  const problems = preflightManifest([{ id: "001", csvPath: "a.csv", agent: "none" }], noneExist);
  const text = formatPreflightProblems(problems);
  assert.match(text, /suite 001/);
  assert.equal(text.split("\n").length, problems.length + 1, "one header + one line per problem");
  assert.equal(formatPreflightProblems([]), "", "no problems => no output");
});

test("hasDeterministicRunner ignores blank and whitespace-only values", () => {
  assert.ok(hasDeterministicRunner({ id: "x", csvPath: "a", runner: "layout-runner" }));
  assert.ok(!hasDeterministicRunner({ id: "x", csvPath: "a", runner: "" }));
  assert.ok(!hasDeterministicRunner({ id: "x", csvPath: "a", runner: "   " }));
  assert.ok(!hasDeterministicRunner({ id: "x", csvPath: "a" }));
});

// ---- the real manifest -------------------------------------------------------------

test("the REAL manifest passes preflight against the REAL filesystem", () => {
  const manifest = JSON.parse(readFileSync("config/test-suites.json", "utf-8")) as {
    suites: Array<{ id: string; file: string; agent: string; runner?: string }>;
  };
  const suites: PreflightSuite[] = manifest.suites.map((s) => ({
    id: s.id,
    csvPath: s.file,
    agent: s.agent,
    runner: s.runner,
    agentPath: join("ci", "agents", `${s.agent}.md`),
  }));
  const problems = preflightManifest(suites, { fileExists: existsSync });
  assert.deepEqual(problems, [], formatPreflightProblems(problems));
});
