# `vc-test` prototype — the QA command, thin slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A runnable `/vc-test:qa-ticket <KEY>` that tests one ticket by calling the skills this repository already has, plans its waves from a registry, adds layer 0 (the change map) and reports what the run cost — so the design's central bet (cheaper than `/qa-test-fast`, still finds the Medium bugs) is measured on a real ticket before P1 is built.

**Architecture:** A new plugin folder `plugins/vc-test/`, loaded with `claude --plugin-dir plugins/vc-test` — no marketplace entry yet. Its command is a thin orchestrator: `/ticket-context` → change map → `/qa-test-strategy` → `plan-run.mjs` → waves → triage → Medium-only investigation → verdict by a fresh agent → `run-cost.mjs`. Every skill it calls stays where it is under `.claude/`; nothing is moved. Four small scripts own the deterministic work; every agent gets a brief file of paths.

**Tech Stack:** Node 18+ ES modules (`.mjs`), no new dependencies; tests with `tsx --test` (temporary, see Global Constraints); Claude Code plugin format (`.claude-plugin/plugin.json`, `commands/`).

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — §3 (the shape), §4.1 (data flow), §5.1 (registry), U24–U30, U37, U42, U45–U47, U50.

## Prototype scope

**In:** plugin skeleton; `lib/artifacts.json`; `lib/strategy-artifacts.mjs`; `lib/capabilities.mjs` (minimal); `lib/plan-run.mjs`; layer 0 (`change-map.schema.json`, `check-change-map.mjs`, its brief); `lib/run-cost.mjs`; the command with both human points; briefs for the thin checklist, `ac-checks` (API/GraphQL, no browser agent), `ui-checks` and the verdict writer; severity filter and Medium-only investigation; one live run.

**Out (each lands in its spec phase, not here):** moving skills into the plugin and the connectors behind `$VC_RUN` (P1); kept `.spec` files and their CSV rows (U18, U27 — needs the suites-reorganization M3); the U32 bridge tool; round N ≥ 2 (U15); `route.mjs` (the prototype accepts a feature-test ticket only, as `/qa-test-fast` does); `knowledge-store.mjs`, `write-zones.mjs`; the test-data family; the cross-user access probe (U33 — needs on-the-fly accounts; the anonymous probe is in); `dev-check` (waits for O5/O6); Azure.

## Global Constraints

- ES modules, `.mjs`, `.js` extensions in imports; plugin paths through `import.meta.url`, output paths through the run folder `npm run run:use -- <KEY> [<env>]` prints (`RUN_DIR=…`), working state under `<outputRoot>/.vc-fix/vc-test/<KEY>/`.
- **No committed unit test** (`CLAUDE.md` NO CODE ⇒ NO UNIT TEST, RULE 2): each task's test lives in `scripts/unit/tmp-vc-test-<name>.test.mjs`, is run, and is **deleted before the task's commit**. This overrides the writing-plans default of committing tests.
- Command body ≤ 8,000 chars (spec §3 target); every brief and the command under BUDGET-004's 19,000 chars.
- No hardcoded URLs, accounts or ticket data in any script or brief (`.claude/rules/test-data.md` GOLDEN RULE); env through `config.js` / `process.env`.
- No outward write except at human point 2: tracker comment through the existing comment path after a yes; bugs only through `/vc-fix:qa-bug`; no status transition, ever (`.claude/rules/reports.md` §0).
- ≤ 3 browser lanes at once; `ac-checks` takes none (spec §4.1).
- `npm run context:check` green at every commit.

## Review Focus

1. **A strategy that is not approved** (Status `DRAFT`, missing, or a round heading with no Status line) — `plan-run.mjs` must refuse it, never plan from it. Test in Task 3.
2. **A strategy row the registry does not know** (`Mind map`, `Coverage triage + regression`, `Case authoring`, a typo) — recorded as `not-run` with its reason, never silently dropped, never a crash. Test in Task 3.
3. **A `RUN` row whose capability is missing** (no `playwright-firefox` in this session) — a planning error that names the capability (spec §5.2), not a wave that dies at dispatch. Test in Task 3.
4. **A change map that skips a bundle hotspot or AC** — the agent summarises instead of mapping; `check-change-map.mjs` must name each one missing. Test in Task 4.
5. **A session log with repeated message blocks** (one API response split across several jsonl lines with the same `requestId`) — `run-cost.mjs` must count it once, or every number is inflated. Test in Task 5.

---

### Task 1: Plugin skeleton, registry and the strategy reader

**Files:**
- Create: `plugins/vc-test/.claude-plugin/plugin.json`, `plugins/vc-test/README.md`, `plugins/vc-test/LICENSE` (copy of `plugins/vc-perf/LICENSE`)
- Create: `plugins/vc-test/lib/artifacts.json`
- Create: `plugins/vc-test/lib/strategy-artifacts.mjs`
- Test (temporary): `scripts/unit/tmp-vc-test-strategy-artifacts.test.mjs`

**Interfaces:**
- Produces: `readStrategy(md: string) => { round: number, status: "APPROVED"|"CHANGED"|"AUTO"|"DRAFT"|null, rows: Array<{ row: string, decision: "RUN"|"SKIP", order: "FIRST"|"ALONGSIDE"|null, reason: string }> }` and `loadRegistry() => { artifacts: Entry[], rows_not_run: Record<string,string> }`, where `Entry = { id, row: string|null, derivedFrom?: string, run: { skill?, agent?, model?, brief?, commands? }, needs: string[], lane: string|null, requires: string[], writes: string[], order?: "strategy" }` — `row: null` + `derivedFrom: "checklist"` marks an artifact selected whenever that one is (`ac-checks`, `ui-checks`).

- [ ] **Step 1: Write `plugin.json`** — `name: "vc-test"`, `version: "0.0.1"`, `displayName: "Virto Commerce Testing Flow (prototype)"`, `defaultEnabled: false`, `dependencies: [{ name: "vc-init", version: ">=0.3.3" }, { name: "vc-fix", version: ">=0.12.0" }]`, author/homepage/license as in `plugins/vc-perf/.claude-plugin/plugin.json`. README: three lines — prototype, load with `claude --plugin-dir plugins/vc-test`, not in the marketplace until P1.

- [ ] **Step 2: Write `artifacts.json`** with these entries (ids, rows exactly as the strategy template names them in `.claude/templates/test-strategy.md` §Artifacts):

| id | row | run | needs | lane | requires |
|---|---|---|---|---|---|
| `test-model` | `Test model` | skill `qa-test-model`, inline (no agent), model `opus` | `[]` | `null` | `[]` |
| `contract-refresh` | `Contract refresh` | commands `npm run schema:refresh`, `npm run graphql:fixtures:validate:refresh` | `[]` | `null` | `["back-url"]` |
| `checklist` | `Checklist` | agent `test-management-specialist`, brief `briefs/checklist.md`, model `sonnet` | `["test-model"]` | `null` | `[]` |
| `ac-checks` | — (derived: runs when `checklist` runs) | agent `qa-backend-expert`, brief `briefs/ac-checks.md`, model `sonnet` | `["checklist"]` | `null` | `["back-url"]` |
| `ui-checks` | — (derived) | agent `qa-frontend-expert`, brief `briefs/ui-checks.md`, model `sonnet` | `["checklist", "ac-checks"]` | `browser:playwright-chrome` | `["front-url", "mcp:playwright-chrome"]` |
| `exploratory` | `Exploratory` | skill `qa-exploratory` (`ticket <KEY> <env>`), agent `qa-testing-expert`, model `sonnet` | `["test-model"]`, `order: "strategy"` | `browser:playwright-firefox` | `["front-url", "mcp:playwright-firefox"]` |
| `visual` | `Visual lane` | skill `qa-design` (Skill tool, per `.claude/skills/qa-test/visual-axis.md` §4), agent `ui-ux-expert`, model `sonnet` | `[]` | `browser:chrome-devtools` | `["front-url", "mcp:chrome-devtools"]` |

`writes` per entry uses the `<run>/…` form (spec §5.1). `rows_not_run`: `{ "Mind map": "U43 — read only in a run", "Coverage triage + regression": "U7 — no regression in vc-test", "Verifier": "run by /qa-test-strategy before approval", "Case authoring": "U18 — kept .spec is out of the prototype" }`.

- [ ] **Step 3: Write the failing test** `tmp-vc-test-strategy-artifacts.test.mjs`:
  - `readStrategy` on a two-round fixture string reads only `## Round 2`; `status === "APPROVED"` for `Status: APPROVED (Elena, 2026-10-22)`, `"AUTO"` for `Status: AUTO (--yes)`, `null` when no Status line.
  - `Exploratory | RUN 30 min, FIRST — charter: R-1, R-3` → `{ decision: "RUN", order: "FIRST" }`; `ALONGSIDE` likewise; `Visual lane | SKIP — no UI surface` → `{ decision: "SKIP", reason: "no UI surface" }`.
  - a CRLF copy of the fixture parses identically.
  - `loadRegistry().artifacts.map(e => e.id)` equals the seven ids above.

- [ ] **Step 4: Run** `npx tsx --test scripts/unit/tmp-vc-test-strategy-artifacts.test.mjs` — Expected: FAIL (module not found).

- [ ] **Step 5: Implement `strategy-artifacts.mjs`** — the last `## Round N` section, the `### Artifacts` block and table rows read the way `.claude/skills/qa-test-strategy/lib/check-strategy.mjs` lines 11–17 do (same regexes, so a file its gate accepts parses here); the decision is the cell's first word; `Status:` is the first line matching `^Status:\s*(APPROVED|CHANGED|AUTO|DRAFT)`.

- [ ] **Step 6: Run the test** — Expected: PASS. Then `npx claude plugin validate plugins/vc-test` (or `claude plugin validate plugins/vc-test`) — Expected: valid.

- [ ] **Step 7: Delete the test and commit**

```bash
rm scripts/unit/tmp-vc-test-strategy-artifacts.test.mjs
git add plugins/vc-test
git commit -m "feat(vc-test): prototype plugin skeleton, artifact registry, strategy reader"
```

### Task 2: Capabilities probe (minimal)

**Files:**
- Create: `plugins/vc-test/lib/capabilities.mjs`
- Test (temporary): `scripts/unit/tmp-vc-test-capabilities.test.mjs`

**Interfaces:**
- Consumes: the project's `config.js`, loaded with `await import(pathToFileURL(join(process.cwd(), "config.js")))` so the layered env runs; a project without one ⇒ exit 3 "run from the project root".
- Produces: CLI `node plugins/vc-test/lib/capabilities.mjs --key <KEY> --mcp <comma list>` writing `<outputRoot>/.vc-fix/vc-test/<KEY>/capabilities.json` and printing it; pure function `probe({ env, mcp, reach }) => { "back-url": bool, "front-url": bool, "mcp:<name>": true for each name, missing: string[] }`.

- [ ] **Step 1: Write the failing test** — `probe` with `reach` stubbed: `BACK_URL` set and reachable ⇒ `"back-url": true`; `FRONT_URL` unset ⇒ `"front-url": false` and `missing` contains `"front-url: FRONT_URL not set"`; `mcp: ["playwright-chrome"]` ⇒ `"mcp:playwright-chrome": true` and no `"mcp:playwright-firefox"` key.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — `reach(url)` is a `fetch` with a 5 s `AbortSignal.timeout`, any HTTP status counts as reachable; the MCP list comes from the orchestrator (a script cannot see the session's MCP servers), names normalised to lower-case with spaces → `-`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Delete the test and commit** — `feat(vc-test): minimal capabilities probe`.

### Task 3: `plan-run.mjs`

**Files:**
- Create: `plugins/vc-test/lib/plan-run.mjs`
- Test (temporary): `scripts/unit/tmp-vc-test-plan-run.test.mjs`

**Interfaces:**
- Consumes: `readStrategy`, `loadRegistry` (Task 1); `capabilities.json` (Task 2).
- Produces: `planRun({ strategy, registry, capabilities }) => { ok: true, waves: Array<Array<{ id, lane, run }>>, notRun: Array<{ row, reason }> } | { ok: false, errors: string[] }`; CLI `node plugins/vc-test/lib/plan-run.mjs --strategy <md> --key <KEY>` writing `.vc-fix/vc-test/<KEY>/run-plan.json`, exit 2 on `ok: false`.

- [ ] **Step 1: Write the failing test** with these cases:
  - status `DRAFT` or `null` ⇒ `{ ok: false }`, error contains `"not approved"` (Review Focus 1).
  - `Test model SKIP`, `Checklist RUN`, `Exploratory RUN … ALONGSIDE`, `Visual lane RUN` ⇒ waves `[["checklist", "visual"], ["ac-checks", "exploratory"], ["ui-checks"]]` — `test-model` dropped as an unselected need, `exploratory` ALONGSIDE gains `checklist` as a need, `ac-checks`/`ui-checks` follow `checklist`; ids sorted inside a wave.
  - the same with `Exploratory … FIRST` ⇒ `[["checklist", "exploratory", "visual"], ["ac-checks"], ["ui-checks"]]` — it starts before any checklist item runs.
  - `Test model RUN` ⇒ `test-model` alone in wave 1 ahead of `checklist`.
  - `Mind map RUN` ⇒ `notRun` holds `{ row: "Mind map", reason: "U43 — read only in a run" }`; `Mind mapp RUN` (unknown row) ⇒ `notRun` reason `"not in the vc-test registry"` (Review Focus 2).
  - `Exploratory RUN` with no `mcp:playwright-firefox` ⇒ `{ ok: false }`, error names `mcp:playwright-firefox` (Review Focus 3).
  - four browser-lane entries forced into one wave ⇒ the fourth moves to the next wave (≤ 3).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — selected = `RUN` rows matched to entries by `row`, plus every entry whose `derivedFrom` is selected; needs filtered to selected ids; `order: "strategy"` + `ALONGSIDE` adds `checklist`; wave(e) = 1 + max(wave of its needs); then a stable pass moves browser entries past the third in a wave forward one wave at a time.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Delete the test and commit** — `feat(vc-test): plan-run computes waves from the approved strategy`.

### Task 4: Layer 0 — the change map

**Files:**
- Create: `plugins/vc-test/lib/change-map.schema.json`, `plugins/vc-test/lib/check-change-map.mjs`, `plugins/vc-test/briefs/change-map.md`
- Test (temporary): `scripts/unit/tmp-vc-test-change-map.test.mjs`

**Interfaces:**
- Consumes: the bundle (`bundle.json`, `ticket-context/1`): `acs[].id`, `change.prs[].hotspots[].source` (pattern `^[^:\s]+:[^:]+:[0-9]+$`); `validate` from `.claude/skills/ticket-context/lib/schema.mjs`.
- Produces: `change-map.json`, `schema: "vc-test/change-map/1"`:
  - `acs[]`: `{ ac: "AC-n", status: "IMPLEMENTED"|"NO CODE", code: string[] }`
  - `hidden[]`: `{ source, what }` — code no AC asks for
  - `hotspots[]`: `{ id: "H-n", source, risk, proof: "unit"|"api"|"ui"|"exploratory", zone: "access"|"money"|"data"|"order-state"|"buyer-path"|"none", node: string|null, profile: string|null }`
  - `suspicions[]`: `{ id: "S-n", source, hypothesis, check: "H-n" }`
  - `checkChangeMap(map, bundle) => string[]` (errors); CLI `node plugins/vc-test/lib/check-change-map.mjs --map <f> --bundle <f>`, exit 2 on errors.

- [ ] **Step 1: Write the failing test** — a minimal bundle with `AC-1`, `AC-2` and hotspots `a/b:src/x.cs:10`, `a/b:src/y.cs:5`:
  - a complete map ⇒ `[]`.
  - map missing `AC-2` ⇒ error `"AC-2: not in the change map"`; missing the `y.cs:5` hotspot ⇒ error naming `a/b:src/y.cs:5` (Review Focus 4).
  - a suspicion with `check: "H-9"` ⇒ error `"S-1: checks H-9, which does not exist"`.
  - `zone: "cosmetic"` ⇒ a schema error.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the schema and the checker (schema via `validate`, then the coverage and reference checks above).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Write `briefs/change-map.md`** — inputs are paths only: the bundle, the domain's mind map and data model when present (`.claude/knowledge/domain/<slug>.mind-map.json`, `test-data/models/<slug>.data-model.json`). The agent reads the bundle's CHANGE part and ACs, never the raw diff (spec U37: on a PR it reuses the CHANGE analysis); one hotspot per bundle hotspot plus any it adds; the zone comes from the mind-map node when one matches (U44), else from the code; a suspicion is a hypothesis with a line, never a bug; it runs the checker and fixes its own output once. Return: the path only.
- [ ] **Step 6: Commit** (test deleted) — `feat(vc-test): layer 0 change map, schema and checker`.

### Task 5: `run-cost.mjs`

**Files:**
- Create: `plugins/vc-test/lib/run-cost.mjs`
- Test (temporary): `scripts/unit/tmp-vc-test-run-cost.test.mjs`

**Interfaces:**
- Consumes: the session transcript `~/.claude/projects/<project-dir>/<session>.jsonl` (project dir = the cwd with every non-alphanumeric character replaced by `-`) and its `<session>/subagents/agent-*.jsonl` + `agent-*.meta.json` (`description` field).
- Produces: `cost({ mainLines, subagents: [{ description, lines }], since }) => { steps: Array<{ step, input, cacheCreation, cacheRead, output, inputTotal, activeMin }>, total: {…same fields, wallMin} }`; CLI `node plugins/vc-test/lib/run-cost.mjs --since <iso> [--session <id>|latest] [--out <file>]` printing a Markdown table and writing JSON next to `run-plan.json`.

- [ ] **Step 1: Write the failing test**:
  - two jsonl lines with the same `requestId` and identical `usage` ⇒ counted once (Review Focus 5).
  - `inputTotal = input_tokens + cache_creation_input_tokens + cache_read_input_tokens` (U42's input-equivalent measure; output reported separately).
  - a subagent whose `description` starts `[vc-test:exploratory]` lands in step `exploratory`; one with no `[vc-test:…]` prefix lands in `other`; main-session lines in `orchestrator`.
  - records before `since` are ignored.
  - `activeMin` sums gaps between consecutive records that are ≤ 120 s; `wallMin` is last minus first record after `since`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — `--session latest` = the newest `.jsonl` in the project dir; malformed lines are skipped and counted in a `skipped` field, never fatal.
- [ ] **Step 4: Run** — Expected: PASS. Then run the CLI on this machine's newest `/qa-test-fast` session and check that the total is the same order as §2b's (a sanity check, not an assertion).
- [ ] **Step 5: Delete the test and commit** — `feat(vc-test): run-cost reads tokens and minutes per step from the session logs`.

### Task 6: Agent briefs

**Files:**
- Create: `plugins/vc-test/briefs/checklist.md`, `briefs/ac-checks.md`, `briefs/ui-checks.md`, `briefs/verdict.md`

**Interfaces:**
- Consumes: paths only — `test-strategy.md`, `change-map.json`, `testing-checklist.md`, the run folder. Every dispatch description starts `[vc-test:<id>]` (Task 5 attributes cost by it).
- Produces: `{RUN_DIR}/testing-checklist.md` (thin: one row per AC and per strategy risk, columns `Ref | Item | Proof | Data | Result | Evidence`, Proof ∈ `ac-checks`, `ui-checks`, `exploratory`); results written into that file by the two lanes; `{RUN_DIR}/verdict.md` (≤ 60 lines, verdict first).

- [ ] **Step 1: `checklist.md`** — loads `qa-checklist` (Mode 5, `--strategy`), but writes the thin form above (U13 revised); an item a script or an API call can decide gets `ac-checks`; only a visual judgement gets `ui-checks`; every in-scope risk is a row or an omission line.
- [ ] **Step 2: `ac-checks.md`** — no browser tools; each `ac-checks` row decided by a REST or GraphQL call through the repository's own runners (`.claude/knowledge/execution/live-discovery.md`, `graphql-runner`), credentials from the env by name; evidence = the command and a response excerpt; a row it cannot decide by API is re-labelled `ui-checks` with the reason, never SKIP (spec §9). Also runs the **anonymous access probe** on every endpoint the change map lists (U26).
- [ ] **Step 3: `ui-checks.md`** — `playwright-chrome`; only `ui-checks` rows; screenshot only on FAIL (U28).
- [ ] **Step 4: `verdict.md`** — a fresh agent (U30) reads the result files only; the verdict table of `.claude/skills/qa-test-fast/verdict.md`; first line counts Medium-or-worse bugs in and out of scope (B16); Lows as one line each under "Noticed" (U25); "Not tested, and why" from `run-plan.json` `notRun` and any SKIP; appends the `run-cost.mjs` table.
- [ ] **Step 5: Check sizes** — `wc -c plugins/vc-test/briefs/*.md` each < 19,000; `npm run context:check` green.
- [ ] **Step 6: Commit** — `feat(vc-test): briefs for the thin checklist, ac-checks, ui-checks and the verdict writer`.

### Task 7: The command `/vc-test:qa-ticket`

**Files:**
- Create: `plugins/vc-test/commands/qa-ticket.md`

**Interfaces:**
- Consumes: every script and brief above; `/ticket-context`, `/qa-test-strategy`, `/qa-exploratory`, `qa-design`, `qa-triage-results`, `vc-fix:qa-investigate`, `vc-fix:qa-bug` in place.
- Produces: the run folder with `test-strategy.md`, `testing-checklist.md`, `verdict.md`, `run-cost.json`; `--dry-run` stops after `run-plan.json` with no outward write.

- [ ] **Step 1: Confirm the triage split** — read `.claude/skills/qa-triage-results/SKILL.md`: that `ticket <KEY>` **without** `--verify` classifies and returns candidates with severity and does not reach Phase 4. If it does reach Phase 4, the command passes the candidate list itself to `vc-fix:qa-investigate` instead and says so in the command.
- [ ] **Step 2: Write the command** (frontmatter `argument-hint: "<TICKET> [<env>] [--yes] [--dry-run]"`), steps, each a pointer and never a restated rule:
  0. `npm run run:use -- <KEY> [<env>]`; record the start time; `capabilities.mjs --mcp <the MCP servers this session has>`.
  1. `/ticket-context <KEY>` (its STOPs are this run's); a `NOT DEPLOYED:` blocker ⇒ BLOCKED.
  2. Layer 0: dispatch `[vc-test:change-map]` with `briefs/change-map.md`; run `check-change-map.mjs`; show the suspicions at once, labelled *suspected* (U41).
  3. `/qa-test-strategy` inline from its step 2, with the bundle **and** `change-map.json` as inputs: per risk, Approach chooses a script (`ac-checks`) or exploratory (U45); Exploratory is never `SKIP` on a ticket with a UI or API surface (U47). Human point 1 is its approval (`--yes` answers it).
  4. `plan-run.mjs`; `--dry-run` stops here.
  5. Waves from `run-plan.json`, one message per wave, each dispatch `[vc-test:<id>]` with its brief; the exploratory charter = the strategy's row + the change map's significant-zone hotspots + the anonymous access probe.
  6. `qa-triage-results ticket <KEY>` (per Step 1); Low/cosmetic ⇒ "Noticed" only; Medium or worse ⇒ `vc-fix:qa-investigate` (U29).
  7. `run-cost.mjs --since <start>`; dispatch `[vc-test:verdict]` with `briefs/verdict.md`.
  8. Human point 2: `/vc-fix:qa-bug` once per confirmed Medium-or-worse bug with its investigation file (U50), then one question whether to post the tracker comment.
- [ ] **Step 3: Check** `wc -c plugins/vc-test/commands/qa-ticket.md` < 8,000; `claude plugin validate plugins/vc-test`; `npm run context:check`.
- [ ] **Step 4: Dry run** — `claude --plugin-dir plugins/vc-test`, then `/vc-test:qa-ticket <a component-sized ticket> --dry-run`. Expected: a bundle, a valid change map, an approved strategy, `run-plan.json` with waves and `notRun`, no tracker write.
- [ ] **Step 5: Commit** — `feat(vc-test): /vc-test:qa-ticket prototype command`.

### Task 8: One live run and the measurement

**Files:**
- Create: `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` §2b — a "Prototype run" row (modify)

- [ ] **Step 1: Pick the ticket with the owner** — recommended: a component-sized ticket comparable to VCST-5903 R1, whose `/qa-test-fast` session is still on disk so `run-cost.mjs` can measure the baseline the same way (B11).
- [ ] **Step 2: Measure the baseline** — `run-cost.mjs --session <the baseline session id> --since <its start>`; record the per-run total.
- [ ] **Step 3: Run** `/vc-test:qa-ticket <KEY>` live; answer both human points.
- [ ] **Step 4: Record in §2b** — per-run total against the baseline, wall clock, the share of each step, the bugs found by severity and which lane found each. Expected direction (U34): at most 50% of the baseline; a Medium the baseline found and this run missed is recorded as a miss.
- [ ] **Step 5: Commit** — `docs(vc-test): prototype run measured against the /qa-test-fast baseline`.
