// .claude/skills/ticket-context/lib/paths.mjs — C4. Two roots, as plugins/CLAUDE.md defines them:
// outputRoot() is where state goes (the project), skillRoot() is where this skill's own files live.
// Same rule as plugins/vc-fix/skills/project-init/lib/paths.mjs, copied (M1: no import across the boundary).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const KEY_RE = /^[A-Z][A-Z0-9]*-\d+$/;
export const RUN_TTL_MS = 24 * 3600 * 1000;

export function assertKey(key) { if (!KEY_RE.test(String(key))) throw new Error(`not a ticket key: "${key}"`); }
export function outputRoot() { return process.env.VC_FIX_HOME ? resolve(process.env.VC_FIX_HOME) : process.cwd(); }
export function skillRoot() { return resolve(dirname(fileURLToPath(import.meta.url)), ".."); }
export function cacheDir(key, root = outputRoot()) { assertKey(key); return join(root, ".vc-fix", "context", key); }
export function isInside(parent, child) {
  const r = relative(resolve(parent), resolve(child));
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}

/** A fresh run dir under the key's context dir when that path is git-ignored (S3), else under the OS temp dir. */
export function newRunDir(key, { root = outputRoot(), ignored, now = Date.now() } = {}) {
  const base = cacheDir(key, root);
  if (ignored(join(base, "run-probe"))) {
    mkdirSync(base, { recursive: true });
    sweepRunDirs(base, now);
    const dir = join(base, `run-${now}`);
    mkdirSync(dir);
    return { dir, inProject: true };
  }
  return { dir: mkdtempSync(join(tmpdir(), `ticket-context-${key}-`)), inProject: false };
}

/** Delete run dirs a crashed run left behind. Returns how many were removed. */
export function sweepRunDirs(base, now = Date.now()) {
  if (!existsSync(base)) return 0;
  let n = 0;
  for (const name of readdirSync(base)) {
    const m = /^run-(\d+)$/.exec(name);
    if (m && now - Number(m[1]) > RUN_TTL_MS) { rmSync(join(base, name), { recursive: true, force: true }); n++; }
  }
  return n;
}

/** Remove a run dir — only one this skill made. Anything else is refused, never deleted. */
export function removeRunDir(dir, root = outputRoot()) {
  const inContext = isInside(join(root, ".vc-fix", "context"), dir) && /run-\d+$/.test(dir);
  const inTemp = isInside(tmpdir(), dir) && /ticket-context-/.test(dir);
  if (!inContext && !inTemp) throw new Error(`refusing to delete ${dir}: not a ticket-context run dir`);
  rmSync(dir, { recursive: true, force: true });
}
