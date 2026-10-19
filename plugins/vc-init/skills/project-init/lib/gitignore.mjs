/**
 * skills/project-init/lib/gitignore.mjs
 *
 * The one place that decides WHAT /project-init generates must never be committed, and the one
 * function that writes it (VCST-5774 — defect D2).
 *
 * WHY IT IS A SHARED LIB AND NOT PART OF gen-mcp. The rule is "ignore the file BEFORE it exists",
 * and onboarding creates its secret-bearing files across FOUR scripts at four different steps:
 *
 *     §3a scaffold-env      → .env.<env>
 *     §3b scaffold-secrets  → .env.local          ← the densest secret file, and the one the
 *                                                    operator then hand-fills during a PAUSE
 *     §6  gen-profile       → project-profile.json
 *     §7  gen-mcp           → .mcp.json + .claude/settings.local.json
 *
 * While the block was written only by gen-mcp at §7, the guarantee held for exactly the two files
 * §7 creates. `.env.local` — which the operator is explicitly told to paste JIRA_API_TOKEN /
 * ADO_PAT / GITHUB_FIX_BUGS_TOKEN / passwords into, and which then sits there for as long as that
 * takes — was unprotected for the whole window, and stayed unprotected in every onboarding that
 * aborted before §7 (e.g. on a failed §4 live scan). Meanwhile the docblock, CHANGELOG and
 * SKILL.md all asserted the guarantee in full. That is the same false-comment shape the original
 * defect had, so the fix is to make the code match the claim rather than narrow the claim: every
 * writer calls `ensureProjectIgnores()` first, and because it is idempotent, calling it four
 * times costs one file read.
 *
 * RESIDUAL, stated rather than papered over: `.vc-fix/` is created by the SessionStart telemetry
 * hook, which can fire before any of these scripts run. Its entry is written by whichever of them
 * runs first, so a diagnostics dir can exist un-ignored until then. It holds redacted telemetry,
 * not credentials, so it is the acceptable one to leave.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, relative, isAbsolute, sep } from "path";

/** Everything onboarding generates that must never reach a commit. `.mcp.json` and
 *  `.claude/settings.local.json` are the credential-bearing pair; the rest is the other
 *  per-machine output. Entries are plain, project-relative gitignore patterns. */
export const SECRET_IGNORES = [
  ".mcp.json",
  ".claude/settings.local.json",
  ".env.local",
  ".env.*.local",
  "project-profile.json",
  ".vc-fix/",
];

/** Where the Playwright MCP servers land raw captures. Not secret — a landing zone, not evidence
 *  of record — but equally not something to commit. */
export const EVIDENCE_IGNORES = ["test-results/", "reports/bugs/screenshots/_incoming/"];

/** A generated destination as a project-relative ignore entry, or null when it lands OUTSIDE the
 *  project — where no .gitignore of ours can cover it, so the caller must say so out loud rather
 *  than write a `.mcp.json` line that silently protects the wrong path. The literals used to be
 *  hardcoded while `--out`/`--settings` were free to move the files. */
export function ignoreEntryFor(projectRoot, absPath) {
  const rel = relative(projectRoot, absPath);
  // Three ways `relative()` says "not under projectRoot", and only one of them looks like it:
  //   - "" — the destination IS the root, so there is no file here to ignore;
  //   - a ".." SEGMENT — above the root. Matched as a segment, not a prefix: a real directory
  //     named "..hidden" is genuinely inside the project and must keep its entry;
  //   - an ABSOLUTE path — Windows cross-drive, where no relative path can exist at all. This one
  //     passed the old `!startsWith("..")` test, so `--settings D:\x\s.json` from a C: project
  //     wrote the credential off-project, emitted NO warning, and added a "D:/x/s.json" line that
  //     can only ever match a literal directory named "D:".
  if (!rel || isAbsolute(rel)) return null;
  const parts = rel.split(sep);
  return parts.includes("..") ? null : parts.join("/");
}

/**
 * Append the ignore entries a destination implies, if missing. Idempotent, and it only ever
 * APPENDS a marked block — an existing .gitignore is never rewritten or reordered, and a project
 * with no .gitignore at all gets one. `title`/`notes` label the block so separate calls (secrets,
 * evidence) stay legible instead of merging into one unexplained list.
 */
export function ensureGitignoreEntries(root, entries, opts = {}) {
  const {
    title = "vc-fix (/project-init) — browser evidence landing zone",
    notes = [
      "The Playwright MCP servers write raw captures here; /qa-bug moves the ones it keeps",
      "into reports/bugs/screenshots/<bug-slug>/. Nothing here is evidence of record.",
    ],
  } = opts;
  const path = join(root, ".gitignore");
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const lines = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const missing = entries.filter((e) => !lines.has(e));
  if (!missing.length) return [];
  const block = [
    existing && !existing.endsWith("\n") ? "\n" : "",
    `\n# === ${title} ===\n`,
    ...notes.map((n) => `# ${n}\n`),
    missing.map((e) => `${e}\n`).join(""),
  ].join("");
  writeFileSync(path, existing + block);
  return missing;
}

/**
 * The call every /project-init writer makes BEFORE creating its file. Extra entries (a relocated
 * `--out`/`--settings` destination) are merged into the same block. Returns what was added, so a
 * caller can log it; returns [] when everything was already covered. Never throws on a read-only
 * .gitignore — a failure to protect must not abort onboarding silently, so it is reported.
 */
export function ensureProjectIgnores(projectRoot, extraEntries = []) {
  try {
    return ensureGitignoreEntries(projectRoot, [...new Set([...extraEntries.filter(Boolean), ...SECRET_IGNORES])], {
      title: "vc-fix (/project-init) — generated local config, never commit",
      notes: [
        "Per-machine onboarding output. .mcp.json references a credential via ${VAR}; the VALUE",
        "lives in .claude/settings.local.json `env` and .env.local. None of this belongs in git.",
      ],
    });
  } catch (e) {
    console.warn(`[project-init] ⚠ could not update ${join(projectRoot, ".gitignore")} (${e.message}) — add ${SECRET_IGNORES.join(", ")} by hand before committing anything.`);
    return [];
  }
}
