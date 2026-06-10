# REG-2026-06-10-1645 — Mixed Cart full re-test (VCST-5101 fix verification, UI + GraphQL)

**Env:** vcst-qa @ vc-frontend 2.51.0-pr-2310-eb35, fixed XCart artifact (RewardExtensions.cs:201 currency filter live) · store B2B-store · loyalty PTS / Mixed Cart · user `@td(LOYALTY_VIP_USER)`
**Selection:** 050b4 GQL-MC-002..011 (9) + scratch R2/R3/R4/S4/S5 (5) via graphql-runner · CART-071/072 + LOYF-024/025 + directed coupon flow via playwright-chrome

## Counts

| Layer | Cases | Pass | Fail |
|---|---|---|---|
| GraphQL (runner) | 14 | 14 | 0 |
| UI (browser) | 4 CSV + directed flow + 6-run repro matrix | all | 0 (CART-072 initial FAIL retracted after 2nd-source repro) |
| **Total** | **18 + flows** | **all** | **0** |

## Fix verdict: FIXED — confirmed in both layers
Coupon = 10% × USD-only in API and on-screen (UI delta $8.72 = 10% × $87.20 USD post-tier line), invariant to PTS presence, qty steps, select/unselect, and deletion; PTS block discount 0 everywhere; guards (fixed-$, auto promo, mergeCart) unregressed. Previously-RED GQL-MC-006/010/011 now GREEN.

## Failures

**CART-072** (028-cart-core) — initial FAIL **RETRACTED after controlled second-source repro** (same day):
- 4× grid-card adds (4 different USD products: stationery, 2 smartphones, accessory incl. −57% sale, $2M listing) + 1 PDP control, each against a server-confirmed PTS line: **5/5 BOTH-SURVIVE**, with payload proof — every add fires the same `UpdateShortCartItemQuantity` (itemCurrencyCode USD) and the response contains both lines. Server never dropped the PTS line.
- "Clear-cart unreliable" explained: Clear cart requires confirming a Yes/No dialog; when confirmed, `ClearCart` empties the whole mixed cart correctly (response `itemsQuantity: 0`).
- Original observation = transient stale-render in a long rapid-mutation session, most plausibly the known Apollo `currencyCode` cache-write Low bug. **Not filed** per `feedback_verify_payload_bugs_second_source`. CART-072 itself re-verified PASS by the repro matrix (independent per-currency lines coexist).

## Passes
GQL-MC-002, 003, 005, 006, 007, 008, 009, 010, 011, R2, R3, R4, S4, S5 (S5 = AC-pass; 2 runner predicates hit the known multi-path-arithmetic parser limitation, math verified consistent from evidence), CART-071, LOYF-024, LOYF-025, directed UI flow steps 1–6.

## Suite hygiene (fixed during run)
The MC-007..011 promotion appended LF rows into CRLF 050b4 → csv-parse merged 5 rows into one record and **blocked the whole suite**. File normalized to CRLF (29 rows parse, lint clean); `.gitattributes` added (`regression/suites/**/*.csv text eol=crlf`).

## Bugs
- FIXED + verified: [`reports/bugs/fixed/BUG-mixed-cart-coupon-pts-leaks-into-usd-discount.md`](../../bugs/fixed/BUG-mixed-cart-coupon-pts-leaks-into-usd-discount.md)
- Still open (Low, re-confirmed): [`reports/bugs/BUG-mixed-cart-currencyCode-apollo-cache-write.md`](../../bugs/BUG-mixed-cart-currencyCode-apollo-cache-write.md)
- Retracted (2nd-source repro failed to reproduce, 5/5 clean with payload proof): mixed-cart PTS-line loss on grid-card add + Clear-cart ineffective (see CART-072 above)

## Evidence
GraphQL JSONs: `reports/regression/graphql-evidence/` (this run's GQL-MC-*/R*/S* files) · UI screenshot: `VCST-5101-mixed-cart-coupon-applied-discount-isolated.png` (this dir) · HAR: `test-results/chrome/har/`

**Quality gate:** PASS — clean run. VCST-5101 fix verified both layers; CART-072 retracted as stale-render artifact; only the pre-existing Apollo `currencyCode` Low bug remains open (PR #2310).
