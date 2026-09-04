# The coverage-triage axis — triage the EXISTING cases a change invalidates, before the run

**This file is the only place the `/qa-test` coverage-triage axis is specified.** The command
([`.claude/commands/qa-test.md`](../../commands/qa-test.md)) states what runs at `1b` item 2e and
Step 2a and the gate each must clear; this file states why, and holds the disposition rules.

The pipeline read the existing corpus in exactly one direction. `authoring.md` §Artifact A says *"bug
fix / enhancement with existing coverage → **map to existing** suite cases … author only the gaps"* —
a question about what the corpus **already covers**. It never asked the other one: **which existing
rows does this change make WRONG?** So a stale case was reachable by exactly one route — FAIL at
Step 4, then 5a's test-defect triage — and that route is reactive by construction.

It does work when it fires. VCST-5346 repaired three existing cases that way (`MSN-009` fixed,
`MSN-E2E-004` decomposed into three checks, `MSN-019` retired), each a careful surgical edit. But the
entry condition for all three was a red result. Nothing looked.

---

## 1. Why the reactive route is not enough — three independent blockers

Measured on VCST-5733, 2026-09-02.

**1. Suite selection maps CHANGED PATHS, and the mapping misses.** `regression:select --repo
vc-frontend --path client-app/pages/company/customer-orders.vue` selects 37 suites and **excludes
089/091/093** — the sales-rep suites the ticket is entirely about — because no path segment is the
literal token `sales-rep`. `pathTokens` matches exactly (correctly: a prefix rule would let `cart`
capture `cartridge`), so `company`/`customer-orders` yield nothing and `orders`/`account` yield the
*orders* suites.

**And it does not know it missed.** The fail-open widening in `scripts/lib/suite-selection.ts` §1(c)
fires only when the vocabulary matched **nothing**; `orders` matched, so the branch is skipped,
`unmappedPaths` stays `[]`, and the selection reports itself fully mapped. `useOrderView.ts` — which
the Test Model names as a regression surface in its own words — selects 31 suites, none of them
sales-rep, and likewise reports `unmappedPaths: []`. A gap that announces itself is a gap you fix;
this one reports success.

**2. The change-scoped sweep (now C2) applies `--cases critical`**, which drops the High rows where most label and
route assertions live: 091 carries 24 High, 093 carries 29.

**3. A row that never executes is never triaged**, so 5a cannot reach it however good it is.

The hole those three leave, on the same ticket: PR #2444 renames the hub widget to *"My recent
orders"* across 13 locales, and the existing suites assert the **old** label **62 times** (093: 43,
091: 19). Every one is stale the moment it merges, and no gate in the pipeline can see it.

**The corpus-wide backdrop is the same shape.** Measured **2026-09-02 at 133 suites / 4,438 rows**:
only **71** rows carry an `Audited:` stamp (1.6%), and **0 of the 202** rows in the four suites the two
FULL `/qa-test` runs touched (`083c` 0/77, `083d` 0/8, `075d` 0/34, `075e` 0/23). **This file is the one
place that share is written down** — `CLAUDE.md`, `.claude/rules/regression.md` and
`.claude/rules/skills-commands.md` cite it rather than restating it, because the denominator moves with
every append (it moved during the change that added this section) and a transcribed count goes stale in
four files at once, silently. Re-derive it rather than trusting the figure above if it matters:
`Audited:` occurrences over total rows across `regression/suites/**/*.csv`. `/qa-review-tests --triangulate` — the mechanism
that answers *is this assertion still true* — is invoked from `/qa-test` at **no** step, either path.
Its scheduled twin `ci/run-suite-audit.ts` covers one suite per weekday on a ≈25-week cycle, which is
the right cadence for rot and the wrong one for a change landing today.

---

## 2. `coverage_surface` — the token

Derived at `1b` item 2e. The **shared derivation contract** is stated once in [`axes.md`](axes.md) §2 and
is **not** repeated here; records `coverage_triage.surface`. Three parts, each derived:

| Part | Sources |
|---|---|
| **Scope** — which suites could hold an invalidated row | the ticket's domains (`1a`/`1b`) · the derived `layer` · the target suites' manifest `domain`/`tags`/`requiresModules` |
| **Observables** — the concrete strings the change MOVES | the diff + PR body: a renamed label or heading, a moved route, a renamed GraphQL field/op/arg, a changed `data-test-id`, a renamed `@td()` alias, a changed enum spelling |
| **Oracles** — invariants the ticket amends or contradicts | any `BL-*`/`ECL-*` the `1e` model marks for amendment. VCST-5733's model says *"BL-SR-002 MUST BE AMENDED BEFORE IT IS USED AS AN ORACLE HERE"* — and 7 existing rows cite it |

**Scope is the manifest's own vocabulary, NOT the diff's paths.** This is the whole correction to
blocker 1. `domain` and `tags` are present on **every** suite in the manifest (a count here would be wrong by the next append — read `config/test-suites.json`); a changed path is a proxy
for them that demonstrably misses. Paths may still be passed, but they are **additive only** — a path
token can *add* a suite the vocabulary missed and can never *filter out* one the vocabulary found.
That is the same asymmetry `selectSuites` applies to its own incomplete repo index, and for the same
reason: a hit is evidence **for** a suite, never against one.

**`unresolved` is treated as `true`.** The axis fails open, and the asymmetry is flatter than the
visual one: a skipped triage leaves stale assertions nobody will look at again — silently, with no
error anywhere — while a needless one costs a single script run and a few `CONFIRMED` lines. There is
no expensive direction. Record `false` with its sources; an omitted block reads as a clean triage.

**It is a pre-flight trigger, not an effort trigger.** `coverage_surface: true` dispatches **no
agent** and does not promote FAST to FULL.

**On FAST it is opt-in — `--coverage` (or `--axes`); on FULL it always runs** ([`axes.md`](axes.md) §4).

**The argument for FAST is the strongest of the three axes', which is why the flag exists:** a rename, a
restyle, a copy change, a config tweak is *single-layer, single-domain, obvious-surface, P2* **by
construction**, so the change class that invalidates existing assertions is precisely the class FAST
routes — and unlike the visual lane this is not even an exception to FAST's one-execution-agent rule. It
is also the axis with the sharpest measured hole behind it (the 62 stale assertions in §1).

What it does not yet have is a run. `coverage_triage` has been populated in **zero** of the 28 recorded
runs — the one artifact carrying the key has it as `null`. So the case for making it mandatory on the
cheap path is currently an argument rather than evidence; revisit at 5+ runs.

---

## 3. Step 2a — the four dispositions

`npm run tc:scope` produces the worklist; classifying each hit is judgment. The vocabulary is closed
and every hit takes exactly one value.

| Disposition | The row is | Action | Timing |
|---|---|---|---|
| **`CONFIRMED`** | still correct under the change | nothing | — |
| **`REPAIR`** | **mechanically** stale — a renamed selector, a moved route, a removed arg, a dead `@td()` alias — so it cannot execute at all | `/qa-review-tests file <suite> --fix`, under Phase 4b's write-scope ceiling + revert-on-regression | **before** the run |
| **`RE-BASE`** | asserting an **expected value** the change contradicts | keep the assertion as it stands; carry the case into **C1's `--ids`** | resolved **by** the run, at 5a |
| **`SUPERSEDED`** | asserting a surface the change removes | a proposal, recorded — never an edit | human |

### 3a. The `REPAIR` / `RE-BASE` split is the load-bearing rule

**The change under test is normally an UNMERGED PR.** VCST-5733 tests three at once. So rewriting a
case's expected value to match the change *before* the run makes the change its own oracle: the case
can then only pass, whatever the build does. That is the failure
`qa-test-cases-generator` §6 names outright — **no case may invert its assertion to certify a known
defect** — arrived at from the opposite direction, and it is worse here than in the §6 case, because
the rewrite happens in the same run that then reports the green.

The split is exactly the line between the two:

- **`REPAIR` moves the mechanics, not the oracle.** A case that navigates a route that no longer
  exists, or types into a `data-test-id` that was renamed, is not asserting anything yet — it cannot
  reach its own assertion. Fixing the path does not touch what the case claims, so it cannot launder
  a verdict. And leaving it unfixed is not neutral: it manufactures a BLOCKED that reads as a product
  failure, which is the corpus's measured artefactual-BLOCKED class (19.9% overall, 28.6% on suites
  of 81+ cases).
- **`RE-BASE` moves the oracle, so only the run may do it.** The old assertion is kept, the case is
  carried into C1, and Step 4 executes it. If it fails and the new behaviour matches the AC,
  5a's **existing** test-defect path rewrites it — grounded in that run's own evidence, with a
  `{OBSERVED}` that traces to an artifact. If it fails and the new behaviour does *not* match the AC,
  the old case was right and the finding is a bug. **Both outcomes are reachable, which is the entire
  point.** A pre-run rewrite makes only the first reachable.

A `RE-BASE` is therefore not a deferral. It is the run's most strongly grounded check: an assertion
written before the change, executed against the change.

### 3b. Two hard rules

**A `FILTERED_OUT` row disposed `RE-BASE` MUST be carried in C1's `--ids`** — or its disposition is
`CONFIRMED`/`SUPERSEDED` with a stated reason. A `RE-BASE` that never executes is precisely the
invisible class this axis exists to find; leaving one undisposed re-creates the gap inside the
mechanism built to close it. This is the same rule Artifact C already follows for its Scope
Exclusions, one layer down.

**Step 2a files no bug.** A `tc:scope` hit is a claim about a **test case**, never about the product —
the same rule 2d applies to contract drift and `1d` applies to a static DRIFT verdict. A real defect
found while triaging goes through the ordinary route: `1e` if it belongs in the fault model, 5a/5d if
the run confirms it.

### 3c. What `neverAudited` is, and is not

`counts.neverAudited` is **context, not a verdict.** It is read off the `Audited:` stamp via
`parseAuditStamp`, so it answers *when was this row last triangulated* — TRI-000's question — and
never *is it right*. On this corpus it is near-universal (81 of 81 hits on the VCST-5733 scan), so
treating it as a finding would flag everything and therefore nothing. Use it to rank the worklist,
never to justify a disposition.

---

## 4. The deterministic core — `npm run tc:scope`

`scripts/test-cases/scope-existing-coverage.ts`; unit tests
`scripts/unit/scope-existing-coverage.test.ts`.

```bash
npm run tc:scope -- --domain <d>[,<d>] [--suite <ids>] [--module <m>] \
                    (--observable <phrase> | --oracle <ID>)... \
                    [--cases critical[,high]] [--also-ids <ids>] [--json]
```

Needs at least one **scope** flag and at least one **risk term**. Without a risk term it would list
every row in scope — that is a suite audit (`/qa-review-tests --triangulate`), not a change-scoped
triage, and 358 undifferentiated rows is the shape of a report nobody reads. Exit `0` a worklist was
produced (even an empty one) · `1` bad usage · `2` an explicitly named `--suite` could not be scanned.

### `runFate` is the column the tool exists for

| Value | Meaning |
|---|---|
| `WILL_RUN` | executes under the planned Artifact-C selection. A stale row here is **self-announcing** — it goes red at Step 4 and 5a triages it |
| `FILTERED_OUT` | in scope but the case filter drops it. A stale row here is **invisible forever**. This is the coverage hole |

**`FILTERED_OUT` is NOT COMPUTABLE in `1b` wave B, and a `0` there is not a clean result.** Wave B runs
scope + risk terms only (no `--cases`), and with no priority tier nothing *can* be filtered out — the
count is **structurally** zero whatever the corpus holds. It becomes real at the **Step-3 gate re-run**,
where Artifact A exists and the tier is known. Record wave B's value as `not-yet-computable`, never as
zero. The worked example below reports 45 `FILTERED_OUT` **because it passed `--cases critical`** — the
one flag wave B forbids; read it as the Step-3 shape, not the wave-B one.
| `NOT_EXECUTING` | explicitly `Manual` or `Deprecated` (EX-200/EX-201) — opted out **by intent**, so "it will not run" is correct and it is *not* a hole |

`NOT_EXECUTING` is a separate value rather than a flavour of `FILTERED_OUT` for the reason
`suite-results-merge.ts` keeps the same two apart: folding them would make the number that counts real
holes lie.

### The decisions that were live forks

- **Exact scope matching, looser row matching.** Scope partitions the manifest's suites and must not
  over-select, so a term matches a `domain`/`tag` exactly — `order` cannot capture `orders`. Inside a
  row the search is case-insensitive substring, because it reads prose an author hand-wrote where
  `Recent orders`, `Recent Orders` and `recent orders` are one assertion — all three spellings are
  live in 091/093, and an exact-case rule would have found a third of the 62 at-risk rows.
- **Only assertion-bearing columns are searched** (`Title`, `Section`, `Preconditions`, `Test_Data`,
  `Steps`, `Assertions`, `Cross_Layer_Checks`, `Failure_Signals`). A term hitting an `Archetype:`
  stamp in `References` or a `Cleanup` note tells you nothing about what the row asserts.
- **A legacy 11-column suite is REFUSED**, reported in `unscannable[]`, never scanned. `parseSuite`
  maps positionally, so on those suites `Steps` lands in `Test_Data` and `Priority` is not
  `Priority` — scanning would surface the right rows for the wrong reasons and predict `runFate` off
  a column holding something else. Same refusal `filter-cases.ts` and `plan-lanes.ts` make.
- **It delegates instead of re-deciding.** The tier table comes from `filterRows` and the audit stamp
  from `parseAuditStamp`, so the scope report cannot come to disagree with the run it predicts or
  with the TRI-000 rotation. A parallel copy of either would drift silently.
- **Fail-open, always named.** Doubt widens the worklist — matching `filter-cases.ts`, inverting
  `case-classifier.ts` — because a wrongly-included row costs one triage line while a wrongly-excluded
  one is a stale assertion nobody looks at again. An unscannable suite and an observable that matched
  nothing are both printed on an otherwise clean run: an unmatched term is either a genuine corpus gap
  (→ a `1e` matrix cell) or a term worded differently in the CSVs than in the diff, and those need
  opposite responses, so the tool must not silently pick one.

### Worked example — VCST-5733

```
npm run tc:scope -- --domain sales-rep --observable "Recent orders" \
                    --observable "All orders" --oracle BL-SR-002 --cases critical
```

7 suites in scope (050m, 089, 090, 091, 092, 092b, 093), 358 rows scanned, **81 at risk — 35
`WILL_RUN`, 45 `FILTERED_OUT`, 1 `NOT_EXECUTING`**, 81 never audited. The 45 are the rows the three
blockers hid: in scope, invalidated by the rename, and not in any run the ticket would have produced.

---

## 5. Where it does NOT belong

- **It is not a suite audit.** Whether an untouched row has rotted is `/qa-review-tests --triangulate`
  and its scheduled `ci/run-suite-audit.ts` twin, one suite per weekday. This axis asks only what
  **this change** invalidates, and it refuses to run without a risk term precisely so the two cannot
  blur.
- **It does not judge whether the row is wrong.** It reports which rows mention a moved observable,
  which cite an amended oracle, and whether each will run. The docs+live+source evidence bar belongs
  to Dim 11. Same split as `lint-test-cases.ts` TRI-000 vs `--triangulate`, and as `bl:lint` (the
  citation resolves) vs Dimension 6 (it is the *right* citation).
- **It does not retire anything.** `SUPERSEDED` is a proposal. TRI-006 keeps deprecation human, and
  `tc:demote` may only reach `Manual` — a rule a change-scoped triage has no standing to relax.
- **It never reverts with git.** A `REPAIR` that regresses `suites:review` is undone by re-editing the
  row or by reading the baseline from `git show HEAD:<path>` into the scratchpad. Several sessions
  hold uncommitted work in this tree, and a tree-wide `git checkout`/`restore` is unrecoverable for
  all of them (`.claude/rules/regression.md` §WORKING IN A SHARED TREE).
- **It does not widen the oracle-amendment path.** The `1e` model already routes an invariant that
  needs amending to `/qa-review-oracles`; this axis only finds the **cases** citing it, which is the
  half nothing was doing.
