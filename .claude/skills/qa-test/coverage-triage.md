# The coverage-triage axis — triage the EXISTING cases a change invalidates, before the run

**This file is the only place the `/qa-test` coverage-triage axis is specified.** The command
([`.claude/commands/qa-test.md`](../../commands/qa-test.md)) states what runs at `1b` item 2e and
Artifact A's `2a` phase and the gate each must clear; this file states why, and holds the disposition rules.

The pipeline read the existing corpus in exactly one direction. `authoring.md` §Artifact A says *"bug
fix / enhancement with existing coverage → **map to existing** suite cases … author only the gaps"* —
a question about what the corpus **already covers**. It never asked the other one: **which existing
rows does this change make WRONG?** So a stale case was reachable by exactly one route — FAIL at
Step 4, then 5-triage's test-defect triage — and that route is reactive by construction.

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

**2. A change-scoped release sweep applies `--cases critical`**, which drops the High rows where most label and
route assertions live: 091 carries 24 High, 093 carries 29.

**3. A row that never executes is never triaged**, so 5-triage cannot reach it however good it is.

The hole those three leave, on the same ticket: PR #2444 renames the hub widget to *"My recent
orders"* across 13 locales, and the existing suites assert the **old** label **62 times** (093: 43,
091: 19). Every one is stale the moment it merges, and no gate in the pipeline can see it.

**The corpus-wide backdrop is the same shape.** Measured **2026-09-02 at 133 suites / 4,438 rows**:
only **71** rows carry an `Audited:` stamp (1.6%), and **0 of the 202** rows in the four suites the two
FULL `/qa-test` runs touched (`083c` 0/77, `083d` 0/8, `075d` 0/34, `075e` 0/23). **This file is the one
place that share is written down** — `CLAUDE.md`, `.claude/rules/regression.md` and
the command frontmatter cite it rather than restating it, because the denominator moves with
every append (it moved during the change that added this section) and a transcribed count goes stale in
four files at once, silently. Re-derive it rather than trusting the figure above if it matters:
`Audited:` occurrences over total rows across `regression/suites/**/*.csv`. `/qa-review-tests --triangulate` — the mechanism
that answers *is this assertion still true* — is invoked from `/qa-test` at **no** step, either path.
Nothing runs it on a schedule, and a sweep cadence would be the wrong one for a change landing today anyway.

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

## 2a-own — the owner, and why `2a` is a PHASE of Artifact A rather than a step

**Merged 2026-09-11.** `2a` was a standalone step disposed inline by the orchestrator. It is now the
**first phase of Artifact A, the corpus step**, and `test-management-specialist` owns the whole thing —
the disposition of every hit, the `REPAIR` edits it applies, *and* the authoring that follows. **One
dispatch, one owner, one writer.** The label `2a` survives only as a citation contract; the step does not.

**The pipeline had ONE step that reads the existing corpus and it was split across two owners.** Two
reasons that was wrong, and the first is a rule the original placement broke outright.

**1. One writer per suite CSV.** [`.claude/rules/regression.md`](../../rules/regression.md) §Suite
inventory: *a suite CSV has exactly one author for the duration of a change* — one author per CHANGE, not
per file, and a second writer is forbidden **even when the two are editing different rows**. A `REPAIR`
writes `regression/suites/<layer>/<module>/*.csv` in place; Artifact A's append writes the same directory
and routinely the same file. A separate 2a therefore put **two writers on one CSV in the ordinary case**.
The cost of that is not a merge conflict — it is `suites:lint`/`sync` hard-failing **tree-wide** on a
mid-write parse error and blocking every other author in the tree (measured: ~15 min across two sessions,
[`docs/decisions/regression-history.md`](../../../docs/decisions/regression-history.md) §Shared-tree
losses). One phase inside one step means one writer, in one order, with no interleaving to reason about.

**2. It is ONE corpus read, asked in two directions.** [`authoring.md`](authoring.md) §Artifact A asks
*which existing rows already cover this surface*; `2a` asks *which rows does this change make **wrong***.
Splitting them made *"carry 2a's dispositions in, do not re-derive them"* a discipline the dispatch brief
had to keep enforcing across a handoff. Merged, it is structural: the agent that disposed the rows is the
agent that then authors only the gaps, and there is no handoff to lose.

### The phase order inside the step, and what each half gates

| Phase | Runs | Output | Checked at |
|---|---|---|---|
| **`2a` dispose** | **both paths** — FULL always, FAST under `--coverage` | the four dispositions; `REPAIR` edits applied and re-linted; `REPAIR` + `RE-BASE` ids for C1 | `3-cases` (FAST: C1's dispatch) |
| **author** | **FULL only** | new `Draft` rows, staged then appended | `3-cases` |

**On FAST the step is the triage alone.** FAST authors nothing, so Artifact A *is* its `2a` phase, and C1's
exact set is the `REPAIR`/`RE-BASE` ids. This is why the merge does not cost FAST its coverage axis.

**Neither phase gates `3-exec`**, the gate that releases the first test. The whole step runs past it —
which is the 2026-09-10 re-reading that took Artifact A off the critical path ([`sequencing.md`](sequencing.md)
§Ordering), now inherited by the triage that used to sit in front of the checklist.

**Two rules the merge creates, and they are the ones to hold:**

1. **Dispose BEFORE authoring a single new row.** The order inside the step is the reason it is one step.
   Authoring first re-creates the split, one dispatch down.
2. **A `2a` that did not happen is STATED.** An omitted disposition block reads exactly like a clean triage
   (§2). `3-cases` (FAST: C1's dispatch) checks that the phase **ran**, not only that its hits are disposed.

**What the merge costs, stated plainly:** the disposition now lands after `3a`/`3x` rather than at wave B.
Nothing between those points consumes it — its two consumers are A's own append and C1's id list, both
later still — so the cost is only that the run *learns* of a needed `REPAIR` later, not that anything waits
longer. The one real casualty is [`exploratory-lane.md`](exploratory-lane.md) charter item 5, which sourced
its rows from the disposition; it now sources them from **`1b` item 2e's at-risk scan**, which exists before
`3x` runs. That is the better direction anyway: the lane observes the at-risk rows, and the disposition is
then made by an agent that has seen them live.

---

## 3. Phase `2a` — the four dispositions · 4. The deterministic core — `npm run tc:scope`

Moved: the dispositions, the `REPAIR` / `RE-BASE` split, the two hard rules, `neverAudited`, `tc:scope`,
`runFate` and the no-domain case are in
[`.claude/knowledge/execution/regression-selection.md`](../../knowledge/execution/regression-selection.md)
§Existing-Coverage Triage. This file is deleted with the rest of the old FAST/FULL pipeline.

---

## 5. Where it does NOT belong

- **It is not a suite audit.** Whether an untouched row has rotted is `/qa-review-tests --triangulate`,
  one suite at a time. This axis asks only what
  **this change** invalidates, and it refuses to run without a risk term precisely so the two cannot
  blur.
- **It does not judge whether the row is wrong.** It reports which rows mention a moved observable,
  which cite an amended oracle, and whether each will run. The docs+live+source evidence bar belongs
  to Dim 11. Same split as `lint-test-cases.ts` TRI-000 vs `--triangulate`, and as `bl:lint` (the
  citation resolves) vs Dimension 6 (it is the *right* citation).
- **It does not retire anything.** `SUPERSEDED` is a proposal. TRI-006 keeps deprecation human, and
  `tc:demote` may only reach `Manual` — a rule a change-scoped triage has no standing to relax.
- **Undoing a `REPAIR` is a row-level edit.** A `REPAIR` that regresses `suites:review` is undone by
  re-editing the row, or by reading the baseline from `git show HEAD:<path>` into the scratchpad.
- **It does not widen the oracle-amendment path.** The `1e` model already routes an invariant that
  needs amending to `/qa-review-oracles`; this axis only finds the **cases** citing it, which is the
  half nothing was doing.
