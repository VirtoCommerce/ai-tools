# Compare v2 — a second configuration differing only by an uploaded file is silently not added — P2

## Status: FILED — VCST-5875
**Tracker:** [VCST-5875](https://virtocommerce.atlassian.net/browse/VCST-5875) — Sub-task of VCST-5735
**Found by:** VCST-5735 `/qa-test` FULL run · suite 098 (CMP-016) · triaged REAL_BUG · IN-SCOPE
**Archetype:** `SILENT`

**Severity:** P2 · **Type:** Client state / identity

**Env:** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` (vc-frontend PR #2452, open), Platform `3.1063.0`.

## Summary
Adding the same configurable product twice, where the two configurations differ **only** in an uploaded
file, is a **silent no-op**: the second add does nothing, the control stays in its "already added" state,
and no notification appears. The customer gets no signal that their second configuration was rejected.

Separately and compounding it: the entry that *is* added renders **`From $80.00`** and shows **no upload
row at all**, so even the first uploaded file is invisible in the comparison.

## Steps to Reproduce
1. Configure `@td(CFG_FILE_UPLOAD.name)`, upload file A, add to compare.
2. Return to the product, replace the upload with file B, and add to compare again.
3. Observe the control state, any notification, and `/compare`.

## Expected vs Actual
- **Expected:** either two distinct columns (two configurations the customer can tell apart), **or** an
  explicit message saying the configuration is already in the list. Silence is the one unacceptable outcome.
- **Actual:** the product-page control **stays `Remove from Compare`** (pressed), no notification fires,
  the header badge is unchanged, and `/compare` shows **1** column. The entry renders `From $80.00` and
  carries **no `Design Upload` row**.

Contrast CMP-017, where a configured entry *did* carry its configured price and a configuration row —
so the file-section path behaves differently from other configuration paths.

Evidence: `reports/tickets/Sprint26-17/VCST-5735/screenshots/CMP-016-FAIL-second-config-not-added.png`

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | second add is a no-op; control state unchanged; no notification; one column |
| 2. Backend Admin | N/A | the compare list is client-side only — never reaches the server |
| 3. GraphQL xAPI | N/A | no mutation is attempted; the add is refused before any request |
| 4. Platform REST API | N/A | as above |

**Owning layer:** Layer 1 — Storefront

## Root Cause
`withoutFileSections()` strips file sections **before** computing an entry's identity, so two
configurations that differ only by an uploaded file resolve to the *same* `ICompareProductEntry`.
`addToCompareList` then finds the entry already present via `findMatchingEntryIndex` and returns early —
correctly, by its own logic, but with **no feedback path** for the "already present" case.

This is confirmed by the contrast with the working path: CMP-033 showed that after changing a
configuration the product control **reverts from "Remove from Compare" to "Add to Compare"**, which is
what makes a second add reachable. With file sections stripped, the identity does not change, so the
control never reverts and the add is unreachable.

Whether two file-only-different configurations *should* be distinct entries is a product decision. The
defect either way is the **silence** — an add that does nothing and says nothing.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Ownership hint:** platform (no `project-profile.json` — native deployment)
- **Component / module:** `client-app/shared/compare/composables/useCompareProducts.ts`
- **RCA anchor:** `withoutFileSections()` applied inside `findMatchingEntryIndex`; `addToCompareList` early-returns with no notification when `isInCompareList` is true
- **Routing confidence:** HIGH
