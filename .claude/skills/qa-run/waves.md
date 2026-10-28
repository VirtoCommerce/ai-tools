# Release waves — `/qa-run <release> <wave>`

Read by [`/qa-run`](../../commands/qa-run.md) when the selection is `stable:<N>` or `sprint:<XX-YY>` with a wave or `status`.
The plan comes from [`/qa-test-plan stable <N>`](../../knowledge/execution/test-plan/stable-mode.md) or
[`/qa-test-plan <sprint>`](../../knowledge/execution/test-plan/sprint-mode.md) Step 8. Below, `<rel>` is the argument as
typed (`stable:17`, `sprint:26-20`) and `<release>` its folder under `regression/releases/` (`stable-17`,
`sprint-26-20`). You run **one wave** of a release regression
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
/qa-run sprint:26-20 C-purchase --claim   # the same for a wave of a sprint regression
```

**Where each entry point starts.** A flag never skips a step: triage (Step 4) starts, and the GitHub question (Step 7)
is asked, whenever the wave reaches them, whatever flag brought it there.

| Wave status / flag | Starts at |
|---|---|
| `NOT_STARTED` + `--claim` | Step 1 |
| `CLAIMED` or `RUN_DONE` held by someone else + `--continue` | **Step 1** (a takeover is a claim), then Step 2 — runs only what is not run yet |
| `CLAIMED`, or `RUN_DONE` with `notRun`, held by the user + `--continue` | Step 2 (then runs only what is not run yet) |
| `RUN_DONE` with `untriaged > 0` (FAIL or BLOCKED cases without a ledger row) — with no flag, `--triage`, `--publish` or `--handover` | **Step 4** (triage runs first) |
| `RUN_DONE` with `untriaged = 0`, or `TRIAGED` | Step 6 |
| `--handover` on `CLAIMED` (nothing ran) | Step 8 |

**Only the owner writes a wave.** Every entry except `status`, `--claim` and `--continue` starts by checking that
`state.json` `owner` is the user **and** the wave sub-task is assigned to them. Otherwise STOP and show who holds it —
taking a wave over is `--continue`, which goes through Step 1.

## `status` — read-only

Pull `main` first (`git checkout main && git pull`, or a clean worktree of `origin/main`) — the script reads
the files on disk, so a stale checkout shows a stale picture. Then `npm run release:status -- <release>` and
show: the wave table, *Not run yet*, *Real bugs awaiting filing*, *Decisions pending*, which waves are free to
claim (`NOT_STARTED`, every `dependsOn` wave at least `RUN_DONE`), and — from the tracker — which wave
sub-tasks are assigned and in progress right now. Change nothing.

## Step 0 — Pre-flight

1. Work on a branch from current `main`: `claude/qa-release/<release>-<wave>` (create it or check it out; a
   reused checkout keeps old tips — reset to `origin/<branch>` before adding to it).
2. `npm run release:check -- <release>` must be green. Read `release.json` (this wave's `suites`, `dependsOn`,
   `exclusive`) and every other wave's `state.json`.
3. **Dependencies:** every wave in `dependsOn` is at least `RUN_DONE` — W0 especially. If not, STOP and say which.
4. **Before every wave, and before every resumed run of one:** run the [`/preflight`](../../skills/preflight/SKILL.md)
   skill as `regression <this wave's suite ids>` for `env.testEnv`. Beyond the stand and the build it checks what the
   wave's cases need — personas and lane accounts, `@td()` fixtures, and the store, platform and deploy-config
   requirements in `config/suite-requirements.json` — and names the cases each gap will BLOCK. Show the rows; offer the
   `me` / `me, with OK` fixes (seeding, a store setting) before the run, and hand the `you` rows (a vc-deploy-dev PR,
   a password) to the owner. **A gap left as it is costs nothing at run time:** every case a WARN/BLOCK row names is
   recorded BLOCKED with that row's reason and not run (the pre-flight's `skip` map — no browser slot, no model tokens).
   They become those cases' ledger rows in Step 5 — never a surprise in triage. `--run-blocked` runs them anyway, for a
   check that the prediction still holds. The deployed build must still match
   `release.json` `env` — a hotfix deployed mid-release is recorded in `report.md`, not ignored.

## Step 1 — Claim (`--claim`, or `--continue` on a wave someone else holds)

1. **The tracker sub-task is the claim** (contract §8): git only learns about a claim when the wave PR merges,
   so the sub-task is the one place a second QA can see it in time. If the release has no wave sub-tasks and
   more than one person is working on it, STOP and ask the planner to create them.
2. **Is it free?**
   - `--claim`: the wave's sub-task is unassigned and `state.json` is `NOT_STARTED`.
   - `--continue`: the sub-task is unassigned (the previous owner handed it over, §8) and `report.md` has a
     "Before the next owner continues" section.
   - Otherwise STOP and show who holds it. **A claim that looks abandoned is still a claim:** ask its holder
     (a comment on the sub-task), or the planner when the holder cannot be reached, and take over only on that
     person's answer — recorded in the `handovers` note (contract §8, stale claims).
3. **Ask once:** assign the sub-task to the user, comment "claimed by <user> at <time>" on it, and push the
   claim branch (outward-facing — all three on one yes).
4. **Verify the claim held.** Re-read the sub-task after assigning. Jira keeps the last assignment, so two people
   can both "assign" in the same minute: if the assignee is not the user, or another claim comment came in first,
   the other person has the wave — STOP, undo nothing of theirs, and pick another wave.
5. **Personas:** confirm the persona variables in the user's `.env.local` point at accounts no other owner uses this
   release (contract §7.1); compare with the `personas` of every other wave's `state.json`. If unsure, ask the user;
   never borrow another owner's accounts.
6. Write `state.json`: `owner`, `status: CLAIMED` (on `--continue` the status stays), `personas`, `updatedAt`. On
   `--continue`, append the previous owner to `handovers` first. Commit it to
   `claude/qa-release/<release>-<wave>` and push now — a second claimant then hits the existing branch before
   the run, not after it.

## Step 2 — Known ground before running

```
npm run release:status -- <release> --ledger --suites <this wave's suite ids> --with-baseline
```

Keep that output: earlier verdicts for these suites, from this release and from the `baseline` release when its
folder exists. It is used in Step 5, and its `ENV_CONFIG` / `DATA` rows tell you what to check on the env
**before** spending a run on it (a stalled index, a module that is not installed, an unconfigured scope).

## Step 3 — Run

1. **Resolve the run** with `npm run regression:plan -- <suite ids>`, plus `--cases <tier>` when the wave has a `tier` — `rest` is `--cases medium,low` ([`release-folder.md`](release-folder.md) §3: unreadable priorities only in Scope Exclusions). Remove every suite or case listed in
   **another** wave's `exclusive` (contract §7.2) — this wave's own `exclusive` list is what it exists to run.
   Machine-lane suites first: they cost no model tokens (contract §7).
2. **Do not re-seed** a fixture set another wave uses while another wave is running — check the wave sub-tasks
   in the tracker, not only `state.json` (contract §7.3). Data this wave needs for itself is created under the
   owner's personas and removed afterwards.
3. Set `state.json` `status: RUNNING` and move the sub-task to in-progress, then run
   the execution pipeline ([`run.md`](run.md) — today the `/qa-regression` pipeline, Steps 0–8) with the wave's suite ids, its `--cases` tier and
   `TEST_ENV=<env.testEnv>`. Its plan must write `reports/regression/<RUN_ID>/preflight.json` (`--preflight-out`): that
   file is what `suites:lanes` reads the `skip` map from. This second pre-flight is the one that counts: it re-derives
   the `skip` map after any Step 0 fix, so a gap fixed at Step 0 no longer skips its cases. Every rule of that pipeline applies unchanged (browser lanes, `--secrets`, the observed-behaviour steps of its runners).
4. When it finishes — or is cut short (usage limit, env down) — append the run id to `runIds`, write `totals` from
   the run's consolidated report (never counted by hand; `ambiguous` holds what is neither pass, fail, blocked nor
   skipped), put anything not run into `notRun` (suite ids + case count + reason — including each suite's
   `notDeployed` cases from its results file, reason `not deployed: <module>`), set `untriaged` to the FAIL + BLOCKED count,
   `status: RUN_DONE`. **Then go to Step 4 — a cut-short run too.**

## Step 4 — Triage starts on its own

No question: as soon as the wave is `RUN_DONE` with FAILs or BLOCKED cases that have no ledger row, go to Step 5 and
say in one line what is being triaged ("Triaging N FAIL (U without a verdict) and M BLOCKED"). It is stopped only if
the user stops it.

## Step 5 — Triage

1. Invoke the Skill tool with `skill: "vc-test:qa-triage-results"` (shim: [`/qa-triage-results`](../../commands/qa-triage-results.md)), args the wave's run id(s). **Put Step 2's ledger output in the
   classifier brief as known ground:** a finding that matches a row whose `reopen_when` has not happened is cited
   with that row's verdict and `follow_up`, not re-investigated.
2. **Ask the base before comparing** — for each real-bug candidate's endpoint / GraphQL operation / page path:
   `mcp__kb__kb_ask` (CLI: `npm run kb -- ask "<coordinate> <question>"`). Close each list by its handle
   (`kb_show`/`kb_none`); a miss is not a blocker. Rule: `CLAUDE.md` §Essential Rules → *Product context*.
3. **Compare each real-bug candidate on the baseline** (`release.json` `baseline`) to set `new_in_release`. Dispatch
   it to `qa-backend-expert` (`playwright-edge`) or `qa-frontend-expert` (`playwright-chrome`) per
   [`../rules/agents.md`](../../rules/agents.md) §Parallel Execution, with a brief built from
   [`../templates/agent-dispatch.md`](../../templates/agent-dispatch.md) including its observed-behaviour line.
   Temporary data only, removed afterwards; `yes` only when the baseline does not show it. A sprint release has a
   baseline stand only when `release.json` `env.baselineEnv` names one; without it, `new_in_release` is `no` when the
   baseline release's ledger (Step 2) already holds the finding, otherwise `unknown` — never `yes` without a build that
   shows the difference.
4. Write one ledger row per triaged finding — **including every one that will not be filed** — in
   `waves/<W>/ledger.csv`, mapping the triage class per the contract §6. Amend a row for a re-check of the same run;
   never append a duplicate. Real bugs not filed yet: `follow_up: DRAFT`; the same defect seen in several cases: one
   `DRAFT`, the others `DRAFT: same defect as <case>, file once`. A question only a person can answer:
   `PENDING_DECISION` with `decided_by` naming that person. Set `untriaged` to the FAIL and BLOCKED cases still without a row.
   The triage packet's `preClassified` cases (recorded BLOCKED by the pre-flight, never run) get one row per case with
   `source: preflight` and the row's reason: `req:` / `secret:` / a persona's password → `ENV_CONFIG`, an unseeded
   `fixture:` → `DATA`. They cost no classifier call. (A case whose module is not on the stand never gets here: it
   left the plan as `notDeployed`.)
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

Show the `DRAFT` rows (new-in-release first, one per defect). Ask which to file. Never file without the user's yes for
that bug.

1. **Re-verify on the build that is deployed NOW** — a DRAFT is only as good as the build it was seen on, and the
   stand moves (Stable 16: a "new in release" export failure was the stand lagging the bundle, not the bundle). Live
   repro through `vc-fix:qa-investigate`, one candidate per dispatch, ≤3 at a time, each on its own lane; it leaves an
   evidence package (screenshots, requests, the deciding source) under `reports/regression/<RUN_ID>/evidence/<case>/`.
   Not reproduced ⇒ change the row's verdict, do not file. A bug without screenshots is not filed.
2. **File through `/vc-fix:qa-bug`**, one call per confirmed bug:
   `/vc-fix:qa-bug "<defect>" found-by:agent-regression <RUN_ID> --evidence <the package> --link <release.json ticket> --confirmed`.
   `--evidence` makes it read the package instead of reproducing a second time; `--link` relates the bug to the release
   ticket; `--confirmed` passes on the yes this step already took, so it does not ask per bug. It owns the duplicate
   check, the tracker fields, Need hotfixes, the origin labels (`found-by-agent` + `found-in-regression`), the
   screenshots inside the fields and the render check ([`../rules/reports.md`](../../rules/reports.md) §0–§0b,
   [`tracker-ops.md`](../../knowledge/execution/tracker-ops.md)). Do not hand-roll the tracker call: a second filing
   path drifts from the first. The flags need vc-fix ≥ 0.16.0 (#536). On an older install they are ignored: it asks per
   bug and does not link — then link each filed bug to `release.json` `ticket` (Relates) yourself.
3. Replace `DRAFT` with the key. The other rows of the same defect (the `DRAFT: same defect as …` rows) now point at an
   existing issue, so they become `DUPLICATE` with that key.

## Step 7 — ASK: put it in GitHub?

**Always ask after triage:** "Commit the wave, open a PR and post the wave report?" On *yes*:

1. `npm run release:status -- <release> --write`, then `npm run release:check -- <release>` — must be green.
2. **The wave report in the tracker:** `npm run release:report -- <release> --wave <W> --post` — before the commit, so
   the comment ids it records in `state.json` `reports` are in it. It posts two NEW comments, each with an inline image:
   - on the **wave sub-task** — the run's own dashboard (`regression-report.html`, its summary part as a PNG; the HTML
     attached), the totals, the wave's real bugs, the ledger's verdict counts, what was not run;
   - on the **release ticket** — the release dashboard (every wave, status, numbers, owner, real bugs filed / to file,
     pending decisions), then what this wave added and the release's full real-bug list.

   A new comment per wave is the rule, not a duplicate: a wave is its own run, and only a new comment notifies.
   Re-posting the same wave amends its own two comments. Without `--post` the script only builds the files
   (`reports/regression/releases/<release>/<W>/`) — show them first when the user wants to see before posting.
3. Commit on the wave branch: `waves/<W>/` (state, ledger, report) and `PROGRESS.md`; the case / fixture repairs from
   Step 5.7 in their own commit, so they can be reviewed apart from the record. Commit author per the user's git identity.
4. Push and open **one PR to `main`** — body in English: wave, run ids, totals, new-in-release bugs, decisions pending,
   what is left. **Never merge, never force-push.** A push the remote rejects as non-fast-forward means someone else
   pushed this wave's branch: STOP and show whose commits are there — never overwrite another owner's state, ledger or
   report. Before the PR merges it must be up to date with `main`: if another wave merged first, rebase on `main`,
   re-run `--write`, push again (CI checks the PR as it was when it ran, not after `main` moved).
5. **`DONE`** is set in the wave's own PR once nothing is open in it: `untriaged` 0, every repair merged or on this PR,
   every `DRAFT` filed or explicitly deferred by the user. Otherwise the wave stays `TRIAGED`, and its owner sets `DONE`
   in a follow-up wave PR once the last open item closes — a repair PR by someone else never writes the wave's files.

## Step 8 — Handover (`--handover`, or when stopping early)

Triage (Step 4) runs first if the wave has FAIL or BLOCKED cases without a ledger row. Then leave the wave `RUN_DONE` (or `CLAIMED`
if nothing ran) with `notRun` filled in and a "Before the next owner continues" section in `report.md` — including
where any repair lives, which must be a pushed branch — and go to Step 7 so it reaches git. Unassign the sub-task
(on the user's yes): an assigned sub-task is a live claim, and `--continue` will not take it. The next owner runs
`/qa-run <rel> <wave> --continue`, which claims through Step 1 and records the handover in `handovers`; the wave id
stays.

## Rules

- **Tier order is a dependency:** a `high` wave starts only when every `critical` wave has run, a `rest` wave only when
  every `high` wave has — Step 0.3 checks `dependsOn`, which the plan fills that way.
- **One wave, one owner.** Write only this wave's `waves/<W>/`, the generated `PROGRESS.md`, and the suites you are
  repairing; never another wave's files ([`release-folder.md`](release-folder.md) §2).
- **Parallel-safe or not at all:** own personas, no env-wide changes, no re-seed under a running wave (§7).
- **Triage starts on its own after any run (Step 4); the GitHub question after triage (Step 7) is never skipped** — whatever flag.
- **Outward-facing writes only on a yes:** tracker assignment, bug filing, push, PR. Never merge.
- **Numbers from the run, not from memory** — totals from the consolidated report, counts from `release:status`.
