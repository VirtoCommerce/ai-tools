---
description: "[QA Methodology] Plan a stable-bundle release regression that several QA can run in parallel: diff the two bundles (which components changed CODE), classify each change, map it to suites, split the work into independent waves (W0 smoke gate first, env-wide cases in a final exclusive wave), list fixture and env prerequisites, and write the plan to regression/releases/<release>/ in git. Ends by offering the PR to main and one tracker sub-task per wave so the waves can be handed out. Plans only — runs no suite. Each wave is then run with /qa-release-wave."
argument-hint: "<release> --from <vN> --to <vN> --env <TEST_ENV> --ticket <KEY> [--to-ref <branch>] [--update]"
disable-model-invocation: true
---

# /qa-release-plan — Plan a parallel release regression

You are the **release regression planner**. You turn "Stable N is ready" into a plan that two or three
QA can split between them and run on one environment at the same time, with every decision written to
git so any of them can pick it up.

**Read first, every time:** [`release-regression.md`](../knowledge/execution/release-regression.md) — the
folder layout, every field, the wave rules (§7) and the claim protocol (§8). This command is the
procedure; that file is the contract. Do not restate it into the plan.

## Usage

```
/qa-release-plan stable-17 --from v16 --to v17 --env vcptcore_regression --ticket VCST-7000
/qa-release-plan stable-17 --from v16 --to v17 --to-ref feat/VCST-7000-stable-17-bundle ...   # bundle PR not merged yet
/qa-release-plan stable-17 --update        # re-diff after a hotfix lands in the bundle; keeps wave state
```

| Argument | Meaning |
|---|---|
| `<release>` | the folder name under `regression/releases/` — lower-case, dash-separated |
| `--from` / `--to` | bundle folders in `VirtoCommerce/vc-modules` (`bundles/vN/`) |
| `--to-ref` | the branch of an unmerged bundle PR; default `master` |
| `--env` | the `TEST_ENV` the regression runs on |
| `--ticket` | the release ticket; bugs and wave sub-tasks link to it |
| `--update` | re-read `--from` / `--to` / `--to-ref` from `release.json` `bundle`, re-run Steps 1–3 against the bundle as it is now (a hotfix landed), and amend `module-diff.json`, `scope.json`, `release.json` and `PLAN.md`; a wave that already ran keeps its suites, a new suite goes to a wave that has not started. Never touches `waves/` |

## Step 0 — Pre-flight

1. Run the [`/preflight`](../skills/preflight/SKILL.md) skill for `--env`: env health, deployed build, MCP availability.
2. **The env must run the bundle being planned.** Compare the deployed module list (`GET /api/platform/modules`)
   with `bundles/<to>/package.json` (plus platform and theme). Every mismatch goes into `PLAN.md` §Environment —
   a regression of a build that is not deployed tests nothing. A large mismatch is a STOP: tell the user.
3. If `regression/releases/<release>/` already exists without `--update`, STOP and show
   `npm run release:status -- <release>` — the plan exists; offer `--update` instead.

## Step 1 — What changed (mechanical)

```
npm run release:diff -- --from <from> --to <to> [--to-ref <ref>] --suites --out regression/releases/<release>/module-diff.json
```

It reads both bundles, compares every component's two release tags in its own repo and reports
`CODE` / `REBUILD` / `NEW` / `REMOVED` / `SAME` / `UNRESOLVED`, the code files, commit subjects, ticket
keys and — with `--suites` — the candidate suites `regression:select` maps the code files to. Resolve
every `UNRESOLVED` (add the repo to `config/module-repo-map.json`, or note why) before going on.

Also read the bundle's own `breaking_changes.md`, `release_notes.md` and `update_path.md`
(`bundles/<to>/` in vc-modules): they name the cross-cutting changes (a retired framework, a new
required module) that every wave is affected by.

## Step 2 — Classify and scope (judgement)

For each `CODE` and `NEW` component, write one `scope.json` row: versions, class (`F` / `T` / `N`, §4 of
the contract), the wave, the suites, one line on *what changed*, the ticket keys.

- **Class from the commits, not the version.** A migration, obsolete removal or package alignment is `T`;
  a feature or a behaviour fix is `F`. When the commit list does not settle it, open the ticket.
- **New modules (`N`): what the module is supposed to do comes from VirtoOZ** (`/vc-docs`), never from
  memory — `CLAUDE.md` §Essential Rules → *Product context*. A new module with no suite is a coverage gap:
  list it in `PLAN.md` §Gaps and propose an exploratory session for it.
- **Suites:** start from `module-diff.json` `suites` (candidates — the path matcher is broad), narrow by
  domain, add the suites that cover a cross-cutting change. Check each suite's `requiresModules` against
  the deployed list: a suite for a module the env does not run is BLOCKED by plan, not a surprise later.
- `REBUILD` components are out of scope; list them in one line.

## Step 3 — Waves

Design the waves so they can run **at the same time on one environment** (contract §7):

1. **W0 — smoke gate**, always first, every other wave `dependsOn` it.
2. **Group by domain**, so two waves never consume the same disposable fixture set or the same pooled
   state ([`../rules/test-data.md`](../rules/test-data.md) §DISPOSABLE FIXTURES rule 4). Typical split:
   platform & infrastructure · catalog & search · purchase flow · returns, B2B & accounts · marketing & content ·
   theme cross-cutting · modules outside the bundle.
3. **Pull env-wide cases out** (settings, job schedules, reindex/rebuild, restore, restart, re-seed —
   contract §7.2) into `exclusive` and one final exclusive wave that depends on all the others.
4. **Size them** with `npm run regression:plan -- <suite ids>`: a wave should fit one owner's day. Never
   transcribe an estimate you did not get from that output.
5. **Name what each wave needs before it starts:** seed profiles (`npm run models:check -- --plan <profile>`,
   [`/qa-seed-data`](../skills/qa-seed-data/SKILL.md)), personas per owner (contract §7.1), env settings.

## Step 4 — Write the release folder

Write, in `regression/releases/<release>/`:

- `release.json` — per the contract §3, every wave with `id`, `title`, `suites`, `modules`, `dependsOn`,
  `exclusive` where it applies.
- `scope.json` — Step 2's rows.
- `PLAN.md` — §Environment (Step 0.2), §How the scope was decided, §Waves (table: id, scope, suites, cases,
  estimate from `regression:plan`), §Prerequisites (seed, personas, env settings, access the runs need),
  §Gaps (changed modules without a suite, modules the env does not run), §Not in scope (`REBUILD`).
- `waves/<W>/state.json` for every wave, `status: NOT_STARTED`, `owner: null`.

Then:

```
npm run release:check -- <release>      # must be green
npm run release:status -- <release> --write
```

## Step 5 — Hand it out (two questions, both gated)

Ask the user **one question with both choices**:

1. **Open the PR to `main`** with the release folder — branch `claude/qa-release/<release>-plan`, author per the
   user's git identity, the PR body in English (what changed, the wave table, prerequisites, how to claim a
   wave). Push via the user's usual route; **never merge**.
2. **Create one sub-task per wave** under `--ticket` (title `<release> regression — <W> <title>`, unassigned).
   **Required whenever more than one person will run waves:** the sub-task is the claim and its in-progress state
   is how a second owner sees a running wave before any PR merges (contract §8). Outward-facing: only on an
   explicit yes; if the user declines, say that the waves must then be run by one person at a time.

The release ticket's single progress comment (`release.json` `jiraProgressComment`) belongs to the planner: only the
planner amends it, from `PROGRESS.md`, so three owners never overwrite each other's edits
([`../rules/reports.md`](../rules/reports.md) §0).

Report what was done and the next command each QA runs:
`/qa-release-wave <release> <W> --claim`.

## Rules

- **Plans only.** This command runs no suite, seeds nothing and changes no env setting.
- **Every number from a script.** Case counts and estimates come from `regression:plan`, change facts from
  `release:diff`; nothing is transcribed by hand ([`../rules/test-data.md`](../rules/test-data.md) GOLDEN RULE).
- **The plan is a git artifact.** Nothing the waves need may live only in `reports/` (gitignored) or in a chat.
- **`--update` never rewrites a wave's state** — that file belongs to its owner (contract §2).
