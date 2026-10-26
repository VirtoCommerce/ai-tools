# vc-test P2-1 — the run's deterministic scripts: route, trace, write zones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/vc-test:qa-ticket` decides three things by script instead of by the orchestrator's judgement: which job a
ticket is (route, step 0), how each risk of the approved strategy ended (trace, close), and whether the run wrote
anything outside the zones its artifacts own (write zones, close). Released as `vc-test` 0.7.0.

**Architecture:** Three new modules in `plugins/vc-test/lib/`, each a pure core plus a thin CLI, the shape of
`plan-run.mjs` and `scenario-rows.mjs`. `route.mjs` reads the ticket's type, status and parent through the
existing tracker connectors (one bridge launch each), or from the bundle's `fields` when the bridge is refused.
`trace.mjs` reads the last round of `test-strategy.md` and the result rows of `testing-checklist.md` and fills the
round's Reconciliation table. `write-zones.mjs` snapshots the work tree and the run folder before the first wave
and, at close, names every file changed outside the `writes` globs of the artifacts that ran. Only `write-zones`
gets committed tests (U10).

**Tech Stack:** Node 18+ ES modules, `node:test`; no new dependency.

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — §3 (step 0 and step 4), §4 (`route.mjs`, `trace.mjs`, `write-zones.mjs`), §5.1 (`writes`), §8 (the write-zones row), §9, §10 P2, U10, U11, U13, B6. Routing: [`2026-10-09-qa-test-strategy-redesign.md`](../specs/2026-10-09-qa-test-strategy-redesign.md) §5. Reconcile rule: `plugins/vc-test/skills/qa-test-strategy/SKILL.md` §Reconcile.

## P2 is seven plans

P2 spans several subsystems, so it is several plans, as P1 was. The spec already names its test-data phase
"P2b", so the Flow phase's plans are numbered. Each later plan is written when the one before it merges.

| Plan | Delivers | Needs |
|---|---|---|
| **P2-1 (this)** | `route.mjs`, `trace.mjs`, `write-zones.mjs` (+ committed tests), `test.routing` in `/vc-test:init`, all wired into the command | — |
| P2-2 | the round-N refresh (U15, B2, B3): `rounds.mjs` count and delta, the APPEND and RUN steps of §3's round N, the three-round cap | P2-1 |
| P2-3 | the narrow agents `change-map`, `checklist-writer`, `verdict-writer` (U56) replacing the general-purpose briefs; per-entry models (§8); `run-cost.mjs` on the §2b sessions (B11) and the budget defaults in `test.budget` (U73) | P2-1 |
| P2-4 | the `vc-fix` bump: `qa-bug` writes from the investigation file (U50); `qa-checklist` Mode 5 risk ids and `--from-strategy` | — |
| P2-5 | execution skills moved (U56): `qa-triage-results`, `qa-design` + `ui-ux-expert`, `qa-test-automation` + the `.spec` harness copy, `qa-test-cases-generator` + `test-management-specialist` (the kept `.spec` with its CSV row, U18), the verdict rules (B6) and the documents the strategy still reads from this checkout; consumers repointed, `.claude/` copies deleted | P2-3, P2-4 |
| P2-6 | `/vc-test:spec` (U54), `/vc-test:dev-check` (§3a, U35–U52, U71, U72), the F6 `--expect` producer (README), the `/ticket-context` join speed-up (O6, §8); P2's check: `--dry-run` on 3 tickets | P2-1…P2-5 |
| P2b | test data (spec §6a, §10) — the spec's own phase | P2-5 |

`/vc-test:spec` and `/vc-test:dev-check` have no phase in spec §10, yet P3 measures the developer command (U51);
P2-6 places them, and the spec's §10 row is updated with this plan.

## Global Constraints

- **Committed tests only for `write-zones.mjs`** (U10): `plugins/vc-test/lib/write-zones.test.mjs`, picked up by CI's existing `plugins/vc-test/lib/*.test.mjs` pattern (`.github/workflows/unit-tests.yml`). `route.mjs` and `trace.mjs` get temporary tests (`scripts/unit/tmp-<name>.test.mjs`), run red then green, deleted before their commit.
- **The exception list names the new committed test** in the same commit: `CLAUDE.md` §Essential Rules (the NO CODE ⇒ NO UNIT TEST bullet) and `.claude/knowledge/execution/when-to-write-a-test.md:47`.
- **No status name in code** (`ticket-routing.md` §3: never hardcode names). A status reaches a role only through the profile: `test.routing` (Task 1) or `tracker.azure.roleStates`.
- **A role the table cannot decide is `unresolved`** — exit 4, the command asks; never a guess, never a default to `test`.
- **Paths:** plugin files through `import.meta.url`; output through `outputRoot()` (`lib/paths.mjs`); every path a script prints or compares is POSIX-relative to `outputRoot()`.
- **Exit codes**, as the other `lib/` CLIs: 0 OK, 1 usage or unreadable input, 2 a finding the command acts on (unresulted risks, files outside a zone), 3 not writable / not available, 4 `unresolved` (route only).
- **The command body stays under BUDGET-004** (19,000 chars) and as near the §3 target (8,000) as it is today; each wiring is one or two lines citing the script.
- **Release:** `plugins/vc-test/.claude-plugin/plugin.json` → `0.7.0` (description: drop "Triage and investigation … until P2" only if P2-5 has landed — it has not, so keep it), README rows for the three scripts; after merge, `claude plugin tag --push` from `plugins/vc-test/` (`docs/release-process.md` §Step 1, §Step 5a).
- `npm run context:check` and `npm test` green before the PR.

## Review Focus

1. **A Sub-task under another name.** Jira's "Subtask", a localised name, or a custom sub-task type: the connector's `issuetype.subtask === true` decides, not the name. On Azure there are no sub-tasks; every type but Bug is `test`. Test in Task 2.
2. **A Bug in a status no role lists** (a custom "Code review" state). It is `unresolved`, never `not-fixed` by elimination, unless `test.routing["not-fixed"]` lists it. Test in Task 2.
3. **A checklist Ref that names a risk the strategy does not have** (`R12` when the table stops at R9, or a struck `S-4`). It is reported in `unknownRefs` and attributed to nothing; exit 2. Test in Task 3.
4. **A re-run on the same round** finds the run folder already full. Files present at the snapshot with unchanged content are not "changed"; a file the snapshot holds that the run then edits outside its zone is. Test in Task 4.
5. **A user's own uncommitted work** (the operator edits `.gitignore` while the run is in progress). It is outside every zone and is reported — by path, so the operator can say it was theirs; the run is BLOCKED, never silently clean. Test in Task 4.

---

### Task 1: `test.routing` — status names per role, written by `/vc-test:init`

**Files:**
- Modify: `plugins/vc-test/lib/init-plan.mjs` (`planTestBlock` gains `routing`)
- Modify: `plugins/vc-test/commands/init.md` (step 4 asks it; `argument-hint` gains `[--routing <json>]`)
- Test (temporary): `scripts/unit/tmp-vc-test-init-routing.test.mjs`

**Interfaces:**
- Produces: the profile's `test.routing` = `{ "fix-ready": string[], "hotfix-ready": string[], "not-fixed": string[] }` (status names, compared case-insensitively, trimmed). Absent or partly filled is valid.
- `planTestBlock({ …, routing })` returns `test.routing` normalised: names trimmed, empties dropped, duplicates removed; a name listed under two roles throws `status "<name>" is listed under both <a> and <b>`.

- [ ] **Step 1: Write the failing test** — `planTestBlock` with `routing: { "fix-ready": [" Ready for Test ", "TESTING", ""], "not-fixed": ["In Progress"] }` returns `test.routing` equal to `{ "fix-ready": ["Ready for Test", "TESTING"], "not-fixed": ["In Progress"] }`; with `"TESTING"` under both `fix-ready` and `hotfix-ready` it throws the message above; without `routing` the block has no `routing` key (a re-run keeps the stored one: `profile-set.mjs --merge` merges).
- [ ] **Step 2: Run it** — `node --test scripts/unit/tmp-vc-test-init-routing.test.mjs`; expected FAIL.
- [ ] **Step 3: Implement** in `init-plan.mjs`; the CLI takes `--routing <json>`.
- [ ] **Step 4: Run it** — expected PASS.
- [ ] **Step 5: `init.md` step 4** gains one question: *Which statuses mean a Bug is ready for test, ready on a hotfix line, not fixed yet?* — three free-text answers, comma-separated. On Azure prefill from `tracker.azure.roleStates`: `ready-for-test`, `testing` ⇒ fix-ready; `in-progress`, `in-review`, `reopen` ⇒ not-fixed; hotfix-ready empty. A role left empty is allowed: a Bug in an unlisted status is asked at run time.
- [ ] **Step 6: Delete the temporary test, commit** — `feat(vc-test): test.routing — the status names per role for routing (P2-1)`.

### Task 2: `route.mjs` — type × status role → job

**Files:**
- Create: `plugins/vc-test/lib/route.mjs`
- Test (temporary): `scripts/unit/tmp-vc-test-route.test.mjs`

**Interfaces:**
- Consumes: `loadProfile`, `testBlock` (`lib/profile.mjs`); `jiraConnector`, `azureBoardsConnector` (`skills/ticket-context/lib/connectors/`), `HostGoverned` (`…/lib/bridge.mjs`); Task 1's `test.routing`.
- Produces: `roleOf({ status, profile }) → "fix-ready" | "hotfix-ready" | "not-fixed" | null` — `test.routing` first, then `tracker.azure.roleStates` (`ready-for-test`, `testing` ⇒ fix-ready; `in-progress`, `in-review`, `reopen` ⇒ not-fixed).
- Produces: `route({ type, subtask, status, parent, profile }) → { job, role, reason, next }` where `job ∈ "test" | "verify-fix" | "hotfix-check" | "unresolved"`, `next` is `"/vc-fix:qa-verify-fix <KEY>"`, `"/qa-hotfix-check <KEY>"`, `"/vc-fix:qa-fix <KEY>"` (a not-fixed Bug, after the test) or `null`. `parent` is `{ key, type, subtask, status } | null`.
- CLI: `node lib/route.mjs --key <KEY>` (reads type, status, `issuetype.subtask`, parent and the parent's type and status — two reads at most) or `--bundle <bundle.json>` (from `fields.type`, `fields.status`; no parent). Prints the result JSON. Exit 0 a decided job, 4 `unresolved`, 3 the bridge refused (`HostGoverned`: the command routes after step 1 with `--bundle`), 1 usage.

| Input | `job` |
|---|---|
| a Sub-task (`subtask: true`) | the parent's row, re-entered with the parent's type × status; `reason` names the parent. No parent read (`--bundle`) ⇒ `unresolved` |
| type `Bug` (case-insensitive), role `fix-ready` | `verify-fix` |
| type `Bug`, role `hotfix-ready` | `hotfix-check` |
| type `Bug`, role `not-fixed` | `test`, `reason` "reproduce and characterize", `next` `/vc-fix:qa-fix <KEY>` |
| type `Bug`, role `null` | `unresolved`, `reason` names the status and says `test.routing` does not list it |
| type `null` | `unresolved` |
| any other type | `test` |

- [ ] **Step 1: Write the failing test** — one case per table row, plus: `subtask: true` with type `Subtask` and a parent `{ type: "Bug", subtask: false, status: "Ready for Test" }` ⇒ `verify-fix`; a Bug in "Code review" with `test.routing` listing only `fix-ready` ⇒ `unresolved` (Review Focus 2); an Azure profile with `roleStates: { "ready-for-test": "Resolved" }` and no `test.routing` ⇒ a Bug in "resolved" is `verify-fix`; `--bundle` with a Sub-task ⇒ `unresolved`.
- [ ] **Step 2: Run it** — expected FAIL.
- [ ] **Step 3: Implement** the pure `roleOf` and `route`, then the CLI. The `--key` read uses the profile's tracker kind to pick the connector, the same way `skills/ticket-context/lib/cli.mjs` does; ask only for the fields `["issuetype", "status", "parent"]`.
- [ ] **Step 4: Run it** — expected PASS.
- [ ] **Step 5: Live check** — `node plugins/vc-test/lib/route.mjs --key <K>` on three VCST tickets found by JQL: a Bug in a ready-for-test status, a Story, a Sub-task. Each prints the expected job; record the three keys and outputs in the PR.
- [ ] **Step 6: Delete the temporary test, commit** — `feat(vc-test): route.mjs — type × status role → job (P2-1)`.

### Task 3: `trace.mjs` — risks ↔ result rows, the Reconciliation table

**Files:**
- Create: `plugins/vc-test/lib/trace.mjs`
- Test (temporary): `scripts/unit/tmp-vc-test-trace.test.mjs`

**Interfaces:**
- Consumes: the last-round parsing of `lib/strategy-artifacts.mjs` (`lastRound`, `block`, `rows` — export them rather than copy them).
- Produces: `reconcile({ strategyMd, checklistMd, runPlan = null, acs = [] }) → { rows, unresulted, capped, unknownRefs, acs }`:
  - `rows`: one per risk of the last round's `### Risks` table — `{ r, level, planned, ran, result, deviation }`.
  - A result row belongs to a risk when its Ref names `R<n>`, or names `S-<n>` whose `### Scenarios` row's Why likely cites `R<n>`. Rows are every table row of the checklist with an id `C-<n>`, `SC-<n>.<m>`, `VIS-<n>` or `PIX-<n>`.
  - `planned`: the risk's scenarios (`S-1, S-3`) and its `### Approach per risk` technique and lane; `ran`: the row ids.
  - `result`: `FAIL <worst severity>` if any row FAILs (Critical > High > Medium > Low); else `BLOCKED` if any row is BLOCKED and none PASSes; else `PASS` if every row with a result PASSes; `null` when no row has a result.
  - `deviation`: the BLOCKED rows' reasons joined by `; `, or `not run: needs <missing>` for each of the risk's scenarios whose `run-plan.json` entry (`waves[][]`, id `scenario:S-n`) carries `missing`, or `no result`.
  - `unresulted`: the `r` of every row whose result is `null`. `capped`: true when a Critical or High risk's result is `null` or `BLOCKED` (SKILL.md §Reconcile).
  - `unknownRefs`: `{ id, ref }` for each result row whose Ref names an `R<n>` or `S-<n>` the last round does not have.
  - `acs`: for each `{ id }` of `acs` (the bundle's), `{ ac, rows, result }` from the rows whose Ref names it — U13's AC → proof.
- Produces: `writeReconciliation(strategyMd, rows) → string` — the last round's `### Reconciliation` table rows replaced, header and separator kept, the `Candidate cases` line and every other round untouched; running it twice gives the same file.
- CLI: `node lib/trace.mjs reconcile --strategy <p> --checklist <p> [--run-plan <p>] [--bundle <p>] [--write]`. Prints `{ unresulted, capped, unknownRefs, acsWithoutRow }`; `--write` writes the table. Exit 0, 2 when `unresulted`, `unknownRefs` or an AC without a row is non-empty, 1 usage or no `## Round`.

- [ ] **Step 1: Write the failing test** — build a two-round strategy (round 1 untouched), a last round with R1 High, R2 Medium, R3 Critical, scenarios S-1 (· R1) and S-2 (· R3), and a checklist whose rows are `C-1 | AC-1 · R2 | … | PASS`, `SC-1.1 | S-1 · R1 | … | FAIL High`, `SC-1.2 | S-1 · R1 | … | PASS`, `SC-2.1 | S-2 · R3 | … | BLOCKED — no channel to announce the window (U68)`, `C-2 | AC-2 · R12 | … | PASS`. Assert: R1 `FAIL High` ran `SC-1.1, SC-1.2`; R2 `PASS`; R3 `BLOCKED` with that deviation; `capped: true`; `unknownRefs` = `[{ id: "C-2", ref: "AC-2 · R12" }]` (Review Focus 3); with `acs: [{id:"AC-1"},{id:"AC-3"}]`, AC-3 has no row; `writeReconciliation` twice equals once, and round 1's text is byte-equal; CRLF input parses the same as LF.
- [ ] **Step 2: Run it** — expected FAIL.
- [ ] **Step 3: Implement.** Export `lastRound`, `block`, `rows` from `strategy-artifacts.mjs` and import them.
- [ ] **Step 4: Run it** — expected PASS.
- [ ] **Step 5: Real run** — `node plugins/vc-test/lib/trace.mjs reconcile --strategy reports/tickets/Sprint26-21/VCST-5904/vcst/test-strategy.md --checklist reports/tickets/Sprint26-21/VCST-5904/vcst/testing-checklist.md` (no `--write`). Every risk the prototype's verdict reports as tested has a result; a difference is either a parser bug (fix it) or a prototype row with a malformed Ref (name it in the PR).
- [ ] **Step 6: Delete the temporary test, commit** — `feat(vc-test): trace.mjs — the round's reconciliation from its result rows (P2-1)`.

### Task 4: `write-zones.mjs` — every changed file inside an artifact's zone (committed tests)

**Files:**
- Create: `plugins/vc-test/lib/write-zones.mjs`
- Create: `plugins/vc-test/lib/write-zones.test.mjs` (committed, U10)
- Modify: `plugins/vc-test/lib/artifacts.json` (a top-level `orchestrator.writes`)
- Modify: `CLAUDE.md`, `.claude/knowledge/execution/when-to-write-a-test.md` (the exception names this test)

**Interfaces:**
- Consumes: `loadRegistry` (`lib/strategy-artifacts.mjs`, which returns `orchestrator` too after this task); `run-plan.json` as `plan-run.mjs` writes it — `waves` is an array of arrays of `{ id, missing? }` (`checklist`, `ac-checks`, `scenario:S-n`, `visual`, `contract-refresh`); an entry with `missing` was not dispatched, so it did not run.
- `artifacts.json` gains `"orchestrator": { "writes": [...] }` — the files the command and the skills it calls inline write: `<run>/test-strategy.md`, `<run>/testing-checklist.md`, `<run>/verdict.md`, `<run>/summary.json`, `<run>/triage-report.md`, `<run>/evidence-*/**`, `<run>/investigations/**`, `<run>/bugs/**`, `<run>/scenarios/pixel.rows.md`, `<store>/**`. Derive the final list from the VCST-5904 run folder (Step 5), not from this line alone.
- Produces:
  - `registryErrors(registry) → string[]` — a `writes` glob that contains `reports/tickets/` (spec §5.1), or does not start with `<run>/` or `<store>/`.
  - `zonesFor({ registry, ran, runDir, store }) → { owner, re }[]` — `ran` is the entry ids that ran; `<run>` and `<store>` expanded to POSIX paths relative to `outputRoot()`; `S-n` in a scenario glob replaced by that instance's id; `orchestrator` always included; `.vc-fix/**` always allowed (working state).
  - `snapshot({ root, runDir }) → { at, files: Record<string, string> }` — every file under `runDir` and every path `git -C <root> status --porcelain=v1 -z --untracked-files=all` lists, each with the SHA-1 of its bytes (`"deleted"` for a deletion).
  - `changed(before, after) → string[]` — paths added, removed or with a different hash.
  - `outside(changedPaths, zones) → string[]`.
  - Glob semantics: `**` any depth including none, `*` within one segment, everything else literal; matched against POSIX-relative paths; on Windows compared case-insensitively.
- CLI: `node lib/write-zones.mjs snapshot --key <KEY> --run-dir <RUN_DIR>` writes `<WORK>/zones-snapshot.json`; `node lib/write-zones.mjs check --key <KEY> --run-dir <RUN_DIR> --run-plan <p>` prints `{ outside, registryErrors }`. Exit 0 none, 2 a file outside every zone (the run is BLOCKED, spec §8), 1 usage, no snapshot, or a registry error.

- [ ] **Step 1: Write the failing committed tests** in a temporary git repository (`mkdtempSync`, `git init`): (a) a scenario instance `scenario:S-2` owns `<run>/scenarios/S-2.rows.md` and not `S-3.rows.md`; (b) a file written into `<run>/` by an entry that did not run is outside; (c) Review Focus 4 — a file present at snapshot and unchanged is not changed, the same file edited is; (d) Review Focus 5 — an edit to a tracked `.gitignore` after the snapshot is outside; a `.gitignore` already dirty and untouched since the snapshot is not; (e) `**` matches zero segments (`<run>/bugs/**` matches `<run>/bugs/a.md` and `<run>/bugs/x/y.md`); (f) `registryErrors` flags `reports/tickets/S1/K/vcst/x.md` and `scratch/x.md`; (g) `.vc-fix/vc-test/K/vcst/run-plan.json` is never outside.
- [ ] **Step 2: Run them** — `node --test plugins/vc-test/lib/write-zones.test.mjs`; expected FAIL.
- [ ] **Step 3: Implement** `write-zones.mjs`; add `orchestrator` to `artifacts.json` and return it from `loadRegistry`.
- [ ] **Step 4: Run them** — expected PASS; `node --test "plugins/vc-test/lib/*.test.mjs"` all green.
- [ ] **Step 5: Real run folder** — snapshot an empty scratch folder as `--run-dir`, copy the VCST-5904 run folder's files into it, and `check` with a `run-plan.json` naming the entries that run had: every file is inside a zone. Each file outside is either added to `orchestrator.writes` (a file the flow does write) or named in the PR as a prototype stray.
- [ ] **Step 6: Exception list** — `CLAUDE.md` and `when-to-write-a-test.md:47` name `plugins/vc-test/lib/write-zones.test.mjs` beside the knowledge-store test (U10: the write-zone check). `npm run context:check` green.
- [ ] **Step 7: Commit** — `feat(vc-test): write-zones.mjs — a run writes only inside its artifacts' zones (P2-1)`.

### Task 5: Wire the three into the command; release 0.7.0

**Files:**
- Modify: `plugins/vc-test/commands/qa-ticket.md`
- Modify: `plugins/vc-test/briefs/verdict.md`
- Modify: `plugins/vc-test/README.md`, `plugins/vc-test/.claude-plugin/plugin.json`
- Modify: `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` §10 (the P2 row: its seven plans; `/vc-test:spec` and `/vc-test:dev-check` placed in P2-6)

**Interfaces:**
- Consumes: the three CLIs above, exactly as their Interfaces blocks give them.

- [ ] **Step 1: Step 0** gains, after `run:use`: `node <plugin>/lib/route.mjs --key <TICKET>` — `verify-fix` / `hotfix-check` ⇒ STOP naming `next`; `unresolved` (exit 4) ⇒ ask the user which job, with its `reason` (this is not a third human point: the run has not started, and its answer is the route); exit 3 ⇒ route after step 1 with `--bundle <BUNDLE>`. A not-fixed Bug's `reason` becomes the mission line the strategy agent receives.
- [ ] **Step 2: Step 5** gains, before the first wave: `node <plugin>/lib/write-zones.mjs snapshot --key <TICKET> --run-dir <RUN_DIR>`.
- [ ] **Step 3: Step 7** opens with `node <plugin>/lib/trace.mjs reconcile --strategy … --checklist … --run-plan … --bundle <BUNDLE> --write` — exit 2 with `unresulted` ⇒ back to their agents once (as step 6's `unresulted[]`), then reconcile again and go on; `unknownRefs` ⇒ named in the verdict. Then `write-zones.mjs check`; exit 2 ⇒ the run is BLOCKED, the verdict names each file.
- [ ] **Step 4: `briefs/verdict.md`** — "Reconcile the strategy first" becomes: the Reconciliation table is already filled by `trace.mjs`; read it, and its `capped` caps the verdict below PASS. Add `WRITE_ZONES` (the check's JSON) to the inputs: a non-empty `outside` makes the verdict BLOCKED, each path listed.
- [ ] **Step 5: Check the budget** — `npm run context:check` green; the command's size printed next to the 8,000 target in the PR.
- [ ] **Step 6: Dry run** — `/vc-test:qa-ticket <a Story key> --dry-run` routes `test`, plans the waves, and writes nothing outside `.vc-fix/` and the run folder; `/vc-test:qa-ticket <a Bug in ready-for-test>` STOPs at step 0 naming `/vc-fix:qa-verify-fix`.
- [ ] **Step 7: Release** — `plugin.json` `0.7.0`; README "What is here" lists `route.mjs`, `trace.mjs`, `write-zones.mjs` and `test.routing`; spec §10 P2 row as above; `npm run context:check`, `npm test`, `node --test "plugins/vc-test/lib/*.test.mjs"` green; `claude plugin validate plugins/vc-test`. Commit `release(vc-test): 0.7.0 — route, trace and write zones by script (vc-test P2-1)`; PR; after merge `claude plugin tag --push` from `plugins/vc-test/`.
