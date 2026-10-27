# vc-test P2-3 — the narrow agents, the model per step, the measured baseline and the budget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** three writing steps of `/vc-test:qa-ticket` move from a general-purpose agent with a brief to plugin agents
with narrow tools: `change-map` (layer 0), `checklist-writer` and `verdict-writer`. Every dispatch gets its model
from one declared place. `run-cost.mjs` measures the §2b sessions, so the baseline that U34 compares against
exists, and `test.budget` gets defaults from that number. Released as `vc-test` 0.9.0.

**Architecture:**
- Each new agent is an `agents/<name>.md` in the plugin. Its body is today's brief, moved rather than rewritten, and
  its `tools:` line enforces what U56 grants.
- The brief file is deleted in the same commit, and the registry's `run` block names the agent.
- `change-map` keeps U37's "no writes": it returns one JSON object, which `check-change-map.mjs` saves from the
  agent's transcript and gates. That is the way the `/ticket-context` analysts already return their output
  (`skills/ticket-context/lib/agent-output.mjs`).
- `run-cost.mjs` learns to read any session file and a whole session.
- `/vc-test:init` writes `test.budget`, and `run-cost.mjs` shows what each run spent against it.

**Tech Stack:** Node 18+ ES modules, `node:test`; no new dependency.

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — §2b
(the measurement), §8 (Tokens: "`model` per registry entry … chosen per entry in P2"), §10 P2, U13, U30, U34, U37,
U38, U42, U56, U73, B11. P2 index: [`2026-10-26-vc-test-p2-1-scripts.md`](2026-10-26-vc-test-p2-1-scripts.md) §P2 is
seven plans. House style and conventions: [`2026-10-27-vc-test-p2-2-rounds.md`](2026-10-27-vc-test-p2-2-rounds.md).

## Decisions this plan makes (the spec leaves them open — confirm at review)

| # | Question | Decision |
|---|---|---|
| Q1 | U56 says `checklist-writer` also writes the `.spec` files and runner rows its items name, loading `/qa-test-automation` (U55). That skill and the `.spec` harness move into the plugin only in P2-5 | In P2-3 `checklist-writer` writes the thin checklist, as the brief does today. The `.spec` half is added in P2-5, together with the skill it loads |
| Q2 | How does `change-map` (Read/Grep/Glob, U37) produce a file? | It returns the JSON as its final message. `check-change-map.mjs --agent <id> --out <path>` saves it from the transcript, then gates it, as `cli.mjs save` does for the analysts |
| Q3 | Where does a step's model live? | A plugin agent declares it in its frontmatter `model:`. A registry lane declares it in `run.model`. The command names a model only for the two brief-driven dispatches that stay (`scenarios`, `strategy`: `opus`). A table in spec §8 lists every step with its model and why. *Changed at execution: `investigate` (`sonnet`) is a third command-named dispatch (Ruling E)* |
| Q4 | The `/ticket-context` analysts' model (`model: inherit` today). Measured: Opus 2.5× the old Stage 1, Sonnet 1.7× (§8) | `sonnet`. Its outputs are gated by `check-bundle.mjs`, so a weaker extraction fails loudly rather than silently |
| Q5 | The default `test.budget` (U73) | `qa` = half of VCST-6398's measured per-run total (U34's target on the comparable large ticket), with half its active minutes. `dev` = 40% of `qa` (U38's 20 : 50). `windowTokens` is unset. A client sets its own. *Changed at execution: wall minutes (Ruling D), dev minutes from U51 (Ruling F); recorded on spec U73* |
| Q6 | What does the budget do in P2-3? | It is reported, not enforced. `run-cost.mjs --budget` adds "share of budget" to its table; the verdict and the approval summary show it. Estimating a plan's cost and dropping scenarios at human point 1 (U38) needs a per-entry cost table first, so it is named for P2-6 |

## Global Constraints

- **No committed unit test** (CLAUDE.md §Essential Rules, NO CODE ⇒ NO UNIT TEST):
  - every code task's test is `scripts/unit/tmp-vc-test-<name>.test.mjs`, run red then green, deleted before its commit;
  - agent definitions, briefs, the command and the spec are prompts or docs, so they get none.
- **An agent definition follows** `.claude/knowledge/agents/authoring-standard.md`:
  - frontmatter `name`, `description`, `model`, `color`, `applicability` + `applicability_rationale`, `tools`, in the
    shape of `plugins/vc-test/agents/strategy-verifier.md`;
  - each body is under BUDGET-004 (19,000 chars).
- **Tools are the grant, not the prompt** (U56):
  - `change-map`: `Read, Grep, Glob`;
  - `checklist-writer`: `Read, Grep, Glob, Write, Edit, Skill`;
  - `verdict-writer`: `Read, Write`.
  - No Bash, no network, no browser in any of them. A write outside the run's zones is caught by `write-zones.mjs`, as now.
- **A brief is moved, not rewritten.** Each agent body keeps its brief's rules verbatim, except a line that names a
  tool the agent no longer has (`change-map` can no longer run its checker).
- **Dispatch descriptions keep `[vc-test:<step>]`** (command rule 4: `run-cost.mjs` counts by it). The step ids
  `change-map`, `checklist` and `verdict` do not change, so cost tables stay comparable across releases.
- **Paths:** plugin files through `import.meta.url`, output through `outputRoot()`.
- **The command stays under BUDGET-004.** It is 14,076 chars today, and this plan should not grow it: an agent
  dispatch line is shorter than a brief dispatch.
- **Release:** `plugins/vc-test/.claude-plugin/plugin.json` → `0.9.0`. Its description lists the plugin's agents.
  README rows; spec §10's P2 row says P2-3 is done. After merge, `claude plugin tag --push` from `plugins/vc-test/`.
- `npm run context:check`, `npm test` and `claude plugin validate plugins/vc-test` are green before the PR.

## Review Focus

1. **A `change-map` reply that is not pure JSON.** A fenced block, prose before the object, or two objects in one
   reply. The saver takes exactly what `extractAgentOutput` takes for the analysts and refuses anything else
   (exit 2, the errors back to the agent once), never a partly parsed map. Test in Task 1.
2. **The wrong transcript.** Two `change-map` dispatches in one session (the round-1 retry). The saver reads the
   transcript of the agent id it is given, never "the newest". Test in Task 1.
3. **A session whose subagents are stored differently.** An older Claude Code kept subagent records as `agent-*.jsonl`
   beside the session, or as sidechain lines inside it. `run-cost.mjs --session-file` counts them, or says that it
   did not find them, never a total that silently omits them. Test in Task 4.
4. **A budget that is missing or malformed in the profile.** No `test.budget` means the defaults, named as defaults
   in the table. A non-numeric value is a usage error, never a share computed against `NaN`. Test in Task 5.
5. **An old registry entry that still names a brief.** A client profile cannot pin the registry, but a stale
   checkout can. `plan-run.mjs` refuses a `run` block that names both `brief` and a plugin agent, or a brief file
   that does not exist. Test in Task 2.

---

### Task 1: `change-map` — a read-only agent, its output saved from the transcript

**Files:**
- Create: `plugins/vc-test/agents/change-map.md` (body from `briefs/change-map.md`)
- Delete: `plugins/vc-test/briefs/change-map.md`
- Modify: `plugins/vc-test/lib/check-change-map.mjs` (`--agent <id> --out <path>`)
- Modify: `plugins/vc-test/commands/qa-ticket.md` (step 2.1)
- Test (temporary): `scripts/unit/tmp-vc-test-change-map-save.test.mjs`

**Interfaces:**
- Consumes: `extractAgentOutput(lines)`, `findAgentTranscript(agentId)`, `readTranscript(path)` from
  `plugins/vc-test/skills/ticket-context/lib/agent-output.mjs`.
- Produces: the agent `vc-test:change-map`:
  - `model: sonnet`, `tools: Read, Grep, Glob`;
  - input lines are the brief's own (`BUNDLE`, `MIND_MAP`, `DATA_MODEL`);
  - its last message is the change-map JSON object and nothing else;
  - "Before you return, run the checker" is replaced by "the orchestrator saves and checks your reply; a reply it
    refuses comes back once with its errors".
- Produces: `node lib/check-change-map.mjs --agent <agentId> --out <path> --bundle <bundle.json>`:
  - finds the transcript of exactly that agent id, extracts the object, writes `<path>`, then runs today's checks;
  - exit 0 OK, 2 checks failed or no single JSON object (errors printed), 1 usage or no transcript;
  - `--map <path>` without `--agent` keeps today's behaviour.

- [ ] **Step 1: Write the failing test.**
  - A transcript fixture whose last assistant message is one JSON object ⇒ the file is written and checked.
  - The object inside a ```json fence ⇒ the same result as `extractAgentOutput` gives the analysts.
  - Prose plus an object, or two objects ⇒ exit 2 and no file (Review Focus 1).
  - Two agents in one session, with `--agent` naming the first ⇒ the first agent's map (Review Focus 2).
  - An unknown agent id ⇒ exit 1.
- [ ] **Step 2: Run it** — `node --test scripts/unit/tmp-vc-test-change-map-save.test.mjs`; expected FAIL.
- [ ] **Step 3: Implement** `--agent` in `check-change-map.mjs`, reusing `agent-output.mjs` (no copy of its parser).
- [ ] **Step 4: Run it** — expected PASS.
- [ ] **Step 5: Agent and command.** Write `agents/change-map.md` from the brief and delete the brief. Step 2.1
  becomes: dispatch `vc-test:change-map` with `BUNDLE`, `MIND_MAP` / `DATA_MODEL`, then `check-change-map.mjs --agent
  <its id> --out <WORK>/change-map.json --bundle <BUNDLE>`; exit 2 ⇒ SendMessage the errors once, save again, then
  STOP. The suspicions line stays.
- [ ] **Step 6: Real run** — `check-change-map.mjs --map` on the VCST-5904 prototype's `change-map.json`
  (`.vc-fix/vc-test/VCST-5904/vcst/`, if present) is unchanged; record the output.
- [ ] **Step 7: Delete the temporary test, commit** — `feat(vc-test): change-map is a read-only agent; its map is saved from the transcript and gated (P2-3)`.

### Task 2: `checklist-writer` and `verdict-writer` — the two writing agents

**Files:**
- Create: `plugins/vc-test/agents/checklist-writer.md` (body from `briefs/checklist.md`)
- Create: `plugins/vc-test/agents/verdict-writer.md` (body from `briefs/verdict.md`)
- Delete: `plugins/vc-test/briefs/checklist.md`, `plugins/vc-test/briefs/verdict.md`
- Modify: `plugins/vc-test/lib/artifacts.json` (`checklist.run` → `{ "agent": "vc-test:checklist-writer" }`)
- Modify: `plugins/vc-test/lib/plan-run.mjs` (Review Focus 5)
- Modify: `plugins/vc-test/commands/qa-ticket.md` (step 5's `checklist` dispatch, step 7.4)
- Modify: every other file that names `briefs/checklist.md` or `briefs/verdict.md` (`grep -rn` across `plugins/` and `.claude/`)
- Test (temporary): `scripts/unit/tmp-vc-test-plan-run-agent.test.mjs`

**Interfaces:**
- Produces: `vc-test:checklist-writer`:
  - `model: sonnet`, `tools: Read, Grep, Glob, Write, Edit, Skill`;
  - it loads `qa-checklist` (Mode 5) as the brief says, and writes `{RUN_DIR}/testing-checklist.md` only (Q1);
  - return contract unchanged: the path and the row count.
- Produces: `vc-test:verdict-writer`:
  - `model: sonnet`, `tools: Read, Write`;
  - it writes `{RUN_DIR}/verdict.md` and `verdict.json` from the inputs the brief lists;
  - return contract unchanged: the path and the verdict word.
- Produces: a registry entry whose `run.agent` names a plugin agent (`vc-test:<name>`) carries no `brief` and no
  `model`. `planRun` refuses an entry with both `brief` and `vc-test:` agent, and an entry whose `brief` file is
  missing under the plugin. Each refusal is an error naming the entry.
- Produces: in the command, an entry whose `run.agent` starts `vc-test:` is dispatched as that subagent type with
  its paths. An entry with `run.brief` keeps today's line.

- [ ] **Step 1: Write the failing test.**
  - `planRun` with `checklist.run = { agent: "vc-test:checklist-writer" }` ⇒ ok, and the plan entry carries the agent.
  - `{ agent: "vc-test:x", brief: "briefs/x.md" }` ⇒ an error naming the entry.
  - `{ agent: "general-purpose", brief: "briefs/missing.md" }` ⇒ an error naming the missing file (Review Focus 5).
  - Today's scenario and prior-bug templates still plan.
- [ ] **Step 2: Run it** — expected FAIL.
- [ ] **Step 3: Implement** the check in `plan-run.mjs` (brief paths resolved against the plugin root through `import.meta.url`).
- [ ] **Step 4: Run it** — expected PASS. `node --test plugins/vc-test/lib/*.test.mjs` green (`write-zones` reads the registry).
- [ ] **Step 5: Agents, registry, command, references.**
  - Write the two agent files from the briefs and delete the briefs.
  - Change `checklist.run` in the registry.
  - Step 7.4 dispatches `vc-test:verdict-writer`.
  - Repoint every reference the grep finds, in the same commit.
- [ ] **Step 6: Delete the temporary test, commit** — `feat(vc-test): checklist-writer and verdict-writer — plugin agents with narrow tools replace the general-purpose briefs (P2-3)`.

### Task 3: one model per step

**Files:**
- Modify: `plugins/vc-test/agents/ticket-context-analyst.md` (`model: sonnet`, Q4)
- Modify: `plugins/vc-test/commands/qa-ticket.md` (the `**Dispatch <x> (<model>)**` definition line: a plugin agent's model is its own)
- Modify: `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` §8 Tokens (the per-step table)

**Interfaces:**
- Produces: the §8 table, one row per dispatch. Columns: step id, who runs it (agent or registry lane), model, the
  measurement or reason. Rows:
  - `ticket-context` analysts — sonnet, Q4;
  - `change-map`, `checklist`, `verdict` — sonnet, U30's fresh small-context writers;
  - `scenarios`, `strategy` — opus, the choices a person approves;
  - `strategy-verifier` — sonnet;
  - `ac-checks`, `scenario:S-n`, `bug:PB-n`, `visual` — sonnet, the prototype's browser lanes at 18.9–26.3M each (§2b);
  - `fetch` — its own.

  Every model a dispatch uses is in exactly one place: an agent's frontmatter, a registry `run.model`, or, for
  `scenarios` and `strategy` only, the command line.

- [ ] **Step 1:** Check that every dispatch in `qa-ticket.md` and `skills/*/SKILL.md` resolves its model to one
  place. Grep for `opus`, `sonnet` and `model`, and list each hit in the report.
- [ ] **Step 2:** Make the three edits. No unit test (prompt and doc only). `claude plugin validate plugins/vc-test` passes.
- [ ] **Step 3: Commit** — `docs(vc-test): one declared model per step; ticket-context analysts on sonnet (P2-3)`.

### Task 4: `run-cost.mjs` on any session — the §2b per-run totals (B11)

**Files:**
- Modify: `plugins/vc-test/lib/run-cost.mjs` (`--session-file <path>`, `--since` optional)
- Modify: `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` §2b (the totals) and B11's row
- Test (temporary): `scripts/unit/tmp-vc-test-run-cost.test.mjs`

**Interfaces:**
- Produces: `--session-file <path to a session .jsonl>` (any project folder) instead of `--session <id>`. Without
  `--since`, the session's first record is the start.
- Produces: subagents are read from `<session>/subagents/*.jsonl` (today's layout) and, when absent, from the older
  layouts the session actually has: `agent-*.jsonl` in the session's folder, or `isSidechain` lines in the session
  file. `cost()` gains `subagentSource: "subagents" | "agent-files" | "sidechain" | "none"` in its result, and
  `toMarkdown` prints it under the table. `"none"` is said, never silent (Review Focus 3).

- [ ] **Step 1: Write the failing test.** A session fixture in each of the three layouts gives the same totals for the
  same records. A session with no subagents reports `subagentSource: "none"`. With no `--since`, the start is the
  first record. Each message is still counted once (`requestId`).
- [ ] **Step 2: Run it** — expected FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it** — expected PASS.
- [ ] **Step 5: Measure B11.**
  - Find the four §2b sessions: VCST-5903 rounds 1 and 2, VCST-6398 and VCST-2945. Search the transcripts under
    `~/.claude/projects/*/` for the `/qa-test-fast <KEY>` invocation and its §2b date. A ticket can have several
    sessions; take the one whose date and run folder match §2b, and say why.
  - Run `run-cost.mjs --session-file <it>` on each.
  - Write a per-run row into §2b: input-equivalent tokens, output, active and wall minutes, subagent source.
  - Update B11's row: done, with the numbers U34 now compares against. VCST-6398 is the large-ticket baseline and
    VCST-5903 R1 the component-ticket one.
  - A session not found on this machine is written as "not found locally", and B11 stays open for it. It is never
    estimated.
- [ ] **Step 6: Delete the temporary test, commit** — `feat(vc-test): run-cost reads any session; §2b per-run totals measured (B11, P2-3)`.

### Task 5: `test.budget` — defaults from the baseline, spent against it

**Files:**
- Modify: `plugins/vc-test/lib/init-plan.mjs` (`planTestBlock` gains `budget`)
- Modify: `plugins/vc-test/commands/init.md` (the budget question, with the defaults shown)
- Modify: `plugins/vc-test/lib/profile.mjs` (`testBlock` returns the budget, defaults applied)
- Modify: `plugins/vc-test/lib/run-cost.mjs` (`--budget qa|dev`)
- Modify: `plugins/vc-test/commands/qa-ticket.md` (step 7.3 passes `--budget qa`; step 3 adds the budget line of `run-cost.mjs --since <start> --budget qa` — spent so far against the budget — to the approval question)
- Modify: `plugins/vc-test/agents/verdict-writer.md` (the cost section names the share of budget)
- Test (temporary): `scripts/unit/tmp-vc-test-budget.test.mjs`

**Interfaces:**
- Consumes: Task 4's measured VCST-6398 total (Q5). Write the two defaults as named constants in `profile.mjs`,
  with a comment citing §2b. They are the one transcribed number this plan allows, because the spec itself says the
  defaults are "set once in P2 by `run-cost.mjs`" (U73).
- Produces: `test.budget = { qa: { tokens, minutes }, dev: { tokens, minutes }, windowTokens? }`. `planTestBlock`
  validates it: positive numbers; `windowTokens` optional; anything else throws, naming the key.
- Produces: `testBlock(profile).budget` — the profile's budget, or the defaults with `source: "default"`.
- Produces: `run-cost.mjs --budget qa|dev` adds a line under the table: `budget: <spent> of <tokens> (<n>%) · <active
  min> of <minutes> min (<source>)`. With `windowTokens` set, it also adds the window share; it never gates (U42, U73).

- [ ] **Step 1: Write the failing test.**
  - `planTestBlock` with a valid budget ⇒ normalised.
  - `qa.tokens: "a lot"` ⇒ throws, naming `test.budget.qa.tokens`.
  - No budget ⇒ `testBlock` gives the defaults with `source: "default"` (Review Focus 4).
  - `run-cost --budget qa` on a fixture ⇒ the line, with the share computed.
  - With `windowTokens` set ⇒ the window share too.
- [ ] **Step 2: Run it** — expected FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it** — expected PASS.
- [ ] **Step 5: Prompts.** `init.md` asks for the budget once and shows the defaults; Enter keeps them. The command
  and `verdict-writer` change as listed.
- [ ] **Step 6: Delete the temporary test, commit** — `feat(vc-test): test.budget — defaults from the measured baseline, every run's spend against it (U73, P2-3)`.

### Task 6: release 0.9.0

**Files:**
- Modify: `plugins/vc-test/.claude-plugin/plugin.json`, `plugins/vc-test/README.md`
- Modify: `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` §10 (the P2 row)

- [ ] **Step 1:** `plugin.json` `0.9.0`. The description names the agents (`ticket-context-analyst`,
  `strategy-verifier`, `fetch`, `change-map`, `checklist-writer`, `verdict-writer`) and keeps the "until P2" phrase,
  because P2-5 has not landed. README rows: the three agents, `check-change-map.mjs --agent`,
  `run-cost.mjs --session-file` and `--budget`, `test.budget`.
- [ ] **Step 2:** The spec §10 P2 row: "**P2-3 done** (vc-test 0.9.0: agents `change-map`, `checklist-writer`,
  `verdict-writer`; a model per step; §2b per-run totals; `test.budget`)". The P2-6 part of that row gains U38's
  plan-cost estimate at human point 1 (Q6).
- [ ] **Step 3: Checks** — `wc -c` on the command (≤ 14,076, the size before this plan), `npm run context:check`,
  `npm test`, `claude plugin validate plugins/vc-test`, all green.
- [ ] **Step 4: Commit** — `release(vc-test): 0.9.0 — narrow agents, a model per step, the measured baseline and the budget (vc-test P2-3)`.
