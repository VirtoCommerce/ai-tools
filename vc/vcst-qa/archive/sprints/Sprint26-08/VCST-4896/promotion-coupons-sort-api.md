# VCST-4896 — promotionCoupons xAPI sort behavior verification

**Date:** 2026-04-28
**Tester:** qa-backend-expert (slot 3 / playwright-edge)
**Build under test:** Ver. 2.48.0-pr-2269-dfb0-dfb0c1e5
**Endpoint:** `https://vcst-qa-storefront.govirto.com/graphql`
**Operation:** `GetPromotionCoupons`
**Verdict:** **FAIL — `sort` variable is silently ignored by the xAPI resolver.**

---

## 1. Auth approach

The storefront SPA stores its OAuth bearer token in `localStorage.auth` after sign-in. Approach used:

1. Navigated to `https://vcst-qa-storefront.govirto.com/sign-in` in playwright-edge — already had an active session as **John Mitchell** (`test-john.mitchell-20260310@test-agent.com`, slot 1 user, TechFlow org).
2. In page context, parsed `JSON.parse(localStorage.getItem('auth'))` to get `{ token_type: "Bearer", access_token: "..." }`.
3. Resolved `userId` via `me { id }` GraphQL probe → `143bc845-7ba3-4982-ae9a-a9446a399705`.
4. Sent all subsequent GraphQL requests via `fetch('/graphql', { method: 'POST', headers: { Authorization: 'Bearer ...', 'Content-Type': 'application/json' }, body: JSON.stringify({query, variables}) })`.

No credentials were hardcoded. Token expiry: `2026-04-28T11:46:23Z` (~28 minutes from probe start — sufficient for the run).

**Note on test data:** prompt scope said "4 coupons (E2E-COUPON, THRESH50, CAT20, FREESHIP) sharing endDate Jan 1 2027". Reality on env: this user has **15 coupons**, with diverse endDates (some null, some `2026-04-29`, some `2026-12-31`, etc.). Only `FREESHIP` matches the prompt's expected list. The actual data set is **more discriminating** for sort verification (varied dates, nulls, mixed alphabetic ranges) — improves test power, not weakens it.

## 2. Request/response table

All cases: `cultureName: "en-US"`, `storeId: "B2B-store"`, `userId: "143bc845-..."`, `first: 16`, `after: "0"`, totalCount = 15, HTTP 200, no `errors[]`.

**Canonical order returned (every variant):**
`FREESHIP | FIXED5 | QA | AIR | FREE | EXCLUSIVE10 | QA10OFF | super | MUESLI | QA2 | code | ONE | LOVE | wine-gift | CODE`

| #     | sort variable           | HTTP | errors[] | items couponCode order | Differs from TC01? | Verdict |
|-------|-------------------------|------|----------|------------------------|--------------------|---------|
| TC01  | *(omitted)*             | 200  | null     | canonical              | —                  | baseline |
| TC02  | `endDate:asc`           | 200  | null     | canonical              | NO                 | FAIL    |
| TC03  | `endDate:desc`          | 200  | null     | canonical              | NO                 | FAIL    |
| TC04  | `name:asc`              | 200  | null     | canonical              | NO                 | FAIL    |
| TC05  | `name:desc`             | 200  | null     | canonical              | NO                 | FAIL    |
| TC06  | `couponCode:asc`        | 200  | null     | canonical              | NO                 | FAIL    |
| TC07  | `couponCode:desc`       | 200  | null     | canonical              | NO                 | FAIL    |
| TC08a | `endDate:asc;name:asc`  | 200  | null     | canonical              | NO                 | FAIL    |
| TC08b | `endDate:asc,name:asc`  | 200  | null     | canonical              | NO                 | FAIL    |
| TC09  | `doesnotexist:asc`      | 200  | null     | canonical              | NO                 | FAIL (silent) |
| TC10  | `""` (empty string)     | 200  | null     | canonical              | NO                 | PASS (matches no-sort) |
| TC11  | `endDate ASC`           | 200  | null     | canonical              | NO                 | FAIL    |
| TC12  | `endDate-asc`           | 200  | null     | canonical              | NO                 | FAIL    |
| TC13  | `endDate:ascending`     | 200  | null     | canonical              | NO                 | FAIL    |
| TC14  | `endDate`               | 200  | null     | canonical              | NO                 | FAIL    |
| TC15  | `-endDate`              | 200  | null     | canonical              | NO                 | FAIL    |
| TC16  | `+endDate`              | 200  | null     | canonical              | NO                 | FAIL    |

Verdict for **TC10** (empty string) is technically PASS only because behaving like "no sort" is reasonable; flagged here as data point, not a regression.

## 3. Sort syntax analysis

- **Schema accepts:** `sort: String` (nullable, scalar). Confirmed via introspection — `__type(name:"Query").fields.promotionCoupons.args` includes `sort` of kind `SCALAR`/`String`.
- **Resolver behavior:** EVERY variant of `sort`, including completely invalid syntax (`+endDate`, `endDate-asc`, `doesnotexist:asc`, multi-field with `;` or `,`), returns the **same byte-identical 15-item ordering**. The argument is parsed (no rejection at the GraphQL layer) but **dropped at the resolver level**.
- **No syntax is "supported"** in the sense of producing differential ordering. There is also no validation feedback — invalid input is silently ignored.

Schema also exposes an undocumented `keyword: String` argument on `promotionCoupons` (not in our query file) — out of scope for this check, noted for future review.

## 4. Tie-breaking behavior

Moot — since sort is not honored, there's nothing to break ties on. The default order returned (without any sort variable) appears to be a fixed ordering that does NOT correspond to:
- `endDate:asc` (the canonical order has rows with endDate=null, `2026-04-29`, `2026-12-31` interleaved arbitrarily; first 7 items all share `2026-12-31`, then drops to `2026-04-29`, jumps to null, then `2026-04-30`, etc. — not date-sorted in any direction)
- alphabetical name or couponCode
- `id` (mix of GUID formats)

Most plausible default: **insertion / `createdDate` order in the underlying coupon table**. This is consistent with Virto platform's default for promotion lists when no explicit sort is requested.

## 5. Findings — bug-worthy issues

### BUG #1 — `sort` variable silently ignored on `promotionCoupons` xAPI

**Severity:** High (functional contract violation; PR #2269 ships a feature whose backend dependency is broken).
**Module:** xAPI / vc-module-x-marketing (promotion coupons resolver).
**Build:** 2.48.0-pr-2269-dfb0-dfb0c1e5.

**Steps to reproduce:**
1. Authenticate as a user who has multiple promotion coupons (e.g. John Mitchell, TechFlow org on QA — 15 coupons with varied endDates).
2. POST to `/graphql` with the `GetPromotionCoupons` operation, varying only the `sort` variable across requests:
   - `sort: "endDate:asc"` vs `sort: "endDate:desc"` — should reverse order; they don't.
   - `sort: "name:asc"` vs `sort: "couponCode:asc"` — should reorder; they don't.
3. Compare `data.promotionCoupons.items[].couponCode` arrays.

**Expected:** Different `sort` values produce different `items[]` orderings consistent with the requested field/direction.
**Actual:** All 16 sort variants tested (including bad syntax and a non-existent field) return the byte-identical default ordering. HTTP 200, no `errors[]`. PR #2269's `usePromotionCoupons` composable defaults to `sort: "endDate:asc"` and sends it verbatim — so the storefront UI sort picker (if/when wired up) will appear to do nothing.

**Impact on PR #2269 (VCST-4896):**
- The "Coupons sidebar" UI will display coupons in fixed default order regardless of any sort affordance.
- If the cart sidebar relies on `endDate:asc` for "soonest-expiring first" prioritization, this prioritization is **not actually applied** at the API — what the user sees is whatever default ordering the resolver emits.
- Hidden risk: empty-`endDate` coupons interleaved with future-dated ones in default order can mislead users about urgency.

**Evidence:**
- `evidence/api/sort-syntax-variants.json` — 17-row variant matrix (16 sort variants + baseline).
- `evidence/api/full-response-tc01-tc04-tc09.json` — full GraphQL payloads for representative cases (no-sort, name:asc, bad-field).

**Suggested fix area (informational only):** the resolver in `vc-module-x-marketing` (or wherever `promotionCoupons` is wired) likely needs to apply the `sort` clause on the `IPromotionUsageSearchService` query (or equivalent). Compare against the working sort behavior on neighboring xAPI queries like `promotions` or `cart` to find the pattern.

---

### BUG #2 — Invalid sort field is not validated (silent ignore)

**Severity:** Low (related to BUG #1; a side effect of the resolver dropping sort).
**Description:** `sort: "doesnotexist:asc"` returns HTTP 200 with no `errors[]`. Even if BUG #1 is fixed by honoring the sort, the resolver SHOULD validate the field name and return a GraphQL error (e.g. `errors: [{ message: "Unknown sort field 'doesnotexist'" }]`) rather than fall through.
**Note:** Document this as a follow-up — fixing #1 may or may not surface this depending on how Virto's `SortInfo.Parse` handles unknown fields (typically ignored without error today across the platform). Consider this an enhancement candidate, not a release blocker.

---

## 6. Verdict

**Does the `sort` variable actually drive item order in the response? — NO.**

The xAPI `promotionCoupons` query accepts the `sort: String` argument at the schema layer, but the resolver does not honor it. Every value tested (including PR #2269's default `endDate:asc`, valid alternative fields, common syntax variants, invalid field names, multi-field expressions, and empty string) produces the same default ordering.

**Implication for PR #2269 / VCST-4896:** the frontend `usePromotionCoupons` composable's `sort` parameter is currently a no-op end-to-end. Frontend behavior may appear superficially correct (no errors, list renders), masking the backend gap. Recommend filing a backend bug against vc-module-x-marketing (or the package owning `promotionCoupons` resolver) and tracking it as a dependency of VCST-4896 before sign-off.

---

## Files
- Report: `tests/Sprint-current/VCST-4896/promotion-coupons-sort-api.md` (this file)
- Evidence:
  - `tests/Sprint-current/VCST-4896/evidence/api/sort-syntax-variants.json`
  - `tests/Sprint-current/VCST-4896/evidence/api/full-response-tc01-tc04-tc09.json`
- Query reused: `test-data/graphql/queries/promotionCoupons.graphql`
