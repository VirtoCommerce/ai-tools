# Root cause — VCST-6398 V11

**Symptom:** on /compare (3 iPhones) the Differences tab shows 4 rows while the corner line reads "Differ: 3 of 9 rows".

**Mechanism (HIGH confidence, source + live agree):** the counter and the row filter use different predicates by construction.
- N = `tableRows.filter(row => row.differs).length` (`useCompareProductsPage.ts:464`) → Price, SKU, Cellular = 3.
- Differences shows `pinnedRows` + `unpinnedRows.filter(row => row.differs || PERMANENT_ROW_KEYS.includes(row.key))` with `PERMANENT_ROW_KEYS = [price, availability]` (`compare-table.vue:361,426-432`) → + Availability (identical, permanent) = 4.
- Second path, same gap: any pinned identical row is also shown and not counted (Brand pinned → 5 rows, still "3 of 9", `03-…png`).
- It agrees only when Price and Availability both differ and nothing identical is pinned (the A2 printer set).

**Lowest failing layer:** storefront Vue (client-side computed). No request, no console error, no backend data involved — the values are identical in the DOM and the API.

**Alternatives ruled out**
1. *Data drift / Availability actually differs:* DOM shows 1454 / 1454 / 1454, all "In stock"; `getAvailabilitySignature` gives equal signatures → `differs=false`. Ruled out.
2. *By design:* PARTLY. Keeping Price + Availability visible under Differences is explicit intent (`constants.ts:16-18`, `compare-table.vue:360` comments, since #2452). The counter label "Differ: N" counts differing rows, which is accurate for what it says. What is NOT specified anywhere: whether N should equal the rows shown. AC-3 text in the ticket bundle is only *"Compare page, desktop: the 'Differ: N of M rows' line is shown"* — it does not define N = rows in the Differences tab (the triage premise). VirtoOZ (storefront user guide, Compare Products) says only "Limit the list of product characteristics to differences only" — silent on the counter and on permanent rows. PR #2452's body says Differences "hides rows that are identical", which the Price/Availability exemption contradicts. ⇒ a spec/UX ambiguity, not a code error against a written requirement.
3. *Regression from #2518 / PR #11:* ruled out — identical logic in vc-frontend 2.59.0, 2.60.0 and the feature commit 17ad3e6f6 (#2452); #2518 did not touch it.

**Verdict for triage:** REPRODUCED as observed, but the behaviour is the shipped design of the compare feature (since vc-frontend #2452), not a defect introduced by the merge. Not a FAIL of AC-3 as written. At most a Low UX inconsistency (counter vs visible rows) for the PO to decide: either label the permanent/pinned rows, or count them, or reword the line.

**Fix routing (only if PO calls it a defect):** layer storefront · repoKind frontend · repo VirtoCommerce/vc-frontend-next (read at d67b0e0a; same logic upstream in vc-frontend since #2452 — routing corrected by the triage orchestrator) · files `client-app/shared/compare/components/compare-table.vue` (visibleRows) and/or `client-app/shared/compare/composables/useCompareProductsPage.ts` (differRowsCount) · confidence HIGH on location.
