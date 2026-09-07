# Exploratory Session: AutoMapper Wave 3 — cross-module response field diff

**Date:** 2026-09-07 · **Duration:** ~30 min (agent box) + ~10 min orchestrator verification
**Env:** **vcptcore-qa** (not vcst-qa — see §Environment) · **Platform:** 3.1064.0-pr-3105 · A/B control: **vcst-qa** @ pre-change
**Session type:** [EXP] · **Technique:** Boundary-of-features two-path field diff · **Lane:** none used (API-layer only, declared)
**Charter:** EXP-01 from `sprint-26-17-summary.json` §5.3 — anchor VCST-5661, signal C2, risk score 25 (sprint's highest). **Refs:** ECL-14.1 hunted; BL-PRICE-003/008/009, BL-ORD-010, BL-CART-007 judged against.

## Environment — the charter could not run where the plan assumed

`vcst-qa` **pins every module below the release that carries the change**, so exploring there would have audited the old AutoMapper code and returned a false negative. The wave is live on `vcptcore-qa`: `XCart 3.1031.0-pr-138` · `XCatalog 3.1019.0-pr-110` · `XOrder 3.1010.0-pr-50` · `XPickup 3.1005.0-pr-11` · `Xapi 3.1021.0-pr-84` · `CatalogCsvImportModule 3.1005.0-pr-146`. That made `vcst-qa` usable as a **pre-change negative control**, and the A/B is what separated one net-new defect from one pre-existing behaviour — two of four hypotheses resolved the opposite way to how they first looked.

## Net-New Scenarios Discovered

| # | Scenario | Why uncovered | What we found | Oracle ref | Fate | Next charter |
|---|---|---|---|---|---|---|
| 1 | Mixed term+range facet request on `orders`, asserting each facet's `order` equals its requested position | No case in `050c`/`050a` selects `order` at all; no `VC-*` entry | **Bug 1 below** — the range facet takes `order=0` regardless of request position; terms shift to 1..n | **NONE** → Oracle Feedback | **PROMOTE** → `050c`. Assert each facet's `order` equals its 0-based index in the `facet:` string. `INV`-strength, literal-free | — |
| 2 | Same on `products`, asserting the **union** of `term_facets`+`range_facets`+`filter_facets` `order` values is a permutation of `0..n-1`, and that each list may be non-contiguous | Same gap; the PR declares per-list non-contiguity intentional and nothing records it | Verified a **perfect permutation on both builds** — vcptcore `[0,1,2,3,4]` (5 of 5 distinct), vcst `[0..15]` (16 of 16), range interleaved at its configured position both times | **NONE** → Oracle Feedback | **PROMOTE** → `050a`. Assert the *global* set is a permutation of `0..n-1` (the invariant that survives a data change) and explicitly do **not** assert per-list contiguity | — |
| 3 | Ad-hoc `products` range facet whose bounds are not store-configured | Nothing tests ad-hoc `facet:` range syntax | Requested facets are **silently omitted**: HTTP 200, `errors[]` empty, and the facet simply absent. On vcptcore `"__brand price.usd:[100 TO 200] __color"` returned **only** the range facet — both requested term facets vanished | `ECL-14.1` (shape); BL = **NONE** | **DECLINE** as a bug case — the admission rule is unknown, so any assertion written today encodes a guess. Promote after #4 characterises it | EXP-01b |
| 4 | Money as `Float` in facet statistics | Schema-level; no suite reads `statistics` | `RangeFacetStatistics.min/max` are `Float` while sibling `FacetRangeType.min/max` are `Decimal` — the same money quantity at two precisions on one type | **`BL-PRICE-008`** (no floating-point money) | **PROMOTE** → `050a`, low priority. Assert `statistics.max` equals the `Decimal` from the equivalent `ranges[].max` so a float round-trip surfaces | — |

## Bugs Found

| # | Sev | Title | Evidence | Net-new? |
|---|-----|-------|----------|----------|
| 1 | **Medium** | x-order facet `order` is not the requested position — the range aggregation is always numbered `0` and term aggregations shift to `1..n`, so x-order and x-catalog now disagree about what `order` means | §Reproduction below | **YES — mapper finding (#83/#84 + #50)**, unrelated to gifts / VCST-5801 |

**Reproduction (orchestrator-verified independently of the agent, both builds):**

```
"status total:[0 TO 1000] currency"  post: status@1 currency@2 | total@0   pre: status@0 currency@0 | total@0
"currency status total:[0 TO 1000]"  post: currency@1 status@2 | total@0
"total:[0 TO 1000] status"           post: status@1            | total@0
```

The range facet reports `order=0` whether requested **first, second or third** — the index bears no relation to the requested position. Pre-change every facet was `0`, exactly as the PR body describes ("always `0`"), so no client could have depended on the old value; that is why this is Medium and not High. The PR body states `Order` is now "the aggregation's **position**"; on the x-order path it is not. Meanwhile **x-catalog numbers by configured sequence on both builds** with the range interleaved (measured above, #2) — so #83's stated purpose of aligning x-order with x-catalog is **not achieved**. Consequence: a client sorting a facet panel by `order` renders the money/range filter first regardless of configured order.

## Confirmed Good — the PR's own motivation verified, plus the clean diff

**x-order decimal range bounds survive intact.** The `Convert.ToInt64` → `ToNullableDecimal`/`InvariantCulture` change works: `[100 TO 200.5]` → `from=100 to=200.5`; `[0.5 TO 1000]` → `from=0.5`; `[0 TO 1000]` → `from=0` (a zero lower bound is not swallowed as falsy). No truncation, rounding, or culture mangling. The agent's opening hypothesis — fractional bounds being dropped — was **wrong**, and survived only ~4 minutes because it ran a same-shape positive control before concluding.

**Clean diff.** Every field on `TermFacet` · `RangeFacet` · `FilterFacet` · `FacetTermType` · `FacetRangeType` · `RangeFacetStatistics` was enumerated by **live introspection** (not the committed snapshot) and then explicitly requested. On the post-change build **no field returned `null`, empty, `0`, or shape-collapsed where the pre-change build populated it**, and no enum landed as a numeric ordinal. Facet `label` values are populated and human-shaped (`Brand`, `Color`, `Size chart`) — the PR's own flagged risk of blank or field-name-shaped labels is **not** reproduced on configured facets. Two caveats: type sets were introspected on `vcptcore-qa` only, and `FacetRangeType.min/max/total` return `0/0/0` on configured product range facets on **both** builds — not a regression, but not a field this session can call correct either.

## Charter scenarios — coverage

| # | Target | Status |
|---|---|---|
| 1 | **x-cart #138** — GraphQL `cart()` vs REST `/api/carts/{id}` full field diff | **NOT REACHED.** Scenario 3 opened a live seam on the first probe and consumed the box. No gift field was touched, so this session says nothing about VCST-5801 either way. **Highest-value re-run.** |
| 2 | **x-order #50** — custom + dynamic properties vs Admin payload | **PARTIALLY COVERED.** The order *facet* surface was probed hard (Bug 1 + the decimal confirmation); the `dynamicProperties` / custom-property diff was **not** done. 1,246 orders exist on this env, so the fixture is available — no order was placed. |
| 3 | **x-catalog #110 + x-api #83 `FacetMappingContext`** | **COVERED** — both PR-body sub-hypotheses resolved: `order` semantics (Bug 1, #2) and range-bound parsing (confirmed good). |
| 4 | **x-pickup #11** — BOPIS FFC fields vs Admin | **NOT REACHED.** No probe issued; zero information either way. |

## Oracle Feedback

| Kind | Entry | Evidence | Route |
|---|---|---|---|
| **Missing** — the load-bearing one | **No `BL-*` governs facet metadata at all.** Nothing states what `order` means, whether the global set must be a permutation, or whether a requested facet may be silently omitted. Wave 3 changed the meaning of `order` across six modules with **no oracle to judge it against** — which is why Bug 1 can only be called against a *PR body*. Proposal: one `P1` invariant — "a requested facet is either returned or reported; `order` is the requested position; the union across the three facet lists is a permutation of `0..n-1`" | #1, #2, #3 | `/qa-review-oracles bl` — proposal only, **no ID invented** |
| Extend scope | `ECL-14.1` is written for **mutations** whose payload carries an error surface. #3 is the identical shape on a **query**: 200, empty `errors[]`, failure expressed only as an absent collection. A reader applying ECL-14.1 literally would not reach a query. Proposal: broaden the two-channel rule to any xAPI operation returning a collection, adding "an empty collection where one was requested is a third channel" | #3 | `/qa-review-oracles ecl` |
| Corroborated | `BL-PRICE-008` — `RangeFacetStatistics.min/max : Float` is a live float money surface in the xAPI schema | #4 | `/qa-review-oracles bl` — evidence, not an edit |

## Risk Areas

- **`XCart pr-138` was never exercised.** The module with the largest known-fragile surface in this wave (money, discount, gift) has zero coverage from this session, and it is the one carrying a *known* pre-fix defect (VCST-5801; PR #139 absent on every QA env).
- **Two modules now disagree about `order`** — a shared facade producing module-dependent metadata is the seam most likely to hide the next defect. And **silent omission is this wave's signature with nothing gating it**: #3, plus the PR's own "null `filters` `MapTo` became a silent no-op" adopted deliberately in three modules. No oracle and no suite assertion anywhere requires that a *requested* facet be returned or reported.

## Observations

- `facet:"price.usd"` with no bounds silently becomes a **term** facet named `price_usd` with 228 terms — a money field rendered as 228 checkboxes. Plausible by design, but the client gets a shape it did not request, with no signal. Relatedly `price.usd` / `price` / `price.USD` all resolve with **different counts** (`price:[100 TO 200]` → 197 vs `price.usd:[100 TO 200]` → 124): case-insensitive on currency, currency-agnostic on the bare form, so a test omitting the suffix measures a different population — the ambient-context trap one level down, inside the facet string rather than the args. Ad-hoc counts also differ from store-configured counts for identical bounds (124 vs 101), consistent with the configured range's `includeFrom=false` but not proven. **Cross-build attribution for #3 is NOT established**: the agent reported it "identical on pre-change vcst-qa"; orchestrator re-check found the two envs return *different* ad-hoc results, but the requested facet names may not exist on both — so this is **env-data-dependent and unattributed**, not evidence either way about the wave.

## Questions for the Team

1. On the x-order path, is `order` the **requested** position or the position **after** the facade splits aggregations by kind? Bug 1 is a defect under the first reading and a documentation gap under the second — the PR body says the first. Related: should x-catalog and x-order agree on `order`? #83's stated purpose was to align them; measured, they do not.
2. What is the admission rule for an ad-hoc `products` range facet? Pre-existing, but unspecified, un-asserted, and the failure is invisible.
3. Is `RangeFacetStatistics` being `Float` deliberate, given `FacetRangeType` uses `Decimal` for the same quantity?

## Charter-from-Gap (next-session candidates)

- **EXP-01a (highest value)** — the x-cart #138 money/discount/gift field diff this session did not reach: GraphQL `cart()` vs REST `/api/carts/{id}`, field list from live `CartType` introspection, money → discount → gift. Must be briefed that `XCart` on vcptcore-qa is `pr-138` **without** #139, so a gift-into-paid-line anomaly on a merged cart **is VCST-5801** and must not be re-filed.
- **EXP-01b** — the ad-hoc range-facet admission rule (#3): which requested ranges survive, on a non-price numeric property as well as price, with the same facet names confirmed present on both builds. Then **x-pickup #11** and the **x-order dynamic/custom-property diff** — the two candidate scenarios this session left with zero information.

**Writes performed:** none. Read-only throughout — GraphQL queries, `GET /api/platform/modules`, `POST /api/order/customerOrders/search` (a search, not a mutation). No cart created, no order placed, no store touched, no `PUT`, no git command. Probe scripts live only in the session scratchpad. No tracker item filed, no oracle edited, no CSV written.
