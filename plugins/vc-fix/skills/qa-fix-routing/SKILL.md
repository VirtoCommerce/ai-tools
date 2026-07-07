---
name: qa-fix-routing
description: Repo/tracker routing library for the vc-fix plugin — decides which external product repo owns a bug (client vs platform), whether the fix delivers as a direct PR, a fork-PR, or an upstream issue, and which VCS/tracker host to talk to. Used by /qa-fix and /project-init. Self-contained — no dependency on the ci/ directory.
---

# qa-fix-routing — repo + tracker routing library

Self-contained TypeScript library extracted from `ci/lib/` so the `vc-fix` plugin
does not depend on the `ci/` directory (the headless CI regression/fix pipeline)
persisting or being installed. `/qa-fix` and `/project-init` invoke these modules
directly (via a `tsx`/`node` one-off script, same pattern the original `ci/lib`
files used) rather than authoring routing logic inline.

## Files

| File | Role |
|------|------|
| `repo-router.ts` | Core routing: `repoKind`, `repoOwnership`, `isAllowedRepo`, `repoProfile` (build/test cmd per kind), `contributionPlan` (direct / fork / issue), `suggestRepo`, `checkoutForFix`. Reads `fix-repos.json` (allowlist + routing hints) and the deployment profile (`project-profile.json` via `loadProjectProfile`). |
| `module-registry.ts` | Live VC module dependency graph via the Platform API (`BACK_URL`) — `repoFromProjectUrl`, `moduleIdToRepoGuess`. Caches to `.module-registry.cache.json` (gitignored) next to this file. No local imports — fully self-contained. |
| `provenance.ts` | Pure logic, no I/O — `classifyFrontendProvenance` / `frontendDeliveryPlan` for Gate 1b (telling a client's storefront-fork customization from an unmodified-platform bug). Depends only on `repo-router.ts`'s `RepoOwnership` type. |
| `ado-rest.ts` | Azure DevOps REST auth helpers (PAT or `az login`) shared by the Azure tracker/VCS. |
| `vcs/` | `Vcs` interface + `github-vcs.ts` (gh CLI) + `azure-repos-vcs.ts` (ADO REST) implementations + `index.ts` factory (`getVcs`/`getUpstreamVcs`). |
| `trackers/` | `Tracker` interface + `jira-tracker.ts` + `azure-tracker.ts` implementations + `index.ts` factory. |
| `fix-repos.json` | Data: allowed-repo patterns/denylist/explicit kinds + routing keyword table. Override path via `FIX_REPOS_CONFIG`; org override via `FIX_REPO_ORG`. |

## Why extracted (not referencing `ci/lib/` in place)

The original `ci/lib/repo-router.ts` etc. back the headless `ci/run-fix-cycle.ts`
CI twin. `vc-fix` only needs the routing/checkout logic, not the CI orchestration
— so it carries its own copy here. The `fix-repos.json` / `.module-registry.cache.json`
default paths resolve off this file's own directory (`SKILL_DIR`, via
`fileURLToPath(import.meta.url)`) rather than `process.cwd()` — still overridable
via `FIX_REPOS_CONFIG` / `MODULE_REGISTRY_CACHE`. If `ci/` is ever removed from
this repo, or this plugin is installed on its own with no `ci/` present at all,
`vc-fix` keeps working unaffected.

## Fully self-contained (not repo-coupled)

`vc-fix` does not assume it lives inside a full checkout of this repo. Claude
Code plugin installs don't reliably give a plugin's own commands/skills a
resolvable "project root" to reference shared files from (no documented
`${CLAUDE_PLUGIN_ROOT}`-equivalent, and bare relative paths resolve against
whatever the *user's* current working directory happens to be — see the
plugin's own `knowledge/`, `.claude/rules/`, `scripts/lib/` etc., which are
**duplicated into `plugins/vc-fix/`** rather than referenced at the parent
repo's root, precisely to avoid that dependency). `scripts/lib/project-profile.mjs`
and `scripts/lib/resolve-test-env.js` are copied to `plugins/vc-fix/scripts/lib/`
(not shared with the root copy) — see the `../../scripts/lib/project-profile.mjs`
imports in `repo-router.ts` and the one-deeper `../../../scripts/lib/...` in the
`vcs/`/`trackers/` files.

> The rest of `vc-fix` (its command/agent/skill markdown) still resolves file
> references as bare relative paths, which inherits the same undocumented-CWD
> risk described above for any tool call the model issues at runtime — that's a
> broader `/project-init`-level concern tracked separately, not something this
> one skill's file layout can fix on its own.

## Consumers

- `commands/qa-fix.md` (Gate 1 routing, Gate 1b provenance, Phase 5 PR delivery, Phase 6 CI-check-contract-by-ownership)
- `commands/project-init.md` / `skills/project-init/*.mjs` (writes `project-profile.json` that `repoOwnership`/`contributionPlan` read)
- `agents/fullstack-backend.md`, `agents/fullstack-frontend.md` (checkout + repo profile for the fix)
