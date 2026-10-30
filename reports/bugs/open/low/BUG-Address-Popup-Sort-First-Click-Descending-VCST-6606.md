# BUG: Select-address popup — first click on the Address column sorts Z-A (aria-sort=descending), regression of VCST-4992

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-10-28-1013
**Jira:** VCST-6606 (Relates VCST-6417)
**Severity:** Low · **Cases:** A11Y-SORT-001/002 (suite 045) · **Regression task:** VCST-6417

## Env
- vcst (QA storefront), store B2B-store, Firefox, signed-in personal account
- Platform 3.1090.0, Theme vc-theme-b2b-vue-2.61.0-alpha.2605 (matches the package)
- Deterministic: also seen on 2.60.0-alpha.2579 (KB-9B275671) and in the regression run

## Summary
In the cart's **Select address** popup, the first click on the sortable **Address** header sorts descending (Z-A) and sets `aria-sort="descending"`; the second click sorts ascending. VCST-4992 (Done) and VCST-4710 AC-1 require A-Z / `ascending` first.

## Steps to reproduce
1. Sign in, add any product, open /cart.
2. **Shipping details** -> change button next to the shipping address -> **Select address** popup.
3. Click the **Address** header once, then again.

## Actual
- Pristine: `aria-sort="none"`.
- Click 1: `aria-sort="descending"`; request GetCurrentUserAddresses `sort: "name:desc"`.
- Click 2: `aria-sort="ascending"`; `sort: "name:asc"`.

![After the first click](../../../screenshots/Address-Popup-Sort-First-Click-Descending/01-first-click-descending.png)

## Expected
- Click 1 sorts A-Z and sets `aria-sort="ascending"`; click 2 sorts Z-A and sets `aria-sort="descending"` (VCST-4992 Expected Result; VCST-4710 AC-1 "Sorting by columns (A-Z, Z-A) by column name click").

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | package screenshots/00..02, network/click1-request.json (name:desc), click2-request.json (name:asc) |
| 2-4 | N/A — not probed (client-side state; the server sorts as asked) | |

**Owning layer:** Layer 1 — Storefront (UI kit)

## Root Cause Analysis
`client-app/ui-kit/components/organisms/table/vc-table.vue`: the sort button emits `direction: toggleSortDirection(sort.direction)`, toggling the CURRENT sort's direction whichever column it is on. The popup starts from an ascending default sort on another column (`useCheckout.ts` personal/organization address sort), so a first click on Address flips it to `desc`. Details: `reports/regression/REG-2026-10-28-1013/evidence/A11Y-SORT-001/root-cause.md`.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** UI kit VcTable (consumer: shared/checkout/components/select-address-modal.vue)
- **RCA anchor:** client-app/ui-kit/components/organisms/table/vc-table.vue — `toggleSortDirection(sort.direction)` in the header sort button
- **Routing confidence:** HIGH
