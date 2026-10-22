---
description: "[Testing] PROTOTYPE of the vc-test QA command — test one feature-test ticket end to end: /ticket-context → layer-0 change map → approved /qa-test-strategy → only the artifacts it selected, in waves planned by plan-run.mjs (API checks without a browser, exploratory as the main browser lane) → triage → Medium-only investigation → verdict by a fresh agent, with tokens and minutes per step. Runs only from an ai-tools checkout."
argument-hint: "<TICKET> [<env>] [--yes] [--dry-run]"
disable-model-invocation: true
---

# /vc-test:qa-ticket — one ticket, cheapest proof first

You orchestrate **inline** and hold only paths: every hand-off is a file, never a summary in a brief (spec
§4.1). Design: `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` §3. `<plugin>` below is this
plugin's folder (`plugins/vc-test` in this checkout). Run every command from the project root.

## Rules

1. **Two human points only**: the strategy's approval (step 3, `--yes` answers it) and step 8. Nothing else asks.
2. **No ticket status transition, ever. No tracker comment in the prototype** — `verdict.md` is the output.
3. **Bugs only through `/vc-fix:qa-bug`**, one call per confirmed Medium-or-worse bug, after its own question.
4. **Every dispatch's description starts `[vc-test:<step>]`** — including the ones a skill you run tells you to
   make (`[vc-test:triage]`, `[vc-test:investigate]`). `run-cost.mjs` attributes cost by it.
5. **A brief is paths plus the one skill its step needs.** Never paste the bundle, the strategy or a result.
6. ≤ 3 browser lanes at once (`run-plan.json` already respects it); one browser session per agent.
7. A Low or cosmetic finding gets one line under "Noticed" — no investigation, no screenshot, no bug (U25).

## 0 — Probe

1. `npm run run:use -- <TICKET> [<env>]` → note `RUN_DIR`. Record the start time as ISO (`date -u +%FT%TZ`).
2. `node <plugin>/lib/capabilities.mjs --key <TICKET> --mcp <comma list of the MCP servers this session has>`.

## 1 — Context

Run the `ticket-context` skill: `/ticket-context <TICKET>`. Its STOPs are this run's. A `NOT DEPLOYED:` line in
the bundle's `blockers[]` ⇒ the run is BLOCKED on deploy: write `verdict.md` with that line and stop.

## 2 — Layer 0: the change map

Dispatch one `general-purpose` agent (model `sonnet`), description `[vc-test:change-map] <TICKET>`, brief: "Read
and follow `<plugin>/briefs/change-map.md`" + `BUNDLE`, `MIND_MAP`/`DATA_MODEL` when they exist, `OUT =
.vc-fix/vc-test/<TICKET>/change-map.json`. Then run `node <plugin>/lib/check-change-map.mjs --map <OUT> --bundle
<BUNDLE>` yourself; exit 2 ⇒ send the errors back once, a second failure ⇒ STOP.

**Show the suspicions now** — one line each, `suspected`, with file and line (U41).

## 3 — Strategy (human point 1)

Run the `qa-test-strategy` skill inline from its procedure step 2, with the bundle **and** `change-map.json` as
inputs. For every risk, Approach names the layer that proves it: a script (`ac-checks`) or exploratory (U45).
**Exploratory is never `SKIP`** on a ticket with a UI or API surface (U47): its charter covers the change
map's hotspots in a significant zone. Its gate, verifier and one approval question run as the skill says.

## 4 — Plan

`node <plugin>/lib/plan-run.mjs --strategy <RUN_DIR>/test-strategy.md --key <TICKET>` → `run-plan.json`. Exit 2 ⇒
report its errors and STOP. **`--dry-run` stops here**: print the waves and `notRun`, write nothing else.

## 5 — Waves

One message per wave of `run-plan.json`, every entry dispatched as its `run` says, with `RUN_DIR`,
`CHANGE_MAP` and `STRATEGY` paths:

| id | How |
|---|---|
| `test-model` | inline: `/qa-test-model <TICKET> --context <bundle> --strategy <RUN_DIR>/test-strategy.md` |
| `contract-refresh` | run both commands of its `run.commands` |
| `checklist`, `ac-checks`, `ui-checks` | the agent named, brief "Read and follow `<plugin>/<run.brief>`" + the paths |
| `exploratory` | `qa-testing-expert` on `playwright-firefox`: `/qa-exploratory ticket <TICKET> <env>`; charter = the strategy's Exploratory row + the change map's hotspots with a `zone` other than `none` + the anonymous access probe |
| `visual` | `ui-ux-expert` on Chrome DevTools MCP; its brief's first line makes it invoke the Skill tool with `skill: "qa-design"` (`.claude/skills/qa-test/visual-axis.md` §2, §4, §5) |

Each exploratory and visual finding becomes a checklist row (Ref `EXP-n` / `VIS-n`) with its severity.

## 6 — Triage, then Medium-only investigation

1. Run the `qa-triage-results` skill with `ticket <TICKET>` — **without `--verify`** (U29). A non-empty
   `unresulted[]` ⇒ back to step 5 once.
2. Sort its result by severity. **Low / cosmetic** ⇒ "Noticed". **Medium or worse** that it listed as
   `needs-review` ⇒ one `[vc-test:investigate]` dispatch each, invoking `vc-fix:qa-investigate`, ≤ 3 at a time.
   A Low candidate is never investigated here.

## 7 — Verdict

1. `node <plugin>/lib/run-cost.mjs --since <start> --key <TICKET>` → keep its Markdown table.
2. Dispatch a fresh `general-purpose` agent (model `sonnet`), description `[vc-test:verdict] <TICKET>`, brief
   "Read and follow `<plugin>/briefs/verdict.md`" + the paths it lists + the table.

## 8 — Human point 2

For each confirmed Medium-or-worse bug, `/vc-fix:qa-bug` with its investigation package (U50), one at a time;
its own question decides filing. Tear down what the run created, by ledger id. Then print `verdict.md`'s first
two lines and its path.
