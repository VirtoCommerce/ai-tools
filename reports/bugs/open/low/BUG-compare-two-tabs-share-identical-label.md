# Compare v2 — a parent category and its child render two tabs with the identical label — P3

## Status: CONFIRMED
**Found by:** VCST-5735 `/qa-test` FULL run · suite 098 (CMP-011) · IN-SCOPE
**Archetype:** `PARITY`

**Severity:** Low/P3 · **Type:** Labelling · **BELOW the 5d severity floor — not filed**

**Env:** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` (PR #2452, open), Platform `3.1063.0`.

## Summary
A product in a parent category and one in its child produce **two separate tabs carrying the same visible
label** and the same badge count, with no depth or path hint to tell them apart. Verified live with a
seeded pair: keys `ce48ce23-…` and `ce48ce23-…/2e2d11ef-…` — genuinely different groups, identical labels.

## Root Cause
`getProductCategoryKey` joins the first two Category breadcrumb `itemId`s, so parent and child yield
different keys — correct. But the tab **label** is `categoryBreadcrumbs.at(-1)?.title`, which for a
one-level product is the parent's own title and for its child is… the same title, when the child shares
the parent's name. Different keys, one label.

## Why this is Low
Products are partitioned **correctly** — nothing is lost or misfiled, and each tab's contents are right.
Only the labels are ambiguous. Graded P3, therefore not filed.

It is also the same DOM fact as accessibility finding A11Y-7 (two tabs sharing an accessible name).
Recorded once, here.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront · **repoKind:** frontend · **Repo:** `VirtoCommerce/vc-frontend`
- **Component:** `client-app/shared/compare/utilities/index.ts` (`getProductCategoryLabel`)
- **Routing confidence:** HIGH
