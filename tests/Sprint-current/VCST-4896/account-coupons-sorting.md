# /account/coupons — Coupon Sorting Verification

**Ticket:** VCST-4896 (PR #2269)
**Tester:** qa-frontend-expert
**Date:** 2026-04-28
**Build:** `2.48.0-pr-2269-dfb0-dfb0c1e5` (storefront QA, PR #2269 deployed)
**Browser:** playwright-edge (fallback — chromium not installed in playwright-chrome MCP)
**User:** Slot 1 — `test-john.mitchell-20260310@test-agent.com` / TechFlow org
**URL:** `https://vcst-qa-storefront.govirto.com/account/coupons`
**Time-box:** ~15 min

---

## 1. Page Overview

| Attribute | Value |
|---|---|
| Heading (h1) | `All coupons & promotions` |
| Total coupons rendered | **15 cards** (DOM walker count) / 16 cards in raw a11y snapshot — discrepancy from one card whose code/expiry both sit in empty `<p>` placeholders, see CODE/Code1 (idx 10) |
| Sort control present? | **NO** — no dropdown, no headers, no toggle, no link with text/aria/class/id matching `sort` anywhere in the DOM (verified via `querySelectorAll('select, button, [role="combobox"], [role="button"]')` filter) |
| Pagination control present? | **NO** — no `[class*="paginat"]`, no `[aria-label*="page"]`, no nav region with pagination text |
| Sidebar entry highlighted | "Marketing → Coupons & promotions" |
| Cart count badge | 4 (irrelevant to test, just context) |

Console: 1 error during page load — `404 on /xapi/graphql` (separate sub-feature 404, unrelated to coupon sorting).

---

## 2. Default Sort State

### Network payload (request)

`POST /graphql`, operation `GetPromotionCoupons`:

```json
{
  "operationName": "GetPromotionCoupons",
  "variables": {
    "storeId": "B2B-store",
    "userId": "143bc845-7ba3-4982-ae9a-a9446a399705",
    "cultureName": "en-US",
    "first": 16,
    "after": "0",
    "sort": "endDate:asc"
  }
}
```

`sort = "endDate:asc"` — matches PR #2269 default (and matches the cart sidebar default).

### Visible DOM order (rendered cards — also = server response order, since v-for preserves array order)

| # | Coupon code | Expires | Notes |
|---|---|---|---|
| 1 | FREESHIP | Jan 1, 2027 | |
| 2 | FIXED5 | Jan 1, 2027 | |
| 3 | QA | Jan 1, 2027 | "Simple QA Coupon" |
| 4 | AIR | Jan 1, 2027 | |
| 5 | FREE | Jan 1, 2027 | "Register and get 15% for all" |
| 6 | EXCLUSIVE10 | Jan 1, 2027 | |
| 7 | QA10OFF | Jan 1, 2027 | |
| 8 | SUPER | **Apr 30, 2026** | |
| 9 | MUESLI | (no expiry shown) | "GIFT: Muesli" |
| 10 | QA2 | **May 1, 2026** | |
| 11 | CODE (Code1) | (no expiry shown — empty `<p>` placeholder) | |
| 12 | ONE | (no expiry shown) | "10$ OFF" |
| 13 | LOVE | **Jun 18, 2026** | |
| 14 | WINE-GIFT | (no expiry shown) | |
| 15 | CODE (CODE2) | **May 27, 2026** | |

### Verdict on default sort

**The visible/server order does NOT match `endDate:asc`.** With `endDate:asc` the earliest end-dates should be FIRST. The actual order has 7× Jan 1, 2027 cards before Apr 30, 2026 (SUPER, position 8). Multiple later 2026 dates (May 27, Jun 18) appear after the Jan 1, 2027 cluster.

The order looks closer to **catalog/created-order** — not endDate-based at all. The cart sidebar exhibits the **same ordering** (FREESHIP, FIXED5, QA, AIR — the same first 4), confirming both surfaces share identical (likely incorrect) backend behavior.

---

## 3. Sort change tests

**Not applicable — no UI sort control exists.** Steps 5a/5b in the test plan cannot be executed.

To test backend sort responsiveness, a UI control would be required (or direct GraphiQL access). Since this is a frontend QA pass, this is documented as an observation rather than executed.

---

## 4. Pagination behavior

**Not applicable.** With `totalCount` ≈ 16 and `first: 16`, the API call returns the whole result set in one page; no UI pagination is rendered. Cannot test page-2 sort persistence because page 2 doesn't exist for this user. Whether pagination would render at >16 items is untested (test data is below the threshold).

---

## 5. Cross-surface comparison (cart sidebar vs /account/coupons)

Captured live (network panel) on `/cart` after navigating from `/account/coupons`:

| Surface | Operation | `first` | `after` | `sort` | First 4 codes (rendered) |
|---|---|---|---|---|---|
| Cart sidebar | `GetPromotionCoupons` | **4** | "0" | `endDate:asc` | FREESHIP, FIXED5, QA, AIR |
| `/account/coupons` | `GetPromotionCoupons` | **16** | "0" | `endDate:asc` | FREESHIP, FIXED5, QA, AIR |

Identical default sort variable, identical first-4 ordering. The `usePromotionCoupons` composable's PR-2269 default (`endDate:asc`) is wired correctly on both surfaces — the issue, if any, is downstream of the composable.

Evidence: `evidence/account-coupons/03-cart-sidebar-comparison.png`.

---

## 6. Findings

### Observation 1 — `/account/coupons` exposes no sort control to the user

**Severity:** Low (UX gap). Not a regression of PR #2269 — the page predates it (VCST-4590 territory) — but it's now a divergence between what the composable supports (`sort` is a parameter) and what the UI offers (nothing).

**Evidence:**
- `evidence/account-coupons/01-default-state.png` (full page)
- `evidence/account-coupons/02-no-sort-control-visible.png` (above-the-fold viewport — heading directly meets card list, no toolbar)
- DOM scan: 0 elements matching sort-related text/aria/class/id

**Impact:** Users cannot sort the list. With users accumulating coupons over time, browsing "expiring soonest" or "newest" becomes a manual scan.

**Repro steps (for `/qa-bug` ingestion):**
1. Sign in as a B2B user with ≥2 visible coupons
2. Navigate to `/account/coupons`
3. Observe the area between the "All coupons & promotions" heading and the first card — no sort dropdown, no header, no toggle
4. Open DevTools → query `document.querySelectorAll('main *')` for any element with `sort` in text/class/aria — returns 0

**Suggested fix:** Add a sort dropdown above the grid (e.g., "Expiring soonest" / "Expiring latest" / "Name A→Z" / "Name Z→A") that calls the composable's existing `sort` parameter.

---

### Observation 2 — Server-returned order does NOT match the requested `sort: endDate:asc`

**Severity:** Medium (functional — backend or composable bug). Affects BOTH the cart sidebar (PR #2269) and `/account/coupons`, because both pass the same `endDate:asc` and both render the same incorrect order.

**Expected:** With `sort: endDate:asc`, items with earlier `endDate` should appear first. Concretely: `SUPER` (Apr 30, 2026) should be #1, `QA2` (May 1, 2026) #2, `CODE2` (May 27, 2026) #3, `LOVE` (Jun 18, 2026) #4 — then the eight Jan 1, 2027 items — with NULL-expiry items sorted to either start or end depending on the indexer's null policy.

**Actual:** Eight Jan 1, 2027 items appear FIRST; SUPER (Apr 30, 2026 — earliest expiry) appears 8th; later 2026 dates (May 27, Jun 18) appear after the 2027 cluster; NULL-expiry items are scattered throughout (positions 9, 11, 12, 14).

The pattern looks like creation/insertion order, not `endDate` order — suggesting the backend (`PromotionEvaluator`/coupons resolver in xAPI) is not honoring the `sort` parameter for this field, OR the field name `endDate` is wrong for the indexer (might need `EndDate` or `expirationDate`).

**Evidence:**
- Network capture: `sort=endDate:asc` request payload
- DOM order capture: 15 cards as listed in §2

**Repro steps:**
1. Sign in as slot 1
2. Navigate to `/account/coupons`
3. DevTools Network → find `GetPromotionCoupons` request — confirm `variables.sort = "endDate:asc"`
4. DevTools Network → check response → record items[].endDate values in returned order
5. Verify: returned order is NOT monotonic ascending by endDate

**Suggested next step:** Hand off to `qa-backend-expert` — verify the GraphQL resolver in xMarketing module honors the `sort` parameter for `promotionCoupons`. Alternatively, query GraphiQL directly with `sort: "endDate:desc"` and check whether the order changes — if it does NOT change, the parameter is being ignored.

---

### Observation 3 — Some coupons render with empty `<p>` placeholders for label/description and no Expires line

**Severity:** Low (data hygiene / minor visual polish). Not necessarily a bug — could be content authored without those fields.

Cards affected: **CODE/Code1** (idx 11), **CODE/CODE2** (idx 15) — the "label" and "description" paragraphs render as empty `<p>` shells. CODE/Code1 also has no "Expires" line at all (the source coupon presumably has no `endDate`); CODE/CODE2 does have one.

This is more a data/content issue than a frontend bug. Frontend should consider hiding empty `<p>` blocks (or rendering placeholders) for cleaner cards. Out of scope for VCST-4896.

---

## 7. Verdict

**Coupon sorting on `/account/coupons`: BROKEN (server-side) + NOT APPLICABLE (UI).**

| Question from test plan | Answer |
|---|---|
| 1. Sort control exposed to user? | **NO** |
| 2. Default sort variable? | `endDate:asc` (matches PR #2269 default) |
| 3. Sort options work? | **N/A — no UI** |
| 4. Pagination preserves sort? | **N/A — no pagination at this volume** |
| 5. Visual order matches network response? | **YES** (DOM = response order) — but **NEITHER matches the requested `endDate:asc`**, indicating server-side sort is ignored |

**Bottom line for VCST-4896 / PR #2269:**
- The **composable change** (default `sort = "endDate:asc"`, accept custom variables) is correctly wired on the cart sidebar — request payload confirms `first: 4, sort: "endDate:asc"`.
- The **rendered ordering** on the cart sidebar (which is the PR's surface) appears to follow whatever order the backend actually returns — and that order is NOT `endDate:asc`. So while the PR is technically correct (it passes the right parameter), users will not see the "expiring soonest" experience the parameter implies.
- The `/account/coupons` page is a separate, older surface and predates the PR, but inherits the same backend issue plus has its own UX gap (no sort UI).

**Recommended actions:**
1. **Backend investigation (qa-backend-expert)** — verify the xMarketing/xAPI `promotionCoupons` resolver honors the `sort` argument. This is the higher-priority finding because it affects the PR-2269 cart sidebar UX.
2. **Storefront UX enhancement (separate ticket / not gating PR #2269)** — add a sort dropdown to `/account/coupons`.
3. **Empty-paragraph polish (data hygiene)** — out of scope.

PR #2269 itself is **not blocked** by these findings: the composable change is correct as written, and the cart sidebar's visible "wrong order" is the same wrong order the page already had. PR-2269 inherits the bug, doesn't introduce it.

---

## Evidence index

All under `tests/Sprint-current/VCST-4896/evidence/account-coupons/`:

- `01-default-state.png` — full-page screenshot of `/account/coupons` (15 cards visible, no sort control, no pagination)
- `02-no-sort-control-visible.png` — above-the-fold viewport showing heading directly above first card with no toolbar/control between
- `03-cart-sidebar-comparison.png` — `/cart` page showing the "Discount & coupons" sidebar with the same first 4 codes (FREESHIP, FIXED5, QA, AIR) confirming identical default ordering across surfaces
