/**
 * sync-stdio — import FIRST in any CLI that writes to stdout and then calls `process.exit()`.
 *
 *   import "../lib/sync-stdio.mjs";
 *
 * WHY. On POSIX, Node writes to a PIPE asynchronously, and `process.exit()` does not wait for the
 * queue to drain. So `script --json | jq` (or `| node -e …`, or a CI step that pipes) silently loses
 * everything past the first pipe buffer — measured 2026-09-28 on `models:check -- --json`: cut at
 * exactly 65,536 of 66,284 bytes, an invalid JSON document, exit 0. A redirect to a file and a TTY are
 * already synchronous, which is why the bug hides in local runs.
 *
 * Making the two std streams blocking is the fix the `set-blocking` package applies (yargs, nyc): the
 * write returns only once the bytes are in the pipe, so an exit right after cannot drop them. It is a
 * no-op where the handle cannot block (a TTY, a file, a closed stream) and never throws.
 */
for (const stream of [process.stdout, process.stderr]) {
  try {
    const handle = /** @type {{ setBlocking?: (b: boolean) => void } | undefined} */ (stream._handle);
    if (handle && typeof handle.setBlocking === "function") handle.setBlocking(true);
  } catch {
    // A stream without a usable handle stays as it was — the fix is best-effort, never a new failure.
  }
}
