# VCST-4535 Re-test Checklist (Fix Verification)

**Build:** `vc-theme-b2b-vue-2.49.0-pr-2261-79f5-79f53122` (NEW — bumped from `156bb3bb`)
**Date:** 2026-05-07
**PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2261
**Prior verdict:** PASS_WITH_NOTES (2 outstanding P2 a11y bugs)
**Trigger:** Developer (Maya Diachkovskaia) confirmed fix in comment 96905 (2026-05-07): "please check updated orders table as well"

---

## In Scope (Fix Verification)

### R1. BUG-2 — Space key activation on `<tr role="button" tabindex="0">` (WCAG 4.1.2)

**Prior failure:** Tab to a row → press **Space** → no activation. Only **Enter** opened the order detail.

**Fix expectation:** Space key should activate the row identically to Enter (open detail in a new tab via `window.open(_blank)`).
ARIA APG mandate: any `role="button"` MUST respond to BOTH Enter and Space.

#### R1.1 Storybook "Row Click" story
- [ ] **R1.1.1** Open `https://vcst-qa-storybook.govirto.com/?path=/story/components-organisms-vctable--row-click&globals=themePreset:coffee`
- [ ] **R1.1.2** Click into iframe canvas, Tab until first row gains visible focus ring
- [ ] **R1.1.3** Press **Space** → row activates (callback fires / new tab opens / Storybook Actions panel logs `row-click`)
- [ ] **R1.1.4** Verify `preventDefault()` was called (page does NOT scroll on Space)
- [ ] **R1.1.5** Press **Enter** on the same row → identical behavior to Space (regression check)
- [ ] **R1.1.6** Inspect computed listener — confirm both `Enter` and `' '` (Space) handled in keydown
- [ ] **R1.1.7** Run axe-core on the story → no WCAG 4.1.2 / "name-role-value" violations on `<tr role="button">`

#### R1.2 Storefront `/account/orders` (real consumer surface)
- [ ] **R1.2.1** Sign in to `https://vcst-qa-storefront.govirto.com` as TechFlow B2B user
- [ ] **R1.2.2** Navigate to `/account/orders`, verify orders table renders (>=1 row)
- [ ] **R1.2.3** Inspect first row `<tr>` — confirm `role="button"` and `tabindex="0"` still present
- [ ] **R1.2.4** Tab focus to first order row → visible focus ring
- [ ] **R1.2.5** Press **Space** → opens order detail in new tab via `window.open(_blank)` (by-design new-tab)
- [ ] **R1.2.6** Press **Enter** on next row → same new-tab behavior
- [ ] **R1.2.7** Confirm Space did NOT scroll the page (preventDefault working)
- [ ] **R1.2.8** Click row with mouse → still works (regression check on click handler)
- [ ] **R1.2.9** axe-core scan on `/account/orders` → no new violations vs prior baseline

### R2. BUG-A — rowStyle `opacity: 0.5` contrast violation (WCAG 1.4.3)

**Prior failure:** "Row Inline Style" story used opacity-dimming pattern → effective text color `#808080` over white = 3.94:1 ratio (below AA 4.5:1). axe-core flagged 3 elements.

**Fix expectation:** Inactive/disabled-row pattern uses a higher-contrast token (e.g., `text-neutral-600`) instead of opacity dimming, OR opacity raised to a level that meets AA. Computed contrast must be ≥4.5:1 for normal text.

#### R2.1 Storybook "Row Inline Style" story
- [ ] **R2.1.1** Open `https://vcst-qa-storybook.govirto.com/?path=/story/components-organisms-vctable--row-inline-style&globals=themePreset:coffee`
- [ ] **R2.1.2** Visually compare "Inactive" row (Bob Johnson) vs prior screenshot — text should be more readable
- [ ] **R2.1.3** Inspect computed style on dimmed row name cell, email cell, "Inactive" badge
  - Capture: `color`, `opacity`, `background-color`
- [ ] **R2.1.4** Compute effective contrast ratio (apply opacity if any) → must be ≥ 4.5:1
- [ ] **R2.1.5** Run axe-core on the story → 0 violations on `color-contrast` rule
- [ ] **R2.1.6** Capture screenshot for evidence: `storybook-screenshots/retest2/2-1-rowstyle-contrast-fixed.png`

### R3. AMBIGUOUS 1.4.6 — Fixed-column visual separator on Coffee theme

**Prior status:** No `box-shadow` found in computed styles on Coffee theme — design intent unclear.

#### R3.1 Storybook "Fixed Columns" story
- [ ] **R3.1.1** Open the Fixed Columns / Sticky Column story for VcTable
- [ ] **R3.1.2** Inspect computed style on the fixed column edge → look for any `box-shadow`, `border-right`, or `clip-path` indicating a separator
- [ ] **R3.1.3** Resize/scroll horizontally → confirm fixed column still renders correctly with reasonable visual separation
- [ ] **R3.1.4** If still no separator, mark as **N/A — design intent confirmed** (not blocking)

## Regression Sweep (orders.vue surface uses new declarative API)

PR description: "`orders.vue` migrates desktop rendering to `VcTableColumn` and uses `@row-click`". Need a quick regression to confirm no functional regressions vs the prior 156bb3bb test.

### R4. orders.vue regression
- [ ] **R4.1** Orders table renders all expected columns (Order # | Date | Status | Total | etc.)
- [ ] **R4.2** Order numbers in list = order detail URL (BL-ORD-005 invariant)
- [ ] **R4.3** Status labels render as human-readable text (BL-ORD-001 invariant)
- [ ] **R4.4** Mouse click on row → opens order detail in new tab (by-design)
- [ ] **R4.5** Ctrl+click / middle-click → opens new tab (by-design)
- [ ] **R4.6** Sticky header (if applicable) renders on scroll
- [ ] **R4.7** Empty-state rendering when no orders (filter to nothing)
- [ ] **R4.8** Browser console — no errors / Vue warnings on the page
- [ ] **R4.9** Network — orders GraphQL request returns successfully

### R5. Storybook smoke (other VcTable stories)
- [ ] **R5.1** "Default" story renders with both legacy `columns` prop AND new `<VcTableColumn>` API (backward-compat)
- [ ] **R5.2** "Sticky Header" story scrolls correctly with header pinned
- [ ] **R5.3** "Custom Cell Slot" story renders custom slot content
- [ ] **R5.4** "Empty State" / "Loading" stories render their respective states
- [ ] **R5.5** No console errors across stories

---

## Out of Scope

- Admin SPA — VcTable is a storefront-only component (vc-frontend)
- Backend / API — purely frontend change
- Cross-browser (Edge) — Firefox + Chrome covered in prior + this run
- Other VcTable consumers (addresses.vue, quotes.vue, members.vue, etc.) — already verified clean in prior consumer-regression-sweep, no signal that they were touched

## Verdict Decision Tree

| Outcome | Verdict |
|---|---|
| R1 + R2 PASS, R3 N/A or PASS, R4/R5 clean | **PASS** — fix verified, ready to TESTED |
| R1 PASS, R2 partial (contrast better but still <4.5:1), R3 N/A | **PASS_WITH_NOTES** — keep BUG-A open at lowered severity |
| R1 FAIL OR R2 FAIL (no contrast improvement) | **FAIL** — return to dev with regression evidence |
| Build mismatch / Storybook down | **BLOCKED** |

## Evidence Capture

Per `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md`:
- Screenshots: keyboard focus state + computed style panel + axe-core panel for each P2 a11y check
- Console messages: capture warnings/errors during interaction
- HAR: capture orders.vue page load
- Output dir: `tests/Sprint-current/VCST-4535/storybook-screenshots/retest2/` and `tests/Sprint-current/VCST-4535/screenshots/retest2/`
