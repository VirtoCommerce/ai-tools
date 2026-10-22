// The Playwright lane a spec runs on — read from the manifest, never typed here.
// config/test-suites.json defaults.preferredBrowser -> config/mcp-playwright-<name>.config.json
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface LaneConfig {
  browserName: string;
  channel?: string;
  viewport: { width: number; height: number };
  locale?: string;
}

function readJson(rel: string): any {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf-8"));
}

export function laneConfig(): LaneConfig {
  const preferred: string | undefined = readJson("config/test-suites.json").defaults?.preferredBrowser;
  if (!preferred) throw new Error("laneConfig: config/test-suites.json has no defaults.preferredBrowser");
  const file = `config/${preferred.replace("playwright-", "mcp-playwright-")}.config.json`;
  const browser = readJson(file).browser;
  const viewport = browser?.contextOptions?.viewport;
  if (!browser?.browserName || !viewport) throw new Error(`laneConfig: ${file} lacks browser.browserName or contextOptions.viewport`);
  return {
    browserName: browser.browserName,
    channel: browser.launchOptions?.channel,
    viewport: { width: viewport.width, height: viewport.height },
    locale: browser.contextOptions?.locale,
  };
}
