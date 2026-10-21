// Shared by capture.mjs, login.mjs and report.mjs: finds a Playwright install and launches Chromium.
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function candidates() {
  const list = [];
  if (process.env.PLAYWRIGHT_MODULE) list.push(process.env.PLAYWRIGHT_MODULE);
  for (const name of ["playwright", "@playwright/test"]) list.push(path.join(process.cwd(), "node_modules", name));
  try {
    const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    list.push(path.join(globalRoot, "playwright"), path.join(globalRoot, "@playwright/cli/node_modules/playwright"));
  } catch {}
  // playwright-cli bundles Playwright; it may sit under another Node version than the one running.
  try {
    const cli = realpathSync(execFileSync("which", ["playwright-cli"], { encoding: "utf8" }).trim());
    list.push(path.join(path.dirname(cli), "node_modules/playwright"));
  } catch {}
  return list;
}

export function loadPlaywright() {
  for (const dir of candidates()) {
    if (!existsSync(dir)) continue;
    const mod = require(dir);
    if (mod.chromium) return mod;
  }
  console.error(
    "Playwright not found. Install it once (npm i -g playwright, or the playwright-cli skill),\n" +
      "or point PLAYWRIGHT_MODULE at a directory that contains it.",
  );
  process.exit(2);
}

// Playwright's own Chromium first; the installed Chrome when the bundled build is missing or of another revision.
export async function launch(options = {}) {
  const { chromium } = loadPlaywright();
  try {
    return await chromium.launch(options);
  } catch (error) {
    if (!/Executable doesn't exist|playwright install/i.test(error.message)) throw error;
    return chromium.launch({ ...options, channel: "chrome" });
  }
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const next = argv[i + 1];
    args[argv[i].slice(2)] = next === undefined || next.startsWith("--") ? true : next;
    if (args[argv[i].slice(2)] !== true) i++;
  }
  return args;
}
