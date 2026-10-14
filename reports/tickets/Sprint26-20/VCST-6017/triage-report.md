# Triage — VCST-6017 (checklist + C1 run REG-2026-10-13-1643)

Date 2026-10-13 · env vcst-qa · theme `2.60.0-pr-2543-0127-01276486` (vc-frontend#2543 head) · App Insights: skipped (no Azure identity / API key)
Sources: `testing-checklist.md` (19 non-passing rows, ticket mode) + C1 `REG-2026-10-13-1643` (8 FAIL, 1 BLOCKED). `--verify`: investigated every REAL_BUG at P2+; P3 candidates below the filing floor were not investigated (stated).
Totals: 28 issues · **10 real bugs** (2 IN-SCOPE, 8 PRE-EXISTING) · 11 test-defects (all fixed and re-run green) · 1 blocked (operator) · 0 flaky/env.
Restored 2026-10-13 after the original file and the `investigations/` packages + `screenshots/` were removed from the working tree (not in commit 559aa858). Surviving evidence: regression run folders `reports/regression/REG-2026-10-13-{1643,1726,1739}/` (results, traces, FAIL screenshots), lane HARs `test-results/{chrome,edge,firefox}/har/session.har`, kb entries cited below.

## Confirmed bugs (investigated live, REPRODUCED)

| Id | Finding | Prov. | Sev | Repo | Evidence |
|---|---|---|---|---|---|
| A10 / GA-052 | Markup list with id-less cards (`data-product-name/-price` only) re-sends `view_item_list` on every DOM insert/remove (1 → 26); `engine.ts` `entityId`/`isShallowEqual` reference-compare fresh objects | **IN-SCOPE** | Medium | vc-frontend | 3/3 Edge + Chrome; REG-…-1643 GA-052 trace; KB-5CDD664E, KB-897E75E9 |
| B6 / GA-056, GA-043 | A list re-sends `view_item_list` each time a breakpoint changes the rendered card count (6,5,6,5,6; related 10↔4; RB 6/5/4/6), unbounded per page view; pre-PR sent once | **IN-SCOPE** | Medium | vc-frontend | 3 engines; REG-…-1643 GA-056/043 traces; KB-D48E2629, KB-159E3137, KB-0B4A32AA. Author question: whole-array vs rendered-subset impressions (B7) |
| F3 | `/cart`: `add_shipping_info` fires before `begin_checkout`, re-sends once on first qty change, empty cart sends the funnel | PRE-EXISTING | Medium | vc-frontend `pages/cart.vue` L418-438, L457-463 | KB-EA61E19F, KB-E88FFFEB |
| F6 | VcCarousel + home slider arrows are bare divs — not keyboard operable (WCAG 2.1.1/4.1.2, A); hero slides 2+ unreachable | PRE-EXISTING | High | vc-frontend `vc-carousel.vue` L19-27/L53, `slider.vue` L40-48/L115 | KB-433D49DD |
| F8 | Variations table-view expand button has no accessible name (never fixed; VCST-3888 covered only the stepper) | PRE-EXISTING | Medium | vc-frontend `variations.vue` `#append` VcButton | KB-14811CA6 (+ dispute: table view only) |
| F9 | Slider/features images lack alt — schemas have no alt field; `features.vue` passes none; `slider.vue` `??` yields `aria-label=""` | PRE-EXISTING | Medium | vc-frontend | KB-53157036, KB-D0AF91D1 |
| F10 | CLS 0.47–0.68 on home / Page Builder pages (footer, features, carousel, demo-list); same on pre-PR vcptcore | PRE-EXISTING | Medium | vc-frontend `main-layout.vue:27`, `products-carousel.vue:10`, `demo-product-list.vue` | KB-53157036, KB-0AF3B0BB |
| F7 | Primary orange 2.11:1 contrast | PRE-EXISTING | High | — | **duplicate of VCST-6304** — link only |

**Below the floor — not investigated, not filed (P3/Low):** F1 single-image card image not clickable (ui-kit slot overlay) · F2 `update_cart_item` lacks `items[]`/`value` (BL-GA4-002 wording — oracle question) · F4 `select_item` items lack `currency`/`index`/list fields · F11 related carousel arrow overlaps first title (KB-75D49434) · F13 `recentlyBrowsed(maxProducts)` counts rows not products (vc-module-x-recommend, KB-5EE7F47E) · D4 `view_cart` value includes tax (GA4 says exclude; BL-GA4-002 ambiguous) · E2 new list ids undocumented in the PR README (AC7) · docs drift: VirtoOZ ga-events "Item fields" says `brand`, code + GA4 send `item_brand`.

## Test-case fixes (applied via `/qa-review-tests --fix`, operator-approved 2026-10-13) — all re-run green

| Case | Class | Fix | Verified |
|---|---|---|---|
| GA-002 | STALE_TEST | `items_skus` → `items[]` + `items_count` = rendered cards (VCST-5109) | REG-…-1726 PASS |
| GA-028, GA-029 | ASSERTION_DEFECT | `brand` → `item_brand` (GA4 reference + `productToGtagItem`) | 1726 PASS |
| GA-030..032 | STEPS (stale mechanic) | gtag-array filter `e[0]/e[1]/e[2]`; GA-030/031 expected count derived from the PLACED order (auto-gift promo lines count) | 1726 GA-032 PASS; 1739 GA-030/031 PASS |
| GA-037 | ASSERTION_DEFECT | grid leg asserts `items.length = rendered cards`; click the title anchor | 1726 PASS |
| GA-057 | ASSERTION_DEFECT | items = rendered cards per width; ⊂ API codes; 1 per cold load | 1726 PASS |
| GA-058 | STEPS | sign in before locating the Customize card | 1726 PASS |
| GA-040 | TEST_DATA_DEFECT | fixture guarantees a 2-image card (`@td(PB_GA4_PRODUCT_LISTS.carousel_card_name)`) | 1726 PASS |

Open human items: BL-CROSS-005 / BL-GA4-003 left SUSPECT by `bl:fresh` after GA-031's (test-defect) failure — clear via `/qa-review-oracles`. Tooling: the `@td` resolver leaves per-env alias fields empty in resolved CSVs (runner filled from `aliases.vcst.json`).

## Dismissed / blocked

- **C4 / GA-054** barcode redirect — BLOCKED (TEST_DATA_DEFECT): shared B2B-store `BarcodeSearchFields=[]` (KB-16859F54); operator declined the setting change. Unverified on this build.
- **D5** console: pre-existing image 404s / dead host; nothing from `dom-analytics`.

No tracker ticket filed, no fix triggered — human decides.
