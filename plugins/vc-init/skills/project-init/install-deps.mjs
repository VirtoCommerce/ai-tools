#!/usr/bin/env node
/**
 * install-deps.mjs — install the npm dependencies of EVERY installed plugin of this marketplace, not
 * only vc-init's.
 *
 * A plugin's scripts import bare packages (`dotenv`, `@playwright/mcp`) that Node resolves from the
 * script's own directory — the plugin's install folder in the cache. Claude Code installs no npm
 * dependencies, and every plugin update lands in a NEW version folder without a node_modules. Before
 * VCST-6402 /project-init lived in vc-fix and its `npm install` covered vc-fix; after the move it covered
 * only vc-init, so vc-fix's helpers (`ado.mjs`, `jira.mjs`) failed with "Cannot find package 'dotenv'".
 *
 * For each of vc-init, vc-fix, vc-perf that is installed: if any runtime dependency is missing from its
 * node_modules, run `npm install --omit=dev` there. Prints one line per plugin; exit 1 when an install
 * failed. `--check` installs nothing and exits 1 when something is missing.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePluginRoot } from "../../bridge/resolve-plugin.mjs";

export const PLUGINS = ["vc-init", "vc-fix", "vc-perf"];

/** The runtime dependencies of the plugin at `root` that its node_modules does not hold. */
export function missingDeps(root) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    return [];
  }
  return Object.keys(pkg.dependencies || {}).filter((d) => !existsSync(join(root, "node_modules", ...d.split("/"), "package.json")));
}

/** Every folder a plugin's code may run from: what the resolver picks, and the bridge's trusted pick. */
export function pluginRoots() {
  const out = [];
  for (const name of PLUGINS) {
    const roots = new Set([resolvePluginRoot(name), resolvePluginRoot(name, { trustedOnly: true })].filter(Boolean).map((r) => resolve(r)));
    for (const root of roots) out.push({ name, root });
  }
  return out;
}

function main() {
  const check = process.argv.includes("--check");
  let failed = false;
  for (const { name, root } of pluginRoots()) {
    const missing = missingDeps(root);
    if (!missing.length) { console.log(`[install-deps] ${name}: ok (${root})`); continue; }
    if (check) { console.log(`[install-deps] ${name}: MISSING ${missing.join(", ")} (${root})`); failed = true; continue; }
    try {
      execSync("npm install --omit=dev --no-audit --no-fund", { cwd: root, stdio: ["ignore", "ignore", "pipe"], timeout: 300000 });
      const still = missingDeps(root);
      if (still.length) throw new Error(`still missing: ${still.join(", ")}`);
      console.log(`[install-deps] ${name}: installed ${missing.join(", ")} (${root})`);
    } catch (e) {
      failed = true;
      console.error(`[install-deps] ${name}: ✗ npm install failed in ${root} — ${String(e.stderr || e.message).split("\n")[0]}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
