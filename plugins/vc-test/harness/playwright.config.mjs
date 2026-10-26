// plugins/vc-test/harness/playwright.config.mjs — the ONE Playwright config vc-test's checks run under.
// vc-init's runner (`node "$VC_RUN" runner playwright <spec…>`, bridge/runner.mjs) passes this file as --config
// and the project root as the cwd, with each spec as an anchored file filter. So `testDir` is the cwd — the
// project — and never this file's own folder, which is the plugin install. A plain object, not defineConfig():
// this file must load whichever @playwright/test runs it (the project's own, else vc-test's).
// Evidence on failure only (spec U28; .claude/rules/reports.md §5.1a): the runner captures it, no spec does.
import { join } from "node:path";

const project = process.cwd();

export default {
  testDir: project,
  testMatch: ["**/*.spec.ts", "**/*.spec.mjs", "**/*.spec.js"],
  testIgnore: ["**/node_modules/**", "**/.fix-workspace/**"],
  // Its own folder per run: Playwright empties outputDir when a run starts, and two scenario agents of one wave
  // must not delete each other's failure traces and screenshots.
  outputDir: join(project, ".vc-fix", "vc-test", "playwright-results", `${Date.now()}-${process.pid}`),
  workers: 1,
  reporter: [["list"]],
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
};
