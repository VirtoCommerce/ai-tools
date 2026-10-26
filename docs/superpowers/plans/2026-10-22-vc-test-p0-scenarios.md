# vc-test P0 — a scenario-driven run on a blind benchmark — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the vc-test prototype into the scenario-driven run of U60–U68 and measure it on the blind VCST-5904 benchmark: it must find X5 and cost no more than the prototype (B19).

**Architecture:** Two branches. **Part A** (skills, its own branch and PR, per the owner's rule) changes `qa-test-strategy` (gate clauses 11–13, the `Scenarios` table) and `ticket-context` (a blind `prepare`). **Part B** (`plugins/vc-test/`, branch `claude/vc-test-p0`, which already carries U68) adds the benchmark loader, the scenario scorer, the planner's per-scenario entries, the settings-window lock and announcement, the briefs and the command. Part B's run needs Part A merged. Deterministic work is in scripts; judgement is in briefs.

**Tech Stack:** Node 18+ ES modules (`.mjs`), no new dependency; tests with `tsx --test`, temporary (see Global Constraints).

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — U57–U68, B18–B21, §2c, §3, §4.1, §5.1, §10 P0. Benchmark: [`plugins/vc-test/benchmarks/VCST-5904.json`](../../../plugins/vc-test/benchmarks/VCST-5904.json).

## Global Constraints

- **No committed unit test** (`CLAUDE.md` RULE 2): each task's test is `scripts/unit/tmp-<name>.test.mjs`, run RED then GREEN, and deleted before the commit.
- Every prompt file under BUDGET-004 (19,000 chars); `qa-test-strategy/SKILL.md` is at ~18,660 — new gate text goes into `floors.md`, the SKILL gets one line per clause.
- `npm run context:check` and `npm run docs:index:check` green at every commit; `npm test` green before each PR.
- No hardcoded URLs, accounts or ids; env through `config.js` / `process.env` (`.claude/rules/test-data.md`).
- No outward write except at the human points: the team-channel announcement (U68) is approved by approving the scenario list.
- Significant zones and weights come from the spec (U39, U61); the six classes are U60's, numbered 1–6 in its order.
- At most 12 scenarios per run until O7 sets a budget (B19); one free class-3 exploratory scenario is always in the list (U47 under U65).

## Review Focus

1. **Two scenarios that write the same global setting in one wave** — they must land in different waves, and two global windows never overlap (U65, U68). Test in Task B3.
2. **A lock left by a crashed run** — a stale global-window lock (past its expiry) is reclaimed, never a run blocked forever; a live lock refuses. Test in Task B4.
3. **The benchmark build has moved** — any pinned version that differs from the live one voids the run before any context is fetched (O8). Test in Task B1.
4. **Comment times with offsets** (`2026-10-22T12:00:00.000+0200`) — the cutoff compares instants, not strings. Test in Task A3.
5. **A candidate citing a signal that does not exist** (an unknown hotspot id, an `untested` entry the bundle does not hold) — rejected with its reason, never scored. Test in Task B2.

## Status (2026-10-26)

**Closed 2026-10-26 (spec U69).** A1–A3 merged in #521, B1–B6 in #520. **B7 is not run**, by the owner's decision:
the scenario flow was already run on VCST-5904 (spec §2b), and vcst had moved off the pinned build (theme replaced by
`vc-frontend#2595`, MFA at `dd9b`). The §2c rows without a result are measured in P3. B1's loader, `bench-aside.mjs`,
`briefs/blind.md`, the benchmark definition and B6's `--benchmark` are removed (U69); A3's blind `prepare` stays, and
`keep-prepare` moved to `lib/keep-prepare.mjs`. The rest of this section is the state as it was before that decision.

**Before the decision:** The gate check of A1 Step 3 was re-run on 2026-10-26 against
the prototype's strategy: it fails 11b on P5 and P10, 11a on P9 and 12 on H-23, H-25, H-34 and H-50, which are the
causes of the X5 miss. The same run lists ~80 `6h` errors (each regression suite at risk must be named in Out of
scope). That is a cost for the strategy writer on a wide domain such as auth.

**Built differently from the tasks below. The code is normative; the tasks are kept as they were planned.**
- B1: the CLI also returns `unverifiable` (a module whose live version cannot be read ⇒ exit 3), `pin_only`
  (Platform and Theme, compared by branch pin, never read live), `move_aside` and `hide_pending`. `run_dir` is where
  the finished run is archived. The run itself works in fresh folders after `bench-aside.mjs aside`.
- B3: a scenario that writes a global or shared-store setting runs **alone** in its wave, with no other scenario and
  no `ac-checks`, so the flipped value cannot falsify its wave-mates. Browser lanes come from a pool per proof.
- B4: the announcement is an Adaptive Card, not a MessageCard. `window.mjs` also has `run`, which opens the window,
  runs the command and closes the window. The deadline is enforced: the command gets `VC_TEST_WINDOW_DEADLINE` and
  is killed at `--max-s`. `check` reports whether a channel is configured.
- B5/B20: scenario agents write `<RUN_DIR>/scenarios/S-n.rows.md`, and `scenario-rows.mjs merge` folds them into
  `testing-checklist.md` after each wave.
- Not in the plan: `bench-aside.mjs` (moves earlier run folders out and back, keeps `prepare/`, writes
  `bundle.blind.json`), `briefs/blind.md` (the rule for dispatches with no vc-test brief) and `briefs/ledger.md`.
- Budgets: `qa-test-strategy/SKILL.md` is at 18,976 of 19,000 chars and `qa-ticket.md` at 7,999 of 8,000. A fix
  after B7 moves text down a tier.

**Known gap in the blind prepare (A3).** `--before` drops comments and PRs created after the cutoff. For the PRs it
keeps, it still reads the diff, the body and the review comments at today's head. For VCST-5904 this was checked
by hand (`repinned[].post_cutoff_pr_content` in the benchmark). Every later benchmark needs the same check until
`ticket-context` cuts review comments and bodies at `--before`.

---

## Part A — skills branch `claude/vc-test-p0-skills` (from `origin/main`)

### Task A1: Gate clauses 11 and 12 (U57, U58, U59)

**Files:**
- Modify: `.claude/skills/qa-test-strategy/lib/check-strategy.mjs`
- Modify: `.claude/skills/qa-test-strategy/floors.md` (new section `## Clauses 11–13 — vc-test runs`), `.claude/skills/qa-test-strategy/SKILL.md` (gate list: one line each for 11, 12; "checks clauses 1–6h, 8, 10, 11, 12 and 13"; technique list gains `SCALE`), `.claude/templates/test-strategy.md` (technique comment gains `SCALE`)
- Test: `scripts/unit/tmp-strategy-oracles.test.mjs` — already written in `.claude/worktrees/strategy-oracles/scripts/unit/`; copy it in.

**Interfaces:**
- Produces: errors prefixed `11a:`, `11b:`, `12:` from `checkStrategy(md, bundle, { changeMap, changeMapPath })`; exported `STATE_HOTSPOT = /\b(limit(?:er|s)?|attempts?|counter|throttl\w*|rate[- ]?limit\w*|cach(?:e|ed|ing)|lockout|locked out|in[- ]memory|session state)\b/i`.

- [x] **Step 1: Copy the test** and run `npx tsx --test scripts/unit/tmp-strategy-oracles.test.mjs` — Expected: tests 1–3 FAIL (11a, 11b, 12 missing), 4–6 PASS.
- [x] **Step 2: Implement.** Project risks are the items of the `Project risks:` line, split at each `P<n>` token.
  - **11a:** an item with a code anchor (`/\b[\w./-]+\.(cs|ts|tsx|vue|js|mjs|json|graphql|cshtml|html):\d+\b/`) or a hotspot/suspicion id (`/\b[HS]-\d+\b/`) ⇒ `11a: P<n> describes product behaviour (<match>) — a product risk with its own check, not a project risk (U58)`.
  - **11b:** an item that names a risk (`/\bR-?\d+\b/`) and a weakening phrase (`/record(?:s|ed|ing)?\b[^.·]*\bobserved|instead of assert|no PASS\/FAIL|never FAIL|not asserted/i`) ⇒ `11b: P<n> lowers how <R> is decided — the AC/doc value stays the oracle (U57)`.
  - **12** (only with a change map): each hotspot whose `risk` matches `STATE_HOTSPOT` is covered when a risk with technique `SCALE` cites its id or its `path:line` (the hotspot `source` minus the leading `repo:`), or an Out of scope line names it with "single instance"; else `12: <ids> hold state but no SCALE risk cites them (U59)`.
- [x] **Step 3: Run the test** — Expected: 6/6 PASS. Also run the gate on the real VCST-5904 strategy: `node .claude/skills/qa-test-strategy/lib/check-strategy.mjs --strategy reports/tickets/Sprint26-21/VCST-5904/vcst/test-strategy.md --bundle <its bundle> --change-map .vc-fix/vc-test/VCST-5904/change-map.json` from the main checkout — Expected: an `11b` error on P10 and a `12` error naming the limiter hotspot (the miss behind X5, caught).
- [x] **Step 4: Docs, delete the test, commit** — `feat(qa-test-strategy): clauses 11–12 — no product risk in a project risk, the AC value stays the oracle, SCALE for held state (U57–U59)`.

### Task A2: The `Scenarios` table and clause 13 (B18)

**Files:** `check-strategy.mjs`, `floors.md` §Clauses 11–13, `.claude/templates/test-strategy.md` (a `### Scenarios` block after `### Approach per risk`, columns `S | Class | What it does | Bug it hunts | Why likely | Score | Proof | Writes`)
- Test: `scripts/unit/tmp-strategy-scenarios.test.mjs`

**Interfaces:**
- Produces: errors `13:`; with a change map, clause `6e` reads "a `MODEL` risk is cited by at least one scenario" and no longer requires `Test model` RUN.

- [x] **Step 1: Write the failing test** — with a change map and a `### Scenarios` table: (a) a scenario whose `Why likely` cites no `R-n` ⇒ `13: S-2 cites no risk`; (b) an `R-n` with technique `MODEL` cited by no scenario ⇒ `13: R1 (MODEL) has no scenario`; (c) `Test model | SKIP — scenarios cover the MODEL risks` raises no `6e` error; (d) without a change map, `6e` behaves exactly as today; (e) a `Scenarios` row with `Class` outside 1–6 ⇒ `13:`.
- [x] **Step 2: Run** — Expected: FAIL.
- [x] **Step 3: Implement** in `checkStrategy`: parse `block(sec, "Scenarios")` rows as `{ s, cls, what, hunts, why, score, proof, writes }`; apply (a)–(e).
- [x] **Step 4: Run** — Expected: PASS; then `npm test` — Expected: 0 fail.
- [x] **Step 5: Docs, delete the test, commit** — `feat(qa-test-strategy): a Scenarios table and clause 13 for vc-test runs (B18)`.

### Task A3: A blind `prepare` in `/ticket-context` (U67)

**Files:** `.claude/skills/ticket-context/lib/cli.mjs` (`prepare` flags `--before <iso>` and `--hide <KEY,KEY>`; both in the freshness key and in `prepare.json` as `benchmark: { before, hide }`), `lib/known.mjs` (`prior_runs` is `[]` when `prepare.json` carries `benchmark`), `SKILL.md` (one line under Step 0)
- Test: `scripts/unit/tmp-tc-blind.test.mjs`

**Interfaces:**
- Produces: `blindIssue(issue, { before, hide }) => issue` exported from `lib/jira.mjs` — drops comments created after `before` from `fields.comment.comments` and the index-paired `renderedFields.comment.comments`, and drops `issuelinks` entries whose key is in `hide`.

- [x] **Step 1: Write the failing test** — comments at `2026-10-22T10:00:00.000+0000`, `2026-10-22T12:30:00.000+0200` (= 10:30Z) and `2026-10-22T11:00:00.000+0000` with `before = 2026-10-22T10:17:38Z` ⇒ only the first stays, and its rendered twin with it (Review Focus 4); an `issuelinks` entry to `VCST-6504` with `hide: ["VCST-6504"]` is dropped; `blindIssue(issue, {})` returns the issue unchanged.
- [x] **Step 2: Run** — Expected: FAIL.
- [x] **Step 3: Implement** `blindIssue` (compare `Date.parse` instants) and call it in `prepare` right after the issue is fetched, before inventory; refuse `--before` that does not parse (usage, exit 1).
- [x] **Step 4: Run** — Expected: PASS; `npm test` — 0 fail.
- [x] **Step 5: Delete the test, commit, push the branch, open the Part A PR** — `feat(ticket-context): a blind prepare for benchmark runs (--before, --hide) (U67)`.

---

## Part B — plugin branch `claude/vc-test-p0`

### Task B1: The benchmark loader (U67, O8)

**Files:** Create `plugins/vc-test/lib/benchmark.mjs`; Test `scripts/unit/tmp-vc-test-benchmark.test.mjs`

**Interfaces:**
- Produces: `loadBenchmark(key) => def` (reads `plugins/vc-test/benchmarks/<KEY>.json`); `parseVerify(text) => Array<{ artifact, live }>` (the `Verify` table of `npm run deploy:pr -- <KEY> --verify`); `compareBuild(def, rows) => { ok, moved: Array<{ artifact, pinned, live }> }`; `benchRunDir(runDir, n) => string` (`<runDir>/bench-<n>`); CLI `node lib/benchmark.mjs --key <KEY>` runs the verify, prints `{ ok, moved, run_dir, before, hide }`, exit 2 when moved.

- [x] **Step 1: Write the failing test** — the VCST-5904 verify table (MFA `3.1000.0-pr-1-cf83` LIVE, OTP `3.1001.0-pr-3-d978` LIVE, Platform `healthy`, Customer MISSING, Theme PINNED) against the definition ⇒ `ok: true` (Platform compares by its image tag line, Customer's `MISSING` is accepted because the definition says it is the release, Theme by the pinned file name); the same with MFA `3.1000.0-pr-1-ab12` ⇒ `ok: false`, `moved` names MFA (Review Focus 3).
- [x] **Step 2: Run** — Expected: FAIL. **Step 3: Implement. Step 4: Run** — PASS.
- [x] **Step 5: Delete the test, commit** — `feat(vc-test): benchmark loader and build check (U67, O8)`.

### Task B2: The scenario scorer (U60, U61, U68, B19)

**Files:** Create `plugins/vc-test/lib/score-scenarios.mjs`, `plugins/vc-test/lib/scenarios.schema.json`; Test `scripts/unit/tmp-vc-test-score.test.mjs`

**Interfaces:**
- Consumes: the generator's `candidates.json` — `{ candidates: [{ id: "C-n", cls: 1-6, title, steps, hunts, signals: [{ kind: "state-in-memory"|"new-door"|"setting-other-consumers"|"untested"|"prior-bug", ref }], zone: "access"|"money"|"data"|"order-state"|"buyer-path"|"none", proof: "api"|"browser", writes: [{ scope: "global"|"store:<id>", name }], storeCreated: boolean, exploratory?: boolean }] }`; the change map; the bundle.
- Produces: `scoreScenarios({ candidates, changeMap, bundle, max = 12 }) => { selected: Scenario[], notSelected: Array<{ id, reason }>, rejected: Array<{ id, reason }> }`, `Scenario = candidate + { s: "S-n", likelihood, impact, score, needsGlobalWindow, needsOperatorStore }`; `renderScenarios(result) => string` (the `### Scenarios` table of B18 plus a "Not selected" list); CLI `node lib/score-scenarios.mjs --key <KEY> --candidates <file>` writes `<WORK>/scenarios.json` and prints the table.

- [x] **Step 1: Write the failing test**:
  - weights: likelihood = sum of signal weights `state-in-memory 3, new-door 2, setting-other-consumers 2, prior-bug 2, untested 1`, capped at 5; impact `access 5, money 5, data 4, order-state 4, buyer-path 3, none 1`; score = likelihood × impact;
  - a `state-in-memory` signal whose `ref` is not a change-map hotspot matching the state pattern, or an `untested` ref not in the bundle's `change.prs[].untested` ⇒ rejected with the reason (Review Focus 5);
  - selection is by score, then class diversity on ties; at most `max`; a candidate with `exploratory: true` (class 3) is always kept and counts toward `max`;
  - `writes` with `scope: "global"` ⇒ `needsGlobalWindow: true`; `scope: "store:<id>"` with `storeCreated: false` ⇒ `needsOperatorStore: true` (U68);
  - `renderScenarios` emits the B18 columns in order and numbers `S-1…` by rank; the `Writes` cell is `;`-separated `<scope>/<name>` (`global/MultiFactorAuthentication.Enabled`, `store:AGENT-TEST-X/OtpSignIn.Enabled`) or `—`.
- [x] **Step 2: Run** — FAIL. **Step 3: Implement. Step 4: Run** — PASS.
- [x] **Step 5: Delete the test, commit** — `feat(vc-test): scenario scorer — likelihood × cost, signals checked, at most 12 (U61, B19)`.

### Task B3: Strategy reader and planner — one entry per scenario (U65, §5.1)

**Files:** Modify `plugins/vc-test/lib/strategy-artifacts.mjs` (`readStrategy` also returns `scenarios`), `plugins/vc-test/lib/plan-run.mjs`, `plugins/vc-test/lib/artifacts.json` (drop `test-model`, `ui-checks`; add `scenario` with `"row": "Scenarios"`; `ac-checks` becomes `derivedFrom: "Scenarios"`, the background AC run); Test `scripts/unit/tmp-vc-test-plan-scenarios.test.mjs`

**Interfaces:**
- Produces: `readStrategy(md).scenarios: Array<{ s, cls, proof, writes: Array<{ scope, name }> }>`; `planRun` instantiates `scenario:S-n` entries (lane `browser:playwright-chrome` when `proof` is `browser`, else `null`; run `{ brief: "briefs/scenario-run.md", agent: "general-purpose", model: "sonnet" }`).

- [x] **Step 1: Write the failing test**:
  - two scenarios that write the same `global` setting are in different waves, and no wave holds two scenarios that write any `global` setting (Review Focus 1);
  - two scenarios writing `store:AGENT-TEST-X` / `OtpSignIn.Enabled` are in different waves; writes to different stores may share a wave;
  - browser scenarios respect ≤ 3 per wave; `api` scenarios take no browser slot;
  - `ac-checks` runs in the first wave of scenarios; `Test model` in the strategy is reported in `notRun` as "U63 — no separate test model".
- [x] **Step 2: Run** — FAIL. **Step 3: Implement** (a scenario's wave = the first wave after its needs where no other member writes a setting it writes and, for a global writer, no other global writer). **Step 4: Run** — PASS.
- [x] **Step 5: Delete the test, commit** — `feat(vc-test): the planner makes one entry per approved scenario and serialises shared settings (U65)`.

### Task B4: The global settings window — lock and announcement (U68)

**Files:** Create `plugins/vc-test/lib/window.mjs`; Test `scripts/unit/tmp-vc-test-window.test.mjs`

**Interfaces:**
- Produces: `acquire({ key, setting, maxSeconds, now, lockPath }) => { ok, holder? }` — one lock file `<outputRoot>/.vc-fix/vc-test/global-window.lock` `{ key, setting, pid, expiresAt }`; `release({ key, lockPath })`; `announce({ webhook, phase: "open"|"close", key, setting, value, maxSeconds }) => { ok, reason? }` — a Teams MessageCard POST to `process.env.TEAMS_WEBHOOK_URL`; no URL ⇒ `{ ok: false, reason: "no channel to announce the window" }`. CLI `node lib/window.mjs open|close --key <KEY> --setting <name> --value <v> [--max-s 120]`: `open` = acquire, then announce, exit 2 on either refusal; `close` = announce, then release.

- [x] **Step 1: Write the failing test** — a second `acquire` while a live lock is held ⇒ `ok: false` with the holder; a lock past `expiresAt` is reclaimed (Review Focus 2); `release` by another key leaves the lock; `announce` with no webhook ⇒ the refusal above; with a stub `fetch`, the posted body names the ticket, the setting, the value and the window length.
- [x] **Step 2: Run** — FAIL. **Step 3: Implement. Step 4: Run** — PASS.
- [x] **Step 5: Delete the test, commit** — `feat(vc-test): one global settings window at a time, announced in the team channel (U68)`.

### Task B5: Briefs — generator, runner, strategy, verdict, checklist

**Files:** Create `plugins/vc-test/briefs/scenarios.md`, `plugins/vc-test/briefs/scenario-run.md`; modify `briefs/strategy.md`, `briefs/verdict.md`, `briefs/checklist.md`

**Interfaces:**
- Consumes: B2's `candidates.json` shape and CLI; B3's strategy `### Scenarios` table; B4's `window.mjs` CLI; A3's blind `prepare`.

- [x] **Step 1: `scenarios.md`** — the six classes with one example each from §2b (X5, C-38, C-34, C-33, B5, MFA × email confirmation); mechanism analysis on the change map's hotspots (setting → rule → code → token, U63); inputs: the bundle, the diff files `prepare.json` names, the mind map and data model (B21 — nothing else, no network); every candidate carries real signal refs; writes `candidates.json`, runs `score-scenarios.mjs`, returns only its table.
- [x] **Step 2: `scenario-run.md`** — one scenario: its steps; the oracle is the AC/doc value (U57); `SCALE` requests on fresh connections, instance markers recorded (U59); settings: a global write only through `window.mjs open/close` around the shortest window, a store write only on the run's own stores or the operator-named one (U68), re-read before use (guard), every change in the ledger; results as `SC-n` rows in `testing-checklist.md` (B20); evidence on failure only; in a benchmark, kb entries observed after the cutoff are not used and are listed.
- [x] **Step 3: `strategy.md`** — the strategy section writes the scorer's table as `### Scenarios`, keeps `### Risks` for citation; the verifier (Critical risk) checks the list for a dropped strong-signal class, a weakened oracle and product behaviour in a project risk (U64); the approval summary is the scenario list (U62) plus the windows it will announce. **`verdict.md`** — per-scenario cost; in a benchmark, the hidden sources and the kb entries left unused. **`checklist.md`** — background AC rows only.
- [x] **Step 4: Check** — each brief under 19,000 chars; `npm run context:check` green. **Commit** — `feat(vc-test): briefs for the scenario generator and runner (U60–U68)`.

### Task B6: The command — `--benchmark`, scenarios, windows

**Files:** Modify `plugins/vc-test/commands/qa-ticket.md` (≤ 8,000 chars target)

- [x] **Step 1: Edit**: `--benchmark` runs `benchmark.mjs` first (exit 2 ⇒ STOP "the benchmark build moved"), forces round 1 in `bench-<n>`, and passes `--before`/`--hide` to `/ticket-context`; step 2 = change map, then the generator agent `[vc-test:scenarios]`; step 3 = the strategy agent writes the `Scenarios` section and the gate runs with A1–A2; human point 1 shows the scenario list and the windows (U62, U68); step 5 dispatches `[vc-test:scenario:S-n]` per `run-plan.json` entry with `briefs/scenario-run.md`; a global-window scenario with no `TEAMS_WEBHOOK_URL` is BLOCKED before dispatch.
- [x] **Step 2: Check** — `claude plugin validate plugins/vc-test`; `npm run context:check`; dry plan: `plan-run.mjs` on a hand-made strategy with a `Scenarios` table — waves as Task B3 expects. **Commit** — `feat(vc-test): the command runs scenarios and the blind benchmark (U60–U68)`.

### Task B7: The blind benchmark run and §2c

- [ ] **Step 0: Choose the second benchmark ticket before this run** (spec §2c caveats). Clause 12 was written after
  X5 was found, so VCST-5904 alone is a weak test.
- [ ] **Step 1: Preconditions** — Part A merged ✔ (#521). `TEAMS_WEBHOOK_URL` set in `.env.local` for the team channel ✘: on 2026-10-26 `node plugins/vc-test/lib/window.mjs check` exits 1, so every global-window scenario would be BLOCKED. `node plugins/vc-test/lib/benchmark.mjs --key VCST-5904` ⇒ `ok: true` ✔: re-pinned on 2026-10-26 to MFA `e8c7` and theme `8619` (O8, `repinned[]`). If the build moves again, STOP and record it in §2c (O8).
- [ ] **Step 2: Run** in a fresh session: `claude --plugin-dir plugins/vc-test`, then `/vc-test:qa-ticket VCST-5904 vcst --benchmark`.
- [ ] **Step 3: Record** in the spec: a §2b paragraph (cost per step and per scenario, scenarios proposed/approved/run, significant bugs by class, misses against the control) and a result in every §2c row. Pass: X5 found; ≤ 205.4M end to end and ≤ 113.8M in execution (B19). A miss on X5 fails P0 whatever the cost.
- [ ] **Step 4: Commit** — `docs(vc-test): P0 benchmark result on VCST-5904`.
