# Release Process

How to cut a release of the `vc-qa` plugin. Companion to [`versioning.md`](versioning.md) (the *what*) — this doc is the *how*.

> **Note:** `.claude-plugin/marketplace.json` lists **two** plugins — `vc-fix` (`plugins/vc-fix/`) and
> `vc-perf` (`plugins/vc-perf/`). `vc-qa` is **not** listed: its full surface now lives under `.claude/`
> as project-scoped components, auto-discovered in this repo with no plugin manifest. This process
> applies per plugin — substitute the plugin being released wherever this doc says `vc-qa`, and note
> that each plugin versions and tags independently (Step 1, Step 5a).

> **Audience:** Maintainers cutting releases. Not customers (customers read [`onboarding.md`](onboarding.md) and pin to a tagged version per [`versioning.md` § Customer Upgrade Path](versioning.md#customer-upgrade-path)).

## Cadence

| Type | Trigger | Frequency |
|------|---------|-----------|
| **Patch** (`x.y.Z`) | Bug fix on a released version | As needed — usually within a week of the bug report |
| **Minor** (`x.Y.0`) | New capability, new suite, new BL, new env var with safe default | Roughly monthly post-v1.0; per-phase during pre-1.0 |
| **Major** (`X.0.0`) | Breaking Tier A change. Always paired with a `docs/migrations/v{N}.md` guide. | Rare — target one major bump per ~6-12 months once GA |
| **Pre-release** (`x.y.z-alpha.N`, `x.y.z-beta.N`, `x.y.z-rc.N`) | Pilot deliverables, RC candidates | As pilots demand |

**During Phase 1 (now):** minor bumps per workstream checkpoint. We're not on a calendar cadence yet — releases gate on completed acceptance criteria, not dates.

## Roles

| Role | Responsibility |
|------|---------------|
| **Release owner** | The maintainer cutting a given release. Single named individual per release (not a rotating "team"). Documented in the release commit message. |
| **Approval reviewer** | At least one non-owner reviewer signs off on the release PR. Catches changelog-vs-diff drift. |
| **Pilot liaison** (post-Phase 2) | When a release ships during an active pilot, the liaison communicates the change to the pilot customer with a 1-line summary + the changelog link. |

**Currently:** Release owner is the maintainer working on `main`. Approval reviewer is open — will be named when [`docs/support-runbook.md`](support-runbook.md) Tier 1 owner is decided.

## What Triggers a Release

A release cuts when **all** of these are true:

1. The work is on a feature branch that's been merged to `main` (or is the PR being merged)
2. `CHANGELOG.md` `[Unreleased]` has at least one entry under Added / Changed / Fixed / Security
3. Every entry's Verified subsection has at least one concrete check that passed
4. `npm run env:check` is green on `TEST_ENV=vcst`
5. `npm run verify:multi-env` exits 0 (filter pipeline is unbroken)
6. `npm run suites:lint` exits 0 (manifest is schema-valid)
7. `npx tsx scripts/test-data/validate-td-refs.ts` exits 0 (no broken `@td()` refs)

If any check fails, fix the cause before tagging — don't release a known-broken state.

## Mechanical Steps

These are deterministic — no judgment calls. Anyone with maintainer rights can execute.

### Step 1 — Bump version numbers

**Bump the released plugin's own manifest:**

- `plugins/<name>/.claude-plugin/plugin.json` `"version": "x.y.z"` — the single source of truth for that plugin. Claude Code's plugin loader reads this file, and Step 5a derives the `{name}--v{version}` tag from it.

**`.claude-plugin/marketplace.json` `"version"` is the CATALOG's version, not a plugin's.** Bump it only when the listing itself changes — a plugin added or removed, a description, source path, or owner edited. It does **not** have to equal any plugin's version.

> **This rule changed when the catalog grew a second plugin.** It used to read "`plugin.json` and `marketplace.json` MUST match", which was true while `vc-fix` was the only listing and the repo *was* the plugin. With `vc-fix` and `vc-perf` versioning independently, one shared number cannot track both — the catalog now versions itself. Current state: catalog `0.9.4`, `vc-fix` `0.8.6`, `vc-perf` `0.2.6`. **That is not drift; do not "fix" it by forcing them equal.**

**Also update the plugin's own component counts** in its `marketplace.json` description and `plugin.json`, if agents/skills/commands were added or removed — a stale count there is what customers read before installing.

`package.json` `"version"` is the repo/toolset line (the whole-repo `vX.Y.Z` tags from Step 5). Nothing reads it programmatically and it does **not** mirror a plugin version.

### Step 2 — Finalize the changelog entry

In `CHANGELOG.md`:

1. Rename the `[Unreleased]` heading to `[x.y.z] — YYYY-MM-DD` (today's date)
2. Verify every entry is concrete (no "improved various things" — be specific about *what* was added/changed/removed and *why*)
3. Add a new empty `[Unreleased]` section above for future work
4. Flag every Tier A change with `**Tier A:**` (reviewer scrutiny signal)
5. Flag every breaking change with `**BREAKING:**` + a link to `docs/migrations/v{N}.md`

### Step 3 — Run the release verification battery

Locally, in the working tree about to be tagged:

```bash
npm install
npm run env:check
npm run verify:multi-env
npm run suites:lint
npx tsx scripts/test-data/validate-td-refs.ts
npm run env:check
node skills/run-vc-mcp-testing-module/driver.mjs
```

All seven must exit 0. If any don't, fix and re-verify before continuing.

### Step 4 — Open the release PR

Branch name: `release/vX.Y.Z`. PR title: `Release vX.Y.Z`.

PR description template:

```markdown
## Release vX.Y.Z — YYYY-MM-DD

### Highlights
- Bullet 1
- Bullet 2

### Verified
- [x] `npm run env:check` green
- [x] `npm run verify:multi-env` exits 0
- [x] `npm run suites:lint` exits 0
- [x] `npx tsx scripts/test-data/validate-td-refs.ts` exits 0
- [x] `npm run env:check` green
- [x] `node skills/run-vc-mcp-testing-module/driver.mjs` 7/7 checks pass

### Changelog
See `CHANGELOG.md` [vX.Y.Z] section.

### Migration notes (only for major releases)
N/A | See `docs/migrations/vN.md`
```

Get one non-owner approval. Merge.

### Step 5 — Tag and push

After the merge lands on `main`:

```bash
git checkout main
git pull
git tag -a vX.Y.Z -m "Release vX.Y.Z — short description"
git push origin vX.Y.Z
```

Tag format: `vX.Y.Z` (lowercase v + semver). Pre-releases: `vX.Y.Z-alpha.N` / `vX.Y.Z-beta.N` / `vX.Y.Z-rc.N`.

### Step 5a — Push a per-plugin dependency tag (if any other plugin depends on this one)

`.claude-plugin/marketplace.json` can list more than one plugin (e.g. `vc-fix` and `vc-perf`), and one
plugin's `.claude-plugin/plugin.json` can declare a `dependencies` entry naming another in-repo plugin
with a semver range (`{ "name": "vc-fix", "version": ">=0.7.0" }`). Claude Code's plugin installer
resolves that range against **per-plugin git tags**, not the whole-repo `vX.Y.Z` tags from Step 5 —
the tag format is `{plugin-name}--v{version}` (e.g. `vc-fix--v0.8.1`). Check the currently-tagged
versions with `git tag -l '*--v*'`.

**Every time a plugin that other plugins depend on bumps its version, push a matching dependency tag
in the same release**, from the plugin's directory:

```bash
claude plugin tag --push
```

This derives the `{name}--v{version}` tag from that plugin's `plugin.json`, validates the marketplace
entry agrees on the version, and pushes it to `origin`. Manual equivalent, from the repo root:

```bash
git checkout main
git pull
git tag vc-fix--vX.Y.Z   # tags HEAD — the commit that landed the plugin.json version bump.
                          # If this plugin's release merged earlier than main's current tip
                          # (other plugins can land work after it), tag that earlier commit
                          # instead: git tag vc-fix--vX.Y.Z <that-commit-sha>.
git push origin vc-fix--vX.Y.Z
```

(Substitute the plugin name being released for `vc-fix`.) Unlike Step 5's release tag, this is
**lightweight, not annotated** — no `-a`/`-m` — matching the `vc-fix--v0.7.0`/`vc-fix--v0.8.1` tags
already on this repo; `claude plugin tag`'s own `-m`/`--message` flag is there if the team ever wants
to standardize on annotated dependency tags instead. Skipping this step doesn't break the
dependent plugin's *installability* today — a dependency range like `>=0.7.0` still resolves against
whatever tag is newest — but it silently freezes every dependent plugin's installers on the last
tagged content snapshot instead of the version `plugin.json` now claims to be at, and a future
`version` bump that *tightens* the range (e.g. to `>=0.9.0`) will hard-fail install with no matching
tag until this step runs. This already happened once during `vc-perf`'s initial development (a
same-content relabel to `0.2.0` wasn't re-tagged, so `claude plugin update` couldn't see the new
content) — see PR [#136](https://github.com/VirtoCommerce/vc-mcp-testing-module/pull/136) and issue
[#156](https://github.com/VirtoCommerce/vc-mcp-testing-module/issues/156).

A CI/release check that fails when a plugin's `plugin.json` version has no matching
`{name}--v{version}` tag would close this gap for good (tracked separately in #156) — this step is
the process fix in the interim.

### Step 6 — Announce

In order:

1. **GitHub Release** — Use the tag, paste the changelog section, attach no binaries (the repo IS the artifact).
2. **Pilot customers, if any** — Send the release notes via the channel they prefer (Slack DM / email / Teams). One paragraph + the changelog link.
3. **Internal VC team** — Post in the QA channel: "vc-qa vX.Y.Z is out — highlights: [bullets]. Pin to the tag in your CI."
4. **No marketing campaign for pre-1.0 releases.** Save the launch noise for v1.0 GA.

### Step 7 — Advance `main`

After tagging, `main` continues as the canonical line:

- Keep `main` as the release line; the next release cuts when the next workstream lands
- Feature branches merge into `main` and are deleted after merge (git history is preserved by the merge commit)

## Hotfix Flow

A hotfix is a patch release against an already-tagged version (e.g. `v0.3.0` ships, then `v0.3.1` fixes a critical bug found in customer use).

| Step | Action |
|------|--------|
| 1 | Open the issue with a `Bug` label + cite the affected version |
| 2 | Branch from the **tagged commit**, not from `main`. `git checkout -b hotfix/v0.3.1 v0.3.0` |
| 3 | Fix the bug. Add a `[Fixed]` entry to `CHANGELOG.md` under a new `[0.3.1]` section |
| 4 | Bump the plugin's own `plugin.json` to `0.3.1` (catalog `marketplace.json` only if the listing itself changed) |
| 5 | Run the same Step 3 verification battery |
| 6 | Open PR `hotfix/v0.3.1 → main`. Get approval. Merge. |
| 7 | Tag `v0.3.1` per Step 5 |
| 8 | **Also cherry-pick the fix back to any active feature branches** so unreleased work doesn't regress the same bug |

Hotfix SLA target: customer-blocking bug → patch out within 48 hours (will be hard-codified once support owner is named).

## Pre-Release Flow

Use pre-releases when the work is functionally complete but you want pilot feedback before the stable tag:

```bash
git tag -a v1.0.0-rc.1 -m "Release candidate 1 for v1.0.0"
git push origin v1.0.0-rc.1
```

Customers can opt in to pre-releases by pinning to e.g. `v1.0.0-rc.1` instead of `^1.0`.

Pre-release naming: `-alpha.N` (internal-only) → `-beta.N` (selected pilots) → `-rc.N` (general pre-release) → unsuffixed stable.

## Compatibility Matrix

Maintained at `docs/compatibility-matrix.md` (TBD — created when first v1.0.0 ships).

Tracks: plugin version × Claude Code version × required VC platform version. Customers consult this before upgrading.

## Anti-Patterns

| Don't | Why |
|-------|-----|
| Tag without bumping the plugin's own `plugin.json` | Customers see the new tag but the manifest still shows the old version. Confusing + breaks Claude Code's version pin behavior. |
| Force the catalog `marketplace.json` `version` to equal a plugin's version | They are different things — the catalog versions the *listing*, each plugin versions itself. With two plugins listed, one number cannot track both, and "correcting" the catalog to match one plugin silently misreports the other. |
| Bump a plugin's version without pushing its `{plugin-name}--v{version}` tag (Step 5a), when another plugin depends on it | Silently strands every dependent plugin's installer on the last tagged content — `plugin.json` claims the new version but nothing resolvable backs it. |
| Skip the verification battery "because the change was small" | Small changes are how `@td()` refs and manifest schemas silently break. Every release runs the full battery. |
| Amend a published tag | Once `git push origin vX.Y.Z` lands, the tag is immutable in customer lockfiles. To fix a bad release, cut a new patch — never re-tag. |
| Backdate a changelog entry | `YYYY-MM-DD` is the tag date, not the work date. Customers correlate release dates to their CI run dates. |
| Mix release work with feature work in the same PR | One PR per release. If you want to release + ship a feature, that's two PRs. |
| Self-approve | Always one non-owner sign-off. Catches the half-finished changelog entry the author didn't notice. |
| Skip the customer announcement during pilots | The pilot customer signed up for honest communication. A silent release breaks that trust. |

## Reference

- Versioning contract: [`versioning.md`](versioning.md)
- Tier classification: [`../.claude/architecture/TIER.md`](../.claude/architecture/TIER.md)
- Changelog: [`../CHANGELOG.md`](../CHANGELOG.md)
- Phase 1 plan section on releases: `~/.claude/plans/functional-singing-cosmos.md` § Workstream 16
