---
name: qa-hotfix
description: "[QA Methodology] Release a HOTFIX of an already-merged-and-released fix into the bundles that are currently the latest stable releases (ASK which ones — the set changes over time; e.g. at one point v12 & v14). Resolve the JIRA task → its linked PR → fix commit, verify it is MERGED and SHIPPED, check the fix-shape safety gate (single module, no dependency-version bump), then per bundle create the support/<X.Y> branch if missing (gated) and cherry-pick onto it, triggering the repo's 'Release hotfix' workflow. Use when asked to 'выпустить хотфикс для релиза', backport a fix to a stable bundle, or cut a patch on a support line. Gated writes, never auto-merges, STOPs on a fix-shape risk or a cherry-pick conflict."
argument-hint: "VCST-XXXX [v12,v14] [--repo=<name>] [--pr=<ref>] [--dry-run]"
---

# Release a Hotfix into Frozen Bundles

A VirtoCommerce **stable bundle** (`vc-modules/bundles/vN`) pins every module, the Platform, and
the Theme to one frozen generation. When a fix lands on `dev` and ships in the current release, a
frozen bundle does **not** get it for free — the bundle intentionally trails `master`. To deliver
the fix to a frozen bundle you cut a **hotfix**: a new patch `X.Y.(Z+1)` on the bundle's existing
`X.Y` line, produced from a `support/<X.Y>` branch.

This skill productizes the manual flow Oleg described (choose branch → find commit → cherry-pick →
commit → "Release Hotfix"). Terminal entry: [`/qa-hotfix`](../../commands/qa-hotfix.md).

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
1. **By branch (physical possibility):** the `Possible?` column — a hotfix runs on `support/X.Y`.
   If the branch is missing → `✗ no` → **create it first** (gated write step 0 below) from the
   line's base tag, then proceed. The pinned tag must be real on that line (that's the base).
2. **By code (will it apply):** the `Code check` block — every file the fix MODIFIES/REMOVES must
   still exist on the support branch (added files are excluded). All present → clean cherry-pick
   likely; a missing file → the line diverged → cherry-pick will likely conflict. This is a
   no-clone heuristic; the **definitive** conflict check is the actual `git cherry-pick` at the
   write step (clone in `.fix-workspace/`, conflict → STOP, never force a risky resolution).

### The fix-shape gate — is this fix safe to hotfix? (developer's checklist)

Before ANY hotfix, the fix itself must clear the checklist a VC release engineer runs by hand. The
precheck prints it as the **`Fix-shape check`** block (computed once from the fix commit's own diff,
so it's repo/task-level, not per-bundle):

| # | Check | How it's verified | On FAIL |
|---|-------|-------------------|---------|
| 1 | **Fix in a single module** | the diff stays inside one `src/<Project>` tree | multi-project → **STOP + hand off** |
| 2 | **No breaking changes** | HEURISTIC flag: touches a contract-bearing file (`module.manifest`, `.csproj`, `Directory.Build.props`, `*Dto.cs`, `Models/`, `Contracts/`, `I*.cs`, `*Client.cs`) | flagged → a **developer MUST confirm** it isn't breaking before proceeding |
| 3 | **Doesn't bump other modules' dependency versions** | scans the diff for a changed `VirtoCommerce.*` version in a manifest/`.csproj`/props | a raised pin → **STOP + hand off** (a hotfix must not drag dependency versions) |
| 4 | **cherry-pick applies clean** | the actual `git cherry-pick` at the write step | conflict beyond trivial → **STOP + hand off** |
| 5 | **`vc-build compress` passes** | the **"Release hotfix" workflow** builds + tests the artifact; `hotfix:release --poll` exits `1` if the run is red | red run → read logs, self-correct ≤2× or escalate |
| 6 | **Regression environment** | after the release deploys, run regression on the support line | RED → hand off |

Checks 1–3 are mechanized in the precheck (no clone); 4–6 are enforced downstream (write step /
release workflow / regression). **Golden rule (Oleg): if anything looks like it could break —
STOP, analyze, and involve a developer.** A `⚠` on check 1 or 3 makes the precheck exit `1` and
**suppresses the "Next steps" write plan** — it is not a hotfix candidate until a human clears it.
A `⚠` on check 2 is advisory (heuristic) but still requires a developer's explicit "not breaking"
before you proceed.

### Verdicts & exit codes

| Verdict | Meaning |
|---|---|
| `✓ READY → … → X.Y.(Z+1)` | support branch exists, fix not yet on it — proceed to the write steps |
| `◯ already-applied` | the fix commit is already on `support/X.Y` — nothing to cherry-pick |
| `✗ no support/X.Y` | the branch doesn't exist yet — **create it first** (gated write step 0), branching from the line's base tag, then proceed with the hotfix |
| `— not in bundle` | the repo isn't pinned in that bundle — nothing to hotfix there |

- Exit `0` = every requested bundle is `ready`/`already-applied` · `1` = a gate is blocked (incl. a
  fix-shape signal — multi-module or dependency bump) · `2` = tool error.
- `--json` emits `{ task, repo, fixSha, prGate, releaseGate, fixShape, bundles[] }` for the orchestrator
  (`fixShape` = `{ modules, multiModule, dependencyBumps[], contractFiles[] }`).

## The write steps (gated — confirm before EACH)

For `READY` bundles, and for `✗ no support/X.Y` bundles after their branch is created (step 0).
Work in `.fix-workspace/` (gitignored). **Triple-guarded no-auto-merge culture applies**
(`.claude/rules/quality-gates.md`): every write needs explicit human confirmation — sequentially,
one confirmation per write; in parallel, a single **batch** confirmation covering all lanes before
any push (see *Parallel vs sequential* below). Either way, nothing is pushed unconfirmed.

**Step 0 — create the support branch when it's missing (`✗ no support/X.Y`).** A hotfix needs a
`support/X.Y` line; if it doesn't exist yet, create it (this used to be a hand-off, now it's a
gated write). Branch from the line's **base tag** = the highest released `X.Y.*` tag, or — if the
bundle's pinned `X.Y.Z` is all that exists on the line — the pinned tag itself. Never branch from
`dev`/`master` (that would pull in unreleased work).

```bash
# base = highest existing X.Y.* release tag (fallback: the bundle-pinned X.Y.Z)
git fetch origin --tags
git branch support/X.Y <base-tag>          # e.g. git branch support/3.1011 3.1011.0
git push origin support/X.Y                # ← confirm before this push
```

Confirm the base tag with the user before pushing (it decides what the new support line contains).
After the branch exists, re-run the precheck for that bundle → it should now read `✓ READY`, then
continue with steps 1–4.

For each ready bundle (line `X.Y`) — one **lane**; with ≥2 `READY` bundles run the lanes in
parallel (own worktree each) per *Parallel vs sequential* below, after a single batch confirmation:

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

### Parallel vs sequential — what can run concurrently

The unit of parallelism is the **support branch** (one per `READY` bundle). Because of *one repo
per task*, all bundles route to the **same repo**, so this is fan-out across that repo's support
lines (`3.1000`, `3.1011`, …). Default: **for ≥2 `READY` bundles, run them in parallel**; drop to
sequential the moment a branch needs human judgment (a cherry-pick conflict).

**Parallelize (independent per branch — safe):**

- **Per-bundle precheck** — read-only; `hotfix-precheck.ts` already takes all bundles in one call.
- **The whole per-branch write pipeline** (steps 0–4), one lane per support line — **but each lane
  needs its OWN git worktree**: a single working tree can only be checked out on one branch at a
  time, so cherry-picking two lines in one clone is inherently serial. Give each line an isolated
  worktree: `git worktree add .fix-workspace/<repo>--<X.Y> support/<X.Y>` → cherry-pick / push /
  release run concurrently across lanes.
- **`hotfix:release … --poll` per branch** — the **biggest win**: each poll blocks minutes, and the
  lanes are independent (different lines → different `X.Y.*` tags, no tag collision; the auto
  `IncrementPatch` commit lands on each line's own branch; the Release-hotfix workflow has **no
  repo-scoped `concurrency` group**, so GitHub runs the dispatches concurrently). Launch them as
  background jobs, then collect verdicts.

**Keep sequential / serialized (a shared resource or a barrier):**

- **Steps 1–3** (resolve fix → gate merged+shipped → ask bundles) and the **fix-shape check** —
  per *task*, computed once; nothing to fan out.
- **The ordered pipeline WITHIN a lane** — `checkout → cherry-pick → (resolve) → push → release`
  each depends on the previous; only *across* lanes is it parallel.
- **The human confirmation gate** — collapse it into **one batch confirmation** (show every lane's
  diff, confirm once) *before* any push. Never fan out writes without it.
- **Two releases on the SAME support branch** — never concurrent (degenerate: two bundles on one
  `X.Y` line share the branch → the `IncrementPatch` auto-commits would race). Distinct lines only.
- **JIRA comment + status advance** — one *task* → do **once, after all lanes finish** (aggregate
  the per-bundle results into a single comment + a single `Hotfix ready` transition), not per lane.

**Isolation rules for a parallel run:** a lane that hits a cherry-pick conflict (or any STOP)
**must not abort the other lanes** — that lane STOPs and hands off; the rest proceed, and the final
report lists per-lane outcomes (released / stopped-conflict / stopped-other). Rate limits are a
non-issue with `GIT_TOKEN` (5000 req/h).

### After the hotfix

- Re-run the precheck → the bundle should now read `◯ already-applied`.
- Report per bundle: new patch version + release URL. Comment the outcome on the JIRA task (English).
- **Advance the JIRA status to `Hotfix ready`** (right after the outcome comment) — **only for
  issue type `Bug`.** The `Wait hotfixes` / `Hotfix ready` statuses live only in the Bug workflow;
  a hotfix can also target a **Story** (or any other type), and those have no such statuses — for
  them **leave the status untouched** (still post the outcome comment, still skip the flag). Check
  the issue's `issuetype.name` first; if it isn't `Bug`, do nothing here. For a Bug, the path is
  **`Tested → Wait hotfixes → Hotfix ready`**, but the middle hop is driven by a field, not a
  transition:
  1. **Set the "Need hotfixes" flag** (VCST: `customfield_10181` = option `{id: "10151"}` — the
     ` true` checkbox). A JIRA post-function then **auto-moves `Tested → Wait hotfixes`** (the
     "Wait hotfixes" status only exists while this flag is set — that's why there is no manual
     `Tested → Wait hotfixes` transition).
  2. **Take the live-discovered transition whose target status is `Hotfix ready`** (VCST: the
     "Hotfix released" transition, id `15`). Discover it with `getTransitionsForJiraIssue` — never
     hardcode the id; match by `to.name === "Hotfix ready"`.
  - **Never move a ticket backwards.** If the ticket is already at or past `Hotfix ready` (e.g.
    `Testing on stable`, `Done`), no `Hotfix ready` transition is offered → leave the status as-is.
    Setting the flag on such a ticket is harmless (it still needed hotfixes) but do not force a
    backward transition.
  - Tracker-agnostic: this is the VCST (Jira) workflow; discover the field + transitions live and
    skip the step on a tracker/project that has no `Hotfix ready` status.
- **Theme/frontend caveat:** a vc-frontend hotfix release asset is named `vc-frontend-X.Y.Z.zip`
  (not `vc-theme-b2b-vue-*`) — `reference-vc-frontend-release-asset-naming`. If a bundle's
  `ThemeB2BVue` pin must then be bumped, take the URL from the release's real `assets[]`, never by
  string-replacing the version. (Bumping the bundle pin itself is `/qa-bundle-check` territory.)

## Final step — offer self-diagnostics (consent-gated)

At the **very end of every `/qa-hotfix` run** — whether it published a hotfix, STOPPED, or BAILed —
offer to self-diagnose this session with [`/vc-self-check`](../vc-self-check/SKILL.md), the plugin's
Tier-B self-diagnostician. A hotfix touches many moving parts (PR/release gates, cherry-picks across
support lines, the Release-hotfix workflow, JIRA transitions), so a run is a rich signal for catching
a degraded or broken skill.

**How to offer it (respect `vc-self-check`'s hard invariant — NEVER auto-trigger unprompted):**

1. **Ask, don't run.** Present a single Yes/No (`AskUserQuestion`): *"Run self-diagnostics on this
   session? (`/vc-self-check` — local report only, nothing is sent anywhere.)"* Run it **only** on an
   explicit **Yes**; on No, end normally.
2. **On Yes → invoke `/vc-self-check` (default `latest`).** It reads this session's passive telemetry
   + transcript against the skill-expectations oracle and writes a **local** `DIAG-*.md` under
   `.vc-fix/diagnostics/`. It is **read-only** w.r.t. the install and **sends nothing externally** —
   upstream contribution is the separate, independently-consented `/vc-self-check deliver` (never run
   it from here).
3. **No double-nag.** If the global end-of-session consent prompt already offered self-check for this
   session (its one-shot `selfCheckSeen` guard fired), or telemetry hasn't been collected (no
   `.vc-fix/diagnostics/*.jsonl` — the `SessionStart` hook isn't wired), **skip this offer silently**.
   Never re-prompt a session that already ran the diagnostician.
4. **Trivial / clean runs:** a no-op run (e.g. a fast STOP before any write, or `--dry-run`) rarely
   yields findings — the offer is still fine, but don't insist; a declined offer is a normal ending.

## Hard rules (STOP/BAIL is a success, not a failure)

- **Never auto-merge.** The pipeline ends at a published hotfix release; merging the *bundle bump*
  PR (if any) is a separate human action. `merge_pull_request` / `gh pr merge` are denied.
- **Create a missing `support/X.Y` branch (gated), don't hand off.** When the line has no support
  branch, create it from the line's **base tag** (highest released `X.Y.*`, else the bundle-pinned
  `X.Y.Z`) with explicit human confirmation of that base — never silently, and never off
  `dev`/`master`. (Write step 0.)
- **One repo / one module per task.** Multi-repo or multi-module fixes → STOP + hand off (fix-shape
  check 1).
- **A hotfix never bumps a dependency version.** A raised `VirtoCommerce.*` pin (fix-shape check 3)
  → STOP + hand off — bumping the bundle's pins is `/qa-bundle-check` territory, not a hotfix.
- **STOP on:** PR not merged, fix not released, a fix-shape signal (multi-module / dependency bump /
  unconfirmed breaking-change surface), cherry-pick conflict beyond trivial, failed release run, or
  the published patch not containing the fix. Leave the JIRA task where it was with a one-line reason.
- **If anything looks like it could break — think first.** Analyze it and involve a developer before
  hotfixing; do not force a risky change onto a frozen support line.

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
