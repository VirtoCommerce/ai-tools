import "./config.js"; // layered .env loader first
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { laneConfig } from "./regression/lib/lane-config.js";
import { defaultRunId } from "./regression/lib/runner-cases.js";

const lane = laneConfig();

// One RUN_ID for the whole run, fixed HERE in the main process: workers inherit process.env, and
// Playwright restarts a worker after every failed test, so a default computed per worker would split
// one run's evidence across several reports/regression/<RUN_ID>/ folders.
process.env.RUN_ID ||= defaultRunId();

export default defineConfig({
  workers: 1,
  fullyParallel: false,
  // Playwright EMPTIES its outputDir at the start of every run. RUN_DIR is a ticket's run folder
  // (it holds that run's other evidence), so the specs get a subfolder of it, never the folder itself.
  outputDir: process.env.RUN_DIR ? join(process.env.RUN_DIR, "specs") : "test-results/specs",
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
