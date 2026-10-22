---
description: "[Testing] PROTOTYPE of the vc-test QA command — test one feature-test ticket end to end: /ticket-context → layer-0 change map → approved /qa-test-strategy → only the artifacts it selected, in waves planned by plan-run.mjs (API checks without a browser, exploratory as the main browser lane) → triage → Medium-only investigation → verdict by a fresh agent, with tokens and minutes per step. Runs only from an ai-tools checkout."
argument-hint: "<TICKET> [<env>] [--yes] [--dry-run]"
disable-model-invocation: true
---

# /vc-test:qa-ticket — one ticket, cheapest proof first

You orchestrate **inline** and hold only paths: every hand-off is a file, never a summary in a brief (spec
§4.1). Design: `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` §3. `<plugin>` below is this
plugin's folder (`plugins/vc-test` in this checkout). Run every command from the project root. `WORK` is
`.vc-fix/vc-test/<TICKET>/<env>/` (the scripts' working state, one per env: `capabilities.json`, `change-map.json`,
`run-plan.json`, `ledger.jsonl`, `run-cost.json`).

## Rules

1. **Two human points only**: the strategy's approval (step 3, `--yes` answers it) and step 8. Nothing else asks.
2. **No ticket status transition, ever. No tracker comment in the prototype** — `verdict.md` is the output.
3. **Bugs only through `/vc-fix:qa-bug`**, one call per confirmed Medium-or-worse bug, after its own question.
4. **Every dispatch's description starts `[vc-test:<step>]`** — including the ones a skill you run tells you to
   make (`[vc-test:triage]`, `[vc-test:investigate]`). `run-cost.mjs` attributes cost by it.
5. **A brief is paths plus the one skill its step needs.** Never paste the bundle, the strategy or a result.
6. ≤ 3 browser lanes at once (`run-plan.json` already respects it); one browser session per agent.
7. A Low or cosmetic finding gets one line under "Noticed" — no investigation, no screenshot, no bug (U25).
8. **Every turn of yours re-reads your whole context**, so keep it small: start the run in a fresh session, never
   read a skill's supporting files or a script's source unless a step fails, and cut a script's output to what the
   step needs (its exit code and summary line; `| tail -n 20` on anything that prints a table or JSON).
9. **A STOP once step 5 has begun tears down first** (step 8's `teardown.mjs`), then stops: no data outlives the run.

## 0 — Probe

1. `npm run run:use -- <TICKET> [<env>]` → note `RUN_DIR`. Record the start time as ISO (`date -u +%FT%TZ`).
2. `node <plugin>/lib/capabilities.mjs --key <TICKET> --mcp <comma list>` — the list names the browser servers
   this session has, from `playwright-chrome`, `playwright-firefox`, `playwright-edge`, `chrome-devtools`. Its
   `stand.writable` goes into every brief that may create data.
3. **Domain slug.** Take the candidate from the ticket's components and summary and check it with
   `npm run bl:extract -- --has-domain <slug>`. None checks out ⇒ run without one; F2 then fires on doubt.

## 1 — Context

Run the `ticket-context` skill: `/ticket-context <TICKET> --domain <slug>` (no `--domain` only when step 0 found
none). The domain brings the domain map, the `BL-*` rules and the mind map into the bundle. Its STOPs are this run's. A `NOT DEPLOYED:` line in
the bundle's `blockers[]` ⇒ the run is BLOCKED on deploy: write `verdict.md` with that line and stop.

## 2 — Layer 0: the change map

Dispatch one `general-purpose` agent (model `sonnet`), description `[vc-test:change-map] <TICKET>`, brief: "Read
and follow `<plugin>/briefs/change-map.md`" + `BUNDLE`, `MIND_MAP` / `DATA_MODEL` for the step-0 slug when the
files exist, `OUT =
<WORK>/change-map.json`. Then run `node <plugin>/lib/check-change-map.mjs --map <OUT> --bundle
<BUNDLE>` yourself; exit 2 ⇒ send the errors back once, a second failure ⇒ STOP.

**Show the suspicions now** — one line each, `suspected`, with file and line (U41).

## 3 — Strategy (human point 1)

**You do not write the strategy** — its reading, gate loop and verifier loop cost the most orchestrator turns
(dry run on VCST-5904). Dispatch one `general-purpose` agent (model `opus`), description `[vc-test:strategy]
<TICKET>`, brief: "Read and follow `<plugin>/briefs/strategy.md`" + `BUNDLE`, `CHANGE_MAP`, `RUN_DIR`. It writes
the round as `Status: DRAFT`, passes the gate and the verifier, and returns the approval summary and the path.
Its round must still say `Status: DRAFT` (`grep -m1 '^Status:'`): anything else ⇒ send it back once, then STOP —
only you write an approval.

Then ask the one approval question (AskUserQuestion) with that summary. *Change* ⇒ SendMessage the same agent the
user's words and ask again on its new summary. *Approve* ⇒ you set the section's `Status:` line yourself
(`APPROVED (<who>, <date>)`, or `AUTO (--yes)` under `--yes`) — one Edit, no re-read of the file.

## 4 — Plan

`node <plugin>/lib/plan-run.mjs --strategy <RUN_DIR>/test-strategy.md --key <TICKET>` → `run-plan.json`. Exit 2 ⇒
report its errors and STOP. **`--dry-run` stops here**: print the waves and `notRun`, write nothing else.

## 5 — Waves

One message per wave of `run-plan.json`, every entry dispatched as its `run` says, with `RUN_DIR`,
`CHANGE_MAP`, `STRATEGY`, `CAPABILITIES` and `KEY`. Every brief that may create data — `ac-checks`, `ui-checks`,
exploratory, visual, investigate — also names `<plugin>/briefs/ledger.md`. An entry with `missing` is not
dispatched: its rows get Result `BLOCKED — needs <missing>`.

| id | How |
|---|---|
| `test-model` | inline: `/qa-test-model <TICKET> --context <bundle> --strategy <RUN_DIR>/test-strategy.md` |
| `contract-refresh` | run both commands of its `run.commands` |
| `checklist`, `ac-checks`, `ui-checks` | the agent named, brief "Read and follow `<plugin>/<run.brief>`" + the paths |
| `exploratory` | `qa-testing-expert` on `playwright-firefox`: `/qa-exploratory ticket <TICKET> <env>`; charter = the strategy's Exploratory row + the change map's hotspots with a `zone` other than `none` + the anonymous access probe |
| `visual` | `ui-ux-expert` on Chrome DevTools MCP; its brief's first line makes it invoke the Skill tool with `skill: "qa-design"` (`.claude/skills/qa-test/visual-axis.md` §2, §4, §5) |

**You are the writer of the rows no lane owns**, after the checklist exists and the exploratory and visual lanes
have returned: (a) the Result and Evidence of every row whose Proof is `exploratory`, from the session's notes —
PASS, `FAIL <severity>`, or `BLOCKED — <reason>`, never empty; (b) one new row per exploratory or visual finding,
with the next free `C-n`, Ref `EXP-n` / `VIS-n`, Result `FAIL <Critical|High|Medium|Low>` and the notes path as
Evidence. A row with an empty Result is unresulted and stops triage.

## 6 — Triage, then Medium-only investigation

1. Run the `qa-triage-results` skill with `ticket <TICKET> --min-severity P2` — only Medium or worse is
   reproduced live (U29). A non-empty `unresulted[]` ⇒ fill those rows (step 5's writer rule) and triage once
   more; still non-empty ⇒ STOP and list them.
2. **Below floor** and Low / cosmetic ⇒ "Noticed". **Medium or worse** it listed as `needs-review` ⇒ one
   `[vc-test:investigate]` dispatch each, invoking `vc-fix:qa-investigate`, ≤ 3 at a time.

## 7 — Verdict

1. `node <plugin>/lib/run-cost.mjs --since <start> --key <TICKET>` → keep its Markdown table.
2. Dispatch a fresh `general-purpose` agent (model `sonnet`), description `[vc-test:verdict] <TICKET>`, brief
   "Read and follow `<plugin>/briefs/verdict.md`" + the paths it lists + the table.

## 8 — Human point 2

For each confirmed Medium-or-worse bug, `/vc-fix:qa-bug` with its investigation package (U50), one at a time;
its own question decides filing. Tear down with `node <plugin>/lib/teardown.mjs --key <TICKET>` (`--dry-run` shows
the plan): ledger entities of this stand only, newest first, by id; a setting back to its first `before` while the
stand still holds the run's `after`. Exit 2 ⇒ name what failed, what it left for a human (`manual`), what it did not
know (`unknown`) and what another stand wrote (`foreign`); exit 3 ⇒ the stand is not writable, all of it is manual.
Then print `verdict.md`'s first two lines and its path.
