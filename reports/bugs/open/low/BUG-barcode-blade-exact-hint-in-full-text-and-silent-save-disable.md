# Barcode scanner blade: "Matching is exact" hint shown in Full-text mode; Exact mode with no fields disables Save without saying why `[Low]`

## Status: READY_TO_SUBMIT

**Severity:** Low (P3) · **Type:** UI copy / UX · **Related:** VCST-2945 (in scope — new blade)
**Env:** vcst-qa · Catalog 3.1046.0-pr-909-2839 · Platform 3.1073.0-pr-3121-9965

## Summary

Two small guidance defects in the new Barcode scanner blade.
1. The "How to fill barcode data" panel always ends with *"Matching is exact: the scanned value must equal the stored value; the selected fields are matched with OR."* This is shown in Full-text mode too, where no fields are selected and matching is not exact.
2. In Exact mode with no field checked, Save becomes disabled, but no message or inline error says a field is required.

## Steps to Reproduce

1. Sign in to `{{BACK_URL}}` as `{{ADMIN}}` (password `{{ADMIN_PASSWORD}}`). Go to Stores → `@td(BARCODE_STORE.name)` → Search configuration → **Barcode scanner**.
2. Select **Full-text search** and read the "How to fill barcode data" panel.
3. Select **Exact match on selected fields**, make sure no field row is checked, and look at the toolbar and the form.
4. Click **Reset**. Do not save.

## Expected vs Actual

| Step | Expected | Actual |
|---|---|---|
| 2 — Full-text | the exact-matching sentence is hidden, or appears only with the Exact options | *"Matching is exact: the scanned value must equal the stored value; the selected fields are matched with OR."* is shown |
| 3 — Exact, 0 fields | a visible reason, e.g. "Select at least one field" next to **Fields** | Save is greyed out with no message; the only cue is the `required` marker on the **Fields** label |

Mode hints quoted exactly as shown: *"Full-text search looks the scanned value up in the whole product text."* / *"Exact match compares it with the selected fields only."*

Supporting capture — the "How to fill barcode data" panel, including the exact-matching sentence, shown with no Exact mode selected: `reports/bugs/screenshots/barcode-blade-scanner-off-without-browsefilters-read/SRCHA-056-FAIL-false-off-after-dismiss.png`.

## Root Cause Analysis

`barcode-search.tpl.html`: the `hint.matching` `<li>` is in the always-rendered "How to fill barcode data" block, not inside `<div ng-if="blade.matchMode === blade.matchExact">`. `barcode-search.js`: `isValid()` returns false for Exact mode with 0 fields and only feeds the Save `canExecuteMethod`. No validation message is bound to it.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin
- **Suggested repo:** VirtoCommerce/vc-module-catalog (PR #909, branch `feat/VCST-2945-barcode-search-setup`)
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Catalog Admin SPA — Barcode scanner blade
- **RCA anchor:** `src/VirtoCommerce.CatalogModule.Web/Scripts/blades/barcode-search.tpl.html` (`catalog.blades.barcode-search.hint.matching` `<li>`); `barcode-search.js` `isValid()`
- **Routing confidence:** HIGH

Found by: /qa-test VCST-2945 (2026-09-28)
