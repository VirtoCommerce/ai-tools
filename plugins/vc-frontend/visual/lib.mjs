// Shared by the PIXEL engine (snap.mjs, diff.mjs, affected.mjs, setup.mjs): blocking stdio, flag reading, and
// where the three npm packages come from.
//
// The engine ships inside the vc-frontend plugin because the plugin runs in a theme fork, which has neither the
// engine nor its packages. The same files serve ai-tools (`npm run visual:*`): one engine, no second copy.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// On POSIX, Node writes to a pipe asynchronously and process.exit() does not wait for it: `snap | tee` would lose
// the tail. Blocking stdio is the fix `set-blocking` applies; a no-op where the handle cannot block.
for (const stream of [process.stdout, process.stderr]) {
  try {
    const handle = stream._handle;
    if (handle && typeof handle.setBlocking === "function") handle.setBlocking(true);
  } catch {
    // best-effort, never a new failure
  }
}

/** Raw value following `flag`, or undefined when the flag is absent. */
export function flagValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Non-negative integer flag; anything else exits with `exitCode`. */
export function intFlag(argv, flag, fallback, exitCode = 1) {
  const raw = flagValue(argv, flag);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`✗ ${flag} expects a non-negative number, got "${raw}"`);
    process.exit(exitCode);
  }
  return n;
}

/** An unknown flag is a usage error: a typo that silently widens or narrows a run is the worst kind of quiet. */
export function rejectUnknownFlags(argv, known, valued = [], exitCode = 1) {
  const knownSet = new Set(known);
  const valuedSet = new Set(valued);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    if (!knownSet.has(a)) {
      console.error(`✗ unknown flag "${a}". Known: ${[...known].sort().join(" ")}`);
      process.exit(exitCode);
    }
    if (valuedSet.has(a)) i++;
  }
}

/**
 * Where `setup.mjs` installs the packages when the project does not have them: the repository's own
 * `node_modules/.cache/` (fork-drift.mjs caches there too) — never the fork's package.json, never the
 * plugin's install folder (read-only). `VC_VISUAL_DEPS` overrides it.
 */
export function depsDir() {
  if (process.env.VC_VISUAL_DEPS) return process.env.VC_VISUAL_DEPS;
  let root = process.cwd();
  try { root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* not a checkout */ }
  return join(root, "node_modules", ".cache", "vc-frontend-visual");
}

/**
 * Load one package: first as this file resolves it (an ai-tools checkout has them in its node_modules), then from
 * depsDir(). Exits 2 with the setup command when neither has it.
 */
export async function load(name) {
  try {
    return await import(name);
  } catch {
    const dir = depsDir();
    if (existsSync(join(dir, "node_modules", name))) return createRequire(join(dir, "package.json"))(name);
    console.error(`✗ "${name}" is not installed. Run once: node ${join(dirname(fileURLToPath(import.meta.url)), "setup.mjs")} (installs into ${dir})`);
    process.exit(2);
  }
}
