#!/usr/bin/env node
/**
 * Stop / SubagentStop hook — sweep stray screenshots out of the repo root.
 *
 * Why this exists: Playwright MCP resolves an explicit *relative* `filename`
 * against the server CWD (the repo root), and ignores the config `outputDir`
 * for that case. When a regression runner passes a bare name like
 * `cat016-chip-case.png` instead of the full
 * `reports/regression/<RUN_ID>/screenshots/...` path (test-runner-agent.md §8),
 * the PNG lands loosely in the repo root. `*.png` is gitignored, so it never
 * shows in `git status` — it just accumulates as clutter. This hook relocates
 * any such loose root image/HAR into the active run's screenshots folder after
 * each subagent (runner) and at session end.
 *
 * Only files git does NOT track are swept. The vc-fix plugin runs this hook
 * in every project the user opens, not just ai-tools, and a product repo may
 * commit images in its root (vc-frontend's README `demo.jpg` was moved away,
 * leaving it deleted in `git status`). A Playwright stray is never tracked, so
 * skipping tracked files loses nothing. If the root is not a git work tree or
 * git fails, nothing is swept: we cannot tell a stray from a committed file.
 * Never touches subdirectories. Always exits 0 — a hook must never fail the
 * agent.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { readdirSync, existsSync, mkdirSync, renameSync, readFileSync, statSync } from "node:fs";

const SWEEP_EXT = /\.(png|jpe?g|har)$/i;

try {
  const here = dirname(fileURLToPath(import.meta.url));      // .claude/hooks
  const root = resolve(here, "..", "..");                    // repo root

  // Loose image/HAR files directly in root (non-recursive).
  const candidates = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isFile() && SWEEP_EXT.test(e.name))
    .map((e) => e.name);

  if (candidates.length === 0) process.exit(0);

  // Skip anything git tracks. Throws (→ outer catch → exit 0, nothing moved)
  // when root is not a git work tree or git is unavailable.
  const tracked = new Set(
    execFileSync("git", ["ls-files", "-z", "--", ...candidates], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).split("\0"),
  );
  const strays = candidates.filter((name) => !tracked.has(name));

  if (strays.length === 0) process.exit(0);

  // Resolve destination: active run's screenshots dir, else a stray bucket.
  let dest = join(root, "reports", "regression", "_stray-screenshots");
  try {
    const statusPath = join(root, "reports", "regression", "test-run-status.json");
    if (existsSync(statusPath)) {
      const status = JSON.parse(readFileSync(statusPath, "utf8"));
      if (status?.outputDir) {
        dest = resolve(root, status.outputDir, "screenshots");
      }
    }
  } catch {
    /* fall back to the stray bucket */
  }

  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

  let moved = 0;
  for (const name of strays) {
    const src = join(root, name);
    let target = join(dest, name);
    // Avoid clobbering an existing file with the same bare name.
    if (existsSync(target)) {
      const ts = statSync(src).mtimeMs.toString(36);
      target = join(dest, name.replace(SWEEP_EXT, (m) => `-${ts}${m}`));
    }
    try {
      renameSync(src, target);
      moved++;
    } catch {
      /* skip a locked/in-use file; next sweep gets it */
    }
  }

  if (moved > 0) {
    console.error(`[sweep-stray-screenshots] moved ${moved} loose file(s) from repo root → ${dest}`);
  }
} catch {
  /* never fail the agent on a housekeeping hook */
}
process.exit(0);
