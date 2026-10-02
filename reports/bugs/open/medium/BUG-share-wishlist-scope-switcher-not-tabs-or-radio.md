# Share list "Who can access" switcher implements neither the tabs nor the radio pattern — [Medium]

**Env:** vcptcore-qa · theme 2.59.0-pr-2476-0604 · playwright-edge · 2026-09-29
**Found by:** /qa-test VCST-5707 (3x, 4v) · **Class:** BL-A11Y on a feature ticket → standalone, related to VCST-5707 · **WCAG 2.2:** 4.1.2 Name, Role, Value; 2.1.1 Keyboard · **Archetype:** RENDER

## STR
1. As @td(SR_REP_PRIMARY) open Share on a list.
2. Tab into "Who can access" (Private / My organization / Specific customers / Anyone with link); press ArrowLeft/ArrowRight; inspect the accessibility tree.

## Expected vs Actual
- Expected: a single-select choice exposed as a tablist (arrow keys move, one Tab stop) or a radio group (Figma mobile frame 83043 draws radios).
- Actual: a `group` of four `button[aria-pressed]`, each its own Tab stop; arrow keys do nothing. The accessible name also embeds the state ("Private, selected") while `aria-pressed` states it again — likely announced twice (screen-reader check not performed).

## Evidence
`reports/tickets/Sprint26-19/VCST-5707/design-report.md` (Tab switcher semantics); `screenshots/4v-share-private-1920.png`, `4v-share-specific-375.png`.

## Fix Routing
`vc-frontend` `VcTabSwitch` as used by `share-wishlist-modal.vue` (PR #2476) — likely a shared UI-kit component, so the fix may belong in the kit.
