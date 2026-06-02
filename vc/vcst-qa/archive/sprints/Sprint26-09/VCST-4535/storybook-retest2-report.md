# VCST-4535 Storybook Re-test 2 Report

**Date:** 2026-05-07
**Build:** `vc-theme-b2b-vue-2.49.0-pr-2261` (Storybook bundle `iframe-BrzTl-6B.js`, `generatedAt: 2026-05-07T10:45:46Z`)
**Prior build under test:** `156bb3bb` (2026-05-06)
**Trigger:** Developer comment by Maya Diachkovskaia (2026-05-07): "Please add fix for accessibility"
**Tester:** ui-ux-expert agent
**Browser:** Chrome DevTools MCP
**Storybook URL:** https://vcst-qa-storybook.govirto.com
**Theme:** Coffee (verified — toolbar shows " Coffee" preset on all stories)

---

## 1. Build Verification

Storybook `project.json` was fetched directly:

```
generatedAt: 1778150746196 → 2026-05-07T10:45:46.196Z
storybookVersion: 9.1.20
framework: @storybook/vue3-vite
```

The Storybook bundle (`iframe-BrzTl-6B.js`) was built today after the developer's fix comment. This is the new build. No version string of the form `vc-theme-b2b-vue-*` is embedded in the Storybook bundle itself (consistent with prior run), but the `generatedAt` timestamp confirms a fresh build on the same date as the fix push.

---

## 2. R1.1 — BUG-2: Space-key activation on `<tr role="button" tabindex="0">` (WCAG 4.1.2)

**Verdict: FAIL — fix NOT applied in this build**

### Source-code evidence (definitive)

The compiled bundle was fetched and searched for the VcTable row `onKeydown` handler. The relevant fragment at the row render call site is:

```js
onKeydown:C2(s2=>Q.value&&V.$emit("rowClick",L,F),["enter"])
```

`C2` is Vue 3's `withKeys()` helper. The modifier array contains only `["enter"]`. Space (`" "`) is absent. This is identical to the prior build (`156bb3bb`). The fix was not applied to the keydown handler.

### Behavioral confirmation

- Dispatched a `KeyboardEvent("keydown", { key: " ", code: "Space" })` to the focused first row.
- "Last clicked" indicator: remained `None` before and after — row did not activate.
- `defaultPrevented`: `false` — page-scroll suppression (preventDefault) is also absent.
- Enter key was not re-tested (confirmed passing in prior run; source code shows `["enter"]` still present).

**Expected fix:** `["enter","space"]` (or equivalent) in the `withKeys` modifier array, plus `preventDefault()` on Space to suppress native scroll.

**WCAG criterion:** 4.1.2 Name, Role, Value — ARIA APG mandate: elements with `role="button"` MUST respond to both Enter and Space.

**Screenshot:** `storybook-screenshots/retest2/r1-1-row-click-space-still-broken.png`

### axe-core result on Row Click story

Axe-core reports **Violations: 0, Passes: 21** on this story. This is structurally correct — axe-core can verify `role="button"` + `tabindex="0"` are present, but cannot detect that the Space keydown handler is missing at runtime. The violation is behavioral, not structural.

**Screenshot:** `storybook-screenshots/retest2/r1-axe-row-click-violations-0.png`

---

## 3. R2 — BUG-A: rowStyle opacity contrast (WCAG 1.4.3)

**Verdict: PASS — fix applied and verified**

### Fix approach

The Row Inline Style story's `rowStyle` function was changed from:

```js
// BEFORE (prior build)
style="opacity: 0.5;"   // opacity dimming pattern
```

to:

```js
// AFTER (new build)
style="color: var(--color-neutral-500); pointer-events: none;"
```

### Computed style evidence — Bob Johnson row (Inactive)

| Property | Value |
|----------|-------|
| `style` attribute | `color: var(--color-neutral-500); pointer-events: none;` |
| Computed `opacity` | `1` (no opacity dimming) |
| Computed `color` | `rgb(115, 115, 115)` = `#737373` |
| Computed `background-color` | `rgba(0, 0, 0, 0)` (transparent) |
| Effective background | `rgb(250, 250, 250)` / `#FAFAFA` (nearest opaque ancestor) |

### Contrast ratio calculation

| Background | Text `rgb(115,115,115)` luminance | BG luminance | Contrast ratio | Passes AA (4.5:1)? |
|-----------|----------------------------------|--------------|----------------|---------------------|
| White `#FFFFFF` | 0.171441 | 1.000000 | **4.74:1** | YES |
| Near-white `#FAFAFA` | 0.171441 | 0.955257 | **4.54:1** | YES |

Both computed backgrounds exceed the 4.5:1 WCAG AA threshold for normal text (14px / weight 400).

The `pointer-events: none` on the Inactive row also prevents interaction, which is the correct UX pattern for visually disabled rows.

### axe-core result on Row Inline Style story

**Violations: 0, Passes: 13** — "No accessibility violations found."

Prior run (build `156bb3bb`) had **3 color-contrast violations** on this story (Bob Johnson name cell, email cell, Inactive badge — all at 3.94:1). All three are now resolved.

**Screenshot:** `storybook-screenshots/retest2/r2-1-rowstyle-contrast-fixed.png`

---

## 4. R3 — AMBIGUOUS 1.4.6: Fixed-column visual separator

**Verdict: RESOLVED — separator implemented via CSS pseudo-elements**

### Finding

The prior build had no separator CSS at all (no `box-shadow`, no `border`, no pseudo-element rules for fixed columns). The new build adds CSS `::after` / `::before` pseudo-element separators on all fixed column variants:

```css
.vc-table__title--fixed--start::after {
  pointer-events: none;
  position: absolute;
  top: 0px; bottom: 0px; right: 0px;
  width: 0.125rem;   /* 2px line */
  background-color: rgb(from var(--color-neutral-300) r g b / var(--tw-bg-opacity, 1));
  content: "";
}

.vc-table__title--fixed--end::before {
  /* mirror of above, left: 0px */
}
/* same rules for .vc-table__cell--fixed--start::after, .vc-table__skeleton-cell--fixed--start::after etc. */
```

This is a design-token-based (`--color-neutral-300`) 2px hairline separator applied to:
- Fixed-left column right edge (`::after`)
- Fixed-right column left edge (`::before`)
- Header cells, data cells, and skeleton cells — all covered

The Sticky Column story viewport (1920px) was wider than the table content (`scrollWidth === clientWidth = 1188px`), so horizontal scroll was not active and the separator was not visually testable via scroll. The CSS rule is present and will render correctly when horizontal overflow occurs. The ambiguity from the prior run is **resolved** — this is now a concrete implementation, not a design intent question.

---

## 5. R5 — Smoke Regression (other VcTable stories)

| Story | Result | Violations | Notes |
|-------|--------|-----------|-------|
| Default | PASS | 0 | 4 columns, 5 data rows, no `role="button"` (correct — no `@row-click`), declarative API renders |
| Sticky Header Container | PASS | 0 | `thead.vc-table__head--sticky` has `position: sticky` confirmed |
| Loading | PASS | 0 | 45 skeleton cells, 0 data rows — correct skeleton state |
| Empty | PASS | 0 | "No items available" empty state renders |
| Sticky Column | PASS | 0 | `position: sticky; left: 0px` on Name column, `z-index: 3` |

**R5 smoke: 5/5 stories pass. Zero console errors observed across all story navigations.**

---

## 6. axe-core Summary

| Story | Prior build violations | New build violations | Delta |
|-------|----------------------|---------------------|-------|
| Row Click | 0 | 0 | — (behavioral bug undetectable by axe) |
| Row Inline Style | 3 (`color-contrast`, WCAG 1.4.3) | **0** | **-3 fixed** |
| Default | 0 | 0 | — |
| Sticky Header Container | 0 | 0 | — |
| Loading | 0 | 0 | — |
| Empty | 0 | 0 | — |
| Sticky Column | 0 | 0 | — |

**Total axe violations across tested stories: 0** (down from 3 in prior run).

---

## 7. Verdict

| Bug | Prior verdict | This run | Outcome |
|-----|--------------|----------|---------|
| **BUG-2** — Space key on `role="button"` rows (WCAG 4.1.2) | FAIL (P2 a11y) | FAIL | NOT FIXED — bundle source shows `withKeys(handler, ["enter"])` only; Space absent; behavioral test confirms no activation, no `preventDefault` |
| **BUG-A** — `rowStyle` opacity contrast 3.94:1 (WCAG 1.4.3) | FAIL (P2 a11y) | **PASS** | FIXED — `opacity: 0.5` replaced with `color: var(--color-neutral-500)`; computed contrast 4.54:1–4.74:1; axe 0 violations |
| **AMBIGUOUS 1.4.6** — Fixed column separator | AMBIGUOUS | **RESOLVED** | Separator implemented via CSS `::after`/`::before` pseudo-elements using `--color-neutral-300` 2px hairline |

### Overall re-test verdict: PARTIAL PASS (1 of 2 bugs fixed)

- BUG-A (WCAG 1.4.3 contrast): FIXED — close this bug, mark as resolved.
- BUG-2 (WCAG 4.1.2 Space key): STILL OPEN — fix was not included in this build. Developer should add `" "` (Space) to the `withKeys` modifier array in the VcTable row `onKeydown` handler and call `event.preventDefault()` to suppress native scroll. Return to Maya Diachkovskaia with this report as evidence.

---

## Evidence Files

| File | Purpose |
|------|---------|
| `storybook-screenshots/retest2/r1-1-row-click-space-still-broken.png` | Row Click story with Space key test — "Last clicked: None" unchanged |
| `storybook-screenshots/retest2/r1-axe-row-click-violations-0.png` | axe-core Violations 0 on Row Click story (structural check only) |
| `storybook-screenshots/retest2/r2-1-rowstyle-contrast-fixed.png` | Row Inline Style — axe Violations 0, Inactive row readable |
| `storybook-screenshots/retest2/r5-smoke-sticky-header-pass.png` | Sticky Header Container story — passes smoke |
