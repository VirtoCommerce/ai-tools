import "./config.js"; // layered .env loader first
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { laneConfig } from "./regression/lib/lane-config.js";
import { defaultRunId } from "./regression/lib/runner-cases.js";

// One RUN_ID for the whole invocation: set here, in the main process, so every worker inherits it.
// Evaluated per worker instead, each worker restart (after any failed test) opened a new evidence folder.
process.env.RUN_ID ??= defaultRunId();

const lane = laneConfig();

export default defineConfig({
  workers: 1,
  fullyParallel: false,
  // Playwright empties outputDir at the start of every run, so it is never the run folder itself —
  // that holds the ticket's tracked summary.json and checklist. A `specs/` sub-folder only.
  outputDir: process.env.RUN_DIR ? join(process.env.RUN_DIR, "specs") : "test-results/specs",
  // A first run (or a stale session) mints the storageState inside signedInAs; the sign-in script alone
  // may take ~2 min, twice on a re-create. The default 30 s would turn that into a BLOCKED timeout.
  timeout: 300_000,
  use: { trace: "retain-on-failure", screenshot: "only-on-failure", video: "off" },
  projects: [
    {
      name: "script",
      testMatch: "regression/suites/**/*.spec.ts",
      use: {
        browserName: lane.browserName as "chromium" | "firefox" | "webkit",
        channel: lane.channel,
        viewport: lane.viewport,
        locale: lane.locale,
      },
    },
    { name: "runner", testMatch: "regression/lib/runner-cases.spec.ts" },
  ],
});
