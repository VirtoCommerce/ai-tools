// Per-lane Playwright MCP configuration.
//
// `ci/run-regression.ts` defined ONE `mcpServers` object shared by every concurrent suite,
// pointing at `ci/config/mcp-playwright-chrome.ci.json`, which hardcodes
// `outputDir: "./test-results/chrome"` and `recordHar.path: "./test-results/chrome/trace.har"`.
// With MAX_PARALLEL=3 that is three writers on one HAR file and one output directory: the
// archive is garbage, and Playwright's HAR finalize on `browser_close` can clobber a peer
// mid-write. Screenshots collide the same way, so failure evidence can belong to the wrong
// suite — which is worse than having none, because it is not obviously wrong.
//
// This module keeps the committed file as the TEMPLATE and materializes one config per lane
// under `test-results/lane-{n}/` (already gitignored, already volume-mounted by
// .github/workflows/regression.yml). It is the gate on raising parallelism: until each lane
// owns its output paths, MAX_PARALLEL=3 is the honest ceiling.
//
// The pure rewrite (`laneConfigFor`) is separated from the write so
// `scripts/unit/lane-mcp-config.test.ts` can assert path isolation without touching disk.

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

/** The template shipped in the repo. */
export const TEMPLATE_PATH = join("ci", "config", "mcp-playwright-chrome.ci.json");
/** Pinned MCP version — kept identical to what run-regression.ts used before. */
export const PLAYWRIGHT_MCP_PACKAGE = "@playwright/mcp@0.0.77";

/** Root for a lane's artifacts. Relative, because the MCP config paths are relative. */
export function laneOutputDir(laneId: string): string {
  return `./test-results/lane-${laneId}`;
}

/**
 * Rewrite a template config so every output path is lane-scoped. Pure: takes and returns
 * plain data, so the test can diff two lanes without a filesystem.
 *
 * `recordHar.path` must keep its `.har` extension — Playwright treats it as a FILE path,
 * and pointing it at a directory writes a real archive to a file literally named `har`,
 * invisible to every `*.har` glob. That defect shipped for weeks in the interactive
 * configs; do not reintroduce it here.
 */
export function laneConfigFor(template: unknown, laneId: string): Record<string, unknown> {
  const config = structuredClone(template) as Record<string, unknown>;
  const dir = laneOutputDir(laneId);

  config.outputDir = dir;

  const browser = config.browser as Record<string, unknown> | undefined;
  const contextOptions = browser?.contextOptions as Record<string, unknown> | undefined;
  if (contextOptions) {
    const recordHar = (contextOptions.recordHar ?? {}) as Record<string, unknown>;
    contextOptions.recordHar = { ...recordHar, path: `${dir}/har/session.har` };
  }

  return config;
}

/**
 * Write the lane's config to disk and return the `mcpServers` object to hand to `query()`.
 * The file lands inside the lane's own directory so the config and the artifacts it names
 * cannot drift apart.
 */
export function materializeLaneMcp(laneId: string): Record<string, { command: string; args: string[] }> {
  const template = JSON.parse(readFileSync(TEMPLATE_PATH, "utf-8")) as unknown;
  const config = laneConfigFor(template, laneId);

  const dir = join("test-results", `lane-${laneId}`);
  mkdirSync(join(dir, "har"), { recursive: true });
  const configPath = join(dir, "mcp.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

  return {
    "playwright-chrome": {
      command: "npx",
      args: [PLAYWRIGHT_MCP_PACKAGE, "--config", configPath],
    },
  };
}
