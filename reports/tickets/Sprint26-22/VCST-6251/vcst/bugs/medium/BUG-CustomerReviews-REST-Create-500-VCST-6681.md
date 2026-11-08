# BUG: POST /api/customerReviews returns 500 instead of a validation error — `[Medium]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6251
**Tracker:** VCST-6681 (Relates VCST-6251)
**Env:** vcst @ Platform 3.1093.0-pr-3154-4607, CustomerReviews 3.1008.0-pr-86-6eca (also vcptcore, CustomerReviews 3.1008.0)

## Summary
Admin REST create answers a body with no `images` (NullReference) and a duplicate review (raw SQL unique-index text, schema exposed) with an unhandled 500. xAPI `createReview` validates both cases.

## STR
1. `POST /api/customerReviews` with one review for a `B2B-store` product, no `images` property → 500.
2. Same body with `images: []` → 204 (control).
3. Repeat step 2 → 500 with `IX_CustomerReview_StoreId_EntityId_EntityType_UserId` in the body.

## Expected vs Actual
Expected: 4xx with a validation message (BL-AUTH-017). Actual: 500 in both cases. Non-visual — evidence `bugs/evidence/review-500-repro.json`.

## Layer Validation
| Layer | Result |
|---|---|
| REST | FAIL |
| xAPI | PASS (`DUPLICATE_REVIEW`, `PRODUCT_MUST_BE_PURCHASED`) |
| Admin / Storefront | N/A |

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-module-customer-review · **repoKind:** module · **Ownership hint:** platform
- **RCA anchor:** `CustomerReviewsModuleController.cs:151` (`x.Images.Count`), `:156` (no duplicate check before `SaveChangesAsync`)
- **Routing confidence:** HIGH · auto-fix labels withheld (API-only repro + schema disclosure → Gate-0 bail)
- **Need hotfixes:** set — present in v15 (3.1004.0) and v16 (3.1007.1)
