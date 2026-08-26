# Exploratory Session: Catalog browse & variations resolver

**Date:** 2026-08-26
**Duration:** ~30 min (charter EXP-04, sprint 26-16 §5.3)
**Platform:** 3.1061.0 · **Theme:** 2.56.0 · **Env:** vcst-qa · **Store:** B2B-store
**Session type:** [EXP]
**Discovery technique:** Boundary-of-features hunting — the seam between the `variations` resolver and the `product` resolver
**Charter:** Discover silent mapping loss after VCST-5689 re-shaped the variations resolver (per-master → batched) and AutoMapper was removed from four mapping paths. A dropped field fails nothing.

> **Method note — why this is provable without a before-build.** "Mapping loss" normally needs a baseline
> to diff against, which I do not have. Instead I read the **same entity down two independent paths**
> (`products.variations[]` vs `product(id:)`, same store / culture / currency, adjacent requests). A
> disagreement is an internal contradiction: one path is wrong regardless of what the old build did.

## Net-New Scenarios Discovered

| # | Scenario | Why uncovered | What we found | Fate | Suggested next charter |
|---|----------|---------------|---------------|------|------------------------|
| 1 | **The same variation reports a different MOQ depending on which resolver returned it** | 001/002/050a carry 37 variation rows, none compares the two access paths | Variation `QA-INVVAR-V-001` (id `010ff6d8…`): `minQuantity = 0` via `products{ variations }`, `minQuantity = 1` via `product(id:)`. `maxQuantity`, `packSize`, `availableQuantity` (42) and `price.list` (59.99) agree — only MOQ diverges. A storefront PDP renders its variation picker from `master.variations`, so the surface a B2B buyer sees is the `0` one | **PROMOTE** → `050a` as a runner-native two-op consistency case (machine lane) + bug draft below | Sweep the same two-path diff across every `VariationType` field on a master with several variations |
| 2 | `properties[].value` is `null` — **and this is NOT a resolver defect** | — | Null in **both** paths, so the two-path oracle clears the resolver. The fixture declares `Color=Blue`, but the seeded property is auto-named `AGENT_TEST_VP9279_1786951191351` (label "Alpha EN", `SHORT_TEXT`) with a null value. `td:validate:variation-stock` guards SKU distinctness and stock divergence but **not** that the variation's distinguishing property carries its value | **DECLINE as a product bug** → route to test-data: extend `td:validate:variation-stock` | — |
| 3 | **The environment has almost no variation data**, so this sprint's resolver change is barely exercisable here | Nobody counts the fixtures a suite depends on | Paginated scan of **797 of 4,534** products (`hasVariations`): **zero** masters with variations. The only reachable one is the seeded `QA-INVVAR-M-001`. So 37 variation-related rows across 001/002/050a rest on a single fixture — or pass vacuously | **PROMOTE** as a risk item + team question | Audit which suites depend on fixture classes the env does not actually hold |
| 4 | `VariationType` publishes a `slug` for an entity that has **no PDP route** | — | `slug: seed-test-fixtures/agent-test-variation-stock-blue-xl`, while the fixture's own notes state a variation renders on the master's PDP and has no independent route. A consumer trusting the field builds a dead link (an SPA soft-404: HTTP 200, client-side 404) | **DECLINE** — observation; raise as a question before treating it as a defect | — |

## Bugs Found

| # | Severity | Title | Evidence | Net-new? |
|---|----------|-------|----------|----------|
| 1 | Medium | Same variation, two resolvers, two different `minQuantity` (0 vs 1) — the PDP-facing path reports the wrong MOQ | Scenario 1; both payloads captured this session | Yes |

**Not filed** — the command stops at drafting. Note for whoever picks it up: `0` reads as *unset*, which is
consistent with a mapping the batched path no longer performs; `product(id:)`'s `1` is the sane default.
Confirm against the Admin's own MOQ value before wording the ticket (`feedback_check_backoffice_before_filing_bug`).

## Scope limits — stated, not hidden
- **Scanned 797 / 4,534 products (17.6%)**, unfiltered listing + name search. Scenario 3 is strong but not
  exhaustive; a definitive count needs an Admin-side query or a `hasVariations` filter.
- Charter candidate 2 (field-by-field payload diff **vs the previous build**) was NOT run — no baseline
  build is reachable, and the Admin second source needs credentials this worktree does not carry.
- Charter candidate 3 (variations under an active facet/filter at scale) was NOT run — scenario 3 makes it
  moot on this environment: there is no multi-variation master to filter.

## Risk Areas
- MOQ is a B2B revenue-path field; a `0` on the customer-facing path is the direction that permits, not blocks.
- A catalog with no variation data means the batched resolver ships largely unexercised by regression here.

## Questions
- Is vcst-qa *supposed* to hold variation products, or did they leave in a reseed? 37 suite rows assume they exist.
- Is a variation's `slug` intentional (future independent PDP) or vestigial?

## Charter-from-Gap (next-session candidates)
- Two-path field sweep across all 18 `VariationType` fields on a multi-variation master (needs seeded data).
- Which other suites depend on fixture classes the environment does not actually hold?
