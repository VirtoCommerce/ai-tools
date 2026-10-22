// plugins/vc-test/lib/paths.mjs — where vc-test's working state lands (plugins/CLAUDE.md: outputRoot vs pluginRoot).
// One folder per ticket AND env, as the run folder is: a ledger written on one stand is never read against another.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { TEST_ENV_PATTERN, testEnvChoice } from "../../../scripts/lib/resolve-test-env.js"; // prototype: runs from an ai-tools checkout

export const KEY_RE = /^[A-Z][A-Z0-9]*-\d+$/;
export function outputRoot() { return process.env.VC_FIX_HOME ? resolve(process.env.VC_FIX_HOME) : process.cwd(); }
// The env config.js would load: TEST_ENV, else this session's binding, else the checkout default.
export function currentEnv() { return process.env.TEST_ENV?.trim() || testEnvChoice().env; }
export function workDir(key, { env = currentEnv(), root = outputRoot() } = {}) {
  if (!KEY_RE.test(String(key))) throw new Error(`not a ticket key: "${key}"`);
  if (!TEST_ENV_PATTERN.test(String(env))) throw new Error(`not a TEST_ENV name: "${env}"`);
  const dir = join(root, ".vc-fix", "vc-test", key, env);
  mkdirSync(dir, { recursive: true });
  return dir;
}
export function argOf(argv, name) { const i = argv.indexOf(`--${name}`); return i < 0 ? undefined : argv[i + 1]; }
