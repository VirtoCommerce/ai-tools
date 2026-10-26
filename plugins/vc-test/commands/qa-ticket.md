---
description: "[Testing] PROTOTYPE vc-test — one feature-test ticket by scenarios: context → change map → approved scenarios, one agent each, beside the background AC run → triage → verdict, costed. Triage, investigation and some context scripts still need an ai-tools checkout (P1d-3)."
argument-hint: "<TICKET> [<env>] [--yes] [--dry-run]"
disable-model-invocation: true
---

# /vc-test:qa-ticket — one ticket, the bugs a checklist misses

You orchestrate **inline** and hold only paths: every hand-off is a file, never a summary.
Design: `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` §3, U60–U68.
`<plugin>` is this plugin's folder (`plugins/vc-test` here). Run every command from the project root. `WORK` is
`.vc-fix/vc-test/<TICKET>/<env>/`.
**Dispatch `<x>` (`<model>`) with P** = a `general-purpose` agent of that model, description `[vc-test:<x>] <TICKET>`,
brief "Read and follow `<plugin>/briefs/<x>.md`" + the paths P.

## Rules

1. **Two human points only**: the scenario list's approval (step 3, `--yes` answers it) and step 8. Nothing else asks.
2. **No ticket status transition, no tracker comment** — `verdict.md` is the output.
3. **Bugs only through `/vc-fix:qa-bug`** (step 8).
4. **Every dispatch's description starts `[vc-test:<step>]`**, a skill's too: `run-cost.mjs` counts by it.
5. **A brief is paths plus the one skill its step needs.** Never paste the bundle, the strategy or a result.
6. One browser lane per agent, ≤ 3 at once (`run-plan.json` keeps both).
7. A Low or cosmetic finding gets one line under "Noticed" — no investigation, no screenshot, no bug (U25).
8. **Every turn re-reads your context**: read no supporting file or script source unless a step fails; keep a
   script's exit code and summary (`| tail -n 20`).
9. **A STOP once step 5 has begun tears down first** (step 8); any STOP removes `<WORK>/prepare/`.

## 0 — Probe

1. `npm run run:use -- <TICKET> [<env>]` → note `RUN_DIR` and the start time (`date -u +%FT%TZ`).
2. `node <plugin>/lib/capabilities.mjs --key <TICKET> --mcp <list>` — which of `playwright-chrome`,
   `playwright-firefox`, `playwright-edge`, `chrome-devtools` you have.
3. **Domain slug** from the ticket's components and summary, checked by `npm run bl:extract -- --has-domain <slug>`;
   none checks out ⇒ no slug (F2 fires on doubt).

## 1 — Context

`/vc-test:ticket-context <TICKET> --domain <slug>` (none without a slug); its bundle is every agent's `BUNDLE`. Its
STOPs are this run's. Before its `finish`: `node <plugin>/lib/keep-prepare.mjs --prepare <prepare_path> --key
<TICKET>` → `PREPARE` (none if cached). A `NOT DEPLOYED:` line in `blockers[]` ⇒ BLOCKED on deploy: write
`verdict.md` with it and stop.

## 2 — Change map, then scenarios

1. Dispatch `change-map` (`sonnet`) with `BUNDLE`, `MIND_MAP` / `DATA_MODEL` of the slug if they exist, `OUT =
   <WORK>/change-map.json`. Then `node <plugin>/lib/check-change-map.mjs --map <OUT> --bundle <BUNDLE>`; exit 2 ⇒
   errors back once, then STOP. **Show the suspicions**: one line each, file and line (U41).
2. Dispatch `scenarios` (`opus`) with `BUNDLE`, `PREPARE`, `CHANGE_MAP`, `MIND_MAP`, `DATA_MODEL`, `OUT =
   <WORK>/candidates.json`, `KEY`. No `<WORK>/scenarios.json` ⇒ back once, then STOP. Delete `<WORK>/prepare/`.

## 3 — Strategy (human point 1)

**You do not write the strategy.** Dispatch `strategy` (`opus`) with `BUNDLE`, `CHANGE_MAP`,
`SCENARIOS_TABLE = <WORK>/scenarios.md`, `SCENARIOS = <WORK>/scenarios.json`, `RUN_DIR`. It returns the approval
summary once gate and verifier pass; its round must still say `Status: DRAFT`, else back once, then STOP.

Ask (AskUserQuestion) with that summary: the scenarios, the windows to announce in the team channel
(U68), a `Shared store:` to name. **Approving it approves those posts.** *Change* (add, strike,
reorder, a store) ⇒ SendMessage the agent the user's words, ask again on the new summary.
*Approve* ⇒ you set `Status:` (`APPROVED (<who>, <date>)`, or `AUTO (--yes)`) — one Edit, no re-read.

## 4 — Plan

`node <plugin>/lib/plan-run.mjs --strategy <RUN_DIR>/test-strategy.md --key <TICKET>` → `run-plan.json`. Exit 2 ⇒
report its errors, STOP. **`--dry-run` stops here**: print the waves and `notRun`, write nothing else.

## 5 — Waves

One message per wave of `run-plan.json`; each brief gets `RUN_DIR`, `STRATEGY`, `KEY`, its own paths below, and
`<plugin>/briefs/ledger.md` if it may write. An entry with `missing` is not dispatched; its rows:
`BLOCKED — needs <missing>`.

| id | How |
|---|---|
| `contract-refresh` | both commands of its `run.commands` |
| `checklist`, `ac-checks`, `scenario:S-n` | its `run.agent` and `run.model`, `[vc-test:<id>] <TICKET>`, brief "Read and follow `<plugin>/<run.brief>`"; checklist + `CHANGE_MAP`; ac-checks + `CHECKLIST`, `CHANGE_MAP`, `CAPABILITIES`; a scenario + `S`, `SCENARIOS`, `BUNDLE`, `CAPABILITIES`, `LANE` = its `lane`, `EXPLORATORY` = its `exploratory` |
| `visual` | `ui-ux-expert` on Chrome DevTools MCP, brief opening with Skill `qa-design` (`.claude/skills/qa-test/visual-axis.md` §2, §4, §5) |

**A `global/…` writer is BLOCKED before dispatch** if `node <plugin>/lib/window.mjs check` exits 1: write its row,
`BLOCKED — no channel to announce the window (U68)`, to `<RUN_DIR>/scenarios/S-n.rows.md`. The visual lane's
findings: a row each in `scenarios/visual.rows.md`, `VIS-<m>`, Proof `visual`, `FAIL <severity>`. **After each
wave**: `node <plugin>/lib/scenario-rows.mjs merge --run-dir <RUN_DIR> --ids <its S-n,…[,visual]>`; exit 2 ⇒
`missing` / `refused` back to their agent once, merge those again.

## 6 — Triage, then Medium-only investigation

1. The `qa-triage-results` skill, `ticket <TICKET> --min-severity P2` — only Medium+ is reproduced live (U29).
   `unresulted[]` rows ⇒ back to their agent once, triage again; still some ⇒ STOP, list them.
2. **Below floor**, Low, cosmetic ⇒ "Noticed". **Medium+** listed `needs-review` ⇒ a `[vc-test:investigate]`
   dispatch each, invoking `vc-fix:qa-investigate`, ≤ 3 at a time.

## 7 — Verdict

1. `node <plugin>/lib/run-cost.mjs --since <start> --key <TICKET>` → keep its Markdown table.
2. Dispatch a fresh `verdict` (`sonnet`) with the paths its brief lists and the table.

## 8 — Human point 2

Each confirmed Medium+ bug: `/vc-fix:qa-bug` with its investigation package (U50), one at a time; its own
question decides filing. Tear down: `node <plugin>/lib/teardown.mjs --key <TICKET>`. Exit 2 ⇒ name what failed and
its `manual`, `unknown`, `foreign` lists; 3 ⇒ the stand is not writable: all manual. Print `verdict.md`'s first two
lines and path.
