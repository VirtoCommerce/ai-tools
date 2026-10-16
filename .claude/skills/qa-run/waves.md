# Release waves — `/qa-run stable:<N> <wave>`

Read by [`/qa-run`](../../commands/qa-run.md) when the selection is `stable:<N>` with a wave or `status`.
The plan comes from [`/qa-test-plan stable <N>`](../../knowledge/execution/test-plan/stable-mode.md). You run **one wave** of a release regression
on behalf of its owner. Other QA may be running other waves
on the same environment right now, so everything you do respects the parallel-run rules.

**Read first, every time:** [`release-folder.md`](release-folder.md) — the
folder, `state.json`, the ledger and its verdict vocabulary (§5–6), the parallel-run rules (§7) and the
claim protocol (§8). This file is the procedure; that file is the contract.

## Usage

```
/qa-run stable:16 status            # who holds which wave, totals, decisions pending (read-only)
/qa-run stable:16 W4 --claim        # take W4, then run it
/qa-run stable:16 W3 --continue     # pick up a half-done wave someone handed over
/qa-run stable:16 W4 --triage       # triage the wave's runs
/qa-run stable:16 W4 --publish      # put the wave in GitHub
/qa-run stable:16 W4 --handover     # stop here, leave it for someone else
```

**Where each entry point starts.** A flag never skips a step: triage (Step 4) starts, and the GitHub question (Step 7)
is asked, whenever the wave reaches them, whatever flag brought it there.

| Wave status / flag | Starts at |
|---|---|
| `NOT_STARTED` + `--claim` | Step 1 |
| `CLAIMED`, or `RUN_DONE` with `notRun` + `--continue` | Step 2 (then runs only what is not run yet) |
| `RUN_DONE` with `untriaged > 0` — with no flag, `--triage`, `--publish` or `--handover` | **Step 4** (triage runs first) |
| `RUN_DONE` with `untriaged = 0`, or `TRIAGED` | Step 6 |
| `--handover` on `CLAIMED` (nothing ran) | Step 8 |

## `status` — read-only

Pull `main` first (`git checkout main && git pull`, or a clean worktree of `origin/main`) — the script reads
the files on disk, so a stale checkout shows a stale picture. Then `npm run release:status -- stable-<N>` and
show: the wave table, *Not run yet*, *Real bugs awaiting filing*, *Decisions pending*, which waves are free to
claim (`NOT_STARTED`, every `dependsOn` wave at least `RUN_DONE`), and — from the tracker — which wave
sub-tasks are assigned and in progress right now. Change nothing.

## Step 0 — Pre-flight

1. Work on a branch from current `main`: `claude/qa-release/stable-<N>-<wave>` (create it or check it out; a
   reused checkout keeps old tips — reset to `origin/<branch>` before adding to it).
2. `npm run release:check -- stable-<N>` must be green. Read `release.json` (this wave's `suites`, `dependsOn`,
   `exclusive`) and every other wave's `state.json`.
3. **Dependencies:** every wave in `dependsOn` is at least `RUN_DONE` — W0 especially. If not, STOP and say which.
4. Run the [`/preflight`](../../skills/preflight/SKILL.md) skill for `env.testEnv`. The deployed build must still match
   `release.json` `env` — a hotfix deployed mid-release is recorded in `report.md`, not ignored.

## Step 1 — Claim (`--claim`)

1. **The tracker sub-task is the claim** (contract §8): git only learns about a claim when the wave PR merges,
   so the sub-task is the one place a second QA can see it in time. If the release has no wave sub-tasks and
   more than one person is working on it, STOP and ask the planner to create them.
2. **Is it free?** The wave's sub-task is unassigned and `state.json` is `NOT_STARTED`. Otherwise STOP and show who
   holds it.
3. **Ask once:** assign the sub-task to the user (outward-facing — only on a yes).
4. **Personas:** confirm the persona variables in the user's `.env.local` point at accounts no other owner uses this
   release (contract §7.1); compare with the `personas` of every other wave's `state.json`. If unsure, ask the user;
   never borrow another owner's accounts.
5. Write `state.json`: `owner`, `status: CLAIMED`, `personas`, `updatedAt`. On `--continue`, append the previous
   owner to `handovers` instead and take `owner`.

## Step 2 — Known ground before running

```
npm run release:status -- stable-<N> --ledger --suites <this wave's suite ids> --with-baseline
```

Keep that output: earlier verdicts for these suites, from this release and from the `baseline` release when its
folder exists. It is used in Step 5, and its `ENV_CONFIG` / `DATA` rows tell you what to check on the env
**before** spending a run on it (a stalled index, a module that is not installed, an unconfigured scope).

## Step 3 — Run

1. **Resolve the run** with `npm run regression:plan -- <suite ids>`, plus `--cases <tier>` when the wave has a `tier` (`critical`, `high`; a `rest` wave runs the cases neither tier selected — `npm run suites:filter`). Remove every suite or case listed in
   **another** wave's `exclusive` (contract §7.2) — this wave's own `exclusive` list is what it exists to run.
   Machine-lane suites first: they cost no model tokens (contract §7).
2. **Do not re-seed** a fixture set another wave uses while another wave is running — check the wave sub-tasks
   in the tracker, not only `state.json` (contract §7.3). Data this wave needs for itself is created under the
   owner's personas and removed afterwards.
3. Set `state.json` `status: RUNNING` and move the sub-task to in-progress, then run
   the execution pipeline ([`run.md`](run.md) — today the `/qa-regression` pipeline, Steps 0–8) with the wave's suite ids, its `--cases` tier and
   `TEST_ENV=<env.testEnv>`. Every rule of that pipeline applies unchanged (browser lanes, `--secrets`, the observed-behaviour steps of its runners).
4. When it finishes — or is cut short (usage limit, env down) — append the run id to `runIds`, write `totals` from
   the run's consolidated report (never counted by hand; `ambiguous` holds what is neither pass, fail, blocked nor
   skipped), put anything not run into `notRun` (suite ids + case count + reason), set `untriaged` to the FAIL count,
   `status: RUN_DONE`. **Then go to Step 4 — a cut-short run too.**

## Step 4 — Triage starts on its own

No question: as soon as the wave is `RUN_DONE` with FAILs or BLOCKED cases that have no ledger row, go to Step 5 and
say in one line what is being triaged ("Triaging N FAIL (U without a verdict) and M BLOCKED"). It is stopped only if
the user stops it.

## Step 5 — Triage

1. Run [`/qa-triage-results`](../../commands/qa-triage-results.md) on the wave's run id(s). **Put Step 2's ledger output in the
   classifier brief as known ground:** a finding that matches a row whose `reopen_when` has not happened is cited
   with that row's verdict and `follow_up`, not re-investigated.
2. **Ask the base before comparing** — for each real-bug candidate's endpoint / GraphQL operation / page path:
   `mcp__kb__kb_ask` (CLI: `npm run kb -- ask "<coordinate> <question>"`). Close each list by its handle
   (`kb_show`/`kb_none`); a miss is not a blocker. Rule: `CLAUDE.md` §Essential Rules → *Product context*.
3. **Compare each real-bug candidate on the baseline** (`release.json` `baseline`) to set `new_in_release`. Dispatch
   it to `qa-backend-expert` (`playwright-edge`) or `qa-frontend-expert` (`playwright-chrome`) per
   [`../rules/agents.md`](../../rules/agents.md) §Parallel Execution, with a brief built from
   [`../templates/agent-dispatch.md`](../../templates/agent-dispatch.md) including its observed-behaviour line.
   Temporary data only, removed afterwards; `yes` only when the baseline does not show it.
4. Write one ledger row per triaged finding — **including every one that will not be filed** — in
   `waves/<W>/ledger.csv`, mapping the triage class per the contract §6. Amend a row for a re-check of the same run;
   never append a duplicate. Real bugs not filed yet: `follow_up: DRAFT`; the same defect seen in several cases: one
   `DRAFT`, the others `DRAFT: same defect as <case>, file once`. A question only a person can answer:
   `PENDING_DECISION` with `decided_by` naming that person. Set `untriaged` to the FAILs still without a row.
5. **Bank what the triage established** — for each platform behaviour your rows state (real bug, by-design,
   env quirk): matched ⇒ `mcp__kb__kb_confirm`, contradicted ⇒ `kb_dispute`, base held nothing ⇒ `kb_capture` (CLI:
   `npm run kb -- capture`). Anchor = the route or request, never a label; contract:
   `.claude/knowledge/execution/kb-capture-contract.md`. Public base. Put the entry ids in the row's `source`.
6. Write `waves/<W>/report.md`: results per suite, what the FAILs were (by verdict), BLOCKED causes with the fix for
   each, the real bugs (new vs pre-existing), and **"Before the next owner continues"** if anything is left. Within the
   regression cap of [`../rules/reports.md`](../../rules/reports.md) §2.
7. Case and fixture repairs the triage found go on the same branch, through
   [`/qa-review-tests`](../../skills/qa-review-tests/SKILL.md) `--fix` — one author per suite CSV for the duration of the
   change ([`../rules/regression.md`](../../rules/regression.md) §Suite inventory). Re-run the repaired cases before
   calling them fixed.
8. `status: TRIAGED` when `untriaged` is 0; otherwise the wave stays `RUN_DONE`.

## Step 6 — ASK: file the real bugs?

Show the `DRAFT` rows (new-in-release first, one per defect). Ask which to file. Filing follows the tracker rules —
[`../rules/reports.md`](../../rules/reports.md) §0–§0b and [`tracker-ops.md`](../../knowledge/execution/tracker-ops.md):
labels, screenshots inline, linked to `release.json` `ticket`. Replace `DRAFT` with the key of each one filed. Never file
without the user's yes for that bug.

## Step 7 — ASK: put it in GitHub?

**Always ask after triage:** "Commit the wave and open a PR?" On *yes*:

1. `npm run release:status -- stable-<N> --write`, then `npm run release:check -- stable-<N>` — must be green.
2. Commit on the wave branch: `waves/<W>/` (state, ledger, report) and `PROGRESS.md`; the case / fixture repairs from
   Step 5.7 in their own commit, so they can be reviewed apart from the record. Commit author per the user's git identity.
3. Push and open **one PR to `main`** — body in English: wave, run ids, totals, new-in-release bugs, decisions pending,
   what is left. **Never merge.** If CI reports `PROGRESS.md is stale` (another wave merged first), rebase on `main`,
   re-run `--write`, push again.
4. **`DONE`** is set in the wave's own PR once nothing is open in it: `untriaged` 0, every repair merged or on this PR,
   every `DRAFT` filed or explicitly deferred by the user. Otherwise the wave stays `TRIAGED`, and the PR that closes
   the last open item sets `DONE`.

## Step 8 — Handover (`--handover`, or when stopping early)

Triage (Step 4) runs first if the wave has FAILs without a verdict. Then leave the wave `RUN_DONE` (or `CLAIMED`
if nothing ran) with `notRun` filled in and a "Before the next owner continues" section in `report.md` — including
where any unpushed repair lives — and go to Step 7 so it reaches git. Offer to unassign the sub-task. The next owner
runs `/qa-run stable:<N> <wave> --continue`, which records the handover in `handovers`; the wave id stays.

## Rules

- **Tier order is a dependency:** a `high` wave starts only when every `critical` wave has run, a `rest` wave only when
  every `high` wave has — Step 0.3 checks `dependsOn`, which the plan fills that way.
- **One wave, one owner.** Write only this wave's `waves/<W>/`, the generated `PROGRESS.md`, and the suites you are
  repairing; never another wave's files ([`release-folder.md`](release-folder.md) §2).
- **Parallel-safe or not at all:** own personas, no env-wide changes, no re-seed under a running wave (§7).
- **Triage starts on its own after any run (Step 4); the GitHub question after triage (Step 7) is never skipped** — whatever flag.
- **Outward-facing writes only on a yes:** tracker assignment, bug filing, push, PR. Never merge.
- **Numbers from the run, not from memory** — totals from the consolidated report, counts from `release:status`.
