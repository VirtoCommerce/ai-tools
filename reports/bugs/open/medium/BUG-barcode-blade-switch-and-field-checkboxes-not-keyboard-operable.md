# Barcode scanner blade: the switch and the field checkboxes cannot be used by keyboard and have no accessible name `[Medium]`

## Status: READY_TO_SUBMIT

**Severity:** Medium (P2) · **Type:** accessibility, standalone. Related to VCST-2945 but not a sub-task of it.
**Env:** vcst-qa · Catalog 3.1046.0-pr-909-2839 · Platform 3.1073.0-pr-3121-9965 · axe-core 4.12.1 + a manual keyboard walk on blade `#storeBarcodeSearch`

## Summary

A keyboard or screen-reader user cannot turn the storefront scanner on or off and cannot select any of the 87 match fields in the new Barcode scanner blade. Both controls are built from hidden native inputs inside platform `__switch` / `__checkbox` wrappers. These inputs get no tab stop and expose no role, name or checked state. The two match-mode radios also form two separate groups. A new badge in the blade fails text contrast.

## Steps to Reproduce

1. Sign in to `{{BACK_URL}}` as `{{ADMIN}}` (password `{{ADMIN_PASSWORD}}`). Go to Stores → `@td(BARCODE_STORE.name)` → Search configuration → **Barcode scanner**. Select **Exact match on selected fields**.
2. Click in the blade header, then press Tab repeatedly.
3. Run axe on the blade and inspect the accessibility tree.
4. Restore the store to `{"scannerEnabled":true,"fields":[]}` without saving (Reset).

## Expected vs Actual

| Control | Expected | Actual |
|---|---|---|
| "Enable barcode scanner in the storefront" switch | one tab stop, role switch/checkbox, named by its label, checked state announced, Space toggles | hidden native checkbox inside an unlabelled `label.form-label.__switch`: **no accessible name, no tab stop** (WCAG 2.1.1, 4.1.2) |
| 87 field-row checkboxes | each focusable, role checkbox, name = row text, checked state announced | inputs are `visibility:hidden`: **no role or state, cannot be reached by keyboard**. Tab order is Save → Reset → radios, then focus leaves the blade (2.1.1, 4.1.2) |
| Match-mode radios | one radio group: one tab stop, arrow keys move between options | no shared `name` attribute: **two tab stops**, two separate groups (4.1.2 / keyboard pattern) |
| `.barcode-search-badge.__multi` ("MULTI-VALUE") | ≥ 4.5:1 | **2.20:1** (`#43b0e6` on `#eef4f9`, 10px uppercase) (1.4.3) |
| `.barcode-search-badge.__missing` ("MISSING FROM INDEX") | ≥ 4.5:1 | 3.24:1 (`#e6533f` on `#fdeceb`) (1.4.3) |

No screenshot: the defects are in the keyboard focus order and the accessibility tree, which a still image does not show. The badge colours come from the stylesheet (`catalog.css`, lines added by PR #909).

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | N/A | admin-only |
| 2. Admin | **FAIL** | axe 4.12.1 + keyboard walk (above) |
| 3–4. xAPI / REST | N/A | presentation only |

**Owning layer:** Layer 2 — Admin SPA.

## Root Cause Analysis

`barcode-search.tpl.html`:
- The switch is `<label class="form-label __switch"><input type="checkbox" …><span class="switch"></span></label>`. There is no text inside the label and the input has no `id`, so the visible "Enable barcode scanner…" label is not associated with it.
- Each field row is `<span class="form-control __checkbox barcode-search-field__check"><input type="checkbox" …><span class="check"></span></span>`.
- The two `<input type="radio">` have no `name`.

The platform `__switch` / `__checkbox` styles hide the native input (`visibility:hidden`), so it is removed from the tab order and the accessibility tree. The blade copies these platform patterns, so other blades that use them probably have the same gap. A full fix may therefore be partly in `vc-platform` (for example, visually hiding the input without `visibility:hidden`). The blade-level part — labels, `aria-label` / `id` association, a shared radio `name`, badge colours — belongs to the module.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin
- **Suggested repo:** VirtoCommerce/vc-module-catalog (PR #909); possibly also VirtoCommerce/vc-platform (shared `__switch` / `__checkbox` CSS)
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Catalog Admin SPA — Barcode scanner blade; platform form-control styles
- **RCA anchor:** `src/VirtoCommerce.CatalogModule.Web/Scripts/blades/barcode-search.tpl.html` (`label.form-label.__switch`, `span.form-control.__checkbox`, radios without `name`); `Content/css/catalog.css` `.barcode-search-badge.__multi`
- **Routing confidence:** LOW. The blade-level changes are single-repo, but the hidden-input root cause is the shared platform pattern, so the fix may span two repos.

Found by: /qa-test VCST-2945 (2026-09-28)
