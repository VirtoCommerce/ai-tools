# plugins/ — working on the distributed plugins

Loaded when working under `plugins/`. Repo-wide rules (incl. the self-diagnostics lock-step rule and
per-plugin versioning/tagging) stay in the root `CLAUDE.md` §Project Overview.

## Why `vc-fix` duplicates rather than references the repo root

Claude Code doesn't document a reliable way for a plugin's commands/skills to resolve bare relative paths against "wherever the plugin got installed" (no `${CLAUDE_PLUGIN_ROOT}`-equivalent; paths resolve against the *user's* CWD, which may be an unrelated project) — see `plugins/vc-fix/skills/qa-fix-routing/SKILL.md` for the finding. `qa-fix-routing/` additionally resolves its own data-file paths (`fix-repos.json`, `.module-registry.cache.json`) off `import.meta.url` rather than `process.cwd()`, so at least that piece works regardless of working directory. `/project-init`'s own onboarding flow (now the `vc-init` plugin) handles the same split explicitly: `plugins/vc-init/skills/project-init/lib/paths.mjs` separates `outputRoot()` (`VC_FIX_HOME || process.cwd()` — where ALL generated project state lands, symmetric with the readers) from `pluginRoot()` (`CLAUDE_PLUGIN_ROOT ||` resolved-from-`import.meta.url` — read-only plugin assets, never a write target), so an installed plugin writes `project-profile.json`/`.env.*`/`.mcp.json` into the *project*, not the versioned marketplace cache. `gen-mcp` copies the Playwright MCP configs into the project's `config/` because `${CLAUDE_PLUGIN_ROOT}` does not expand inside a project-level `.mcp.json`.

## `vc-init` — onboarding, the profile's only writer, and the token bridge

`/project-init` lives here since VCST-6402 (it was vc-fix's), so vc-perf no longer pulls all of vc-fix just to onboard. Three things are this plugin's alone:

- **The profile.** vc-init writes `project-profile.json` (`gen-profile`, `reconcile-profile`, and `profile-set.mjs` for the other plugins — `/qa-bug`'s first-run field answers, `/perf-init`'s `perf` block). vc-fix and vc-perf carry read-only loader copies (`plugins/vc-fix/scripts/lib/project-profile.mjs`, `plugins/vc-perf/scripts/profile-get.mjs`) that STOP on a missing profile or an unknown `schemaVersion`; a field added to vc-init's `PROFILE_DEFAULTS` is added to vc-fix's copy in the same commit.
- **The token bridge.** No GitHub / Azure DevOps / Jira token is in a file. The operator stores each PAT in `vc-secrets`; `write-secrets-decl.mjs` declares the `vc-init-<group>` tasks; every token-holding call runs as `node "$VC_RUN" <tool> …`, where `$VC_RUN` is a stable shim (`vc-run-shim.mjs` → `~/.claude/plugins/data/vc-init-ai-tools/vc-run.mjs`) that resolves the current install and dispatches through `bridge/run.mjs` — an allowlist, a host-pinned git credential helper, an allowlisted child env and output redaction. Test-user passwords may live there too (`lib/passwords.mjs`): one secret per password per env, and the Playwright lanes run as `node "$VC_RUN" playwright <lane>` → the vc-secrets server `playwright-<lane>.<env>` → `bridge/playwright-mcp.mjs`, which hands them to Playwright MCP as `config.secrets` with no `--secrets` file. `plugins/vc-init/bridge/` is the one place under `plugins/` besides vc-secrets with committed unit tests (root `CLAUDE.md` §Essential Rules).
- **Duplication, as vc-fix.** vc-init carries its own copies of the libs `/project-init` needs (`scripts/lib/`) and resolves a sibling plugin's files through `bridge/resolve-plugin.mjs` (a checkout sibling, the install registry, the cache) — never a relative path into another plugin.

## `vc-perf` — the three layers

**L1** BenchmarkDotNet A/B, **L2** a k6 load harness + `dotnet-counters`, **L3** `dotnet-trace` allocation/CPU/DB attribution, plus a `perf-analyst` agent that ranks optimization candidates and a `perf-loop` orchestrator.
