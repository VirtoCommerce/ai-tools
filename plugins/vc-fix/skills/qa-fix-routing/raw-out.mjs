/**
 * skills/qa-fix-routing/raw-out.mjs — where a token-holding CLI may write, and how much.
 *
 * `jira.mjs download` and `ado.mjs download-attachment` run through `$VC_RUN` with a tracker token in their
 * environment and a command line the caller wrote. So the file they save goes only inside
 * `<outputRoot>/.vc-fix/` (working state, never the project's sources or anything outside the project),
 * checked after resolving links, and the bytes are counted as they arrive: a declared size is the
 * tracker's word, the bytes read are ours (the same rule as /ticket-context's readCapped).
 */
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, realpathSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { outputRoot } from "../../scripts/lib/run-dir.mjs";

const within = (base, path) => {
  const rel = relative(base, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/** The nearest existing ancestor of `p` (itself when it exists). */
function nearestExisting(p) {
  let dir = p;
  while (!existsSync(dir)) {
    const up = dirname(dir);
    if (up === dir) return dir;
    dir = up;
  }
  return dir;
}

/**
 * The absolute path for `--out`, which must lie inside `<root>/.vc-fix/` — lexically, and after resolving
 * the nearest existing folder on the way (a link or junction cannot lead out). Missing folders under
 * `.vc-fix/` are created only after the check.
 * @returns {string}
 */
export function rawOutPath(out, root = outputRoot()) {
  const refuse = () => {
    throw new Error(`--out must be inside ${resolve(root, ".vc-fix")}/ (got ${JSON.stringify(String(out))})`);
  };
  if (typeof out !== "string" || !out.trim()) refuse();
  const base = resolve(root, ".vc-fix");
  const abs = resolve(root, out);
  if (!within(base, abs)) refuse();
  mkdirSync(base, { recursive: true });
  const realBase = realpathSync.native(base);
  const realParent = realpathSync.native(nearestExisting(dirname(abs)));
  if (realParent !== realBase && !within(realBase, realParent)) refuse();
  mkdirSync(dirname(abs), { recursive: true });
  return abs;
}

export const FETCH_TIMEOUT_MS = 30_000; // a JSON read — /ticket-context's CAPS.fetchTimeoutMs
export const DOWNLOAD_TIMEOUT_MS = 120_000; // an attachment, body included — CAPS.downloadTimeoutMs

const isTimeout = (e) => e?.name === "TimeoutError" || e?.name === "AbortError";
const timedOut = (label, ms) => new Error(`${label} timed out after ${ms / 1000} s`);

/**
 * fetch() that never hangs: the whole exchange, body included, is aborted after `ms`, and the abort is one
 * readable error. A stalled tracker must not leave a token-holding process running.
 */
export async function timedFetch(url, opts = {}, ms = FETCH_TIMEOUT_MS, label = "the request") {
  try {
    return await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    throw isTimeout(e) ? timedOut(label, ms) : e;
  }
}

/**
 * Stream a fetch Response's body to `file`, at most `maxBytes`. A declared Content-Length over the cap, or
 * more bytes than the cap, throws `over-cap`. The bytes go to a fresh sibling file opened exclusively and
 * renamed over `file` only when complete: a rename replaces the directory entry, so a link already at
 * `file` (symbolic or hard) is never written through, and a good file there survives a failed download.
 * @returns {Promise<{ bytes: number, contentType: string|null }>}
 */
export async function writeCapped(res, file, maxBytes) {
  const over = () => new Error(`over-cap: more than ${maxBytes} bytes`);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw over();
  const part = `${file}.part-${process.pid}-${randomBytes(4).toString("hex")}`;
  const fd = openSync(part, "wx");
  let bytes = 0;
  let failed = null;
  try {
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          failed = over();
          await reader.cancel().catch(() => {});
          break;
        }
        writeSync(fd, value);
      }
    }
  } catch (e) {
    failed = isTimeout(e) ? new Error("the download timed out") : e;
  } finally {
    closeSync(fd);
  }
  if (failed) {
    try {
      unlinkSync(part);
    } catch {
      /* already gone */
    }
    throw failed;
  }
  renameSync(part, file);
  return { bytes, contentType: res.headers.get("content-type") };
}
