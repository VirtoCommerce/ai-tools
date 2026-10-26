# vc-test P1d-3a — "unavailable is not doubt": the floors read the install's capabilities — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A floor never fires on doubt only because this install lacks a tool. The repository scripts
`/vc-test:ticket-context` calls (`deploy:pr`, `preflight`, `domain:check`, `bl:extract`, `regression:select`, `tc:scope`)
become capabilities, and a missing one is a named SKIP. F2 reads the domain map from the project knowledge store,
F5 is gated on a regression corpus, and F6 reads `deployed.json`. Released as `vc-test` 0.4.0.

**Architecture:** `capabilities.mjs` already writes `<WORK>/capabilities.json`; it gains the script capabilities.
`floors.mjs` and `check-strategy.mjs` take `--capabilities <file>`. A floor whose fire comes only from a missing
capability, or whose required artifact this install cannot run, comes back `skipped` with that capability instead
of `fired`. The gate accepts a skipped floor when the strategy names it on its Floors line and in Out of scope.
`/vc-test:ticket-context` reads a domain map from the project store before it asks `domain:check`, and folds a
`deployed.json` into its deployment blockers when `deploy:pr` is absent. Without `--capabilities` nothing changes,
so this repository's runs and the existing gate tests behave as today.

**Tech Stack:** Node 18+ ES modules; `node:test` for temporary tests.

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — §5.2 (the rule), §5.3 (F2, F5, F6), U6, U7, §6. P1d-3 is two plans: this one, and [`2026-10-26-vc-test-p1d3b-host-governed.md`](2026-10-26-vc-test-p1d3b-host-governed.md), the host-governed route. They touch different files and can land in either order.

## Global Constraints

- **Unread is still doubt (F9).** Only a capability the install *lacks* turns a floor into SKIP. A script that is declared but fails, times out or prints no JSON stays a doubt that fires the floor, as today.
- **No `--capabilities` ⇒ today's behaviour, byte for byte.** `floors.mjs` and `check-strategy.mjs` without the flag give the same JSON and the same gate result as 0.3.1. That is how this repository's own `/qa-test-fast` and the existing gate checks stay untouched.
- **A skipped floor is never silent.** It is named on the strategy's Floors line as `skipped: <F> (not available in this install: <capability>)`, and Out of scope carries it with its residual risk (§5.2). The verdict lists it under "not tested, and why", as for any SKIP.
- **Budgets.** `skills/qa-test-strategy/SKILL.md` is 19,377 chars, over the 19,000 cap and in `.prompt-size-baseline.json`, so it may only shrink: any line added there is paid for in the same file. The rule's detail goes in `floors.md`, a supporting file. `skills/ticket-context/SKILL.md` stays under 19,000.
- **Self-contained** (`plugins/CLAUDE.md`): the skills import vc-test's own `lib/` (`knowledge-store.mjs`, `paths.mjs`), never the repo root.
- **NO CODE ⇒ NO UNIT TEST, and every test here is temporary** (`scripts/unit/tmp-<name>.test.mjs`, deleted before its commit).
- **Release:** `vc-test` 0.4.0, CHANGELOG, then `vc-test--v0.4.0` after merge.

## Review Focus

1. **A declared script that fails is mistaken for a missing one.** `regression:select` exits 1 on a project that has the script: F5 must fire on doubt (`unreadable`), not skip. Only the `not-available-in-install` reason, or `capabilities.scripts["regression-select"] === false`, skips. Test in Task 3.
2. **A skip that hides a real fire.** F5 with cases at risk fires even with no corpus capability: the at-risk list was read, so there is nothing to doubt. F2 with a readable store map is decided on the map, whatever `domain:check` says. Test in Task 3.
3. **A project store map that is a different domain.** The store map is read only for the slug `prepare` was given (`--domain`), at `<store>/domain/<slug>.md`, after the slug passes `DOMAIN_RE`. A slug with no map leaves F2 on doubt (`domain map ABSENT`). Test in Task 2.
4. **`deployed.json` from another ticket or env.** It is read only from this ticket's work folder (`workDir(key, env)`), and only its `expected[]` verdicts become blockers; with no `expected[]` it adds nothing. `UNKNOWN` is a `DEPLOYMENT UNKNOWN:` line, never `NOT DEPLOYED:` (F6 does not fire on it). Test in Task 2.
5. **A strategy written before this release.** A Floors line with no `skipped:` segment, checked with `--capabilities` where nothing is skipped, passes exactly as before. Test in Task 3.

---

### Task 1: The script capabilities

**Files:**
- Modify: `plugins/vc-test/lib/capabilities.mjs` (`projectScripts`)
- Test (temporary): `scripts/unit/tmp-vc-test-capabilities-scripts.test.mjs`

**Interfaces:**
- Produces: `capabilities.json` gains `scripts: { "deploy-pr", "preflight", "domain-check", "bl-extract", "regression-select", "tc-scope", "schema-refresh" }`, each a boolean: the npm script of that name (`deploy:pr`, `preflight`, `domain:check`, `bl:extract`, `regression:select`, `tc:scope`, `schema:refresh`) is declared in the project's `package.json`. The existing `contract-refresh` and `regression-corpus` keys stay, equal to `scripts["schema-refresh"]` and `scripts["regression-select"]`, so 0.3.x readers keep working.
- Consumed by Tasks 2–3.

- [ ] **Step 1: Write the failing test**: `probe()` over a temp root whose `package.json` declares `deploy:pr` and `tc:scope` only gives exactly those two `true` and the other five `false`; a root with no `package.json` gives all seven `false`; `contract-refresh` and `regression-corpus` still match.
- [ ] **Step 2: Run** `node --test scripts/unit/tmp-vc-test-capabilities-scripts.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** in `projectScripts(root)`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Delete the test, commit** `feat(vc-test): capabilities name the repository scripts ticket-context calls (§5.2)`.

### Task 2: `/vc-test:ticket-context` — the domain map from the project store, F6 from `deployed.json`

**Files:**
- Modify: `plugins/vc-test/skills/ticket-context/lib/known.mjs` (`knownGround`)
- Modify: `plugins/vc-test/skills/ticket-context/lib/deploy.mjs` (`checkDeployment`)
- Modify: `plugins/vc-test/skills/ticket-context/lib/cli.mjs` (the two callers pass `profile`, `key`, `env`)
- Test (temporary): `scripts/unit/tmp-tc-store-deployed.test.mjs`

**Interfaces:**
- Consumes: `storeConfig(profile, { root })` from `plugins/vc-test/lib/knowledge-store.mjs`; `workDir(key, { env, root })` from `plugins/vc-test/lib/paths.mjs`; the `deployed.json` written by `node "$VC_RUN" runner plugin deployed --key <KEY> --expect <file>` (`compareExpected` rows `{ id, expected, live, verdict }`).
- Produces:
  - `knownGround({ …, profile })`: when a `domain` is given, the project store's `<store.project>/domain/<domain>.md` is read first. Present ⇒ `known.domain_map = { state: "PRESENT", path: <absolute path> }`, and its `<domain>.mind-map.json` sets `known.mind_map.path`; `domain:check` is not run. Absent ⇒ today's `domain:check` path when the script is declared, else `state: "ABSENT"` with the existing `not-available-in-install` gap on `known.domain:check`.
  - `checkDeployment({ …, key, env })`: when `deploy:pr` or `preflight` is not declared and `<WORK>/deployed.json` exists with `expected[]`, each `NOT DEPLOYED` row becomes the blocker `NOT DEPLOYED: <id> — expected <expected>, live <live> (deployed.json)` and each `UNKNOWN` row `DEPLOYMENT UNKNOWN: <id> — <live or reason> (deployed.json)`. The `change.deployed` `not-available-in-install` gap stays, with the detail `PR artifacts not resolved; the stand was read by deployed.mjs`. No `deployed.json` ⇒ today's behaviour.

- [ ] **Step 1: Write the failing test**:
  - a temp project with `qa-knowledge/domain/orders.md` and `orders.mind-map.json` and no `domain:check` script: `knownGround({ domain: "orders", … })` gives `PRESENT` with that path and the mind-map path, and no `known.domain:check` gap;
  - `domain: "returns"` with no map there and no script gives `ABSENT` and the gap;
  - with both a store map and a `domain:check` script, the fake `run` is never called for `domain:check` (Review Focus 3);
  - a `deployed.json` in `workDir("VCST-1", { env: "vcst", root })` with `expected: [{ id: "VirtoCommerce.Orders", expected: "3.2.0", live: "3.1.0", verdict: "NOT DEPLOYED" }, { id: "Theme", expected: "2.6.0", live: null, verdict: "UNKNOWN" }]` and no `deploy:pr` gives one `NOT DEPLOYED:` and one `DEPLOYMENT UNKNOWN:` blocker; the same file under another key or env is ignored; a file with no `expected` adds no blocker (Review Focus 4).
- [ ] **Step 2: Run** `node --test scripts/unit/tmp-tc-store-deployed.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement**; pass `profile` to `knownGround` and `key`/`env` to `checkDeployment` from `cli.mjs` (`known` and `deploy` subcommands read the profile with the plugin's `loadProfile`, as `prepare` does).
- [ ] **Step 4: Run.** Expected: PASS. Then `prepare` + `known` on VCST-5097 in this repository (which has no `qa-knowledge/` store and declares every script) equals 0.3.1's `known.out.json`.
- [ ] **Step 5: Delete the test, commit** `feat(vc-test): ticket-context reads the domain map from the project store, and F6 from deployed.json without deploy:pr (§5.3)`.

### Task 3: The floors and the gate read capabilities

**Files:**
- Modify: `plugins/vc-test/skills/qa-test-strategy/lib/floors.mjs` (`computeFloors`, CLI)
- Modify: `plugins/vc-test/skills/qa-test-strategy/lib/check-strategy.mjs` (clause 6, CLI)
- Modify: `plugins/vc-test/skills/qa-test-strategy/floors.md` (the rule, F2, F5, F6 rows), `template.md` (the Floors line), `SKILL.md` (one line, paid for in the same file)
- Modify: `plugins/vc-test/briefs/strategy.md` and `plugins/vc-test/commands/qa-ticket.md` (pass `--capabilities <WORK>/capabilities.json` to both scripts)
- Test (temporary): `scripts/unit/tmp-vc-test-floors-capabilities.test.mjs`

**Interfaces:**
- Produces:
  - `computeFloors(bundle, { …, capabilities = null })`. Each floor object may carry `skipped: "<capability>"`; a skipped floor has `fired: false` and `requires: []`. The decision, applied after today's computation and only when `capabilities` is given:
    - F5 fired on doubt only because `known.regression:select` or `known.tc:scope` has reason `not-available-in-install` (or `capabilities.scripts["regression-select"] === false`), and `known.cases_at_risk` is empty ⇒ `skipped: "regression-select"`.
    - Any fired floor whose every required artifact needs a capability this install lacks ⇒ `skipped: <that capability>`. The map: `Exploratory` needs a browser lane (any `mcp:playwright-*`); `Visual lane` needs `mcp:chrome-devtools`; `Coverage triage + regression` needs `regression-select`.
    - F2 is never skipped: its source is the map `prepare` read (Task 2); an absent map stays a doubt that fires it.
  - CLI `floors.mjs --bundle <b> [--change-map <m>] [--capabilities <c>]` and `check-strategy.mjs … [--capabilities <c>]`.
  - Clause 6: with `--capabilities`, a floor `computeFloors` returns as skipped must appear after `skipped:` on the Floors line with its capability (`skipped: F5 (not available in this install: regression-select)`), and Out of scope must name it (`F5`) with a residual risk. A row it would have required may be `SKIP — not available in this install: <capability>`. Errors: `6s: <F> is skipped (<capability>) but not on the 'Floors fired:' line's skipped part` and `6s: <F> is skipped but Out of scope does not name it`.

- [ ] **Step 1: Write the failing test** over saved bundles (copy the VCST-5097 bundle from a 0.3.1 run into scratch, and edit copies):
  - no `--capabilities`: `computeFloors` output equals 0.3.1's on the unedited bundle (Global Constraint 2);
  - `known.regression:select` gap with `not-available-in-install` and no cases at risk ⇒ F5 `skipped: "regression-select"`; the same gap with `unreadable` ⇒ F5 fired on doubt (Review Focus 1); cases at risk present ⇒ F5 fired (Review Focus 2);
  - F1 fired with capabilities naming no `mcp:playwright-*` ⇒ F1 `skipped` for the browser lane;
  - `check-strategy`: a strategy whose Floors line carries `skipped: F5 (not available in this install: regression-select)` and whose Out of scope names F5 passes clause 6; without the Out of scope line it fails with `6s`; an existing strategy with nothing skipped passes as before (Review Focus 5).
- [ ] **Step 2: Run** `node --test scripts/unit/tmp-vc-test-floors-capabilities.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement**; write the rule in `floors.md` (§5.2, cited, with the capability map), the `skipped:` part in `template.md`, and in `SKILL.md` one sentence pointing at it, shortening another sentence in the same file so the file shrinks.
- [ ] **Step 4: Run** the test, then `npm run context:check` (SKILL.md under its baseline). Expected: PASS.
- [ ] **Step 5: Delete the test, commit** `feat(vc-test): a floor the install cannot serve is a named SKIP, never doubt — floors and gate read capabilities.json (§5.2)`.

### Task 4: Release `vc-test` 0.4.0

**Files:** `plugins/vc-test/.claude-plugin/plugin.json` (`0.4.0`), `CHANGELOG.md`, `plugins/vc-test/README.md` (the preview note: "some repository scripts" become capabilities), spec §10 P1 progress (P1d-3a done), this plan's status.

- [ ] **Step 1: Regression.** On VCST-5097 in this repository: `prepare`, `known`, `floors.mjs` without `--capabilities` and `check-strategy.mjs` on a saved strategy give 0.3.1's results. With `--capabilities` from `capabilities.mjs` here (every script declared, browsers present) the floors are the same, since nothing is missing.
- [ ] **Step 2: A client-shaped check.** A temp project with a profile, a `qa-knowledge/domain/<slug>.md`, no repository scripts and the VCST-5097 bundle's `known` block rewritten as such a project would produce it: F2 decided on the store map, F5 skipped with `regression-select`, and `check-strategy` accepting a strategy that names the skip.
- [ ] **Step 3: Gates.** `claude plugin validate plugins/vc-test`, `npm run context:check`, `npm run docs:index:check`, `npm test`.
- [ ] **Step 4: Commit, push, open the PR** `release(vc-test): 0.4.0 — unavailable is not doubt: the floors read the install's capabilities (vc-test P1d-3a)`.
- [ ] **Step 5: After merge**, `claude plugin tag --push` from `plugins/vc-test/` (`vc-test--v0.4.0`).
