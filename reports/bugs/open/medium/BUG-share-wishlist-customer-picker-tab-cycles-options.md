# Share list Customers picker: tabbing onto it opens the listbox and Tab then cycles options until Escape — [Medium]

**Env:** vcptcore-qa · theme 2.59.0-pr-2476-0604 · 2026-09-29
**Found by:** /qa-test VCST-5707 C1 (REG-2026-09-29-1506, B2C-LIST-057, observed once — keyboard walk, no screenshot) · **Class:** BL-A11Y on a feature ticket → standalone, related to VCST-5707 · **WCAG 2.2:** 2.4.3 Focus Order, 2.1.1 Keyboard · **Archetype:** RENDER

## STR
1. As @td(SR_REP_PRIMARY) open Share → Specific customers.
2. Press Tab from the Link/Copy controls onto the Customers picker, then keep pressing Tab.

## Expected vs Actual
- Expected: Tab moves focus to the picker (listbox stays closed until Enter/ArrowDown/typing); the next Tab leaves it for the next control (Clear / recipients / Message).
- Actual: the listbox opens on focus and Tab moves through its options endlessly; only Escape gets the user out. Keyboard users cannot reach the Message field and Share button without knowing to press Escape.

## Evidence
`reports/regression/REG-2026-09-29-1506/suite-007-cases.jsonl` (B2C-LIST-057 notes). Single observation — re-confirm with a screen recording when triaging.

## Fix Routing
`vc-frontend` multi-select `VcSelect` used by `wishlist-customer-sharing.vue` (PR #2476; the kit component is also touched by VCST-5923).
