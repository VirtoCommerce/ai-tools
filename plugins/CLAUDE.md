# plugins/ — working on the distributed plugins

Loaded when working under `plugins/`. Repo-wide rules (incl. the self-diagnostics lock-step rule and
per-plugin versioning/tagging) stay in the root `CLAUDE.md` §Project Overview.

## Why `vc-fix` duplicates rather than references the repo root

Claude Code doesn't document a reliable way for a plugin's commands/skills to resolve bare relative paths against "wherever the plugin got installed" (no `${CLAUDE_PLUGIN_ROOT}`-equivalent; paths resolve against the *user's* CWD, which may be an unrelated project) — see `plugins/vc-fix/skills/qa-fix-routing/SKILL.md` for the finding. `qa-fix-routing/` additionally resolves its own data-file paths (`fix-repos.json`, `.module-registry.cache.json`) off `import.meta.url` rather than `process.cwd()`, so at least that piece works regardless of working directory. `/project-init`'s own onboarding flow now handles the same split explicitly: `plugins/vc-fix/skills/project-init/lib/paths.mjs` separates `outputRoot()` (`VC_FIX_HOME || process.cwd()` — where ALL generated project state lands, symmetric with the readers) from `pluginRoot()` (`CLAUDE_PLUGIN_ROOT ||` resolved-from-`import.meta.url` — read-only plugin assets, never a write target), so an installed plugin writes `project-profile.json`/`.env.*`/`.mcp.json` into the *project*, not the versioned marketplace cache. `gen-mcp` copies the Playwright MCP configs into the project's `config/` because `${CLAUDE_PLUGIN_ROOT}` does not expand inside a project-level `.mcp.json`.

## `vc-perf` — the three layers

**L1** BenchmarkDotNet A/B, **L2** a k6 load harness + `dotnet-counters`, **L3** `dotnet-trace` allocation/CPU/DB attribution, plus a `perf-analyst` agent that ranks optimization candidates and a `perf-loop` orchestrator.
