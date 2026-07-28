// Shared test helpers for the vc-fix self-diagnostics unit tests (PR #143 R2 Suggestion 6):
// collapses the repeated `mkdtempSync(...) → try { … } finally { rmSync(...) }` boilerplate that
// was duplicated across the deliver-* / telemetry tests into one place.
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Run `fn(dir)` in a fresh temp directory, always removed afterward (even on throw). */
export function withTempDir(fn, prefix = "vc-fix-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Run `fn(home)` with `VC_FIX_HOME` pointed at a fresh temp dir, restoring the previous value
 * and removing the dir afterward. Supports an async `fn` (awaits before cleanup).
 */
export async function withTempHome(fn, prefix = "vc-fix-test-") {
  const prev = process.env.VC_FIX_HOME;
  const dir = mkdtempSync(join(tmpdir(), prefix));
  process.env.VC_FIX_HOME = dir;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.VC_FIX_HOME;
    else process.env.VC_FIX_HOME = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}
