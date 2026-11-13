---
description: "[Testing] PREVIEW — goal-driven testing of a non-trivial ticket: contract → research → derived criteria + strategy (one approval) → test → independent judge → verdict."
argument-hint: "<TICKET> [<env>]"
disable-model-invocation: true
---

# /vc-test:qa-goal — a ticket no fixed pipeline can test

Load Skill `vc-test:qa-goal` and follow it: its rails, its steps 0–9, its stops S1 / S2 / S3 and the abort close are
this command's body. This file adds only the arguments, the order of the two ends of a run, and where the skill's
commands come from.

- `<TICKET>` is `<KEY>`; `<env>` is the optional second argument. **With `<env>`, prefix every `node` command of the
  run with `TEST_ENV=<env> `** (the skill's Conventions).
- `<plugin>` is this plugin's folder (`plugins/vc-test` in a checkout). Run every command from the project root.
- `<dir>` is the run folder `goal.mjs init` prints (`.vc-fix/vc-test/<KEY>/<env>/goal/<runId>/`); evidence and
  script inputs go there. Run state lives in `<dir>` and `.vc-fix/vc-test/<KEY>/<env>/`; the knowledge write-back
  (Close 2) and an approved S3 bug write elsewhere. The ticket is never transitioned.
- Double-quote every path on a command line (`"<dir>"` — a Windows path may hold a space); single-quote values.
- This command starts nothing outward by itself: no tracker post, no bug, no status change without S3.

## Start — the skill's step 0, in this order

1. `node <plugin>/lib/profile.mjs --check` — exit 2 ⇒ STOP "run /project-init (vc-init), then /vc-test:init"; exit 3 ⇒
   STOP with its message; an error naming `Cannot find package` ⇒ `npm install --omit=dev --prefix "<plugin>"` once
   (as `/vc-test:init` says), then this step again.
2. `date -u +%FT%TZ` → `<start>`, the `--since` of every `run-cost.mjs` reading.
3. `node <plugin>/lib/goal.mjs init --key <KEY> [--env <env>]` → `{ dir, runId, resumed }`. `resumed: true` ⇒ the
   skill's step 0.3 (`resume.md`: the earlier spend first, then where to go on); `--new` only when the person asks for a fresh run.
4. `node <plugin>/lib/capabilities.mjs --key <KEY> --mcp <this session's MCP servers>` → `capabilities.json`.
5. Not resumed: `node <plugin>/lib/write-zones.mjs snapshot --key <KEY> --run-dir <dir>`.
6. The budget in force (skill step 0.6, rail 10's `run-cost.mjs`).

Then steps 1–8 exactly as the skill gives them: the contract and S1, context (`/vc-test:ticket-context`), the research
loop, criteria and strategy with S2, the test loop, triage, the draft verdict, the judge.

## Close — the skill's step 9, in this order

1. `node <plugin>/lib/oauth-code.mjs purge --dir <dir>` — before anything else.
2. Knowledge write-back (`research-loop.md` §Write-back).
3. `node <plugin>/lib/write-zones.mjs check --key <KEY> --run-dir <dir> --run-plan <dir>/run-plan.json > <dir>/write-zones.json`.
4. `node <plugin>/lib/teardown.mjs --key <KEY> > <dir>/teardown.json`.
5. `node <plugin>/lib/goal.mjs close --dir <dir> --write-zones <dir>/write-zones.json --teardown <dir>/teardown.json`.
6. `node <plugin>/lib/goal.mjs check --dir <dir> --before close`.
7. Print `verdict.md`'s first two lines and its path.
8. **S3**, one outward write at a time, each under its own label (`bug:F-<n>`, `comment:<n>`), per the skill's
   `goal-contract.md` §S3: ask first; on a yes record the S3 checkpoint —
   `node <plugin>/lib/goal.mjs checkpoint --dir <dir> --stop S3 --decision approved --who '<who>' --note '<label>'` —
   and act only after `node <plugin>/lib/goal.mjs check --dir <dir> --before write --what '<label>'` exits 0. A bug
   is filed from the judged evidence (§S3's bug package), never a fresh investigation.

The exit-code handling of steps 3, 4 and 6, and the abort close of a run that ends without a judged verdict, are in
the skill's step 9 and §Stops — follow them there.
