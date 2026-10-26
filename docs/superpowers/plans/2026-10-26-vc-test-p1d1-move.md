# vc-test P1d-1 — `/ticket-context` and `/qa-test-strategy` move into the plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The canonical copies of `/ticket-context` and `/qa-test-strategy` live in `plugins/vc-test/`, with their
agents. `ticket-context-analyst` moves, and `strategy-verifier` is a new agent cut from `qa-lead-orchestrator`'s
Verifier Mode. They are deleted from `.claude/` in the same change (spec U2, U56).

Behaviour stays identical. The deterministic halves are compared against a baseline taken before the move:
`prepare` on VCST-5097, and the strategy gate on a saved strategy. Every consumer, `/qa-test-fast` included, calls
the plugin's copies. `vc-test` 0.2.0 drops its "needs an ai-tools checkout" limitation for these two skills.

**Architecture:** A `git mv` of both skill folders and the agent, then a repoint pass that the gates drive.
`npm run context:check` names every dangling path, and `docs:index:check` names every stale index. Nothing is
rewritten. The skills' scripts already resolve their own files through `import.meta.url`, and their prompts name
`<skill>`, which is the base directory the harness passes. The only code edits are the import paths inside
`plugins/vc-test/lib/` that pointed into `.claude/`.

**Tech Stack:** Node 18+ ES modules; the Claude Code plugin layout (`skills/`, `agents/`).

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — U2, U12, U19, U56, §4 (components), §10 P1 ("`/ticket-context` + strategy from the plugin on VCST-5097 … reproduce today's bundle and gate result").

**Stacked:** this plan's branch is cut from `claude/vc-test-p1c-plan` (PR #526), because it moves files into the P1c
plugin layout. Merge #526 first.

## P1d is three plans

| Plan | Delivers | Needs |
|---|---|---|
| **P1d-1 (this)** | The two skills and their agents move into the plugin, behaviour-identical, with consumers repointed and `vc-test` enabled in this repository | P1c |
| P1d-2 | Connectors (spec §7). `/ticket-context`'s Jira/GitHub reads move behind `$VC_RUN`, using P1a's pinned GraphQL read and P1b's `jira`/`ado` read commands. `lib/profile.mjs` stops reading tokens from the environment (U20). The Azure Boards and Azure Repos connectors are checked against recorded responses. The `vc-fix` floor rises to `>=0.14.0` | P1d-1 |
| P1d-3 | The host-governed route: the `fetch` agent writes the same raw files from the host's MCP servers (U23, B9). The floors' "unavailable is not doubt" rule reads `capabilities.json` (§5.2). F2 reads the project store, F5 is capability-gated, and F6 reads `deployed.json`. The npm scripts `/ticket-context` calls (`deploy:pr`, `preflight`, `domain:check`, `bl:extract`, `regression:select`, `tc:scope`) become capabilities: a project without them records a SKIP, never a doubt | P1d-2 |

## Global Constraints

- **One canonical copy** (U2). After this change, nothing under `.claude/` holds either skill or the moved agent. `git mv` keeps their history.
- **Behaviour-identical.** The deterministic outputs before and after the move must be equal once timestamps and absolute paths are normalised (Task 1 baseline, Task 5 check). Any difference is a bug in the move, not a new behaviour.
- **Self-contained.** No file under `plugins/vc-test/` may name a `.claude/` path after this change. This is checked with a grep in Task 5. The one exception is a link the plan names: a pointer to this repository's own docs for humans, never a file the plugin reads.
- **Budgets.** `qa-test-strategy/SKILL.md` is at about 18,976 of 19,000 chars (BUDGET-004), so every edit there must leave it no longer. The new `strategy-verifier.md` is under 19,000.
- **NO CODE ⇒ NO UNIT TEST.** The move ships no new behaviour. Its proof is the before/after equality and the gates (`context:check`, `docs:index:check`, `npm test`). The import-path edits are covered by `npm test` and the Task 5 smoke run.
- **Agent names in a plugin are namespaced:**
  - `subagent_type: "vc-test:ticket-context-analyst"` and `"vc-test:strategy-verifier"`;
  - skills are invoked as `/vc-test:ticket-context` and `/vc-test:qa-test-strategy`.
- **Release:** `vc-test` 0.2.0, the marketplace description updated (it now ships skills and agents), CHANGELOG, then `vc-test--v0.2.0` after merge.

## Review Focus

1. **A consumer still names the old path or the bare skill name** (`/ticket-context`, `../skills/ticket-context/…`, `.claude/skills/qa-test-strategy/lib/check-strategy.mjs`). `context:check` must be green, and the Task 5 grep for `skills/(ticket-context|qa-test-strategy)` outside the plugin must return only the plugin's own paths.
2. **A dispatch still names an un-namespaced agent** (`ticket-context-analyst`, or `qa-lead-orchestrator` in Verifier Mode for the strategy gate). The grep in Task 5 finds none.
3. **`/qa-test-fast` in this repository on a machine without `vc-test` installed.** Its first step must STOP with "install vc-test (`/plugin install vc-test@ai-tools`)", never run half a pipeline. This is Task 4's guard line.
4. **The cache.** `/ticket-context`'s 24 h bundle cache is keyed under `.vc-fix/context/<KEY>/` and is unaffected by where the code lives. A bundle cached before the move must still be served (no forced `--fresh`). This is checked in Task 5.
5. **The verifier's independence.** `strategy-verifier` re-derives the gate from the bundle and the strategy, never from the orchestrator's floors output, and is read-only (no Write/Edit). Its tools line is checked in Task 3.

---

### Task 1: Baseline, before anything moves

**Files:** none committed. The baseline goes to `<scratch>/p1d1-baseline/`.

- [ ] **Step 1: The deterministic `prepare`.** Run `node .claude/skills/ticket-context/lib/cli.mjs prepare VCST-5097 --fresh`. Keep `prepare.json`, then `abort` that prepare so no half-run stays. Normalise it with a jq-like node one-liner: drop `fetched_at`, `run_dir`, every absolute path and every `*_path` value, and sort keys. Save the result as `prepare.norm.json`.
- [ ] **Step 2: The gate.** Pick the newest run folder whose `test-strategy.md` and bundle both exist, using `reports/tickets/*/VCST-5097/*/` first, else any ticket that `npm run run:dir -- --all` lists with both. Run `node .claude/skills/qa-test-strategy/lib/check-strategy.mjs --strategy <it> --bundle <its bundle>` and save stdout as `gate.json`. Record which ticket was used.
- [ ] **Step 3: The cache probe.** Run `prepare VCST-5097` (no `--fresh`) and record whether it returned `cached: true`. That answer is the Review Focus 4 baseline.
- [ ] **Step 4: Ledger the three paths.** Nothing is committed in this task.

### Task 2: Move `/ticket-context` and its analyst

**Files:**
- `git mv .claude/skills/ticket-context plugins/vc-test/skills/ticket-context`
- `git mv .claude/agents/ticket-context-analyst.md plugins/vc-test/agents/ticket-context-analyst.md`
- Modify:
  - `plugins/vc-test/skills/ticket-context/SKILL.md`: the agent path, and every `subagent_type` → `vc-test:ticket-context-analyst`;
  - `plugins/vc-test/lib/knowledge-store.mjs`: import `scrub.mjs` from `../skills/ticket-context/lib/`; delete `plugins/vc-test/lib/scrub.mjs` (P1c's interim copy, so one canonical scrubber remains);
  - `plugins/vc-test/lib/score-scenarios.mjs` and `check-change-map.mjs`: their `.claude/skills/ticket-context/lib/schema.mjs` import becomes `../skills/ticket-context/lib/schema.mjs`, and the `PENDING` comment is removed.

- [ ] **Step 1: Move and edit.**
- [ ] **Step 2: Check.**
  - `node --test "plugins/vc-test/lib/*.test.mjs"` (PASS).
  - `node plugins/vc-test/lib/score-scenarios.mjs` with no arguments. Expected: the usage line, not an import error.
  - `node plugins/vc-test/skills/ticket-context/lib/cli.mjs` with no arguments. Expected: its usage line.
- [ ] **Step 3: Commit**: `refactor(vc-test): /ticket-context and its analyst move into the plugin (U2, U56)`.

### Task 3: Move `/qa-test-strategy`; `strategy-verifier` is its own agent

**Files:**
- `git mv .claude/skills/qa-test-strategy plugins/vc-test/skills/qa-test-strategy`
- `git mv .claude/templates/test-strategy.md plugins/vc-test/skills/qa-test-strategy/template.md`. Only this skill uses it: `SKILL.md:20` and `rounds.md:50`. Both references become `template.md`.
- Create `plugins/vc-test/agents/strategy-verifier.md`:
  - frontmatter `tools: Read, Grep, Glob, Bash`, `model: sonnet`;
  - a body under 8,000 chars;
  - its rules are the strategy-gate part of `qa-lead-orchestrator.md` §Verifier Mode plus `qa-test/SKILL.md` §The verifier: independence, re-deriving from `source_of_truth`, the deterministic command run first, `APPROVE`/`REJECT` with reasons, never editing;
  - Bash only for the gate command it is handed. The brief says so, and the tools line cannot narrow it further.
- Modify:
  - `plugins/vc-test/skills/qa-test-strategy/SKILL.md` §Approval step 1. Dispatch `vc-test:strategy-verifier` with the same four inputs, and `deterministic_cmd` = `node "<skill>/lib/check-strategy.mjs" …`. The link to `../qa-test/SKILL.md` is removed, because the agent carries those rules. The net char count must not rise.
  - `.claude/agents/qa-lead-orchestrator.md` §Verifier Mode, the "Outside `/qa-test`" paragraph (line ~299): the strategy gate now goes to `vc-test:strategy-verifier`, in one line. `/qa-test`'s own per-step verifier is unchanged until P4.

- [ ] **Step 1: Move, create, edit.**
- [ ] **Step 2: Check.**
  - `node -e` counts the characters of the new and the old `SKILL.md`. Expected: new ≤ old.
  - `wc -c plugins/vc-test/agents/strategy-verifier.md` < 8,000.
  - `grep -n "^tools:" plugins/vc-test/agents/strategy-verifier.md` shows no Write or Edit (Review Focus 5).
  - `claude plugin validate plugins/vc-test`.
- [ ] **Step 3: Commit**: `refactor(vc-test): /qa-test-strategy moves into the plugin; strategy-verifier is its own read-only agent (U56)`.

### Task 4: Repoint every consumer; enable vc-test here

**Files (each from the survey, plus whatever `context:check` names):**
- `.claude/commands/qa-test-fast.md`:
  - the two skill links become `../../plugins/vc-test/skills/<name>/SKILL.md`, and the invocations become `/vc-test:ticket-context` and `/vc-test:qa-test-strategy`;
  - a guard line in its first step: "`vc-test` not installed ⇒ STOP: install vc-test (`/plugin install vc-test@ai-tools`)" (Review Focus 3).
- `.claude/skills/qa-test-fast/context-wave.md` and `verdict.md`: the same repoint.
- `.claude/templates/qa-test-summary.schema.json`: the `$comment` path.
- `plugins/vc-test/commands/qa-ticket.md`:
  - `/vc-test:ticket-context` and `/vc-test:qa-test-strategy`;
  - its description drops "ai-tools checkout only" for these steps. It keeps the note for the steps that remain repo-bound until P1d-3: `qa-triage-results`, `vc-fix:qa-investigate`, and the npm scripts.
- `plugins/vc-test/briefs/strategy.md` and `verdict.md`: `<plugin>/skills/qa-test-strategy/SKILL.md`, not `.claude/…`.
- `.claude/settings.json` `enabledPlugins`: add `"vc-test@ai-tools": true`, next to `vc-secrets`. The comment in `CLAUDE.md` §Repository Structure about what the tracked settings enable gains vc-test in one clause.
- `docs/onboarding.md`: one line saying `/qa-test-fast` now needs `vc-test` installed.

- [ ] **Step 1: Edit.**
- [ ] **Step 2: `npm run context:check`.** Fix every dangling path it names, and repeat until it is green. Then `npm run docs:index`, and `npm run docs:index:check` (green).
- [ ] **Step 3: Commit**: `refactor: every consumer calls the plugin's /ticket-context and /qa-test-strategy; vc-test enabled in this repository`.

### Task 5: The regression check and the release

**Files:** `plugins/vc-test/.claude-plugin/plugin.json` (`0.2.0`, description), `.claude-plugin/marketplace.json` (the vc-test description; the catalog version is unchanged unless the listing's text changes it), `plugins/vc-test/README.md`, `CHANGELOG.md`

- [ ] **Step 1: Before = after.**
  - Repeat Task 1 Step 1 with `node plugins/vc-test/skills/ticket-context/lib/cli.mjs prepare VCST-5097 --fresh` and normalise the same way. `diff` it with the baseline. Expected: no difference, or only fields that hold a path into `plugins/vc-test/skills/` where the baseline held `.claude/skills/`, which the normaliser drops.
  - Repeat Task 1 Step 2 with the plugin's `check-strategy.mjs` on the same inputs. `diff` it with `gate.json`. Expected: identical.
  - Repeat Task 1 Step 3. Expected: the same `cached` answer (Review Focus 4).
- [ ] **Step 2: The greps** (Review Focus 1, 2):
  - `git grep -nE "skills/(ticket-context|qa-test-strategy)" -- ':!plugins/vc-test' ':!docs/'` lists only links of the form `plugins/vc-test/skills/…`.
  - `git grep -nE "subagent_type.{0,4}\"?(ticket-context-analyst|strategy-verifier)" | grep -v "vc-test:"` is empty.
  - `git grep -n "\.claude/" -- plugins/vc-test` returns only the human-doc pointers the plan allows.
- [ ] **Step 3: The release.** Edit the manifest, marketplace, README and CHANGELOG. Then run `claude plugin validate plugins/vc-test`, `claude plugin validate .`, `npm run context:check`, `npm run docs:index:check`, `node --test "plugins/vc-test/lib/*.test.mjs" "plugins/vc-init/bridge/*.test.mjs"` and `npm test`. Expected: all green.
- [ ] **Step 4: Commit**, push and open the PR (base: `claude/vc-test-p1c-plan` until #526 merges, then `main`): `release(vc-test): 0.2.0 — /ticket-context and /qa-test-strategy are the plugin's`.
- [ ] **Step 5: After merge**, from `plugins/vc-test/`, run `claude plugin tag --push` (`vc-test--v0.2.0`).
