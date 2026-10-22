// Every machine-lane (runner-native) CSV row as a Playwright test, executed by the SAME runner
// `npm run suites:machine` uses — so `npx playwright test --project runner` gives people the verdicts
// the pipeline gives. Imports from @playwright/test directly (not ./fixtures.js): runner cases never
// open a browser context.
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { evidenceFileFrom, failedAssertionFrom } from "../../scripts/regression/machine-lane.js";
import { defaultRunId, listRunnerCases, REPO_ROOT, runCase } from "./runner-cases.js";

const runId = process.env.RUN_ID ?? defaultRunId(); // set once in playwright.config.ts
const { suites, skipped } = listRunnerCases();
for (const s of skipped) console.warn(`[runner-cases] skipped ${s.file}: ${s.reason}`);

for (const suite of suites) {
  test.describe(`${suite.id} ${suite.name}`, () => {
    const seen = new Map<string, number>();
    for (const c of suite.cases) {
      const title = `${c.id}: ${c.title}`;
      const n = (seen.get(title) ?? 0) + 1;
      seen.set(title, n);
      // Any repeat gets its own suffix: a duplicate test title makes Playwright reject the whole file.
      const unique = n === 1 ? title : `${title} (duplicate id ${n})`;
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
