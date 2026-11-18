# Regression & CI Reference

## Architecture: Testing Modes

### 1. Interactive MCP-Driven Testing (Primary)
Load a prompt template from `vc/shared/docs/prompts/`, execute via MCP browser tools with DevTools monitoring. After each flow: export HAR, capture console logs, take screenshots. Generate bug reports in `reports/bugs/`.

### 2. Headless CI pipelines — REMOVED 2026-11-11

The Agent-SDK runners (regression, full cycle, monitor, suite audit), their Docker image, the `ci:*` npm scripts and the `full-cycle` / `monitor` / `suite-audit` / `customer-template` workflows are gone (VCST-6637). Regression runs interactively through `/qa-regression` and `/qa-run`. `ci/` now holds only the shared planning library (`ci/lib/`), the App Insights probes (`ci/monitoring/queries/`), `monitor-triage-agent.md` and the typecheck `tsconfig.json`. Do not re-create a headless runner without reading why it went: [`docs/decisions/regression-history.md`](../../docs/decisions/regression-history.md) §Headless pipelines removed. The live-progress watcher, run close-out ownership and the `regression:reap` orphan backstop are in [`knowledge/execution/regression-pipelines.md`](../knowledge/execution/regression-pipelines.md) — read it before touching `test-run-status.json` or the watcher.

### 3. Autonomous Interactive Regression — REMOVED 2026-08-26

Do not re-create it. Why it was removed: [`docs/decisions/regression-history.md`](../../docs/decisions/regression-history.md).

## Test Suite Manifest: `config/test-suites.json`

Central configuration for regression orchestration — browser pool + fallback chain, suite definitions, `selections`, run `defaults`. Read the file (schema: `config/test-suites.schema.json`); its values are not restated here.

## Regression Test Suites

Suites live in `regression/suites/`, organized by module under `Frontend/` and `Backend/`, in the enriched agent-native CSV format. **`config/test-suites.json` is the source of truth for how many there are and how many cases they hold — `npm run suites:lint` prints both.** Do not restate either number here — the two that used to sit in this paragraph were both stale when checked on 2026-09-09, which is why `DOC-006` now fails a build that reintroduces one.

### Suite inventory

Derived, not documented here — `config/test-suites.json` is the source of truth (`npm run suites:lint` prints totals). The suite-authoring RULES — globally unique case IDs, the `…A` / renumber naming convention, **XREF-001** (a dependency may not leave its suite CSV), the `078` split rationale — live in [`knowledge/execution/regression-suites.md`](../knowledge/execution/regression-suites.md). Read it before adding or splitting a suite.

**First: a suite CSV has exactly one author for the duration of a change.** Not one author per file
forever — one author per *change*: whoever is restructuring, culling or re-pointing a suite owns every
row in it until they hand it back. A second writer is forbidden even when the two are editing
"different rows", and even when both are careful. **A suite conflict is never resolved with git** —
hand it to a human or to the other author.

Why a CSV is not mergeable in practice, the disposition-is-the-artifact argument, how to fan out
analysis while serialising the write, the re-parse-after-every-write discipline (a mid-write
unparsable suite takes the manifest gate down for *everyone*), and the cross-session relay rule (a
fact sent to another session's SUBAGENT is dropped silently — the receiving session must re-issue it
in its own dispatch brief): [`knowledge/execution/regression-suites.md`](../knowledge/execution/regression-suites.md)
§Working concurrently on suites. The measured losses behind all of it:
[`docs/decisions/regression-history.md`](../../docs/decisions/regression-history.md) §Shared-tree losses.

### Selection Groups

**Membership is defined in `config/test-suites.json` `selections`, never here** — `npm run suites:lint`
prints the group count, and `npm run regression:plan -- <name>` resolves one to its actual
suite list. The table below is *when to reach for which*, which the manifest cannot tell you.

| Selection | Use Case |
|-----------|----------|
| `smoke` | Daily validation before deployment |
| `critical` | P0 suites only |
| `purchase-flow` | Cart → checkout → orders → payment, end to end |
| `catalog` · `search` · `orders` · `auth` · `b2b` · `marketing` · `platform` | One module, frontend + admin |
| `frontend` · `backend` | One layer, minus the suites the manifest excludes |
| `sprint` | **Plan-driven** — `/qa-regression sprint` reads `docs/Sprint plans/sprint-*-summary.json` → `suitesActivated[]` (auto-picks the most recent plan). Falls back to all P0+P1 suites when no plan exists or `--no-plan` is set |
| `sprint:XX-YY` | Re-run a past sprint's regression scope, pinned to that plan |
| `stable:N <wave>` (`/qa-run` only) | One wave of a stable-bundle regression planned by `/qa-test-plan stable N` — claim, run, triage, publish; `stable:N status` for the overview |
| `full` | Everything the manifest does not exclude — before a production release |

## CI

The only workflows are `gates.yml` and `unit-tests.yml`; both run on every PR. No workflow runs a suite.

## On-demand references (moved out of the always-loaded tier, 2026-09-08)

Each of these is read by the step that needs it and by nothing else. Anchors (`§…`) are unchanged.

| Need | Read |
|---|---|
| Per-case lane routing (`suites:lanes` / `suites:machine` / `suites:merge`), the case filter (`suites:filter`), executability + the `EX-*` codes | [`knowledge/execution/regression-lanes.md`](../knowledge/execution/regression-lanes.md) |
| Post-run promotion `Draft → Automated` (`tc:promote`, the `PR-*` hold codes) — called by `/qa-regression` **6.5** and **`qa-case-promotion`**, never automatic | [`knowledge/execution/regression-promotion.md`](../knowledge/execution/regression-promotion.md) |
| Pre-authoring scaffold (`tc:alloc`, `tc:scaffold --check`, the KEEP gate) | [`knowledge/execution/regression-scaffold.md`](../knowledge/execution/regression-scaffold.md) |
| Change-scoped selection (`regression:select`), existing-coverage triage (`tc:scope`), post-run triage (`/qa-triage-results`) | [`knowledge/execution/regression-selection.md`](../knowledge/execution/regression-selection.md) |
| Storefront selectors — generated surface, `selectors:sync` / `selectors:check` | [`knowledge/execution/regression-selectors.md`](../knowledge/execution/regression-selectors.md) |
| Interactive run orchestration, the live watcher and run close-out, App Insights monitoring, the suite staleness audit | [`knowledge/execution/regression-pipelines.md`](../knowledge/execution/regression-pipelines.md) |
| Suite inventory rules (unique IDs, naming, XREF-001) | [`knowledge/execution/regression-suites.md`](../knowledge/execution/regression-suites.md) |
| A stable-bundle or sprint regression several QA run in parallel — `/qa-test-plan stable <N>` or `<sprint>`, `/qa-run stable:<N>` or `sprint:<XX-YY>` `<wave>`, `regression/releases/<release>/`, the triage ledger | [`skills/qa-run/release-folder.md`](../skills/qa-run/release-folder.md) |

## Prompt Templates

Interactive prompt templates live in `vc/shared/docs/prompts/` — `ls` it for the roster.
