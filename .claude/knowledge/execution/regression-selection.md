# Regression — change-scoped selection, existing-coverage triage, post-run triage

> **Moved verbatim from `.claude/rules/regression.md` on 2026-09-08** (PR 2 of the agentic-system audit) so it loads only when a task reads it. `rules/` is the always-loaded tier; this file is on-demand. Section anchors are unchanged.

## Plan-driven selection — `sprint`, `sprint:XX-YY` (and where `stable:N` went)

Moved from `/qa-regression` Step 1c on 2026-10-16. Both plans are written by `/qa-test-plan`; `/qa-run` reads the same sprint plan.

### `sprint` / `sprint:XX-YY`

Applies (only when selection is `sprint` or `sprint:XX-YY`, and `--no-plan` is NOT set):

The static `sprint` selection group in `test-suites.json` is a generic "all P0+P1" superset. When a sprint test plan exists for the active sprint, prefer its **Section 5.1 suite list** — it's been risk-scored and scoped to the actual Done items.

Resolution order:

0. **Waves first.** When the resolved sprint has a release folder (`regression/releases/sprint-{XX-YY}/`), its
   regression runs wave by wave: STOP and point to `/qa-run sprint:{XX-YY} status`. Running the plan whole here would
   bypass the wave claims and collide with the wave owners on the same environment.
1. **Explicit pin** (`sprint:XX-YY`) → read `docs/Sprint plans/sprint-{XX-YY}-summary.json`. If missing → abort with a clear error: "No sprint plan found for {XX-YY}. Run /qa-test-plan {XX-YY} first, or use --no-plan to fall back to the static group."

2. **Bare `sprint`** → auto-detect the active sprint plan:
   - List `docs/Sprint plans/sprint-*-summary.json` files
   - Pick the one whose `endDate` is closest to (but not after) today's date — i.e. the most-recent-completed sprint plan
   - If no plan files exist → fall back to the static group from `test-suites.json`, log a warning: "No sprint plan found in docs/Sprint plans/ — using static sprint selection group. Run /qa-test-plan to generate a plan-driven selection."

3. **Read** `summary.json` and extract `suitesActivated[]` — these are the suite IDs to run. Validate every ID exists in `test-suites.json` (warn and drop unknowns rather than failing).

3a. **Layer filter** (only if `--frontend` or `--backend` is set) — narrow `suitesActivated[]` to the requested layer by classifying each suite against the layer directory its CSV lives under in `config/test-suites.json` (`regression/suites/Frontend/` vs `Backend/`) — this matches the plan's §5.1.1 / §5.1.2 sub-tables. `--frontend` keeps Frontend suites, `--backend` keeps Backend. Log the dropped-by-layer count. If the filter leaves zero suites, abort with a clear note ("Plan {XX-YY} has no {layer} suites in §5.1"). `--frontend`/`--backend` are mutually exclusive — reject if both are passed.

4. **Resolved-from-plan output** — log to the run report header:
   ```
   Selection: sprint (resolved from docs/Sprint plans/sprint-26-09-summary.json)
   Sprint: Sprint26-09 (2026-04-29 – 2026-05-15)
   Suites: 042, 044, 049, 078, 082, 031, 032, 033, 020, 026, 027, … (46 from suitesActivated[])
   Test cases: <sum of the manifest testCount for the resolved set>
   Plan link: docs/Sprint plans/sprint-26-09-test-plan.md
   ```

5. **`--no-plan` opt-out** → skip this resolution entirely (`/qa-regression` Step 1c; `/qa-run` §1 for `sprint`); use the static `sprint` group from the manifest.

### `stable:N` and sprint waves

A stable-bundle or sprint regression is run wave by wave with `/qa-run stable:<N> <wave>` or `/qa-run sprint:<XX-YY> <wave>`
— selection, tiers and exclusions: `.claude/skills/qa-run/run.md` §1 and `waves.md`. `/qa-regression` has no `stable:N`
selection, and its `sprint` runs a plan whole only when the sprint has no waves (step 0 above).

## Change-Scoped Selection — not running a suite beats running it fast

`npm run regression:select -- --repo <name> [--diff <range> | --changed-files <f> | --path <p>…]
[--target <min>] [--json]` (core `scripts/lib/suite-selection.ts`, CLI
`scripts/regression/select-suites.ts`) answers "which suites does this change need?" without an
LLM. Measured on the real manifest: a single-module change selects ~24 of 127 suites, ~149
predicted minutes against ~1010 for the whole corpus.

**It exists to replace a hallucination.** The headless full-cycle runner (removed by VCST-6637) asked an agent to print
`AFFECTED_SUITES: <ids>` and parsed it with a regex — and the `REG-2026-08-24-1806` notes carry 32
claimed case ids that do not exist, each exactly the next sequential number after a real suite's
maximum. A model asked to name ids names plausible ones. The selector cannot: every id it prints
came out of `config/test-suites.json`, which is a unit-tested property. Every
selection now goes through the selector.

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
and never widens. A change-scoped regression then applies `--cases critical`, dropping the High rows where most label and
route assertions live (091: 24 High, 093: 29 High). And a row that never executes is never triaged. The
concrete hole: PR #2444 renames the hub widget to "My recent orders" across 13 locales, and the existing
suites assert the OLD label **62 times** (093: 43, 091: 19). The Dim-11 rotation is no backstop either —
almost nothing in the corpus carries an `Audited:` stamp, and **not one** of the rows in the four suites
the two `/qa-test` runs touched does. The stamped share is a moving number (every append changes
it), so it is never written down: re-derive it as `Audited:` occurrences over total rows across
`regression/suites/**/*.csv` — a count transcribed into several files is wrong in all of them at once,
silently (§GOLDEN RULE). `/qa-review-tests --triangulate` answers *is this assertion still true*, but nothing
runs it on a schedule, and a sweep cadence is the wrong one for a change landing today anyway.

| Command | Does |
|---|---|
| `npm run tc:scope -- --domain <d>[,<d>] \| --suite <ids> \| --module <m>` | **scope** — from the manifest's own vocabulary; ≥1 required |
| `… --observable <phrase> [--observable …] \| --oracle <ID>[,<ID>]` | **risk terms** — the moved observable / amended invariant to hunt; ≥1 required. One phrase per `--observable` flag, so a comma stays inside it |
| `… --cases <tier>[,<tier>] [--also-ids <ids>]` | predict the run the plan will actually execute |
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

Consumed by **`/qa-test`'s staleness check** (the strategy's F5 — which cases at risk may not run) and by
**`qa-suite-sync`** (which repairs them). Both route each hit to one of four dispositions, below — this
file is their single source of truth. `/qa-test` itself never edits a suite CSV: the dispositions that need
an edit are listed and handed to `/qa-test-lifecycle`.

`FILTERED_OUT` is computable only when the plan carries a priority tier (`--cases`). A scan without one
cannot filter anything out, so its `0` is **structurally** zero — record it as `not-yet-computable`, never
as a clean result. The worked example above reports 45 `FILTERED_OUT` *because* it passed `--cases critical`.

### The four dispositions

`tc:scope` produces the worklist; classifying each hit is judgment. The vocabulary is closed and every hit
takes exactly one value. **When the domain has a mind map, its suspect cases join the worklist** (`TM-017`):
a case stamped on a DRIFT, OBSOLETE or changed node is a hit even when `tc:scope` did not find it. The
slice's unstamped nodes (`TM-014`) are not hits; they are the gap list authoring starts from.

| Disposition | The row is | Action | Timing |
|---|---|---|---|
| **`CONFIRMED`** | still correct under the change | nothing | — |
| **`REPAIR`** | **mechanically** stale — a renamed selector, a moved route, a removed arg, a dead `@td()` alias — so it cannot execute at all | `/qa-review-tests file <suite> --fix` (reached through `/qa-test-lifecycle`), under its write-scope ceiling + revert-on-regression; the row is **stale** for a `/qa-test` run and does not enter it | fixed **before** the run, then **executed by the next one** |
| **`RE-BASE`** | asserting an **expected value** the change contradicts | keep the assertion as it stands; the row **stays in the run's regression selection** | resolved **by** the run, at triage |
| **`SUPERSEDED`** | asserting a surface the change removes | a proposal, recorded — never an edit | human |

#### The `REPAIR` / `RE-BASE` split is the load-bearing rule

**The change under test is normally an UNMERGED PR** (VCST-5733 tested three at once). Rewriting a case's
expected value to match the change *before* the run makes the change its own oracle: the case can then only
pass, whatever the build does. `qa-test-cases-generator` §6 names that failure outright — **no case may
invert its assertion to certify a known defect** — and it is worse here, because the rewrite happens in the
same run that then reports the green. The split is exactly the line between the two:

- **`REPAIR` moves the mechanics, not the oracle.** A case that navigates a route that no longer exists, or
  types into a `data-test-id` that was renamed, is not asserting anything yet — it cannot reach its own
  assertion. Fixing the path does not touch what the case claims, so it cannot launder a verdict. Leaving it
  unfixed is not neutral either: it manufactures a BLOCKED that reads as a product failure (the corpus's
  measured artefactual-BLOCKED class: 19.9% overall, 28.6% on suites of 81+ cases).
- **`RE-BASE` moves the oracle, so only the run may do it.** The old assertion is kept and executed against
  the change. If it fails and the new behaviour matches the AC, triage's test-defect path rewrites it,
  grounded in that run's own evidence (a `{OBSERVED}` that traces to an artifact). If it fails and the new
  behaviour does *not* match the AC, the old case was right and the finding is a bug. **Both outcomes are
  reachable, which is the entire point**; a pre-run rewrite makes only the first reachable. A `RE-BASE` is
  not a deferral — it is the run's most strongly grounded check, an assertion written before the change,
  executed against the change.

#### Two hard rules

**A `FILTERED_OUT` row disposed `REPAIR` or `RE-BASE` must be carried into the run's regression selection**
(`--ids`) — or be `CONFIRMED`/`SUPERSEDED` with a stated reason. A repaired-but-unrun row is the same
invisible class as an undisposed `RE-BASE`: until a run executes it, nothing has verified that the case can
now reach its own assertion. A `RE-BASE` that never executes is precisely the invisible class this triage
exists to find.

**Triage files no bug.** A `tc:scope` hit is a claim about a **test case**, never about the product. A real
defect found while triaging goes through the ordinary route: the fault model if it belongs there, triage
and the bug report if the run confirms it.

#### What `neverAudited` is, and is not

`counts.neverAudited` is **context, not a verdict**. It is read off the `Audited:` stamp via
`parseAuditStamp`, so it answers *when was this row last triangulated* (TRI-000's question), never *is it
right*. On this corpus it is near-universal (81 of 81 hits on the VCST-5733 scan), so treating it as a
finding would flag everything and therefore nothing. Use it to rank the worklist, never to justify a
disposition.

### A change with NO domain: `--domain` does not under-run, it runs WIDE and WRONG

**`--domain` is the wrong scope flag for a change that has no domain** — a token-layer, UI-kit or
design-system change. Scope matching is exact against the manifest's `domain`/`tags`, which is correct when
the change belongs somewhere; when it belongs *everywhere*, the domains you can name are the ones you
happened to think of.

Measured on VCST-5653 (a focus-ring token replacement). Scoped `--domain cross-cutting,branding` with six
observables and three oracles: **18 suites in scope, 447 rows scanned, 26 at risk.** A corpus-wide sweep on
the same terms: **62 rows across 13 suites** — adding `b2b`, `bopis`, `configurable-products`,
`customer-reviews`, `loyalty`, `sales-rep`, `search`, `notifications`. **More suites scanned, fewer hits
found**: the scoped run was not narrow, it was aimed by the wrong vocabulary — and nothing in the output
says *the axis you scoped by does not apply*, so a `26 at risk` line reads exactly like a `62 at risk` line
that found less.

So for a domainless change: **pair `tc:scope` with a corpus-wide pass and scope by `--suite` from what that
returns**, not by `--domain` alone. Record **the literal invocation** — a hit count whose command line is
unrecorded is a claim a verifier cannot reproduce. Name the zero-contributing suites too; an unlisted suite
and an empty one read the same. Turning this discipline into a tool behaviour (a `--surface` /
`--all-domains` mode, or a warning when the diff is `ui-kit/**` or token paths while `--domain` is set) is
`docs/repo-findings-backlog.md` B-33, and is not implemented.

**It is not a suite audit.** Whether an untouched row has rotted is `/qa-review-tests --triangulate`, one
suite at a time; this triage asks only what **this change** invalidates, and refuses to run without a risk
term precisely so the two cannot blur.

## Visual regression at a release — `PIXEL`, not a suite

A pixel regression is not a CSV suite, so no `selections` group holds it and `/qa-regression` does not run
it. At a release, run [`/qa-visual-regression`](../../skills/qa-visual-regression/SKILL.md) beside the
suite regression:

- **Base** is the previous release tag. **Head** is the release candidate.
- **Storybook source:** every story (`visual:affected` is not needed — the scope is the whole kit), on the
  a11y-gated presets × desktop + the narrowest supported width.
- **Pages source:** the project's key routes, if a targets file exists for them.

Its regressions are triaged like any other finding ([`../../skills/qa-visual-regression/triage.md`](../../skills/qa-visual-regression/triage.md)).
Intended changes are listed against the release notes that declare them.

## Post-Run Results Triage — `/qa-triage-results`

A regression run tells you *which* tests failed; **`/qa-triage-results [RUN_ID|latest] [--fix] [--verify]`** works out *why* each one failed and what to do. **Owned by `qa-lead-orchestrator`** (orchestrate-only Triage Orchestrator — delegates classification to the triage classifier brief (`plugins/vc-test/briefs/triage-classifier.md`), live verification to `qa-frontend/backend-expert`, test fixes to `/qa-review-tests`, bug drafts to `/qa-bug`; never edits a CSV, files a ticket, or calls `/qa-fix`). It reads a completed run under `reports/regression/{RUN_ID}/`, and — cloning the `/qa-monitoring` skeleton (collect → dedup → triage → live-verify → report → STOP) — classifies every FAIL into **real product bug** vs a **test defect** (`TEST_STEPS_DEFECT` / `ASSERTION_DEFECT` / `TEST_DATA_DEFECT` / `STALE_TEST`) vs `FLAKY` / `ENV` / `KNOWN_ISSUE`.

- **Collect (deterministic):** `npm run triage:collect -- <RUN_ID|latest> --record` (`scripts/lib/regression-triage.ts`) assembles each non-passing case — **FAIL, BLOCKED, and SKIPPED** (each with a `status`; only PASS and PENDING excluded) — with its `traces/*-FAIL-trace.json` (network + console w/ stack frames, FAIL only), `screenshots[]`, lane HAR path, the CSV row, a stable fingerprint, and the cross-run flaky flag. A BLOCKED is triaged for *why* (env / precondition / data / real bug); a SKIPPED for a removed feature (stale test) vs an intentional gate.
- **Classify (judgment):** `plugins/vc-test/briefs/triage-classifier.md` reads the evidence (incl. **opening the screenshot** for visual/element failures) against the oracles and emits `CLASS` + severity/route/confidence + suggested fix. Ambiguous → `REAL_BUG`/`LOW` (→ live repro / human review), never relabelled as a test-defect.
- **Verify + act:** HIGH-confidence real bugs are reproduced live by `qa-frontend/backend-expert`; under `--fix`, test-defects route to `/qa-review-tests <suite> --fix` (diff + confirm) and confirmed bugs are drafted to `reports/bugs/`. **STOP** — never files a tracker ticket, never triggers `/qa-fix`.
- **Report:** `reports/regression/{RUN_ID}/triage-report.md` (three tables: confirmed bugs / test-case fixes / dismissed).
- **Flakiness feed:** `npm run triage:history` writes per-suite rows into `reports/regression/history.json` in the shape `scripts/regression/compute-metrics.ts` expects (previously the flaky/trend detector was starved — the CI runner wrote a run-level shape it couldn't read; that run-level cost log now lives in `history-ci-runs.json`).

Full methodology: the `/qa-triage-results` skill (`triage-taxonomy.md` + `routing-and-fix.md`). Interactive-first; a headless `run-triage-results` twin under `ci/` is a documented follow-up (not built).

