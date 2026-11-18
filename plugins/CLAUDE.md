# plugins/ — working on the distributed plugins

Loaded when working under `plugins/`. Repo-wide rules (incl. the self-diagnostics lock-step rule and
per-plugin versioning/tagging) stay in the root [`../CLAUDE.md`](../CLAUDE.md) §Project Overview.
The roster is [`../.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json); `vc-secrets`,
`vc-frontend` and `vc-test` are described by their own `README.md` — the sections below hold only what bites
when you edit them.

## Why `vc-fix` duplicates rather than references the repo root

Claude Code doesn't document a reliable way for a plugin's commands/skills to resolve bare relative paths against "wherever the plugin got installed" (no `${CLAUDE_PLUGIN_ROOT}`-equivalent; paths resolve against the *user's* CWD, which may be an unrelated project) — see `plugins/vc-fix/skills/qa-fix-routing/SKILL.md` for the finding. `qa-fix-routing/` additionally resolves its own data-file paths (`fix-repos.json`, `.module-registry.cache.json`) off `import.meta.url` rather than `process.cwd()`, so at least that piece works regardless of working directory. `/project-init`'s own onboarding flow (now the `vc-init` plugin) handles the same split explicitly: `plugins/vc-init/skills/project-init/lib/paths.mjs` separates `outputRoot()` (`VC_FIX_HOME || process.cwd()` — where ALL generated project state lands, symmetric with the readers) from `pluginRoot()` (`CLAUDE_PLUGIN_ROOT ||` resolved-from-`import.meta.url` — read-only plugin assets, never a write target), so an installed plugin writes `project-profile.json`/`.env.*`/`.mcp.json` into the *project*, not the versioned marketplace cache. `gen-mcp` copies the Playwright MCP configs into the project's `config/` because `${CLAUDE_PLUGIN_ROOT}` does not expand inside a project-level `.mcp.json`.

## `vc-init` — onboarding, the profile's only writer, and the token bridge

`/project-init` lives here since VCST-6402 (it was vc-fix's), so vc-perf no longer pulls all of vc-fix just to onboard. Three things are this plugin's alone:

- **The profile.** vc-init writes `project-profile.json` (`gen-profile`, `reconcile-profile`, and `profile-set.mjs` for the other plugins — `/qa-bug`'s first-run field answers, `/perf-init`'s `perf` block). vc-fix, vc-perf and vc-test carry read-only loader copies (`plugins/vc-fix/scripts/lib/project-profile.mjs`, `plugins/vc-perf/scripts/profile-get.mjs`, `plugins/vc-test/lib/profile.mjs`) that STOP on a missing profile or an unknown `schemaVersion`; a field added to vc-init's `PROFILE_DEFAULTS` is added to vc-fix's copy in the same commit.
- **The token bridge.** No GitHub / Azure DevOps / Jira token is in a file. The operator stores each PAT in `vc-secrets`; `write-secrets-decl.mjs` declares the `vc-init-<group>` tasks; every token-holding call runs as `node "$VC_RUN" <tool> …`, where `$VC_RUN` is a stable shim (`vc-run-shim.mjs` → `~/.claude/plugins/data/vc-init-ai-tools/vc-run.mjs`) that resolves the current install and dispatches through `bridge/run.mjs` — an allowlist, a host-pinned git credential helper, an allowlisted child env and output redaction. Test-user passwords may live there too (`lib/passwords.mjs`): one secret per password per env, and the Playwright lanes run as `node "$VC_RUN" playwright <lane>` → the vc-secrets server `playwright-<lane>.<env>` → `bridge/playwright-mcp.mjs`, which hands them to Playwright MCP as `config.secrets` with no `--secrets` file. `plugins/vc-init/bridge/` is the one place under `plugins/` besides vc-secrets with committed unit tests (root [`../CLAUDE.md`](../CLAUDE.md) §Essential Rules).
- **Duplication, as vc-fix.** vc-init carries its own copies of the libs `/project-init` needs (`scripts/lib/`) and resolves a sibling plugin's files through `bridge/resolve-plugin.mjs` (a checkout sibling, the install registry, the cache) — never a relative path into another plugin.

## `vc-perf` — the three layers

**L1** BenchmarkDotNet A/B, **L2** a k6 load harness + `dotnet-counters`, **L3** `dotnet-trace` allocation/CPU/DB attribution, plus a `perf-analyst` agent that ranks optimization candidates and a `perf-loop` orchestrator.

## `vc-test` — the preview testing flow

`/vc-test:ticket-context` → `/vc-test:qa-test-strategy` → `/vc-test:qa-ticket`, plus the visual lane (`/vc-test:qa-design`) and triage (`/vc-test:qa-triage-results`). Depends on vc-init and vc-fix; ships `defaultEnabled: false`. [`vc-test/README.md`](vc-test/README.md) is the normative file map — read it before editing. The rules that bite when you change something here:

- **`knowledge/` holds copies; this repo's file stays canonical.** Each copy names its source on line 1 — edit the source, then the copy, in the same commit (`context:check` DOC-010 lists copies that already drifted, informational only). A plugin file must not read a path under the repo's `.claude/` (`context:check` DOC-009 ratchets it); a prompt that names a repo-only document says "(in this repository: …)".
- **`lib/design/` and `knowledge/bl-ui.md` are generated** from `scripts/lib/*.ts` and the BL YAML by `npm run vc-test:design`. After a BL YAML or measurement-code edit, re-run it; `vc-test:design:check` fails a stale bundle in `gates.yml`.
- **Repo shims call the plugin.** This repo's `/qa-triage-results` and `/qa-design` run the vc-test skills (≥ 0.11.0 and ≥ 0.12.0) — a breaking change to either skill breaks the shim too.
- **Committed tests** exist only for `lib/knowledge-store.mjs` and `lib/write-zones.mjs` (root [`../CLAUDE.md`](../CLAUDE.md) §Essential Rules); every other vc-test script follows NO CODE ⇒ NO UNIT TEST / temporary-test.
- **Its own copies, as vc-fix:** `scripts/lib/` is the env loader copied from vc-fix; tracker and code-host reads go only through `$VC_RUN` (or the `fetch` agent on a host-governed project), never a token of its own.

## `vc-secrets` — the launcher

Depends on nothing and ships no MCP servers — a declaration belongs to whoever needs the server, never to this package. [`vc-secrets/README.md`](vc-secrets/README.md) is normative; change it in the same commit as the behaviour it describes.

- **Its own guard refuses your edits.** With the plugin enabled, its `PreToolUse` hook (`hooks/guard-declarations.mjs`) denies agent writes to the package's code, hooks, manifests and skill files, to any declaration, the trust file and the shim. Only `*.test.mjs`, `test-fixtures.mjs`, `test-support.mjs` and `README.md` stay writable (README §Why an edit to a declaration gets blocked). A refused edit goes to the operator as a diff to apply in their editor — never around the guard through a shell command.
- **The whole package has committed tests** (root [`../CLAUDE.md`](../CLAUDE.md) §Essential Rules). `npm test` does not reach them: `unit-tests.yml` runs `node --test "plugins/vc-secrets/**/*.test.mjs"` as its own step, refuses an empty match, and requires `vc-secrets.test.mjs` (it holds the CI sentinel) — don't rename or fold that file.

## `vc-frontend` — fork and module-plugin skills

Depends on nothing; installs disabled. [`vc-frontend/README.md`](vc-frontend/README.md) is normative.

- **Its skills write into the customer's repo, never this one.** `fork-map.json`, the `upstream-merges/<date>-<slug>.md` log and `*.upstream.test.ts` land in the fork; `mf-new-plugin` edits the module repo and never commits. A change here is a prompt or script change — no fixture, test or output for it is committed in this repo.
- **No footprint in the fork's manifest.** `visual/setup.mjs` installs Playwright, pixelmatch and pngjs into the fork's `node_modules/.cache/`, never its `package.json`, and the plugin has no `package.json` of its own — keep both true.
- **The "can make mistakes" warning** is in the README, `plugin.json` and the `marketplace.json` entry; keep all three.
