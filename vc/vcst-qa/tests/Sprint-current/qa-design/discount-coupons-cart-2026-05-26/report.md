# /qa-design — Discount & coupons section on /cart

**Date:** 2026-05-26
**Target type:** Page section (off-matrix; no Storybook story for CouponCard)
**Target:** `.coupon-card` instances inside the "Discount & coupons" sidebar widget on `/cart`
**Storefront URL:** https://vcst-qa-storefront.govirto.com/cart
**Build:** `vc-theme-b2b-vue-2.50.0-pr-2303-cc2d-cc2ddcdb` (PR #2303)
**Browser:** Chrome DevTools MCP
**Viewports:** 1280 / 768 / **true** 375 (device emulation, not CDP min)
**States exercised:** default · applied (FIXED5) · error ("This code is not valid")

## Invariant Results

| ID | Invariant | Result | Viewports | State scope |
|----|-----------|--------|-----------|-------------|
| F-01 | BL-UI-002 spacing-grid | **FAIL** | all | all |
| F-02 | BL-UI-005 alignment | **FAIL** | all | all |
| F-03 | BL-UI-006 touch targets | **FAIL** | ≤ 768 | all |
| F-04 | BL-UI-003 state-shift (default → applied) | PASS | all | — |
| F-05 | BL-UI-003 state-shift (default → error) | PASS | all | — |
| F-06 | BL-UI-004 overflow | PASS | all | all |

## Findings

### F-01 — BL-UI-002 Off-grid spacing — FAIL (all viewports, all states)
Card `padding: 10px`; VcInput container `padding: 2px`. Neither value is on the 4/8/12/16 spacing grid. Consistent across all 5 cards and all viewports — single source.

### F-02 — BL-UI-005 Icon/content misalignment — FAIL (all viewports, all states)
`.coupon-card` flex container uses `align-items: normal`. Icon is fixed 48 × 48 px; content column grows with label wrapping (92–126 px). Vertical-center drift between icon and content:
- 1-line label (default, applied): **22 px**
- Wrapped label (768 px sidebar, "Coupon on discount for shipping"): **up to 39 px**
- Error state: drift narrows to **12 px** (content expands to fit error text — incidental, only on Custom-code card)

State-agnostic — applied state shows the same 22 px drift as default.

**Single-line fix:** `align-items: center` on `.coupon-card` flex row.

### F-03 — BL-UI-006 Touch targets — FAIL (≤ 768 px, all states)
At true 375 px and at 768 px:
- 5 inputs: height **24 px** (meets WCAG 2.5.8 min 24, fails BL-UI-006 recommended 44)
- 5 apply/remove buttons: **26 × 26 px** (same — meets WCAG min, fails BL-UI-006 44)
- Input-to-button gap: **1 px** (BL-UI-006 threshold ≥ 8 px)

Driven by `vc-button--size--xxs` design-system class — component-level constraint, not a one-off override.

### F-04 / F-05 — BL-UI-003 State-shift — PASS
- default → applied (FIXED5): all 5 cards held position (Δtop=0, Δleft=0; gap stays 12 px)
- default → error: error card height grew 76→94 px; cards above held position; gap preserved

### F-06 — BL-UI-004 Overflow — PASS
`scrollWidth` ≤ `innerWidth` at every viewport; no horizontal scroll; no clipped labels.

## Cross-state / Cross-viewport diagnosis

| Defect | Lives in | Fix locus |
|--------|----------|-----------|
| F-01 spacing | `coupon-card.vue` `<style>` block (`p-2.5` Tailwind class → 10 px) | Component |
| F-02 alignment | `coupon-card.vue` flex root — missing `align-items` | Component |
| F-03 touch targets | `vc-button--size--xxs` design token + VcInput xs height | Design system (cross-component) |

F-02 is the most impactful and the cheapest to fix (one CSS line).

## Notes / context-specific observations

- Applied-state was now exercisable after the user removed a disabled product from the cart. xAPI `addItem` silently no-ops on `Disabled` inventory — relevant to test seed health, not this audit.
- Error-state on Custom-code card partially self-corrects alignment because the content column grows to fit the error text. Named coupons with longer content stay broken at 22–39 px drift in error state.
- 768 px is the worst viewport for F-02 (sidebar narrows to 214 px → labels wrap → drift up to 39 px). 1280 px keeps wrap drift contained because sidebar is 246 px wide. True 375 px sidebar takes full width, no wrap, drift is the baseline 22 px.

## Off-matrix recommendation

CouponCard is not in [critical-ui-scope.md](../../../../.claude/agents/knowledge/critical-ui-scope.md) and has no Storybook story.

1. Add a `VcCouponCard` Storybook story with **default · applied · error · long-label** variants — would have caught F-02 in isolation.
2. Promote CouponCard to critical-ui-scope.md so 002/003/005/006 are regression-enforced.
3. Defects F-01, F-02, F-03 will silently re-regress without #1 + #2.

## Evidence

- `storefront/1280px/applied-state-1280px.png` — applied (FIXED5) confirmed
- `storefront/1280px/FAIL-BL-UI-005-error-state-alignment-1280px.png`
- `storefront/1280px/FAIL-BL-UI-005-icon-content-misalignment.png`
- `storefront/768px/FAIL-BL-UI-005-wrapped-labels-768px.png`
- `storefront/375px/FAIL-BL-UI-005-BL-UI-006-375px-true.png`
