# Step 1e — the Test Model is a FAULT model

Methodology for `/qa-test` Step 1e. The command states *that* the model is required on FULL and *what
gate* it must clear; this file is *why*, and the judgment rules the gate cannot mechanise. Fill-in shape:
[`.claude/templates/test-model.md`](../../templates/test-model.md).

## What it is for

Distil `1c` context + `1d` story analysis + `1a` scope/domains into one structured model — the fault model
Step 3 authors cases from. It answers *"how can this feature be wrong, and what would catch each way?"*,
**not** *"is every acceptance criterion represented?"* Coverage is necessary but it is not the goal, and a
model that only traces ACs produces a suite that confirms the feature instead of attacking it.

**Required for every Story, Epic and substantial feature; not built on the FAST path at all.** The model is
what makes the ticket's context understandable and its documentation adequate — a job a P2 config tweak
does not have. A FAST run states in one line that no model was built and proceeds to the Artifact B
checklist.

## Part 0 comes first, and the chain is drawn

A fault model needs something to hang faults on, and what a feature can most expensively be wrong about is
the end-to-end mechanism it exists to deliver — not the screens it renders on the way. So Part 0 (chain ·
diagrams · variants · the variants × links matrix) is derived FIRST, via
[`/qa-test-design`](../qa-test-design/test-design-techniques.md) §1a (`FLOW`), and the condition space is
built **per link** on top of it.

The order is not a style preference. It is the difference between a suite that proves the feature works and
a suite of individually well-formed per-screen checks that all pass while it does not — see the Loyalty
Missions measurement in [`SKILL.md`](SKILL.md) §The two things.

Diagram selection is not decorative either:

| Draw | When |
|---|---|
| `flowchart` | **always** — the journey: primary path + alternate/error branches |
| `sequenceDiagram` | the chain crosses layers, or any part is async (job / queue / webhook / settlement) |
| `stateDiagram-v2` | the entity has a lifecycle, or an effect is expected to **reverse** (cancel / refund / expire / revoke) |

### The matrix is only a check if its ROWS and COLUMNS are derived independently of the scenario list

*"No blank cells"* is the gate because a blank is a hole someone can see. That property survives only while
the axes come from the **mechanism**. Populate the matrix by reading your own scenario table and it can
confirm nothing the table does not already say: every cell fills, nothing is blank, and a mechanism with no
scenario has **no row to be uncovered in**. The check silently degrades into a restatement of the thing it
was meant to check.

So derive the matrix from Part 0 — chain links as columns, variants as rows — and *then* map scenarios into
it. A cell you cannot fill is the finding; a row you cannot name is a bigger one.

**Variants are partitioned by the branch under test, not by entity identity.** Ask which layer *branches*
on the thing being tested, and when several layers branch differently the variant set is their **union** —
not whichever layer you happened to read first.

**A rewrite of the scenario table is a lossy operation.** Renumbering, re-prioritising or re-deriving the
table after new context lands drops rows silently, because nothing reconciles the new list against the old.
Diff them, or re-derive the matrix from the chain afterwards and see which cells went empty.

> Worked example — VCST-5735 (compare v2), both failures in one model, both showing a full matrix.
> **(1)** Variants were taken from the storage composable, which branches two ways on *entry identity*
> (configurable vs plain), while the render component branched **three** ways (configurable → customize
> link · `hasVariations` → variations link · else → add-to-cart). The whole `hasVariations` branch — its
> control, its `minVariationPrice` display, and its effect on the price row's `differs` signature — had no
> row. **(2)** A scenario covering *the headline capability* (one configurable parent added twice with two
> different configurations, which is the sole reason the entry↔product re-pairing exists) was present in
> the first draft, lost in a rewrite after late context arrived, and never noticed — because the matrix
> row for that variant was then filled from the rewritten table, with the surviving *edge* scenarios.
> Both gaps were found by a human reading the model, not by any gate.

## Why it is a durable file

Written to `reports/ba/test-models/<TICKET>-<date>.md` — `.claude/rules/reports.md` **category 3**. Three
reasons it cannot be a terminal dump:

1. A model nobody can re-open cannot be **argued with**, which is the whole point of having one.
2. The parameter model for a surface (cart, checkout, org roles) does not change per ticket, so as a file
   it is **reused**; as terminal output it dies with the session.

   **Part 0 is also what fills the map's `Test object` block for the next ticket.**
   `.claude/knowledge/domain/functionality-map.md` derives four of the five things a tester needs about
   an object — operations, the data it is tested against, variants, constraints — and **cannot** derive
   the fifth: what the surface is FOR. That comes from a Part 0 value chain and nowhere else, so a domain
   with no model reads `UNDECLARED` (measured: 1 of 13). Writing this model is what changes that, which
   is the same incentive shape as the `Audited:` stamp being the rotation state.

   **Reason 2 had no reader until 2026-09-03, and it shows.** Nothing in the pipeline ever opened an
   existing model, so "reused" was an aspiration: `reports/ba/test-models/` already carries
   `VCST-5346-2026-08-28.md` **and** `VCST-5346-2026-09-02.md` — one ticket, one surface, two fault
   models, which is the fork the section below forbids arriving by a different door. **Find the prior
   model through [`.claude/knowledge/domain/functionality-map.md`](../../knowledge/domain/functionality-map.md)**
   (`1b` item 2-map reads your domain's section and the `1c` brief carries the path). A prior model for
   this surface is **amended, never forked** — the same rule as a same-day round 2, for the same reason.
3. A file is **lintable in principle** — Part 0, the five fault-model parts and the resolved sweeps could
   be checked rather than asserted. **`npm run model:lint` is not implemented**, so today this third reason
   is an intention, not a gate: do not cite it as though a script were enforcing it. The live deterministic
   gates are `tc:scaffold` over the authoring plan (1e-plan) and the appender at Step 3.

### One ticket, one model file — even across `--iterate` rounds

`<date>` is **round 1’s** date (the run’s `date` field), and a later round **amends that same file**.
A same-day round 2 would otherwise collide on the exact path, and a `-r2` sibling is worse than a
collision: reason 2 above is that the next ticket on this surface *reuses* the model, and two files for
one fault model means the reuse picks one at random.

An amendment is a `## Round N` section of 5–15 lines (the 80–160-line band is per model, not per round)
and may do exactly three things:

1. mark a hypothesis **CONFIRMED**, with the bug key 5d filed for it;
2. mark one **CLEARED-by-fix**, with the round it went green and the prerelease it went green on;
3. **add rows for mechanisms the FIX’s diff introduces** — a fix is a change, and it earns the same
   fault-model treatment the original change got. This is the loop’s one genuinely new coverage
   obligation, and skipping it is how a fix ships untested.

It may **not** rewrite Part 0. The value chain does not change because a bug was fixed; if it would,
the fix changed the mechanism, and that is a new ticket rather than a round. The 10-clause gate re-fires
**only on the amendment’s new rows** — inline, no verifier, exactly like the original
`Model complete | 1e | inline` gate. Round bookkeeping lives in
`summary.json.iterations.per_round[].artifacts.model_amendment`; the loop contract is
[`modes.md`](modes.md) §5k §Artifact refresh between rounds.

The AC table and DoD checklist stay terminal-only; the Artifact B checklist goes to the ticket folder.

## The eight rules that make the scenario table a fault model

`Value chain` + `Chain diagrams` + `Mechanism coverage matrix` + `Test scenarios` are the artifact
`test-management-specialist` authors from. The scenario table is not a list of things to try — each row
names a way this feature can be *wrong*, and the case authored from it is the thing that would catch that.

1. **The journey row comes first, and there is exactly one.** The table opens with a `Technique:FLOW` row
   traversing the WHOLE chain in one run, on the surface a customer actually uses, with data that makes
   every link's outcome decidable. Step 3 authors it as the suite's first case, titled `[JOURNEY]`. Every
   other row refines a link that row already crosses. A state-changing feature with no journey row fails
   the gate — that row answers *"does this feature work at all?"*, and it is the one everybody assumes
   someone else wrote.
2. **A link is crossed only by an observation on the far side of it.** Reading a value out of the API and
   reading the same value off the page are two observations of ONE link; the link between them is crossed
   only by a row that causes the effect and then observes it on the other surface. This is what stops "the
   API moves the number" plus "the page renders a number" from counting as coverage of the join between
   them — which is exactly where integration defects live.
3. **No row may certify a defect.** Where the correct expectation is currently unmet, the row keeps the
   SPEC-derived expectation and names the bug; the case authored from it is held (`Draft`, never promoted)
   or marked `Manual`, or the finding stays in the bug report and no case is written. Flipping the
   expectation to match the broken build makes the case green today, unfalsifiable forever, and RED on the
   day the bug is fixed — the worst of the three outcomes.
4. **A row without a defect hypothesis is not written.** The bar is
   [`qa-test-cases-generator`](../qa-test-cases-generator/SKILL.md) §Step 3 — *"what real bug would this
   catch and why would it occur?"* — plus its §6 cull rule (drop a row that duplicates another row's
   hypothesis, tests infrastructure, or would only fail if the framework itself were broken). **Cite it; do
   not restate it.** This is the gap the table exists to close: the generator has always demanded a bug
   hypothesis, and the model used to hand it a flat scenario list with nowhere to put one.
5. **The oracle comes from the specification, never from the implementation or the running system.**
   `{BL-…}` / `{SPEC}` / `{DOC}` are oracles; **`{OBSERVED}` is a baseline, not an oracle** — writing down
   what the live app currently does turns a bug into the expected result, and it also suppresses the
   bug-exposing case that would have caught it. Same provenance grammar `lint-test-cases.ts` GRD-001
   already enforces on `Assertions`, so the row pre-grounds the case.
6. **Technique follows the hypothesis, not house style.** Which technique wins is fault-type dependent, so
   a table produced entirely by one technique is blind to whatever that technique cannot detect. Tokens and
   selection rules: `/qa-test-design` (`SKILL.md` §3 + `test-design-techniques.md` §0 tokens / §6
   interaction rule — cite it, never restate it); **`t=2` by default, `t=3` ceiling, `t=4` revenue-critical
   only.**
7. **Archetype is one token** from the Defect archetypes table in
   [`knowledge/oracles/vc-bug-catalog.md`](../../knowledge/oracles/vc-bug-catalog.md). It is what makes a
   blind spot visible *at design time* rather than in a later audit.
8. **`Reduction` is the anti-vanity field.** Without it, "M scenarios" is unfalsifiable; with it a reader
   can attack the reduction ("do status and lock actually not interact?"), which is where real coverage
   arguments live. Name the dropped factor and what subsumes it — not just the arithmetic.

## The gate — nine clauses, every one contradictable

"Scenarios enumerated" was the old bar and it cannot be wrong. These can:

1. Ticket **flow + type + path** set (flow = `feature-test` — a `verify-fix` / `hotfix-verify` route never
   reaches 1e); ACs decomposed to **atomic conditions**; **BL/ECL/domains** and **risk areas** present.
2. `Value chain` names every link from trigger to what it unlocks, in the user's words, **and the
   `flowchart` is in the file**. A chain that cannot be written is the finding — go back to `1c`/`1d` rather
   than compensating with per-screen scenarios. A cross-layer or async chain also carries the
   `sequenceDiagram`; a lifecycle or a reversible effect also carries the `stateDiagram-v2`.
3. `Mechanism coverage matrix` published with **no blank cells** — each variant × link cell holds a scenario
   # or `GAP` / `WAIVED + reason` — and `Reverse edges` resolved per forward effect (covered by #, or
   `ABSENT IN PRODUCT`, which is reported as a finding).
4. The scenario table's **first row is the `Technique:FLOW` journey**, traversing the whole chain on the
   customer's own surface. Absent for a state-changing feature ⇒ the model is not done.
5. `Condition space` states the factors, their value classes, the constraints, and **raw cell count N**.
6. `Reduction` states `N → M` **and names the factors it dropped and what subsumes them**. An unstated
   reduction is the finding — a scenario count nobody can attack is not a coverage argument.
7. **Every** scenario row carries all five: cell · defect hypothesis · archetype · technique · oracle. No
   blanks, no "TBD", no hypothesis that merely restates the step ("check that X works").
8. Every oracle is `{BL-…}`/`{SPEC}`/`{DOC}` — or, if `{OBSERVED}`/`{HYPOTHESIS}`, the row says what would
   make it a real oracle. An expected value read off the live system is not an oracle. **A `{DOC}` oracle
   citing a GraphQL field, arg or response shape must rest on the snapshot `1b` item 2d refreshed *this
   run*** — a field name from an unrefreshed `graphql-schema.md` is an expected value of unknown age, and
   when 2d recorded `UNKNOWN` those oracles are `{HYPOTHESIS}`
   ([`contract-refresh.md`](contract-refresh.md) §3). Fixture drift 2d reported on an op the ticket's own
   diff touches belongs in the model as a chain link and a candidate reverse edge, not as a footnote.
9. The `Archetype sweep`, `UIP sweep` and `Probes carried in` rows are **PRESENT** — not yet resolved.
   Step 2 is what loads the `VC-*` catalog and the `UIP-*` probe set, so resolving them here would mean
   answering from inputs nobody has read (the template marks all four *"filled in Step 2"*). This clause
   guarantees the rows exist so Step 2's gate cannot skip a sweep silently; **that** gate is where every
   archetype and probe must be covered by a row or **WAIVED with a reason**. Silence is not a waiver — it
   is just checked one step later than this list used to claim.

A missing atomic condition or `ba-system-analyzer` risk area is added before moving on. No fresh-`qa-lead`
dispatch here — this is the doer's own completeness check.

## Worked references

- **Parts 1–5** (condition space → explicit reduction rationale → cells with oracle provenance):
  `reports/ba/Organization roles/test-model-VCST-5281-2026-08-03.md`. It **predates Part 0 and carries no
  diagram** — do not read it as evidence that the chain is optional.
- **A worked Part 0**, with a real chain drawn, its variants × links matrix and its reverse edges:
  `reports/ba/test-models/VCST-5346-2026-08-28.md`.
- The measured cost of not having drawn one: `/qa-test-design` `test-design-techniques.md` §1a.
