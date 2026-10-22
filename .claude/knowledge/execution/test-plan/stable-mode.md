# /qa-test-plan stable — plan a stable-bundle regression

Read by [`/qa-test-plan`](../../../commands/qa-test-plan.md) when the argument is `stable <N>`. It turns a
`VirtoCommerce/vc-modules` bundle diff (`bundles/v{N-1}` → `bundles/vN`) into a regression plan that several QA can run
in parallel on one environment, written to git so any of them can pick it up. The run itself is
`/qa-run stable:<N> <wave>` ([`waves.md`](../../../skills/qa-run/waves.md)).

**Read first:** [`release-folder.md`](../../../skills/qa-run/release-folder.md) — the folder layout, every field, the wave rules
and the claim protocol. Design and the parts still to come (the release → PR → Jira trace, `deploy:bundle`,
`release:compare`, the `stable next` forecast): `docs/superpowers/plans/2026-10-05-qa-test-plan-stable-releases.md`
(VCST-6177).

## Arguments

| Argument | Meaning |
|---|---|
| `stable <N>` | the bundle to plan. The baseline is the previous numeric key of `bundles/stable.json` on `master` |
| `--ref <branch>` | the branch of an unmerged bundle PR; every read of the target bundle carries it. Default `master` |
| `--env <TEST_ENV>` | the environment the regression runs on; default `vcptcore_regression` |
| `--ticket <KEY>` | the release ticket; bugs and wave sub-tasks link to it |
| `--update` | the bundle moved (a hotfix landed): re-run Steps 1–3 against it and amend `module-diff.json`, `scope.json`, `release.json` and `PLAN.md`. A wave that already ran keeps its suites; a new suite goes to a wave that has not started. Never touches `waves/` |

## Step 0 — Pre-flight

1. Run the [`/preflight`](../../../skills/preflight/SKILL.md) skill for `--env`.
2. **The env must run the bundle being planned.** Compare `GET /api/platform/modules` (plus platform and theme) with
   `bundles/vN/package.json` at `--ref`. Every mismatch goes into `PLAN.md` §Environment. A large mismatch is a STOP:
   a regression of a build that is not deployed tests nothing.
3. If `regression/releases/stable-<N>/` exists and `--update` is not set, STOP and show
   `npm run release:status -- stable-<N>`.

## Step 1 — What changed (mechanical)

```
npm run release:diff -- --from v<N-1> --to v<N> [--to-ref <ref>] --suites --out regression/releases/stable-<N>/module-diff.json
```

Per component: `CODE` / `REBUILD` / `NEW` / `REMOVED` / `SAME` / `UNRESOLVED`, code files, commit subjects, ticket keys
and the candidate suites `regression:select` maps the code files to. Resolve every `UNRESOLVED` before going on. Read
the bundle's `breaking_changes.md`, `release_notes.md` and `update_path.md` (`bundles/vN/` at `--ref`): they name the
cross-cutting changes every wave is affected by.

## Step 2 — Classify, scope and score risk (judgement)

One `scope.json` row per `CODE` and `NEW` component: versions, class (`F` / `T` / `N`, contract §4), domain, suites, one
line on what changed, ticket keys.

- **Class from the commits, not the version.** Migration, obsolete removal or package alignment is `T`; a feature or a
  behaviour fix is `F`. When the commit list does not settle it, open the ticket.
- **A new module's intended behaviour comes from VirtoOZ** (`/vc-docs`), never from memory — `CLAUDE.md` §Essential
  Rules → *Product context*. A new module with no suite is a gap: `PLAN.md` §Gaps, with an exploratory charter.
- **Suites:** start from the `module-diff.json` candidates (the path matcher is broad), narrow by domain, add the suites
  a cross-cutting change needs. A suite whose `requiresModules` the env does not run is BLOCKED by plan.
- **Risk per domain**, per [`plan-sections.md`](plan-sections.md) §Risk assessment — it orders the domains inside each
  priority tier and decides which domains get charters.

## Step 3 — Waves: priority tiers × domain slices

A wave is one **(tier, domain group)** cell, so the plan honours priority *and* lets several QA work at once:

| | purchase flow | catalog & search | accounts & B2B | … |
|---|---|---|---|---|
| **W0** smoke gate | one wave, first, alone | | | |
| **critical** (`--cases critical`) | `C-purchase` | `C-catalog` | `C-accounts` | run in parallel |
| **high** (`--cases high`) | `H-purchase` | `H-catalog` | `H-accounts` | start when every critical wave has run |
| **rest** (the remaining cases) | `R-purchase` | `R-catalog` | `R-accounts` | start when every high wave has run |
| **WX** exclusive window | env-wide cases, one owner, last | | | |

1. **Tiers come from the cases' own priority**, through `npm run suites:filter` — the same tiers `/qa-regression --cases`
   uses. Never re-grade a case in the plan.
2. **Domain groups** are chosen so two parallel waves never consume the same disposable fixture set or the same pooled
   state ([`../../../rules/test-data.md`](../../../rules/test-data.md) §DISPOSABLE FIXTURES rule 4). One owner keeping one
   domain across tiers keeps its data in one pair of hands.
3. **Tier order is a dependency:** each `H-*` wave lists every `C-*` wave in `dependsOn`, each `R-*` wave every `H-*`
   wave. `release:check` enforces it.
4. **Env-wide cases** (settings, job schedules, reindex/rebuild, restore, restart, re-seed — contract §7.2) go into
   `exclusive` and the WX wave, out of every tier.
5. **Size** each wave with `npm run regression:plan -- <suite ids> --cases <tier>`; a wave fits one owner's day. Numbers
   only from that output.
6. **Prerequisites per wave:** seed profiles (`npm run models:check -- --plan <profile>`,
   [`/qa-seed-data`](../../../skills/qa-seed-data/SKILL.md)), personas per owner (contract §7.1), env settings.

## Step 4 — Write the release folder

In `regression/releases/stable-<N>/`: `release.json` (contract §3, every wave with `id`, `title`, `tier`, `suites`,
`modules`, `dependsOn`, `exclusive` where it applies), `scope.json`, `PLAN.md` (§Environment, §How the scope was decided,
§Risk, §Waves with the estimates from `regression:plan`, §Prerequisites, §Gaps and charters per
[`plan-sections.md`](plan-sections.md) §Exploratory charters, §Not in scope), and `waves/<W>/state.json` for every wave
(`NOT_STARTED`, `owner: null`). Then:

```
npm run release:check -- stable-<N>
npm run release:status -- stable-<N> --write
```

## Step 5 — Hand it out (both gated, one question)

1. **The PR to `main`** with the release folder — branch `claude/qa-release/stable-<N>-plan`, the user's git identity,
   body in English (what changed, the wave grid, prerequisites, how to claim). **Never merge.**
2. **One tracker sub-task per wave** under `--ticket` — `npm run release:report -- stable-<N> --subtasks` shows them,
   `--apply` creates them and writes each key into `release.json` `waves[].subtask`. Required
   whenever more than one person runs waves: the sub-task is the claim (contract §8). On a *no*, say the waves must then
   run one person at a time.

The release ticket gets **one new comment per finished wave**, posted by whoever finished it (`/qa-run` Step 7,
`release:report --post`): each one carries the whole release as of that wave, so the latest is the current state.
Next command for each QA:
`/qa-run stable:<N> <wave> --claim`.

## Rules

- **Plans only.** No suite runs, nothing is seeded, no env setting changes.
- **Every number from a script** (`release:diff`, `regression:plan`, `suites:filter`), never transcribed
  ([`../../../rules/test-data.md`](../../../rules/test-data.md) GOLDEN RULE).
- **The plan is a git artifact**, never only in `reports/` or a chat.
- **`--update` never rewrites a wave's state** — that file belongs to its owner.
