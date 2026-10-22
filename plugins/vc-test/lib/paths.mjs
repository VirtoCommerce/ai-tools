// plugins/vc-test/lib/paths.mjs — where vc-test's working state lands (plugins/CLAUDE.md: outputRoot vs pluginRoot).
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const KEY_RE = /^[A-Z][A-Z0-9]*-\d+$/;
export function outputRoot() { return process.env.VC_FIX_HOME ? resolve(process.env.VC_FIX_HOME) : process.cwd(); }
export function workDir(key, root = outputRoot()) {
  if (!KEY_RE.test(String(key))) throw new Error(`not a ticket key: "${key}"`);
  const dir = join(root, ".vc-fix", "vc-test", key);
  mkdirSync(dir, { recursive: true });
  return dir;
}
export function argOf(argv, name) { const i = argv.indexOf(`--${name}`); return i < 0 ? undefined : argv[i + 1]; }
