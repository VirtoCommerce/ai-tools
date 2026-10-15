# BUG: "All products" mega-menu trigger narrows 12 px after first load and shifts the header nav

## Status: CONFIRMED (measured), not filed — below the /qa-test severity floor

**Severity: Low** (P3, BL-UI-003 layout stability; cosmetic, one-time per page load). Found incidentally during `/qa-test VCST-5817` (checklist B12) — OUT-OF-SCOPE, PRE-EXISTING (`mega-menu.vue` is not in PR #2522).

**Env:** http://localhost = vc-frontend PR #2522 build `2.60.0-pr-2522-6f90-6f902c9e`, API vcst-qa, store B2B-store, Chrome 1920×1080, anonymous.

## Summary
On a cold page load the header "All products" popover trigger (`DIV.vc-popover`) renders 134×40 px, then settles at 122×30 px. Everything laid out after it moves left by 12 px: `UL.mega-menu__nav` 198.2 → 186.2, `DIV.mega-menu__divider` 182 → 170. Chrome records a layout shift (`hadRecentInput: false`, value 0.00014) with those two nodes as sources. SPA navigations afterwards do not move them.

## Steps to Reproduce
1. Fresh browser context, 1920×1080, register `PerformanceObserver({type:'layout-shift', buffered:true})` before load.
2. Open `{{FRONT_URL}}/printers`.
3. Read the layout-shift entries and `getBoundingClientRect()` of `DIV.vc-popover` (the "All products" trigger) and `UL.mega-menu__nav`.

**Expected (BL-UI-003):** the trigger's loading state and its settled state occupy the same box; nothing beside it moves.
**Actual:** trigger 134 → 122 px; nav and divider shift 12 px left in one frame.

## Root Cause Analysis (hypothesis, not confirmed in source)
`client-app/shared/layout/components/header/_internal/mega-menu.vue` (~l.25–27) renders `<VcLoader>` while `loading` and swaps it for `<VcIcon class="size-4">` (16 px); the two differ in box size. Fix direction: give the loader the same `size-4` box as the icon.

## Related
- This is the co-movement VCST-5817's description attributed to the search bar; `/qa-test VCST-5817` showed the nav is constant across SPA transitions and only moves on first load.
- `reports/bugs/rejected/BUG-account-missions-cls-0219-from-shared-chrome.md` (VCST-5837, rejected) — read before filing.
- `reports/bugs/open/**/BUG-layout-cls-images-missing-dimensions.md` lists `ul.mega-menu__nav` as a contributor.
- Evidence: checklist row B12 in `reports/tickets/Sprint26-20/VCST-5817/testing-checklist.md` (numeric layout-shift entry; no screenshot — a settled screenshot shows nothing).

## Fix Routing
Owning layer: Layer 1 — Storefront · Repo: `VirtoCommerce/vc-frontend` (frontend) · Anchor: `mega-menu.vue` · Confidence: LOW (hypothesis).
