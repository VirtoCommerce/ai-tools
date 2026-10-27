---
description: "[Testing] PROTOTYPE vc-test — one feature-test ticket by scenarios: context → change map → approved scenarios, one agent each, beside the background AC run → triage → verdict, costed. Triage and investigation still need an ai-tools checkout (P2)."
argument-hint: "<TICKET> [<env>] [--yes] [--dry-run]"
disable-model-invocation: true
---

# /vc-test:qa-ticket — one ticket, the bugs a checklist misses

You orchestrate **inline** and hold only paths: every hand-off is a file, never a summary.
Design: `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` §3, U60–U68.
`<plugin>` is this plugin's folder (`plugins/vc-test` here). Run every command from the project root. `WORK` is
`.vc-fix/vc-test/<TICKET>/<env>/`.
**Dispatch `<x>` (`vc-test:<agent>` or `<model>`) with P** = that subagent type on the model in its own frontmatter, or a
`general-purpose` agent of `<model>` with brief "Read and follow `<plugin>/briefs/<x>.md`"; P always has `PLUGIN` = `<plugin>`.

## Rules

1. **Two human points only**: the scenario list's approval (step 3, `--yes` answers it) and step 8. Nothing else asks
   but step 0's `unresolved` route.
2. **No ticket status transition, no tracker comment** — `verdict.md` is the output.
3. **Bugs only through `/vc-fix:qa-bug`** (step 8).
4. **Every dispatch's description is `[vc-test:<step>] <TICKET>`**, a skill's too: `run-cost.mjs` counts by it.
5. **A brief is paths plus the one skill its step needs.** Never paste the bundle, the strategy or a result.
6. One browser lane per agent, ≤ 3 at once (`run-plan.json` keeps both).
7. A Low or cosmetic finding gets one line under "Noticed" — no investigation, no screenshot, no bug (U25).
8. **Every turn re-reads your context**: read no supporting file or script source unless a step fails; keep a
   script's exit code and summary (`| tail -n 20`).
9. **A STOP once step 5 has begun tears down first** (step 8); any STOP removes `<WORK>/prepare/`. `rounds.mjs
   bundle`, `append`, `filed` or `close` exit 1 ⇒ report its stderr, STOP.

## 0 — Probe

1. `npm run run:use -- <TICKET> [<env>]` → note `RUN_DIR` and the start time (`date -u +%FT%TZ`).
2. `node <plugin>/lib/route.mjs --key <TICKET>` → `{job, reason, next}`: `verify-fix` / `hotfix-check` ⇒ STOP naming `next`; exit 4 (`unresolved`) ⇒ ask
   which job, quoting `reason` (not a third point: no run yet), then verify-fix / hotfix-check ⇒ STOP naming `next`, test ⇒ go on; exit 3 ⇒ route after step 1 with
   `--bundle <BUNDLE>` (round ≥ 2: after 0b.1, `--bundle <DELTA_PREPARE>`); exit 2 ⇒ STOP "run /project-init". A not-fixed Bug's `reason` is `MISSION` (step 3).
3. `node <plugin>/lib/rounds.mjs count --key <TICKET> --run-dir <RUN_DIR>` → `ROUND`, `MODE`. Exit 2 ⇒ STOP: print its
   `escalation` (`<plugin>/skills/qa-test-strategy/rounds.md` §At most three). `refresh`, or
   `resume` with ROUND ≥ 2: its `recordRound` must be ROUND − 1, else STOP naming the remedy (rounds.md §Round N in vc-test); `BASE` is its `bundle`. `refresh` ⇒ 0b instead of steps 1–3.
   `resume` ⇒ the steps of that round, its approved section reused: round ≥ 2 runs 0b, and its analyst and strategy
   dispatches only when the section fails the gate (0b.2). Round 1 only, after step 1: `count` again with
   `--bundle <BUNDLE>`; exit 2 ⇒ the same STOP; `refresh` (a verdict comment is an earlier round) ⇒ STOP as a refresh
   whose `recordRound` is not ROUND − 1.
4. `node <plugin>/lib/capabilities.mjs --key <TICKET> --mcp <list>` — which of `playwright-chrome`,
   `playwright-firefox`, `playwright-edge`, `chrome-devtools` you have.
5. **Domain slug** from the ticket's components and summary, checked by `npm run bl:extract -- --has-domain <slug>` or
   listed in `capabilities.json` `knowledgeStore.domainMaps`; none checks out ⇒ no slug (F2 fires on doubt).

## 0b — Round N ≥ 2: refresh (U15, `rounds.md` §Round N in vc-test)

No `/vc-test:ticket-context`, no change map, no scenarios agent, no human point 1. `<ctx>` is
`<plugin>/skills/ticket-context`. `[--change-map <WORK>/change-map.json]` below is passed only when that file exists. **Rebuild**: `node <plugin>/lib/rounds.mjs bundle --key <TICKET> --base <BASE> --delta
<DELTA> --prepare <DELTA_PREPARE>` → prints `BUNDLE`, round N's text, ACs and PRs (the TICKET and CHANGE outputs and
`deploy.json` beside `DELTA_PREPARE`, when they exist), for the strategy and every later step (5, 7, 8). With no
analyst output it reuses a `<WORK>/bundle.json` stamped for round N.

1. `node <ctx>/lib/cli.mjs prepare <TICKET> --since <record>` (its Step 0 statuses, STOPs and host-governed passes) → its `prepare_path` is `DELTA_PREPARE`; then `node <plugin>/lib/rounds.mjs delta --key <TICKET> --run-dir <RUN_DIR>
   --prepare <DELTA_PREPARE>` → `DELTA` (`<WORK>/delta.json`). Exit 2 ⇒ `abort` the prepare, then STOP: `sameBuild`
   "Round <N−1> already tested this build" (P3), `cap` its `escalation`. Route exited 3 at step 0 ⇒ now
   `node <plugin>/lib/route.mjs --bundle <DELTA_PREPARE>`, handled as step 0.2; a STOP it causes `abort`s the prepare first.
2. A `resume` first rebuilds (reusing round N's), then gates the section: `node <plugin>/skills/qa-test-strategy/lib/check-strategy.mjs --strategy
   <RUN_DIR>/test-strategy.md --bundle <BUNDLE> [--change-map <WORK>/change-map.json] --capabilities
   <WORK>/capabilities.json`; exit 0 ⇒ only `deploy --prepare` below, then `abort` the prepare and step 4; else as a
   refresh. Dispatch `vc-test:ticket-context-analyst` per `DELTA.dispatch` (TICKET; CHANGE per PR, `PRS: <ref>`) with `PREPARE =
   DELTA_PREPARE`, then `save` / `merge-change` (that skill's Step 2), `deploy --prepare` (its Step 4), and rebuild. `NOT DEPLOYED`
   ⇒ BLOCKED on deploy, as step 1.
3. `node <plugin>/lib/rounds.mjs append --run-dir <RUN_DIR> --delta <DELTA> [--change-map <WORK>/change-map.json]`; dispatch
   `strategy` (`opus`) with `DELTA`, the analysts' outputs as `TICKET` / `CHANGE`, `DEPLOY` = `deploy.json` beside
   `DELTA_PREPARE`, `BUNDLE`, `CHANGE_MAP` = round 1's (none when it does not exist), `CAPABILITIES`, `RUN_DIR` (`briefs/strategy.md` §Round N ≥ 2). Gate fails twice ⇒ STOP. `abort` the prepare, then
   step 4.

## 1 — Context

`/vc-test:ticket-context <TICKET> --domain <slug>` (none without a slug); its bundle is every agent's `BUNDLE`. Its
STOPs are this run's; on a host-governed project it reads through the host's servers (its Step 0). Before its `finish`:
`node <plugin>/lib/keep-prepare.mjs --prepare <prepare_path> --key <TICKET>` → `PREPARE` (none if cached). A `NOT DEPLOYED:` line in `blockers[]` ⇒ BLOCKED on deploy: write
`verdict.md` with it and stop.

## 2 — Change map, then scenarios

1. Dispatch `change-map` (`vc-test:change-map`) with `BUNDLE`, `MIND_MAP` / `DATA_MODEL` of the slug, if any. Save its reply, the map: `node <plugin>/lib/check-change-map.mjs
   --agent <its agent id> --out <WORK>/change-map.json --bundle <BUNDLE>`; exit 1 or 2 ⇒ dispatch it once more (a new
   agent) with the printed errors, save from its id; fails again ⇒ STOP. **Show the suspicions**: one line each, file and line (U41).
2. Dispatch `scenarios` (`opus`) with `BUNDLE`, `PREPARE`, `CHANGE_MAP`, `MIND_MAP`, `DATA_MODEL`, `OUT =
   <WORK>/candidates.json`, `KEY`. No `<WORK>/scenarios.json` ⇒ back once, then STOP. Delete `<WORK>/prepare/`.

## 3 — Strategy (human point 1)

**You do not write the strategy.** Dispatch `strategy` (`opus`) with `BUNDLE`, `CHANGE_MAP`, `CAPABILITIES`,
`MISSION` (a not-fixed Bug), `SCENARIOS_TABLE = <WORK>/scenarios.md`, `SCENARIOS = <WORK>/scenarios.json`, `RUN_DIR`. It returns the approval summary once gate and verifier pass; its round must still say `Status: DRAFT`, else back once, then STOP.

Ask (AskUserQuestion) with that summary: the scenarios, the windows to announce in the team channel
(U68), a `Shared store:` to name, and `node <plugin>/lib/run-cost.mjs --since <start> --budget qa | grep ^budget:` (spent so far). **Approving it approves those posts.** *Change* (add, strike,
reorder, a store) ⇒ SendMessage the agent the user's words, ask again on the new summary.
*Approve* ⇒ you set `Status:` (`APPROVED (<who>, <date>)`, or `AUTO (--yes)`) — one Edit, no re-read.

## 4 — Plan

`node <plugin>/lib/plan-run.mjs --strategy <RUN_DIR>/test-strategy.md --key <TICKET>` → `run-plan.json`. Exit 2 ⇒
report its errors, STOP. **`--dry-run` stops here**: print the waves and `notRun`, write nothing else.

## 5 — Waves

First `node <plugin>/lib/write-zones.mjs snapshot --key <TICKET> --run-dir <RUN_DIR>` (exit 1 or 3 ⇒ note its line, go on: step 7 reports "not checked"). One message per wave of
`run-plan.json`; each brief gets `PLUGIN` = `<plugin>`, `RUN_DIR`, `STRATEGY`, `KEY`, its own paths below, and `<plugin>/briefs/ledger.md` if it may write. An entry with `missing` is not dispatched; its `BLOCKED — needs <missing>`
row goes in `testing-checklist.md` under `## Scenario results`, never `scenarios/S-n.rows.md` — a `bug:PB-n`'s with
Ref `PB-n · R<k>`, the `R` of its `### Prior bugs` row.

| id | How |
|---|---|
| `contract-refresh` | both commands of its `run.commands` |
| `checklist`, `ac-checks`, `scenario:S-n` | its `run.agent` (a brief entry: on `run.model`, brief `<plugin>/<run.brief>`); checklist + `CHANGE_MAP`; ac-checks + `CHECKLIST`, `CHANGE_MAP`, `CAPABILITIES`; a scenario + `S`, `SCENARIOS`, `BUNDLE`, `CAPABILITIES`, `LANE`, `EXPLORATORY` (its `lane`, `exploratory`) |
| `bug:PB-n` (round ≥ 2) | the same, + `PB`, `CAPABILITIES`, `LANE` (its `lane`, if any) |
| `visual` | `ui-ux-expert` on Chrome DevTools MCP, brief opening with Skill `qa-design` (`.claude/skills/qa-test/visual-axis.md` §2, §4, §5) |

**A `global/…` writer is BLOCKED before dispatch** if `node <plugin>/lib/window.mjs check` exits 1: write its row,
`BLOCKED — no channel to announce the window (U68)`, to `<RUN_DIR>/scenarios/S-n.rows.md`. The visual lane's
rows go in `scenarios/visual.rows.md`, `VIS-<m>`, Proof `visual`: `FAIL <severity>` per finding, and one `PASS` row
naming each VISUAL risk it covered without one. Never absent. **After each
wave**: `node <plugin>/lib/scenario-rows.mjs merge --run-dir <RUN_DIR> --ids <its S-n,…[,PB-n,…][,visual][,pixel]>` (an id's last row wins, never duplicated); exit 2 ⇒
`missing` / `refused` back to their agent once, merge those again.

**Each risk whose technique names `PIXEL` is your own item, with the first wave, whatever the Visual lane row
says** — scripts, not a browser slot. The engine is the vc-frontend plugin's `visual/` (`capabilities.json`
`pixel.engine`), run as its `skills/merge-upstream/visual.md`, every command with the **front checkout** as the
working directory (the `pixel.checkouts` entry whose `git remote get-url origin` is the PR's repo; never cloned): §Once per machine — setup (`setup.mjs`; `--with-browser` only on the user's yes), §Base and head (base =
the PR's base ref, head = its `head_sha`, each a temporary `git worktree` with its install and Storybook build),
§Scope, then §Shoot, compare, confirm. Each risk gets a `PIX-<m>` row naming its `R-n` in `scenarios/pixel.rows.md`, never `visual.rows.md`:
`FAIL <severity>` per confirmed regression, else `PASS`; no engine, no checkout of that repo, a failed setup or build ⇒ `BLOCKED — <which>`; a Lane reading `SKIP — not available in this install` ⇒ `SKIP — <capability>`. Never
absent: merge `pixel` after that wave. A PIXEL risk that runs has Lane `scripts · PIXEL`.

## 6 — Triage, then Medium-only investigation

1. The `qa-triage-results` skill, `ticket <TICKET> --min-severity P2` — only Medium+ is reproduced live (U29).
   `unresulted[]` rows ⇒ back to their agent once, triage again; still some ⇒ STOP, list them.
2. **Medium+** listed `needs-review` ⇒ an `investigate` dispatch (`sonnet`) each,
   invoking `vc-fix:qa-investigate`, ≤ 3 at a time — never for a `PB-n` row: a NOT FIXED prior bug is already filed (P6).

## 7 — Verdict

1. `node <plugin>/lib/trace.mjs reconcile --strategy <RUN_DIR>/test-strategy.md --checklist
   <RUN_DIR>/testing-checklist.md --run-plan <WORK>/run-plan.json [--bundle <BUNDLE>] --write > <WORK>/trace.json` →
   `TRACE`; `--bundle` in round 1 only (P5: round N proves only the ACs its risks cite). Exit 1 ⇒ write `{"error":"<its first stderr line>"}` to that file. Exit 2: `unresulted` ⇒ back to their agents once (as step 6's), merge again, reconcile again; `unknownRefs`,
   `acsWithoutRow` ⇒ the verdict names them (not a send-back).
2. `node <plugin>/lib/write-zones.mjs check --key <TICKET> --run-dir <RUN_DIR> --run-plan <WORK>/run-plan.json >
   <WORK>/write-zones.json` → `WRITE_ZONES`. Exit 2 ⇒ BLOCKED, the verdict names each file; 3 ⇒ "not checked"; any other exit ⇒ write
   `{"outside":[],"gitScope":false,"reason":"<its registryErrors, or its first stderr line>"}` there instead.
3. `node <plugin>/lib/run-cost.mjs --since <start> --budget qa --key <TICKET>` → keep its output, `budget:` line too.
4. Dispatch `verdict` (`vc-test:verdict-writer`) with its paths, `TRACE`, `WRITE_ZONES`, the table, `ROUND`
   and, round ≥ 2, `PRIOR_BUGS` = `DELTA`.

## 8 — Human point 2

Each confirmed Medium+ bug: `/vc-fix:qa-bug` with its investigation package (U50), one at a time; its own
question decides filing; each one filed ⇒ at once `node <plugin>/lib/rounds.mjs filed --run-dir <RUN_DIR> --bug
<id>=<KEY>`. A `verdict.json` bug with `priorBug` is skipped: it is already filed (P6). Then
`node <plugin>/lib/rounds.mjs close --key <TICKET> --run-dir <RUN_DIR> --bundle <BUNDLE>`. Tear down: `node <plugin>/lib/teardown.mjs --key <TICKET>`. Exit 2 ⇒ name what failed and
its `manual`, `unknown`, `foreign` lists; 3 ⇒ the stand is not writable: all manual. Print `verdict.md`'s first two
lines and path.
