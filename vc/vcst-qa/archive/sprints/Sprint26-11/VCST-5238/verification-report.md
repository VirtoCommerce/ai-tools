# VCST-5238 — Fix Verification Report

**Ticket:** VCST-5238 — Apollo `MissingFieldError` "currencyCode" (code 13) on every cart line-item write (`UpdateShortCartItemQuantity`) in Mixed-Cart loyalty mode
**Env:** vcst-qa @ theme **2.51.0-pr-2333-57c2-57c28af5** (PR #2333 deployed) · Store B2B-store, loyalty "Mixed Cart" / PTS · Browser **playwright-edge** (chrome profile was locked) · User AGENT-TEST VIP

## Verdict: VERIFIED ✅

The fix is confirmed live. The `currencyCode` Apollo `MissingFieldError` does **not** fire on any cart write across all runs.

## PRE-CHECK — PASS
`/loyalty-catalog` reachable (50 PTS products, prices "PTS150"/"PTS40"/etc.); cart renders a dedicated "Products in PTS" section and a "Total in PTS" summary block → Mixed Cart mode is ACTIVE.

## STR result: 3 / 3 clean runs
Each run from a CLEAN cart: add a PTS product from `/loyalty-catalog` via "+", then a USD product from `/catalog` via "+", inspecting console after each add.
- Run 1: PTS add 0 errors · USD add 0 errors
- Run 2: PTS add 0 errors · USD add 0 errors
- Run 3: PTS add 0 errors · USD add 0 errors

## currencyCode MissingFieldError count: **0** (across all 3 runs + qty-update + select/unselect)
Only console errors present, every run: 2 benign image 404s (`…GC952104/…webp` on vcst-qa CMS) — unrelated to the fix.

## Checklist
| # | Item | Result |
|---|------|--------|
| 1 | Add PTS product from /loyalty-catalog via "+" | PASS |
| 2 | Add regular USD product from /catalog via "+" | PASS |
| 3 | NO Apollo MissingFieldError "currencyCode" on UpdateShortCartItemQuantity (CORE) | **PASS — 0 occurrences, 3/3 runs** |
| 4 | Update qty of existing line item (cart-page +, no navigation) | PASS — PTS line 1→2, total PTS150→PTS300, no error |
| 5 | Totals reconcile after unselect-all → select-all | PASS — USD $132→$0→$132; PTS150 independent |
| 6 | No NEW console errors introduced | PASS — only pre-existing benign image 404s |
| 7 | Cart shows both items w/ correct currency badges (USD vs PTS) | PASS — "$110.00" / "PTS150.00", separate sections |
| 8 | UpdateShortCartItemQuantity POST → 200, no errors[], currencyCode in returned line items | **PASS** (see network) |
| 9 | New-item optimistic path clean (first add of not-in-cart product) | PASS — covered by STR; 0 errors |
| 10 | BL-CART: cart total == sum of line items; line-item currency consistent | PASS — USD sub $110=line; PTS sub 150=line; per-currency cartTotals |

**Pass count: 10 / 10**

## Network evidence
`UpdateShortCartItemQuantity` (USD add) → **200**, no `errors[]`. Response line items both carry `currencyCode`:
- USD product `f06eb7ca…` → `"currencyCode":"USD"`
- PTS product `42aae9db…` → `"currencyCode":"PTS"`, `itemsQuantity:2`

`changeCartItemsQuantity` (cart-page qty update) → **200**, no `errors[]`; both line items + `cartTotals[]` carry currencyCode (default USD $132 total + non-default PTS300 total). This is exactly the read selection (`shortLineItem.currencyCode`) that previously had no matching field in the optimistic cache write — now present, so Apollo normalization succeeds.

HAR: auto-captured under `test-results/edge/har/`.

## Evidence
- `screenshots/cart-final-state-both-items.png` — both items, USD + PTS sections, dual totals
- `screenshots/cart-run3-totals-reconciled.png` — totals reconciled after select/unselect cycle

## Notes
- chrome profile lock forced the run onto playwright-edge (per team-lead direction); add-to-cart + qty + console/network only, so the known Edge /cart payment-dropdown quirk did not apply.
- Teardown: cart cleared; no orgs/contacts/accounts created (AGENT-TEST VIP is a standing fixture).

**Recommendation: VERIFIED** — safe to transition the ticket to its post-verification state.
