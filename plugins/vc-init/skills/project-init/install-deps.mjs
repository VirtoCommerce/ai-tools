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
 * For EVERY installed and enabled plugin of this marketplace (found at run time, not a fixed list): if any
 * runtime dependency is missing from its node_modules, run `npm install --omit=dev` there. Prints one line per plugin; exit 1 when an install
 * failed. `--check` installs nothing and exits 1 when something is missing.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ownMarketplace, resolvePluginRoot } from "../../bridge/resolve-plugin.mjs";

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

/**
 * The plugins of this marketplace that are installed and enabled: `claude plugin list --json`, else the
 * install registry. Not a fixed list — a plugin added to the marketplace later is covered without a change
 * here. Plugins from other marketplaces are not ours to install into.
 */
export function installedPlugins({ home = process.env.HOME || os.homedir(), marketplace = ownMarketplace() } = {}) {
  const suffix = `@${marketplace}`;
  try {
    const list = JSON.parse(execSync("claude plugin list --json", { stdio: ["ignore", "pipe", "ignore"], timeout: 20000 }).toString());
    if (Array.isArray(list)) {
      return list.filter((x) => x && x.enabled && String(x.id || "").endsWith(suffix) && x.installPath)
        .map((x) => ({ name: String(x.id).slice(0, -suffix.length), root: x.installPath }));
    }
  } catch {
    /* no claude CLI in this shell — the registry below */
  }
  try {
    const reg = JSON.parse(readFileSync(join(home, ".claude", "plugins", "installed_plugins.json"), "utf8"));
    return Object.entries(reg?.plugins || {}).filter(([id]) => id.endsWith(suffix)).flatMap(([id, recs]) =>
      (Array.isArray(recs) ? recs : []).filter((r) => r && typeof r.installPath === "string").map((r) => ({ name: id.slice(0, -suffix.length), root: r.installPath })));
  } catch {
    return [];
  }
}

/**
 * Every folder an installed plugin's code may run from: its install path, what the resolver picks, and the
 * bridge's trusted pick (the newest version beside this install) — deduplicated.
 */
export function pluginRoots() {
  const seen = new Set();
  const out = [];
  const push = (name, root) => {
    if (!root || !existsSync(join(root, "package.json"))) return;
    const r = resolve(root);
    if (seen.has(r.toLowerCase())) return;
    seen.add(r.toLowerCase());
    out.push({ name, root: r });
  };
  push("vc-init", resolvePluginRoot("vc-init"));
  for (const { name, root } of installedPlugins()) {
    push(name, root);
    push(name, resolvePluginRoot(name));
    push(name, resolvePluginRoot(name, { trustedOnly: true }));
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
