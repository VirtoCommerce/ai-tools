# Regression — change-scoped selection, existing-coverage triage, post-run triage

> **Moved verbatim from `.claude/rules/regression.md` on 2026-09-08** (PR 2 of the agentic-system audit) so it loads only when a task reads it. `rules/` is the always-loaded tier; this file is on-demand. Section anchors are unchanged.

## Change-Scoped Selection — not running a suite beats running it fast

`npm run regression:select -- --repo <name> [--diff <range> | --changed-files <f> | --path <p>…]
[--target <min>] [--json]` (core `scripts/lib/suite-selection.ts`, CLI
`scripts/regression/select-suites.ts`) answers "which suites does this change need?" without an
LLM. Measured on the real manifest: a single-module change selects ~24 of 127 suites, ~149
predicted minutes against ~1010 for the whole corpus.

**It exists to replace a hallucination.** `ci/run-full-cycle.ts` asked an agent to print
`AFFECTED_SUITES: <ids>` and parsed it with a regex — and the `REG-2026-08-24-1806` notes carry 32
claimed case ids that do not exist, each exactly the next sequential number after a real suite's
maximum. A model asked to name ids names plausible ones. The selector cannot: every id it prints
came out of `config/test-suites.json`, which is a unit-tested property. Phase 1 now uses the
selector and reads the agent's line only to LOG a disagreement — an id the selector did not choose
is either a hallucination or a mapping gap, and both want looking at rather than running on.

Four rules, and the first inverts the discipline the rest of this file follows:

- **It fails OPEN.** `case-classifier.ts` fails closed (doubt → the browser lane), because
  claiming a case is machine-ready when it is not manufactures a BLOCKED that reads as a product
  failure. Here the expensive direction reverses: an unnecessary suite costs its
  `estimatedMinutes`, a missing one ships a regression. So doubt WIDENS — to the whole layer the
  changed repo touches, with the unmatched paths reported in `unmappedPaths`.
- **The complete signal is primary, the precise-looking one is a bonus.** `resolveSuiteSource`
  yields modules for 117 of 127 suites but **repos for only 44**, because `reposForModule` reports
  router-matched names only — `vc-frontend` names 7 suites while 53 carry `layer: frontend`. So
  selection is driven by the manifest's own `domain`/`tags` vocabulary (present on every suite) and
  the repo index only ADDS; it can never filter out a vocabulary hit. Gating the fail-open fallback
  on the repo index having contributed was a real bug, caught by its own test: one hit from an
  index that covers a third of the corpus is not evidence the index is complete.
- **No hand-written path map.** `client-app/shared/checkout/…` → `checkout` because some suite is
  tagged `checkout`; a `.NET` path is split on dots, `-`, `_`, CamelCase and the structural
  `Module`/`Service`/`Controller` suffix, then matched EXACTLY (a prefix match would let `cart`
  capture `cartridge`). A transcribed table would fail silently on a renamed directory — the
  `.claude/rules/test-data.md` §GOLDEN RULE case, with a narrower selection as the failure mode.
- **The risk floor is never trimmed.** P0 plus `critical-ui-scope` survive any `--target`, and an
  unreachable target reports the overrun honestly instead of dropping the P0 gate. Everything the
  target does drop is printed as **coverage debt**, the opposite of the budget guard that truncates
  silently and reports the remainder as `blocked`.

**An unplaceable change is refused, not guessed.** `ci/lib/affected-suites.ts` `placeChange` maps
`module <name>` and `diff [range]`; a PR reference, a changelog version and a ticket key return
**null**, so the caller keeps its configured `SUITE_SELECTION`. Resolving a PR's file list needs a
GitHub call this module deliberately does not make, and an unplaceable change is exactly when a
wrong-but-plausible selection is least likely to be questioned.

**Not the default for anything, deliberately.** Whether a scoped selection catches what `full`
catches is a question about MISSED regressions, and answering it needs run history that does not
exist yet (`history.json` is un-ignored per A4, but no run has written one — so the history rule is
a documented no-op and the CLI says so). Run it in shadow beside a periodic `full` for several
cycles and compare what it would have skipped. Making it the default now would trade a measured
cost for an unmeasured risk.

## Existing-Coverage Triage — which rows does this change make WRONG?

The scaffold below gates a case *before it is written*. This gates the cases that already exist, and it
closes the one direction the corpus was never read in. Every reader asked *which suites already cover
this, so I author only the gaps*; nothing asked *which existing rows does this change make wrong*. So a
stale row was reachable only by FAILING at Step 4 and being triaged afterwards — reactive by
construction, and only for the rows that ran at all.

Measured on VCST-5733 (2026-09-02), three things compound to make sure a stale row never runs.
`npm run regression:select -- --path client-app/pages/company/customer-orders.vue` selects 37 suites and
**EXCLUDES 089/091/093** because no path segment is the literal token `sales-rep` — and it reports
`unmappedPaths: []`, because the fail-open widening in `suite-selection.ts` fires only when the
vocabulary matched **nothing**, and `orders`/`account` matched, so selection believes it mapped cleanly
and never widens. Artifact C then applies `--cases critical`, dropping the High rows where most label and
route assertions live (091: 24 High, 093: 29 High). And a row that never executes is never triaged. The
concrete hole: PR #2444 renames the hub widget to "My recent orders" across 13 locales, and the existing
suites assert the OLD label **62 times** (093: 43, 091: 19). The Dim-11 rotation is no backstop either —
almost nothing in the corpus carries an `Audited:` stamp, and **not one** of the rows in the four suites
the two FULL `/qa-test` runs touched does. The stamped share is a moving number (every append changes
it, and the append that added this section moved it), so it is measured once in
[`skills/qa-test/coverage-triage.md`](../skills/qa-test/coverage-triage.md) §1 and cited from here —
a count transcribed into four files is wrong in four places at once, silently (§GOLDEN RULE).

| Command | Does |
|---|---|
| `npm run tc:scope -- --domain <d>[,<d>] \| --suite <ids> \| --module <m>` | **scope** — from the manifest's own vocabulary; ≥1 required |
| `… --observable <phrase> [--observable …] \| --oracle <ID>[,<ID>]` | **risk terms** — the moved observable / amended invariant to hunt; ≥1 required. One phrase per `--observable` flag, so a comma stays inside it |
| `… --cases <tier>[,<tier>] [--also-ids <ids>]` | predict the run Artifact C will actually execute |
| `… --json` | machine-readable worklist |

Core `scripts/test-cases/scope-existing-coverage.ts`; unit tests
`scripts/unit/scope-existing-coverage.test.ts`. Output: `scopedSuites[]` (with the reason each was
scoped — domain/tag/module/named/path), `hits[]` (suite, case, title, priority, `Automation_Status`, the
matched term + the column it matched in, cited oracles, `lastAudited`, `runFate`), plus `unscannable[]`,
`unmatchedObservables[]` and a `counts{}` block. Exit `0` on a produced worklist (an empty one included),
`1` on bad usage, `2` when a suite named on `--suite` could not be scanned — a named request must never
be silently ignored, while a suite reached by vocabulary lands in `unscannable[]` instead.

**`runFate` is the point of the tool, not a column on it.** A stale row that `WILL_RUN` is
self-announcing: it goes red at Step 4 and triage picks it up. A stale row that will not run is invisible
forever. `NOT_EXECUTING` (explicit `Manual`/`Deprecated`, EX-200/EX-201) is opted out **by intent** and is
therefore *not* a coverage hole — only `FILTERED_OUT` is, which is why the two are separate values rather
than one.

Six decisions, each of which was a live fork:

- **Scope comes from the manifest's own `domain`/`tags`/`requiresModules` vocabulary**, present on every
  suite — never from path tokens, which is the signal that demonstrably missed. A `--changed-files`-style
  path token can only **ADD** a suite, never filter one out: the same asymmetry `selectSuites` already
  applies to its incomplete repo index, and for the same reason — a hit is evidence FOR a suite, never
  against one.
- **Scope matching is EXACT on a normalised term; matching INSIDE a row is deliberately not.** `order`
  must not capture `orders` and turn a triage worklist into the whole tree — the rule `pathTokens`
  already follows. Within a row the search is case-insensitive substring, because it searches prose an
  author hand-wrote, where `Recent orders` / `Recent Orders` / `recent orders` are the same assertion and
  all three spellings are live in 091/093.
- **Only assertion-bearing columns are searched** — Title, Section, Preconditions, Test_Data, Steps,
  Assertions, Cross_Layer_Checks, Failure_Signals. A term hitting an `Archetype:` stamp in `References`
  or a `Cleanup` note says nothing about what the row asserts.
- **A legacy 11-column suite is REFUSED** and reported in `unscannable[]`, never scanned. `parseSuite`
  maps positionally, so its `Steps` lands in `Test_Data` and its `Priority` is not `Priority`; scanning
  would report the right rows for the wrong reasons and predict `runFate` off the wrong column. Same
  refusal `filter-cases.ts` and `plan-lanes.ts` make.
- **It delegates rather than re-deciding.** The priority-tier table comes from `filterRows`, so
  `critical`/`P0` cannot come to mean different things in the scope report and in the run it predicts;
  the audit stamp comes from `parseAuditStamp`, so the report and the TRI-000 rotation agree.
- **Fail-open, and always named.** Doubt WIDENS the worklist (matching `filter-cases.ts`, inverting
  `case-classifier.ts`) because a wrongly-included row costs one triage line while a wrongly-excluded one
  is a stale assertion nobody looks at again. An unscannable suite and an observable that matched nothing
  are both printed even on an otherwise clean run.

**It answers only the deterministic half** — which rows mention a moved observable, which cite an amended
oracle, and whether each will run. Whether a row is actually WRONG is judgment, and belongs to
`/qa-review-tests` Dimension 11 against its docs + live + source evidence bar. Exactly the split between
`lint-test-cases.ts` TRI-000 (*when* was this audited) and `--triangulate` (*is the tag true*), and
between `bl:lint` (the citation resolves) and Dimension 6 (it is the RIGHT citation).

Measured on VCST-5733: `npm run tc:scope -- --domain sales-rep --observable "Recent orders"
--observable "All orders" --oracle BL-SR-002 --cases critical` → 7 suites in scope, 358 rows scanned,
**81 at risk: 35 WILL_RUN · 45 FILTERED_OUT · 1 NOT_EXECUTING**, 81 never audited.

Consumed by `/qa-test` `1b` item 2e (the derived `coverage_surface` token) and its **Step 2a**, which runs
this before authoring on **both paths** and routes each hit to one of four dispositions —
`CONFIRMED` / `REPAIR` / `RE-BASE` / `SUPERSEDED`. Single source of truth for those:
`.claude/skills/qa-test/coverage-triage.md`.

## Post-Run Results Triage — `/qa-triage-results`

A regression run tells you *which* tests failed; **`/qa-triage-results [RUN_ID|latest] [--fix] [--verify]`** works out *why* each one failed and what to do. **Owned by `qa-lead-orchestrator`** (orchestrate-only Triage Orchestrator — delegates classification to `regression-triage-agent`, live verification to `qa-frontend/backend-expert`, test fixes to `/qa-review-tests`, bug drafts to `/qa-bug`; never edits a CSV, files a ticket, or calls `/qa-fix`). It reads a completed run under `reports/regression/{RUN_ID}/`, and — cloning the `/qa-monitoring` skeleton (collect → dedup → triage → live-verify → report → STOP) — classifies every FAIL into **real product bug** vs a **test defect** (`TEST_STEPS_DEFECT` / `ASSERTION_DEFECT` / `TEST_DATA_DEFECT` / `STALE_TEST`) vs `FLAKY` / `ENV` / `KNOWN_ISSUE`.

- **Collect (deterministic):** `npm run triage:collect -- <RUN_ID|latest> --record` (`scripts/lib/regression-triage.ts`) assembles each non-passing case — **FAIL, BLOCKED, and SKIPPED** (each with a `status`; only PASS and PENDING excluded) — with its `traces/*-FAIL-trace.json` (network + console w/ stack frames, FAIL only), `screenshots[]`, lane HAR path, the CSV row, a stable fingerprint, and the cross-run flaky flag. A BLOCKED is triaged for *why* (env / precondition / data / real bug); a SKIPPED for a removed feature (stale test) vs an intentional gate.
- **Classify (judgment):** `ci/agents/regression-triage-agent.md` reads the evidence (incl. **opening the screenshot** for visual/element failures) against the oracles and emits `CLASS` + severity/route/confidence + suggested fix. Ambiguous → `REAL_BUG`/`LOW` (→ live repro / human review), never relabelled as a test-defect.
- **Verify + act:** HIGH-confidence real bugs are reproduced live by `qa-frontend/backend-expert`; under `--fix`, test-defects route to `/qa-review-tests <suite> --fix` (diff + confirm) and confirmed bugs are drafted to `reports/bugs/`. **STOP** — never files a tracker ticket, never triggers `/qa-fix`.
- **Report:** `reports/regression/{RUN_ID}/triage-report.md` (three tables: confirmed bugs / test-case fixes / dismissed).
- **Flakiness feed:** `npm run triage:history` writes per-suite rows into `reports/regression/history.json` in the shape `scripts/regression/compute-metrics.ts` expects (previously the flaky/trend detector was starved — the CI runner wrote a run-level shape it couldn't read; that run-level cost log now lives in `history-ci-runs.json`).

Full methodology: the `/qa-triage-results` skill (`triage-taxonomy.md` + `routing-and-fix.md`). Interactive-first; a headless `run-triage-results` twin under `ci/` is a documented follow-up (not built).

