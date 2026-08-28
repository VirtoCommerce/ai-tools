/**
 * skills/kb/kb-paths.mjs — the two roots this toolchain distinguishes, kept apart
 * for the same reason `skills/project-init/lib/paths.mjs` keeps its pair apart.
 *
 *   skillDir()      — THIS directory, resolved from `import.meta.url` (the
 *                     `skills/qa-fix-routing/skill-dir.ts` pattern). Every sibling
 *                     module and bundled data file is located from here, so a `kb`
 *                     module invoked by absolute path from an unrelated CWD still
 *                     finds its own files. Never a write target.
 *
 *   outputRoot()    — where PROJECT state lives (`.knowledge/platform`,
 *                     `.knowledge/client`). `VC_FIX_HOME || process.cwd()`, the same
 *                     definition `project-init/lib/paths.mjs` uses, so the readers
 *                     and the writers agree on one directory.
 *
 * A knowledge ROOT is a directory carrying `brain.json`. It is passed explicitly to
 * every module (`--root`); the helpers below only supply the defaults.
 */
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

/** This skill's own directory — CWD-independent. */
export const SKILL_DIR = dirname(fileURLToPath(import.meta.url));

/** Root for generated project state; symmetric with every reader. */
export function outputRoot() {
  return process.env.VC_FIX_HOME ? resolve(process.env.VC_FIX_HOME) : process.cwd();
}

/** Default local cache of the read-only platform brain (pinned to a commit). */
export function platformRoot() {
  return process.env.VC_KB_PLATFORM_ROOT
    ? resolve(process.env.VC_KB_PLATFORM_ROOT)
    : join(outputRoot(), ".knowledge", "platform");
}

/** Default working copy of the client brain (the only writable root on a client install). */
export function clientRoot() {
  return process.env.VC_KB_CLIENT_ROOT
    ? resolve(process.env.VC_KB_CLIENT_ROOT)
    : join(outputRoot(), ".knowledge", "client");
}

/** Standard sub-paths of a root. Single-sourced so no module hardcodes a layout. */
export const LAYOUT = {
  brain: "brain.json",
  confirmed: "confirmed",
  drafts: "drafts",
  index: "knowledge-index.json",
  goldens: join("exam", "goldens.json"),
  history: join("exam", "history.jsonl"),
  tombstones: join("drafts", ".tombstones.json"),
  digest: "digest",
};

export const p = (root, key) => join(root, LAYOUT[key]);

/**
 * Read a root's `brain.json`. It declares the root's `scope` and whether it is
 * writable — the pinned platform cache always sets `"readOnly": true`, which is what
 * makes "a client context never writes to a platform brain" a property of the data
 * rather than of the caller's care.
 * @returns {{scope: string, readOnly: boolean, name?: string, version?: number}|null}
 */
export function readBrain(root) {
  const file = p(root, "brain");
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return {
      ...raw,
      scope: String(raw.scope || ""),
      readOnly: raw.readOnly === true,
    };
  } catch {
    return null;
  }
}

/** Thrown when a write or an emit would cross the platform/client boundary (§2a). */
export class KbContainmentError extends Error {
  constructor(message) {
    super(message);
    this.name = "KbContainmentError";
    this.code = "KB_CONTAINMENT";
  }
}

/**
 * Refuse a write into a root that declares itself read-only, or a client-scope write
 * into a platform brain. Called by every writer (capture, consolidate) BEFORE it
 * touches the filesystem.
 */
export function assertWritable(root, entryScope) {
  const brain = readBrain(root);
  if (!brain) {
    throw new KbContainmentError(
      `${root} is not a knowledge root (no brain.json) — refusing to write into an undeclared directory.`,
    );
  }
  if (brain.readOnly) {
    throw new KbContainmentError(
      `${root} declares readOnly:true (a pinned platform cache) — this toolchain never writes to a platform brain.`,
    );
  }
  if (entryScope && brain.scope === "platform" && entryScope === "client") {
    throw new KbContainmentError(
      `refusing to write a scope:client entry into the platform brain at ${root} — client knowledge crosses the boundary only through the promotion contract.`,
    );
  }
  return brain;
}
