// Every machine-lane (runner-native) CSV row as a Playwright test, executed by the SAME runner
// `npm run suites:machine` uses — so `npx playwright test --project runner` gives people the verdicts
// the pipeline gives. Imports from @playwright/test directly (not ./fixtures.js): runner cases never
// open a browser context.
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { evidenceFileFrom, failedAssertionFrom } from "../../scripts/regression/machine-lane.js";
import { defaultRunId, listRunnerCases, REPO_ROOT, runCase } from "./runner-cases.js";

// playwright.config.ts fixes RUN_ID once in the main process; the fallback only serves a direct import.
const runId = process.env.RUN_ID || defaultRunId();
const { suites, skipped } = listRunnerCases();
// The file is loaded by the main process (collection) and again by every worker, which Playwright
// restarts after each failed test: warn from the main process only, so the list prints once per run.
if (process.env.TEST_WORKER_INDEX === undefined) {
  for (const s of skipped) console.warn(`[runner-cases] skipped ${s.file}: ${s.reason}`);
}

for (const suite of suites) {
  test.describe(`${suite.id} ${suite.name}`, () => {
    const seen = new Set<string>();
    for (const c of suite.cases) {
      const title = `${c.id}: ${c.title}`;
      const unique = seen.has(title) ? `${title} (duplicate id)` : title;
      seen.add(title);
      test(unique, async () => {
        test.setTimeout(300_000); // runCase is synchronous: a case runs to completion, then the clock is read
        const { code, stdout, stderr } = runCase(suite.csv, c.id, runId);
        if (code === 0) return;
        if (code === 1) {
          const evidenceFile = evidenceFileFrom(stdout);
          const evidenceDir = join(REPO_ROOT, "reports", "regression", runId, "graphql-evidence");
          const failed = failedAssertionFrom(evidenceDir, evidenceFile) ?? "an assertion failed";
          if (evidenceFile) test.info().annotations.push({ type: "evidence", description: evidenceFile });
          expect.soft(code, `${c.id}: ${failed}`).toBe(0);
          return;
        }
        if (code === 2) {
          test.skip(true, "browser lane: structural");
          return;
        }
        // exit 3 / signal / spawn failure. The cause is a `Step failed` / FATAL line on stdout; stderr only carries log noise.
        const cause = stdout.split(/\r?\n/).filter((l) => /Step failed|FATAL/.test(l)).slice(-1)[0] ?? stderr.trim();
        throw new Error(`${c.id}: graphql-runner exited ${code} — ${cause}`.slice(0, 600));
      });
    }
  });
}
