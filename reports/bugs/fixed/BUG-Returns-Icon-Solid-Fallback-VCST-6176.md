# BUG: Account menu Returns icon renders as legacy solid glyph (VCST-6176)

## Status: FIXED
**Found by:** human

- **Env:** vcst-qa storefront Ver. 2.59.0-pr-2524-3069; vc-frontend dev @ dbc3f53
- **STR:** signed-in org user → /account/dashboard → Purchasing sidebar.
- **Expected:** Returns icon is a Lucide outline icon like Orders / Lists / Quote requests.
- **Actual:** Returns span lacks `vc-icon--outline`; renders solid SVG viewBox 0 0 20 20.
- Evidence: reports/bugs/screenshots/VCST-6176/vcst-6176-sidebar-before.jpg (DOM check via built-in browser)

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | FAIL | DOM + screenshot |
| 2. Admin | N/A | static icon config |
| 3. xAPI | N/A | |
| 4. REST | N/A | |

## Root Cause
`receipt-refund` (modules/returns/menu.ts:15,30; request-return-button.vue:6) has no outline asset nor alias → `resolveIcon()` outline→solid fallback (ui-kit/utilities/icons.ts).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** ui-kit icon aliases / returns module
- **RCA anchor:** client-app/ui-kit/utilities/icon-aliases.ts (missing receipt-refund)
- **Routing confidence:** HIGH

## Resolution
- **Fixed in:** vc-frontend PR #2544 (unmerged), alias `"receipt-refund": "undo-2"` in `ui-kit/utilities/icon-aliases.ts` + `modules/returns/menu.test.ts`. Build `vc-theme-b2b-vue-2.59.0-pr-2544-3504-350418b7`.
- **Tracker:** VCST-6176
- **Verified:** 2026-10-06, `/qa-verify-fix`, STR 3/3, checklist 9/9 applicable (1 N/A). Local frontend-only storefront `fe-ab8c4e3e2c98` serving the PR build, proxied to the vcst-qa backend.
- **Method:** DOM check (icon class, viewBox, SVG path) on the desktop sidebar (Orders and Returns pages), the mobile menu and the order-page Request return button; RED baseline on vcst-qa `pr-2524`. Evidence: `reports/tickets/Sprint26-20/VCST-6176/evidence.html`.
