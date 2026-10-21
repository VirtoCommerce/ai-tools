import "./config.js"; // layered .env loader first
import { defineConfig } from "@playwright/test";
import { laneConfig } from "./regression/lib/lane-config.js";

const lane = laneConfig();

export default defineConfig({
  workers: 1,
  fullyParallel: false,
  outputDir: process.env.RUN_DIR ?? "test-results/specs",
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
