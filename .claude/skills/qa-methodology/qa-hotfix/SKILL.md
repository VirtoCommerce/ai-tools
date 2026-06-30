---
name: qa-hotfix
description: "[QA Methodology] Release a HOTFIX of an already-merged-and-released fix into the bundles that are currently the latest stable releases (ASK which ones — the set changes over time; e.g. at one point v12 & v14). Resolve the JIRA task → its linked PR → fix commit, verify it is MERGED and SHIPPED, then per bundle cherry-pick onto support/<X.Y> and trigger the repo's 'Release hotfix' workflow. Use when asked to 'выпустить хотфикс для релиза', backport a fix to a stable bundle, or cut a patch on a support line. Gated writes, never auto-merges, STOPs when no support branch exists."
argument-hint: "VCST-XXXX [v12,v14] [--repo=<name>] [--pr=<ref>] [--dry-run]"
---

# Release a Hotfix into Frozen Bundles

A VirtoCommerce **stable bundle** (`vc-modules/bundles/vN`) pins every module, the Platform, and
the Theme to one frozen generation. When a fix lands on `dev` and ships in the current release, a
frozen bundle does **not** get it for free — the bundle intentionally trails `master`. To deliver
the fix to a frozen bundle you cut a **hotfix**: a new patch `X.Y.(Z+1)` on the bundle's existing
`X.Y` line, produced from a `support/<X.Y>` branch.

This skill productizes the manual flow Oleg described (choose branch → find commit → cherry-pick →
commit → "Release Hotfix"). Terminal entry: [`/qa-hotfix`](../../../commands/qa-hotfix.md).

> Twin relationship: `/qa-hotfix` is to hotfix releases what [`/qa-bundle-check`](../qa-bundle-check/SKILL.md)
> is to hotfix *detection*. `bundle:check` tells you a bundle is **missing** a same-line patch;
> `qa-hotfix` **produces** that patch for a specific task. They share `config/module-repo-map.json`,
> the `GIT_TOKEN` auth model, and the same-line semantics.

## VirtoCommerce hotfix mechanics (verified 2026-06-23)

- **Branch convention:** `support/<major.minor>` (e.g. order `3.1000.3` → `support/3.1000`,
  catalog `3.904.11` → `support/3.904`). Confirmed via release `target_commitish`.
- **The "Release hotfix" workflow** is a `workflow_dispatch` shipped in every repo; the filename
  varies by repo kind (discover it by workflow **name** "Release hotfix", don't hardcode):
  - module repo → `module-release-hotfix.yml`
  - `vc-platform` → `platform-release-hotfix.yml`
  - `vc-frontend` → `theme-release-hotfix.yml`
  Run **on the support branch** with `incrementPatch=true` → publishes `X.Y.(Z+1)`,
  `makeLatest=false`, then auto-commits the bumped version back.
- **No `gh` CLI** in this environment — writes go through local `git` + the token-authenticated
  GitHub REST API (`workflow_dispatch` = `POST /actions/workflows/{id}/dispatches`).

## Why a deterministic script (+ a thin agent layer)

Resolving "task → PR → commit", "is it merged & released", "which support branch & next patch" is
mechanical — parse JSON, query GitHub, compare integers. So:

- **`scripts/hotfix-precheck.ts`** does all the read-only analysis and emits a per-bundle verdict.
- **`scripts/hotfix-release.ts`** does the one deterministic write (dispatch the Release-hotfix
  workflow) and verifies the published patch contains the fix.
- The **agent/orchestrator** only does what needs judgment: read the JIRA task, run the cherry-pick
  (resolving conflicts), and gate every write behind explicit human confirmation.

## Step 1 — resolve the fix (linked PR is primary)

`GIT_TOKEN` is read from `.env.local` (5000 req/h; without it 60/h → likely rate-limited).
PR resolution order:

1. **PRIMARY — the PR linked to the task:** GitHub search `org:VirtoCommerce <TASK> type:pr`
   (unscoped, so it also matches PRs that carry the key only in a comment). A single product-repo
   hit (`vc-module-*`, `vc-platform`, `vc-frontend`) is used directly.
2. **FALLBACK — the JIRA description:** only when search finds nothing / can't disambiguate, parse
   the PR link out of the issue **description** (`feedback-find-linked-pr-in-jira-first`). The
   script does this via JIRA REST when `JIRA_EMAIL` + `JIRA_API_TOKEN` are in `.env.local`; the
   `/qa-hotfix` command does it via the Atlassian MCP when running interactively.
3. **MANUAL — last resort:** `--pr=<owner/repo#num | url>` or `--repo=<name>`.

## Step 2 — gate the fix: MERGED and SHIPPED (run FIRST, no bundles yet)

This is the original "проверяем, что PR смержен и релиз выпущен" step. Run the precheck **without**
`--bundles` — it does the gate phase only, then stops to ask for bundles:

```bash
npm run hotfix:precheck -- VCST-5082            # gates-only: PR → merged → shipped
# overrides if the linked-PR search needs help:
npx tsx scripts/hotfix-precheck.ts VCST-5082 [--repo=<name>] [--pr=<owner/repo#num|url>] [--json]
```

1. The PR is **MERGED** (else STOP — merge first; a hotfix cherry-picks the merged commit).
2. The fix has **SHIPPED** in a normal release (the merge commit is contained in a published
   release tag) — else STOP, run the normal "Release" workflow on the base branch first
   ("сначала просим выпустить релиз").

Both pass → the script prints `✓ Gates passed` and prompts for bundles → go to Step 3.

## Step 3 — establish which bundles are the latest stable (ASK, never assume)

Only after the gates pass. **The set of stable bundles is not fixed — it changes as new generations
ship.** `v12`/`v14` are only an illustrative pair; do **not** hardcode them.

1. Ask the user: **"which release bundles are currently the latest stable?"** (the
   "я тебе говорю v12 и v14" step). Accept whatever they name (`v13,v15`, a single `v16`, …).
2. If unsure what exists, candidates live at `vc-modules/bundles/<vN>/package.json` on `master` —
   but *which are the supported stable lines* is the user's call, not a guess. When in doubt, ask.

Every `vN` below is a placeholder for whatever the user named.

## Step 4 — per-bundle precheck (read-only)

```bash
npm run hotfix:precheck -- VCST-5082 --bundles=<the bundles the user named>
```

Per bundle: pinned version → line `X.Y` → does `support/X.Y` exist → highest patch on the line →
the patch a hotfix would produce (`highest + 1`) → whether the fix is already on the branch.

**Two layers of "can we hotfix this?":**
1. **By branch (physical possibility):** the `Possible?` column — a hotfix can be cut only if
   `support/X.Y` exists AND the pinned tag is real on that line. No branch → `✗ no` → STOP for that
   bundle.
2. **By code (will it apply):** the `Code check` block — every file the fix MODIFIES/REMOVES must
   still exist on the support branch (added files are excluded). All present → clean cherry-pick
   likely; a missing file → the line diverged → cherry-pick will likely conflict. This is a
   no-clone heuristic; the **definitive** conflict check is the actual `git cherry-pick` at the
   write step (clone in `.fix-workspace/`, conflict → STOP, never force a risky resolution).

### Verdicts & exit codes

| Verdict | Meaning |
|---|---|
| `✓ READY → … → X.Y.(Z+1)` | support branch exists, fix not yet on it — proceed to the write steps |
| `◯ already-applied` | the fix commit is already on `support/X.Y` — nothing to cherry-pick |
| `✗ no support/X.Y` | **STOP for that bundle** — a hotfix is not physically possible without the branch |
| `— not in bundle` | the repo isn't pinned in that bundle — nothing to hotfix there |

- Exit `0` = every requested bundle is `ready`/`already-applied` · `1` = a gate is blocked · `2` = tool error.
- `--json` emits `{ task, repo, fixSha, prGate, releaseGate, bundles[] }` for the orchestrator.

## The write steps (gated — confirm before EACH)

Only for `READY` bundles, after the precheck is green. Work in `.fix-workspace/` (gitignored).
**Triple-guarded no-auto-merge culture applies** (`.claude/rules/quality-gates.md`): each write
needs explicit human confirmation; never auto-create a support branch.

For each ready bundle (line `X.Y`):

1. `git fetch && git checkout support/X.Y`
2. `git cherry-pick <fixSha>`
   - **Conflict:** resolve only if trivially mechanical; anything risky → **STOP + hand off**
     (the fix touched code that diverged on the support line — a human must decide).
3. Show the diff → **confirm** → `git push origin support/X.Y`
4. **confirm** → trigger + verify the release:
   ```bash
   npm run hotfix:release -- --repo=<name> --branch=support/X.Y --expect-commit=<fixSha> --poll
   ```
   `hotfix-release.ts` discovers the "Release hotfix" workflow, dispatches it on the support
   branch (`incrementPatch=true`), polls the run, and verifies the published `X.Y.(Z+1)` release
   contains `<fixSha>`. Exit `0` = released + verified · `1` = run failed or commit not in release.

### After the hotfix

- Re-run the precheck → the bundle should now read `◯ already-applied`.
- Report per bundle: new patch version + release URL. Comment the outcome on the JIRA task (English).
- **Theme/frontend caveat:** a vc-frontend hotfix release asset is named `vc-frontend-X.Y.Z.zip`
  (not `vc-theme-b2b-vue-*`) — `reference-vc-frontend-release-asset-naming`. If a bundle's
  `ThemeB2BVue` pin must then be bumped, take the URL from the release's real `assets[]`, never by
  string-replacing the version. (Bumping the bundle pin itself is `/qa-bundle-check` territory.)

## Hard rules (STOP/BAIL is a success, not a failure)

- **Never auto-merge.** The pipeline ends at a published hotfix release; merging the *bundle bump*
  PR (if any) is a separate human action. `merge_pull_request` / `gh pr merge` are denied.
- **Never auto-create a `support/X.Y` branch** — that's a release-management decision. STOP + hand off.
- **One repo per task.** Multi-repo / cross-module fixes → STOP + hand off.
- **STOP on:** PR not merged, fix not released, cherry-pick conflict beyond trivial, failed release
  run, or the published patch not containing the fix. Leave the JIRA task where it was with a
  one-line reason.

## Reporting

This is tooling output, not one of the five tracked report categories (`.claude/rules/reports.md`)
— print the precheck table and the released versions to the user / JIRA comment; do **not** create a
file under `reports/`. A hotfix that changes a release decision flows into the normal release report.

## Maintenance

- `config/module-repo-map.json` (shared with `bundle:check`) maps bundle module Id → repo and
  self-heals for new modules.
- Tag scheme assumed: bare `Major.Minor.Patch`; branch scheme `support/Major.Minor`. If a repo
  diverges (e.g. `v`-prefixed tags, a different support-branch name), adjust `tagOf()` / the
  `support/${line}` construction in `scripts/hotfix-precheck.ts`.
- The "Release hotfix" workflow is discovered by name, so a renamed file keeps working as long as
  the workflow's `name:` stays "Release hotfix".
