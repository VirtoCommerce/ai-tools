// .claude/skills/ticket-context/lib/paths.mjs — C4. Two roots, as plugins/CLAUDE.md defines them:
// outputRoot() is where state goes (the project), skillRoot() is where this skill's own files live.
// Same rule as plugins/vc-init/skills/project-init/lib/paths.mjs, copied (M1: no import across the boundary).
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const KEY_RE = /^[A-Z][A-Z0-9]*-\d+$/;
export const RUN_TTL_MS = 24 * 3600 * 1000;
// The two run-dir shapes, anchored. The temp fallback is mkdtemp's: the prefix plus exactly six [A-Za-z0-9].
const RUN_NAME = /^run-(\d+)$/;
const TMP_RUN_NAME = /^ticket-context-([A-Z][A-Z0-9]*-\d+)-[A-Za-z0-9]{6}$/;
const isRealDir = (p) => { try { const st = lstatSync(p); return st.isDirectory() && !st.isSymbolicLink(); } catch { return false; } };

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
  if (typeof ignored !== "function") throw new Error(`newRunDir: missing required option "ignored" (must be a function)`);
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
    const m = RUN_NAME.exec(name);
    if (m && now - Number(m[1]) > RUN_TTL_MS && isRealDir(join(base, name))) { rmSync(join(base, name), { recursive: true, force: true }); n++; }
  }
  return n;
}

/** S3: both shapes of a stale run dir for this key — <root>/.vc-fix/context/<KEY>/run-<stamp> by its stamp, and
 *  <tmp>/ticket-context-<KEY>-XXXXXX by its mtime. Older than 24 h only; nothing else is ever touched. */
export function sweepStaleRuns(key, { root = outputRoot(), now = Date.now(), tmp = tmpdir() } = {}) {
  assertKey(key);
  let n = sweepRunDirs(cacheDir(key, root), now);
  let names = [];
  try { names = readdirSync(tmp); } catch { return n; }
  for (const name of names) {
    if (TMP_RUN_NAME.exec(name)?.[1] !== key) continue;
    const p = join(tmp, name);
    try { if (isRealDir(p) && now - lstatSync(p).mtimeMs > RUN_TTL_MS) { rmSync(p, { recursive: true, force: true }); n++; } } catch { /* raced or locked: the next prepare retries */ }
  }
  return n;
}

/** Remove a run dir — only one this skill made. Anything else is refused, never deleted. */
export function removeRunDir(dir, root = outputRoot()) {
  const resolved = resolve(dir);
  const tmp = resolve(tmpdir());

  // Check if path matches <root>/.vc-fix/context/<KEY>/run-<digits> exactly
  const contextBase = resolve(join(root, ".vc-fix", "context"));
  if (resolved.startsWith(contextBase + sep)) {
    const rel = relative(contextBase, resolved);
    const m = /^([A-Z][A-Z0-9]*-\d+)[/\\]run-(\d+)$/.exec(rel);
    if (m) {
      rmSync(resolved, { recursive: true, force: true });
      return;
    }
  }

  // Check if path matches <tmpdir>/ticket-context-<KEY>-XXXXXX exactly (mkdtemp's shape, one level deep)
  if (resolved.startsWith(tmp + sep)) {
    const rel = relative(tmp, resolved);
    if (TMP_RUN_NAME.test(rel)) {
      rmSync(resolved, { recursive: true, force: true });
      return;
    }
  }

  throw new Error(`refusing to delete ${resolved}: not a ticket-context run dir`);
}
