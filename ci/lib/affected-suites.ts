/**
 * affected-suites — turn a free-text `CHANGE_SOURCE` into a deterministic suite selection.
 *
 * `ci/run-full-cycle.ts` is driven by `CHANGE_SOURCE`, which is prose: `"PR #123"`, `"diff"`,
 * `"module catalog"`, `"changelog 3.1061.0"`. Phase 1 used to hand that to an agent and parse
 * `AFFECTED_SUITES:` out of its reply — and a model asked to name suite ids will name plausible
 * ones (the `REG-2026-08-24-1806` notes carry 32 claimed case ids that do not exist, each exactly
 * the next sequential number after a real suite's maximum).
 *
 * So this places the change instead, and the one rule that matters is: **it returns null rather
 * than guessing.** An unplaceable `CHANGE_SOURCE` must fall back to the configured
 * `SUITE_SELECTION`, because an unplaceable change is precisely when a wrong-but-plausible
 * selection is least likely to be questioned.
 *
 * What it can place today:
 *
 *   `diff` | `diff <range>` | a bare `a..b` range → this repo's own git diff
 *   `module <name>`                              → `vc-module-<name>`
 *   `PR #<n>` / a PR URL                         → NULL. The file list needs a GitHub call this
 *                                                  module deliberately does not make; guessing a
 *                                                  repo from a PR number would be inventing.
 */

import { execFileSync } from "node:child_process";

import { classifyLane } from "./lane-classifier.js";
import { loadManifest } from "./suite-manifest.js";
import { resolveSuiteSource } from "../../scripts/test-cases/suite-source-map.js";
import { selectSuites, type ChangedPath, type SelectableSuite } from "../../scripts/lib/suite-selection.js";

const CONCURRENCY = { browser: 3, fastpath: 4, deterministic: 2 } as const;
const SELF_REPO = "vc-mcp-testing-module";

export interface PlacedChange {
  readonly repo: string;
  readonly paths: readonly string[];
  /** How it was placed, for the log — never a guess left unexplained. */
  readonly via: string;
}

const RANGE_RE = /^[\w./-]+\.\.\.?[\w./-]+$/;

/**
 * Place a `CHANGE_SOURCE`. Returns null when it cannot be placed — see the header.
 *
 * `readDiff` is injected so the tests never shell out to git.
 */
export function placeChange(
  changeSource: string,
  readDiff: (range: string) => string[] = defaultReadDiff,
): PlacedChange | null {
  const src = (changeSource ?? "").trim();
  if (!src) return null;

  const moduleMatch = /^module\s+([A-Za-z0-9._-]+)$/i.exec(src);
  if (moduleMatch) {
    const name = moduleMatch[1].toLowerCase();
    // The module NAME is the path here: the selector's tokeniser reads it exactly as it reads a
    // real path segment, so `module catalog` and `.../CatalogModule.Data/...` narrow the same way.
    return { repo: `vc-module-${name}`, paths: [name], via: `module name '${name}'` };
  }

  const diffMatch = /^diff(?:\s+(.+))?$/i.exec(src);
  if (diffMatch) {
    const range = diffMatch[1]?.trim() || "HEAD~1..HEAD";
    const paths = readDiff(range);
    return { repo: SELF_REPO, paths, via: `git diff ${range} (${paths.length} path(s))` };
  }

  if (RANGE_RE.test(src)) {
    const paths = readDiff(src);
    return { repo: SELF_REPO, paths, via: `git diff ${src} (${paths.length} path(s))` };
  }

  // PR references, changelog versions, ticket keys: a real file list exists but not here.
  return null;
}

function defaultReadDiff(range: string): string[] {
  try {
    // No shell — the range is an argv element, so metacharacters cannot become a command.
    const out = execFileSync("git", ["diff", "--name-only", range], { encoding: "utf-8" });
    return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export interface AffectedSuites {
  readonly ids: readonly string[];
  readonly note: string;
  readonly excludedIds: readonly string[];
}

/**
 * The deterministic replacement for the parsed `AFFECTED_SUITES:` line.
 *
 * Returns null when the change cannot be placed, so the caller keeps its configured selection
 * instead of silently running a narrower set.
 */
export function selectAffectedSuites(
  changeSource: string,
  opts: { targetMinutes?: number | null; readDiff?: (range: string) => string[] } = {},
): AffectedSuites | null {
  const placed = placeChange(changeSource, opts.readDiff);
  if (!placed) return null;

  const manifest = loadManifest();
  const suites: SelectableSuite[] = manifest.suites.map((s) => {
    const raw = s as unknown as Record<string, unknown>;
    return {
      id: s.id,
      name: s.name,
      file: s.file,
      domain: raw.domain as string | undefined,
      layer: raw.layer as string | undefined,
      priority: raw.priority as string | undefined,
      tags: raw.tags as string[] | undefined,
      testCount: s.testCount,
      estimatedMinutes: raw.estimatedMinutes as number | undefined,
      clickDriven: raw.clickDriven as boolean | undefined,
      runner: raw.runner as string | undefined,
      preferredBrowser: raw.preferredBrowser as string | undefined,
      lane: classifyLane({ file: s.file, runner: raw.runner as string | undefined }),
    };
  });

  const suiteRepos = new Map<string, readonly string[]>();
  for (const s of manifest.suites) {
    const raw = s as unknown as Record<string, unknown>;
    suiteRepos.set(s.id, resolveSuiteSource(s.id, (raw.requiresModules as string[] | undefined) ?? []).repos);
  }

  const changed: ChangedPath[] = placed.paths.map((p) => ({ repo: placed.repo, path: p }));
  const result = selectSuites({
    suites,
    changed,
    suiteRepos,
    rotation: suites.map((s) => s.id),
    rotationCount: 0, // CI runs the change scope + risk floor; rotation is the scheduled audit's job
    targetMinutes: opts.targetMinutes ?? null,
    concurrency: CONCURRENCY,
  });

  const parts = [
    placed.via,
    `${result.selected.length} suite(s)`,
    `predicted ${result.predictedMakespanMinutes} min of ${result.fullMakespanMinutes}`,
  ];
  if (result.widened) parts.push("WIDENED (nothing narrowed)");
  if (result.unmappedPaths.length > 0) parts.push(`${result.unmappedPaths.length} unmapped path(s)`);

  return {
    ids: result.selected.map((s) => s.id),
    note: parts.join("; "),
    excludedIds: result.excluded.map((s) => s.id),
  };
}
