# Regression & CI Reference

## Architecture: Testing Modes

### 1. Interactive MCP-Driven Testing (Primary)
Load a prompt template from `vc/shared/docs/prompts/`, execute via MCP browser tools with DevTools monitoring. After each flow: export HAR, capture console logs, take screenshots. Generate bug reports in `reports/bugs/`.

### 2. CI Regression via Claude Agent SDK

`ci/run-regression.ts` runs suites headless via `@anthropic-ai/claude-agent-sdk` (chrome only, up to 3 in parallel, 90-day `history.json`). The live-progress watcher, run close-out ownership and the `regression:reap` orphan backstop are specified in [`knowledge/execution/regression-pipelines.md`](../knowledge/execution/regression-pipelines.md) — read it before touching `test-run-status.json` or the watcher.

### 3. Autonomous Interactive Regression — REMOVED 2026-08-26

Do not re-create it. Why it was removed: [`docs/decisions/regression-history.md`](../../docs/decisions/regression-history.md).

### 4. Full Test Cycle CI Pipeline (Sync → Lifecycle → Regression)
`ci/run-full-cycle.ts` orchestrates a 3-phase pipeline triggered by code changes. Phase 1 (SYNC + REVIEW) uses `/qa-test-lifecycle --ci` to detect stale test cases from PRs/diffs/module updates, update Steps/Assertions, analyze coverage gaps, and run the `/qa-review-tests` **static** dimensions (1–7, 9, 10 — dim 8 needs a browser, dim 11 is the separate `ci/run-suite-audit.ts` twin). Phase 2 (REGRESSION) delegates to `ci/run-regression.ts` to execute the affected suites. Each phase has independent skip flags and budget allocation (50%/50% of total budget). Results go to `reports/full-cycle/{RUN_ID}/`.

**Invoke:** `CHANGE_SOURCE="PR #123" npm run ci:cycle` or via `.github/workflows/full-cycle.yml`
**Triggers:** PR merge to main (auto), daily schedule (Mon-Fri 8AM UTC), manual dispatch
**npm scripts:** `ci:cycle` (full), `ci:cycle:pr` (PR-driven), `ci:cycle:sync-only` (Phase 1 only), `ci:cycle:no-sync` (skip Phase 1)

## Test Suite Manifest: `config/test-suites.json`

Central configuration for regression orchestration. Defines:
- **Browser pool**: 3 slots (playwright-chrome, playwright-firefox, playwright-edge) with fallback chain
- **Suite definitions**: 126 suites in module-aligned subdirectories under `Frontend/` and `Backend/`, with id, name, CSV file path, priority, test count, assigned agent type, and tags
- **Selection groups**: 37 groups — `smoke`, `critical`, `sprint`, `full`, `frontend`, `backend`, plus module-specific groups (`catalog`, `search`, `orders`, `auth`, `b2b`, `marketing`, `platform`, `bopis`, `payment`, `configurable-products`, `whitelabeling`, `purchase-flow`, `loyalty`, …)
- **Defaults**: max 3 parallel agents, 2 retries, 30s retry delay, HAR capture enabled

## Regression Test Suites

126 suites in `regression/suites/` organized by module (50 directories) under `Frontend/` and `Backend/`. Enriched agent-native CSV format. Full definitions in `config/test-suites.json`. **Total: 4,155 test cases** (per manifest `testCount`; the source of truth is `config/test-suites.json`).

### Suite inventory

Derived, not documented here — `config/test-suites.json` is the source of truth (`npm run suites:lint` prints totals). The suite-authoring RULES — globally unique case IDs, the `…A` / renumber naming convention, **XREF-001** (a dependency may not leave its suite CSV), the `078` split rationale — live in [`knowledge/execution/regression-suites.md`](../knowledge/execution/regression-suites.md). Read it before adding or splitting a suite.

### WORKING IN A SHARED TREE — the git prohibition, then the one-author rule

**FIRST AND STRONGEST: never run a git command that changes repository or working-tree state.**
No `stash` (push/pop/apply/drop), no `checkout` / `restore` / `switch` on paths or branches, no
`reset`, `clean`, `revert`, `rebase`, `merge`, `commit` — by any agent, in any session, for any reason,
including "recovery". Read-only git is always fine (`status`, `diff`, `log`, `show HEAD:<path>`);
for a baseline, copy the file to the scratchpad or read `git show HEAD:<path>`.

This is stated **before** the one-author rule below because it is the stronger of the two, and the
2026-08-28 loss proves it: one author's `git checkout --theirs -- .` reached files it had no interest
in and reverted **every tracked file** to HEAD, destroying a completed 161-insertion suite
re-pointing and 14 rule edits belonging to other sessions. Single authorship would not have
prevented that — the command was run by the file's own author, and its blast radius was the whole
tree. Several sessions hold uncommitted work here at any time, and a tree-wide git operation is
unrecoverable for all of them. A `git stash` that "failed silently" is the signal to stop and
report, never to escalate to a broader command.

**A commit is not exempt just because it is not destructive: `git add -A` in a shared tree commits
OTHER sessions' uncommitted work.** The risk is the opposite of the git prohibition above — nothing
is lost, but someone else's unfinished work is **published under your commit message**, attributed to
your change, and pushed where others will build on it. So a tree-wide commit needs the same *ping
first* discipline as a destructive operation: say what you are about to sweep up, and let the other
authors say whether their half is in a committable state.

Measured 2026-08-28: one session's user authorised `commit all`, and the commit carried a second
session's fixture work, suite fix, aliases and bug reports — without that session's user being asked.
It landed cleanly only because that half happened to be gate-green at that minute; a patched assertion
had landed moments earlier and the same command could as easily have caught the file mid-edit. Treat
the good outcome as luck, not as evidence the practice is safe.

**Calibrate what this rule is about, or it becomes "never run `git add -A`" and gets ignored.** The
failure is **publishing another session's unfinished WORK** — half-written source, a suite mid-edit, a
fixture that has not been verified — under your commit message and your name. It is **not** every file
you did not personally author. Sweeping up an already-tracked transient artifact — a run-status file, a
generated report — is untidiness, not the failure: it was in git before you touched it and the next
commit records its final state. Measured 2026-09-01: `reports/regression/test-run-status.json` was
committed mid-run and read as a repeat of this mistake, until checking showed it has been tracked for
100+ commits and matches no ignore rule, so every commit touching that path has always recorded
whatever state it was in. Keep the distinction sharp; a rule that flags everything flags nothing.

**And once it is pushed, it stays.** Do not offer to rewrite history to fix attribution on a shared
branch: a force-push breaks the branch for every session that has pulled it, which is a real loss
traded for a cosmetic one. Attribution lives in the reports, the code comments and the audit trail —
which is where anyone actually looks.

**SECOND: a suite CSV has exactly one author for the duration of a change.** Not one author per file
forever — one author per *change*: whoever is restructuring, culling or re-pointing a suite owns
every row in it until they hand it back. A second writer on the same CSV is forbidden even when the
two are editing "different rows", and even when both are careful.

This is the same discipline `/qa-review-oracles` already applies to `business-logic.md` and
`e-commerce-edge-cases-library.md` — triangulation fans out, the **apply is single-writer** — and it
exists here for the same reason plus two that are specific to suites:

- **A CSV is not mergeable in practice.** Rows are multi-line, quoted, and the safe writers
  (`suites:append`, the surgical byte-level edit `promote-cases.ts` uses) all read-modify-write the
  whole file. Two such writes interleave into a file that parses but is wrong — and `suites:lint`
  cannot tell you which half was intended.
- **The disposition is the artifact, not the diff.** A restructure is a set of coupled decisions —
  this case is culled *because* that journey now crosses its link, these two merge *because* they
  test one rule. Splitting the file between two authors splits the reasoning, and the second author
  cannot see why the first kept what they kept.
- **Concurrency here has a measured cost.** 2026-08-28: two `test-management-specialist` agents in
  two sessions were given the same suite (`083d`) minutes apart; earlier the same day a subagent's
  `git checkout --theirs -- .` — reached for as "recovery" after a stash collision in the shared
  tree — reverted every tracked file to HEAD and destroyed a completed 161-insertion re-pointing of
  that same suite plus 14 rule edits. Neither loss was a merge conflict; both were two writers where
  the tree assumed one.

**How to work concurrently anyway** — the fan-out is fine, the *write* is what serialises:

| Want | Do |
|---|---|
| Two people analysing one suite | Both analyse; **one** applies. The other hands over a staged rows CSV + a disposition table |
| Two suites, two authors | Fine — ownership is per file, and `config/test-suites.json` is written by `suites:sync`, not by hand. **It is shared state**: agree who runs sync, or exchange the per-suite delta and let one side apply it |
| Handing a suite over mid-change | Say so explicitly and stop writing. The successor re-reads the file from disk before their first edit |
| You find a suite already modified in the tree | **Do not overwrite and do not revert.** Someone else is mid-change; report the conflict and wait |

**A mid-write invalid CSV blocks every concurrent author, not just you.** `suites:sync` and
`suites:lint` hard-fail on a parse error anywhere in the corpus, so a suite left transiently
unparsable — a half-written quoted field, an unbalanced closing quote — takes the manifest gate down
for everyone in the tree until it is fixed. Measured 2026-08-28: a `CSV_INVALID_CLOSING_QUOTE` at
line 871 of one suite blocked both sessions' gates for ~15 minutes, and the author who caused it did
not know it was blocking anything — it looked like a local parse failure. So the
surgical-edit discipline (`promote-cases.ts`: locate the record by its own raw text, replace only the
changed bytes, **re-parse and compare field-by-field**) is not merely about diff hygiene during a
shared-tree window — re-parse after EVERY write, not once at the end.

**A fact relayed to another session's SUBAGENT does not arrive — it is lost silently.** Cross-session
messages land in a subagent's context as system-reminder blocks and (correctly) trip the harness's
prompt-injection handling: the receiving agent treats them as untrusted, declines to act, and may
refuse to open files the message points at. Measured 2026-08-28: two coordination messages carrying
load-bearing environment facts were dropped this way, and neither side saw a rejection. **The relay
path that works is session → session → the receiving session RE-ISSUES the fact, in its own words, in
the subagent's dispatch brief.** That re-statement is also what makes the fact reviewable, so it is
the right shape independent of the transport. Never assume a forwarded fact landed; if it matters,
it belongs in the brief.

**A suite conflict is never resolved with git** — see the prohibition at the head of this section.
Hand the conflict to a human or to the other author; there is no git command that makes two writers
safe, and every one of them makes the loss bigger.

### Selection Groups

| Selection | Suites | Use Case |
|-----------|--------|----------|
| `smoke` | 042, 078, 078b, 078c, 078d | Daily validation before deployment |
| `critical` | 042, 078, 078b, 078c, 078d, 039, 044, 049 | P0 suites only |
| `purchase-flow` | cart + checkout + orders-frontend + payment | Purchase flow regression |
| `catalog` | 001-003, 051, 053 | Catalog module (frontend + admin) |
| `search` | 004-005, 061 | Search module (frontend + admin) |
| `orders` | 014-019 | Orders & quotes (frontend + admin) |
| `auth` | 031-033 | Authentication module |
| `b2b` | 006-010 | B2B features |
| `marketing` | 023-025, 077 | Marketing module (admin + storefront) |
| `platform` | 020-021, 049, 063 | Platform module |
| `frontend` | All Frontend/ suites minus 3 exclusions (53) | Frontend-only regression |
| `backend` | All Backend/ suites minus 4 exclusions (63) | Backend-only regression |
| `sprint` | **Plan-driven** — `/qa-regression sprint` reads `vc/shared/docs/Sprint plans/sprint-*-summary.json` → `suitesActivated[]` (auto-picks the most recent plan). Falls back to all P0+P1 suites when no plan exists or `--no-plan` is set. | Before sprint release |
| `sprint:XX-YY` | Pinned to a specific sprint plan in `vc/shared/docs/Sprint plans/` | Re-run a past sprint's regression scope |
| `full` | All 119 (126 minus the 7 excluded) | Before production release |

## CI Regression Testing

The `ci/` directory provides Docker-based CI regression using the Claude Agent SDK:

```bash
docker build -t vc-regression -f ci/Dockerfile .
docker run --rm --shm-size=2gb --env-file .env \
  -e ANTHROPIC_API_KEY=your-key \
  -e SUITE_SELECTION=smoke \
  -e TEST_ENVIRONMENT=qa \
  -e MAX_BUDGET_USD=5.0 \
  vc-regression
```

Suite selection accepts group names (`smoke`, `critical`, `catalog`, `orders`, etc.) or comma-separated IDs (`042,039,049`). CI runs up to 3 suites in parallel (configurable via `MAX_PARALLEL`). Reports go to `reports/regression/ci-YYYY-MM-DD/` (markdown + JSON summary).

**Note:** The CI `run-regression.ts` dynamically loads suite definitions from `config/test-suites.json` at startup. Selection groups are also defined in the manifest's `selections` block.

**Scheduled Pipeline (GitHub Actions - `.github/workflows/regression.yml`):**
- **Daily smoke**: Mon-Fri at 6:00 AM UTC — runs suite 042 ($5 budget)
- **Weekly full regression**: Sunday at 2:00 AM UTC — runs all 119 `full` suites ($80 budget — the derived budget is $144; see ci/lib/suite-caps.ts)
- **Manual trigger**: Any selection, any environment, any budget via `workflow_dispatch`

**Teams Notifications:** After each pipeline run, `ci/notify-teams.ts` sends an Adaptive Card to the configured Teams webhook. Requires `TEAMS_WEBHOOK_URL` secret.

## On-demand references (moved out of the always-loaded tier, 2026-09-08)

Each of these is read by the step that needs it and by nothing else. Anchors (`§…`) are unchanged.

| Need | Read |
|---|---|
| Per-case lane routing (`suites:lanes` / `suites:machine` / `suites:merge`), the case filter (`suites:filter`), executability + the `EX-*` codes | [`knowledge/execution/regression-lanes.md`](../knowledge/execution/regression-lanes.md) |
| Post-run promotion `Draft → Automated` (`tc:promote`, the `PR-*` hold codes) | [`knowledge/execution/regression-promotion.md`](../knowledge/execution/regression-promotion.md) |
| Pre-authoring scaffold (`tc:alloc`, `tc:scaffold --check`, the KEEP gate) | [`knowledge/execution/regression-scaffold.md`](../knowledge/execution/regression-scaffold.md) |
| Change-scoped selection (`regression:select`), existing-coverage triage (`tc:scope`), post-run triage (`/qa-triage-results`) | [`knowledge/execution/regression-selection.md`](../knowledge/execution/regression-selection.md) |
| Storefront selectors — generated surface, `selectors:sync` / `selectors:check` | [`knowledge/execution/regression-selectors.md`](../knowledge/execution/regression-selectors.md) |
| Headless CI runner internals, the App Insights monitoring twin, the suite staleness-audit twin | [`knowledge/execution/regression-pipelines.md`](../knowledge/execution/regression-pipelines.md) |
| Suite inventory rules (unique IDs, naming, XREF-001) | [`knowledge/execution/regression-suites.md`](../knowledge/execution/regression-suites.md) |

## Prompt Templates

Key prompt templates in `vc/shared/docs/prompts/`:
- `How to test Builder.io.md` - Builder.io, Virto Pages & vc-frontend testing
- `story-testing.md` - Story-level testing prompt

> **Note:** `test-runner-agent.md` is now an agent definition at `agents/test-runner-agent.md`, not a prompt template.
