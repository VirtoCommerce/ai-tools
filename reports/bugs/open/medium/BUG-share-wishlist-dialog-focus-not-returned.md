# Share list dialog: focus is not returned to the trigger after the dialog or its confirmation closes — [Medium]

**Env:** vcptcore-qa · theme 2.59.0-pr-2476-0604 · playwright-edge, 1920/768/375 · 2026-09-29
**Found by:** /qa-test VCST-5707 visual lane (4v) · **Class:** BL-A11Y on a feature ticket → standalone, related to VCST-5707 · **WCAG 2.2:** 2.4.3 Focus Order · **Archetype:** RENDER

## STR
1. As @td(SR_REP_PRIMARY) open /account/lists → list gear (Actions) → Share.
2. Close the dialog (Save, Cancel or ×); separately, open a nested confirmation (Private tab on a shared list) and press Cancel.
3. Check the focused element.

## Expected vs Actual
- Expected: focus returns to the control that opened the dialog (the Actions trigger), or to the Save button after a nested Cancel.
- Actual: `document.activeElement` is the app root in all three cases; a keyboard / screen-reader user is thrown to the top of the page. The focus trap itself works (Tab wraps, background aria-hidden, Escape closes only the top layer). Inconsistency: the Remove-list confirmation focuses the destructive "Delete" by default, the two sharing confirmations focus Cancel.

## Evidence
`reports/tickets/Sprint26-19/VCST-5707/design-report.md` §F3; `screenshots/4v-stop-sharing-confirm-1920.png`, `4v-change-access-confirm-1920.png`.

## Fix Routing
`vc-frontend` `share-wishlist-modal.vue` / `stop-sharing-confirmation-modal.vue` (PR #2476 already forwards the trigger element through `wishlist-card` / `wishlist-dropdown-menu` emits — the return target is available but not used on close).
