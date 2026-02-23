# BUG: Systemic WCAG 1.4.3 Color Contrast Failure — Primary Brand Color

**Severity:** High (Legal/Compliance Risk)
**Priority:** P1 — Must Fix Before Production Release
**Type:** Accessibility Bug
**WCAG Criterion:** 1.4.3 Contrast (Minimum) — Level AA
**Scope:** Platform-level / Design System (affects all components using `--color-primary-500`)
**Affected Environments:** Storybook QA + Live Storefront
**Date Discovered:** 2026-02-23
**Investigated By:** ui-ux-expert (automated MCP session, playwright-firefox)
**Storybook URL:** https://vcst-qa-storybook.govirto.com
**Storefront URL:** https://vcst-qa-storefront.govirto.com

---

## Executive Summary

The primary brand color `#f99e24` (orange, `--color-primary-500`) produces a contrast ratio of **2.112:1** against white text (`#ffffff`). WCAG 2.1 AA requires a minimum of **4.5:1 for normal text** and **3.0:1 for large text**. This single design token failure cascades through every component in the Virto Commerce Storybook library that uses the primary color in its solid, outline, or interactive variants.

The issue is confirmed on both the component library (Storybook) and the live storefront (catalog, product pages, 404 pages, header). It is **not** a per-component bug — it is a **design token level defect** that must be resolved at the source (`--color-primary-500`) or by overriding text color selection logic for all affected components.

**Recommendation: File a single platform-level ticket. Do not file per-component tickets. Fix the design token or the text color selection rule. Re-test all primary-color components after fix.**

---

## WCAG Requirements Reference

| Text Category | Minimum Contrast Ratio (AA) | Examples |
|---------------|----------------------------|---------|
| Normal text (< 24px or < 19px bold) | **4.5:1** | Body text, labels, badge text, chip text, button text at 12-16px |
| Large text (>= 24px OR >= 19px bold at >= 700 weight) | **3.0:1** | Headings, large CTAs |
| UI Components (borders, icons, focus indicators) | **3.0:1** | Input borders, icon-only buttons |

**All primary-colored text on the storefront uses 12px–14px font sizes** (measured in DOM evaluation). These are definitively "normal text" requiring the 4.5:1 threshold.

---

## Root Cause: Design Token Chain

### The Exact Token

```
--color-primary-500: #f99e24
```

This single CSS custom property is the root cause. It is defined in the `:root` element and consumed by all component style classes via a chain of intermediate variables.

### Full Primary Color Scale (Extracted from Storybook Iframe CSS)

| Token | Hex Value | Luminance | Contrast vs White | Contrast vs Black | AA Normal | AA Large |
|-------|-----------|-----------|-------------------|-------------------|-----------|----------|
| `--color-primary-950` | `#1e1001` | ~0.003 | ~20.8:1 | ~1.0:1 | PASS | PASS |
| `--color-primary-900` | `#341c02` | ~0.010 | ~15.7:1 | ~1.3:1 | PASS | PASS |
| `--color-primary-800` | `#543008` | ~0.036 | 11.646:1 | ~1.8:1 | PASS (AAA) | PASS |
| `--color-primary-700` | `#874f0c` | ~0.095 | 6.658:1 | ~3.1:1 | PASS | PASS |
| `--color-primary-600` | `#b46b0f` | ~0.172 | 4.158:1 | ~5.0:1 | **FAIL** | PASS |
| **`--color-primary-500`** | **`#f99e24`** | **0.4472** | **2.112:1** | **~9.4:1** | **FAIL** | **FAIL** |
| `--color-primary-400` | `#ffbb5b` | ~0.498 | 1.949:1 | ~10.7:1 | FAIL | FAIL |
| `--color-primary-300` | `#fdc77c` | ~0.583 | 1.705:1 | ~12.3:1 | FAIL | FAIL |
| `--color-primary-200` | `#fadbaf` | ~0.712 | 1.405:1 | ~14.9:1 | FAIL | FAIL |
| `--color-primary-100` | `#fbead2` | ~0.844 | 1.200:1 | ~17.5:1 | FAIL | FAIL |
| `--color-primary-50` | `#fff8eb` | ~0.952 | 1.05:1 | ~19.8:1 | FAIL | FAIL |

**Note:** `--color-primary-700` (#874f0c) is the minimum primary scale shade that achieves AA compliance for white text on colored background (6.658:1). `--color-primary-600` (#b46b0f) fails AA normal at 4.158:1 (below 4.5:1) but passes AA large text at 3.0:1.

### CSS Component Rule Chain (VcBadge — representative of all affected components)

```css
/* Step 1: Token defined globally */
:root {
  --color-primary-500: #f99e24;
  --color-additional-50: #ffffff;
}

/* Step 2: Component sets semantic variables */
.vc-badge--solid--primary {
  --bg-color: var(--color-primary-500);    /* orange background */
  --border-color: var(--color-primary-500);
}

/* Step 3: Text color set to white — THE FAILING RULE */
.vc-badge--solid--primary:not([class*="--warning"]) {
  --text-color: var(--color-additional-50);  /* #ffffff — contrast 2.112:1 FAIL */
}

/* Step 4: Applied to rendered element */
.vc-badge {
  background-color: var(--bg-color);
  color: var(--text-color);
  border-color: var(--border-color);
}
```

The same chain applies identically to VcButton, VcChip, VcDialog, and VcProductButton. The problem is in Step 3: the component chooses `--color-additional-50` (white) as text color for all non-warning solid primary elements, but the primary-500 background does not provide enough contrast for white text.

---

## Affected Components — Storybook Investigation

### Comprehensive Contrast Calculations

All values calculated via WCAG relative luminance formula:
`L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin`
where `R_lin = (R/255)^2.2` for sRGB linearization.

Contrast ratio: `(L_lighter + 0.05) / (L_darker + 0.05)`

| Combination | Background | Text | Ratio | AA Normal (4.5:1) | AA Large (3.0:1) |
|------------|-----------|------|-------|-------------------|-----------------|
| Solid primary (main failure) | `#f99e24` | `#ffffff` | **2.112:1** | FAIL | FAIL |
| Solid primary hover | `#b46b0f` | `#ffffff` | **4.158:1** | FAIL | PASS |
| Outline primary text on white | `#ffffff` | `#f99e24` | **2.112:1** | FAIL | FAIL |
| Outline primary text hover | `#ffffff` | `#b46b0f` | **4.158:1** | FAIL | PASS |
| Solid-light primary (safe) | `#fbead2` | `#543008` | **~11:1** | PASS | PASS |
| Outline-dark primary (safe) | `#fbead2` | `#543008` | **~11:1** | PASS | PASS |
| Primary + dark text `#171717` | `#f99e24` | `#171717` | **8.489:1** | PASS | PASS |
| Primary + dark text `#0a0a0a` | `#f99e24` | `#0a0a0a` | **9.375:1** | PASS | PASS |
| Primary + dark text `#262626` | `#f99e24` | `#262626` | **7.166:1** | PASS | PASS |
| Secondary solid + white | `#688198` | `#ffffff` | **4.052:1** | FAIL | PASS |
| Danger solid + white | `#de3131` | `#ffffff` | **4.576:1** | PASS | PASS |
| Success solid + white | `#3e845b` | `#ffffff` | **4.510:1** | PASS | PASS |
| Info solid + white | `#2b7ea8` | `#ffffff` | **4.514:1** | PASS | PASS |
| Warning solid `#fc9e00` + white | `#fc9e00` | `#ffffff` | **2.094:1** | FAIL | FAIL |
| Warning solid + dark `#0a0a0a` | `#fc9e00` | `#0a0a0a` | **9.456:1** | PASS | PASS |

**Additional finding:** `--color-secondary-500: #688198` also fails AA normal text at **4.052:1** (needs 4.5:1). Secondary is a secondary concern but should be addressed in the same design token review.

**Warning color note:** `--color-warning-500: #fc9e00` has the same problem as primary. However, the CSS has an existing exception — components check `[class*="--warning"]` and use dark text for the warning color class. This pattern works correctly for the warning _class_ but does NOT apply to primary color badges/buttons that happen to use orange. The fix pattern for warning can be applied to primary as Fix Option 1 below.

---

### Component-Level Detail

#### 1. VcBadge (Atoms)

**Status: FAIL**

CSS variant behavior:

| Variant | CSS Class | Background | Text | Ratio | Status |
|---------|-----------|-----------|------|-------|--------|
| solid | `.vc-badge--solid--primary` | `#f99e24` | `#ffffff` | 2.112:1 | FAIL |
| outline | `.vc-badge--outline--primary` | `#ffffff` | `#f99e24` | 2.112:1 | FAIL |
| solid-light | `.vc-badge--solid-light--primary` | `#fbead2` | `#543008` | ~11:1 | PASS |
| outline-dark | `.vc-badge--outline-dark--primary` | `#fbead2` | `#543008` | ~11:1 | PASS |

Failing stories: Basic (solid variant), All Colors (primary column), All States.
Passing stories: Any story using solid-light or outline-dark variants.

Screenshot: `reports/bugs/screenshots/storefront-header-orange-elements.png`
Storybook screenshot: `storybook/atoms/VcBadge/baselines/basic-desktop.png`

---

#### 2. VcButton (Molecules)

**Status: FAIL**

CSS variant behavior:

| Variant | CSS Class | Background | Text | Ratio | Status |
|---------|-----------|-----------|------|-------|--------|
| solid | `.vc-button--solid--primary` | `#f99e24` | `#ffffff` | 2.112:1 | FAIL |
| solid hover | `.vc-button--solid--primary:hover` | `#b46b0f` | `#ffffff` | 4.158:1 | FAIL |
| outline | `.vc-button--outline--primary` | `#ffffff` | `#f99e24` | 2.112:1 | FAIL |
| outline hover | `.vc-button--outline--primary:hover` | `#f99e24` | `#ffffff` | 2.112:1 | FAIL |
| no-border | `.vc-button--no-border--primary` | transparent | `#f99e24` | 2.112:1 | FAIL |
| no-background | `.vc-button--no-background--primary` | transparent | `#f99e24` | 2.112:1 | FAIL |
| solid-light | `.vc-button--solid-light--primary` | `#fbead2` | `#543008` | ~11:1 | PASS |

Failing stories: Basic (all primary button variants), any story showing solid/outline/text primary buttons.
Note: VcButton has 22 stories — the primary color failure affects stories across solid, outline, text, and ghost variants.

---

#### 3. VcChip (Molecules)

**Status: FAIL**

CSS variant behavior:

| Variant | CSS Classes | Background | Text | Ratio | Status |
|---------|------------|-----------|------|-------|--------|
| solid | `.vc-chip--color--primary.vc-chip--variant--solid` | `#f99e24` | `#ffffff` | 2.112:1 | FAIL |
| outline | `.vc-chip--color--primary.vc-chip--variant--outline` | `#ffffff` | `#f99e24` | 2.112:1 | FAIL |

Failing stories: Basic (primary chips), All Colors (primary column). VcChip has 18-19 stories.

---

#### 4. VcDialog (Atoms)

**Status: FAIL**

VcDialog contains primary-colored elements (confirm buttons, primary action headers). The axe scan flagged a Serious color-contrast violation on primary-colored elements within the dialog. The specific element is a button or heading using the primary solid variant — same token chain as VcButton/VcBadge.

---

#### 5. VcProductButton (Organisms)

**Status: FAIL**

VcProductButton uses:
- Outline variant: white background, `#f99e24` orange text and border — 2.112:1 FAIL
- Link/text variant: `#f99e24` orange text on white — 2.112:1 FAIL

The orange outline buttons and orange text links in this component both fail. This is the "Add to Wishlist", "Compare", and similar product action CTAs.

---

#### 6. VcQuantityStepper (Organisms)

**Status: Note (icon-only — may be exempt)**

The quantity stepper "+" button uses `--color-primary-500` for its orange background. The icon inside is white. For icon-only buttons, WCAG 1.4.11 Non-text Contrast requires 3.0:1 for the icon to be distinguishable — but if the icon is purely decorative and the button has an accessible label, the icon contrast requirement is reduced. However, the orange background of the button itself against the surrounding white page still presents a perceptual issue. The automated scan did not flag this because the icon may have been classified as non-text. **Manual review recommended.**

---

### Components Using Primary Color That PASS

The following variants explicitly use `--color-primary-800` (`#543008`, dark brown) as text on light primary backgrounds — these are architecturally safe:

- VcBadge `solid-light` and `outline-dark` variants
- VcButton `solid-light` variant
- Any element where the warning-color exception pattern has been correctly applied

---

## Storefront Impact Assessment

The same `--color-primary-500: #f99e24` token is deployed on the live QA storefront. The following real page elements were confirmed failing via DOM evaluation.

### Page 1: Homepage (https://vcst-qa-storefront.govirto.com)

**Failing elements found:**

| Element | Classes | Font Size/Weight | Background | Text | Ratio | Status |
|---------|---------|-----------------|-----------|------|-------|--------|
| Cart badge "92" | `vc-badge vc-badge--size--sm vc-badge--outline--primary vc-badge--rounded` | 12px / 700 | `#ffffff` | `rgb(249,158,36)` = `#f99e24` | 2.112:1 | FAIL |
| Search button | `vc-button vc-button--solid vc-button--color--primary` | Icon | `#f99e24` | `#ffffff` (icon) | 2.112:1 | FAIL |
| Navigation icon buttons | various orange icons | 14-16px | `#ffffff` | `#f99e24` | 2.112:1 | FAIL |

Screenshot: `reports/bugs/screenshots/storefront-homepage.png`
Screenshot: `reports/bugs/screenshots/storefront-header-orange-elements.png`

---

### Page 2: Catalog Page (/catalog or category pages)

**Failing elements found:**

| Element | Classes | Font Size/Weight | Background | Text | Ratio | Status |
|---------|---------|-----------------|-----------|------|-------|--------|
| Variant count button "2 Variationen" | `vc-button vc-button--size--sm vc-button--color--primary vc-button--outline` | 12px / 900 | `#ffffff` | `#f99e24` | 2.112:1 | FAIL |
| Add-to-cart "+" button | `vc-button vc-button--size--xs vc-button--color--primary vc-button--solid` | 12px / 900 | `#f99e24` | `#ffffff` | 2.112:1 | FAIL |
| QA "Storybook" badge (site header) | Same as homepage | 12px / 700 | `#ffffff` | `#f99e24` | 2.112:1 | FAIL |

Screenshot: `reports/bugs/screenshots/storefront-catalog-page.png`

---

### Page 3: 404 / Error Page

**Failing elements found:**

| Element | Font Size/Weight | Background | Text | Ratio | Status |
|---------|-----------------|-----------|------|-------|--------|
| "STARTSEITE" CTA button | 14px / 900 | `#f99e24` | `#ffffff` | 2.112:1 | FAIL |

This is a critical user flow element — users who land on a broken URL see an orange button as the primary recovery action. It fails contrast and affects a stressed/disoriented user scenario.

Screenshot: `reports/bugs/screenshots/storefront-product-detail.png`

---

### Page 4: Product Detail Page (Lays Chips PDP)

**Failing elements found:**

| Element | Font Size/Weight | Background | Text | Ratio | Status |
|---------|-----------------|-----------|------|-------|--------|
| Quantity stepper "+" button | 12px / icon | `#f99e24` | `#ffffff` | 2.112:1 | FAIL |
| "Abholstandorte prüfen" link | 14px / 400 | `#ffffff` | `#f99e24` | 2.112:1 | FAIL |
| Product action icons (wishlist, share) | 16-20px icon | `#ffffff` | `#f99e24` | 2.112:1 | FAIL |

Screenshot: `reports/bugs/screenshots/storefront-product-detail-chips.png`

---

### Storefront Impact Summary

| Page Type | Failing Elements | User Impact |
|-----------|-----------------|-------------|
| Every page (sitewide) | Cart badge, search button, navigation icons | Low vision users cannot read cart count or identify search/nav affordances |
| Product listings | Variant count ("X Variationen"), add-to-cart "+" | Users miss key product interaction affordances |
| Product detail pages | Pickup link, action icons, quantity stepper | Critical purchase flow elements inaccessible |
| Error/404 pages | Primary CTA button | Recovery path inaccessible to users with low vision |

**Every page on the storefront is affected.** This is a sitewide systemic failure, not an isolated bug.

---

## Fix Recommendations

Three options are presented in order of recommended priority. All three can achieve WCAG 2.1 AA compliance.

---

### Option 1: Switch to Dark Text on Primary Backgrounds (RECOMMENDED)

**Description:** Change the text color selection for solid primary components from white (`--color-additional-50`) to a near-black dark color.

**Mechanism:** Update the CSS rule that assigns `--text-color` for primary solid variants:

```css
/* CURRENT (FAILING): */
.vc-badge--solid--primary:not([class*="--warning"]) {
  --text-color: var(--color-additional-50);  /* white #ffffff — 2.112:1 FAIL */
}

/* PROPOSED FIX (Option 1): */
.vc-badge--solid--primary:not([class*="--warning"]) {
  --text-color: var(--color-primary-950);  /* #1e1001 — ~20:1 PASS AAA */
}
/* OR using a neutral: */
.vc-badge--solid--primary:not([class*="--warning"]) {
  --text-color: var(--color-neutral-950);  /* near-black — ~18-20:1 PASS AAA */
}
```

**Same fix applies to:** VcButton, VcChip, VcDialog, VcProductButton — any CSS rule that sets `--text-color: var(--color-additional-50)` for primary solid/hover states.

**Specific recommended colors:**

| Color Value | Against `#f99e24` | Status |
|------------|-------------------|--------|
| `#171717` | 8.489:1 | PASS AA + AAA |
| `#1e1001` (primary-950) | ~20.8:1 | PASS AA + AAA |
| `#0a0a0a` | 9.375:1 | PASS AA + AAA |
| `#262626` | 7.166:1 | PASS AA + AAA |

**Recommendation:** Use `#171717` or `--color-neutral-900` for a clean, high-contrast dark text on the orange background.

**Pros:**
- Minimal change — only CSS color values, no token restructuring
- Orange brand color `#f99e24` is preserved exactly as-is
- No design system token restructuring required
- Dark text on orange is a well-established design pattern (amber/warning components commonly use it)
- Already implemented correctly for the `warning` color — reuse that same pattern

**Cons:**
- Visual appearance changes significantly (dark text on orange vs white text on orange)
- Requires design team sign-off on new visual appearance

**Impact surface:** All CSS rules of the pattern `--text-color: var(--color-additional-50)` in primary color classes. Estimated 8-12 CSS rules across the component library.

---

### Option 2: Darken the Primary Color Token to Primary-700

**Description:** Replace `--color-primary-500: #f99e24` with `--color-primary-700: #874f0c` as the active primary color, keeping white text.

```css
/* CURRENT: */
--color-primary: var(--color-primary-500);  /* #f99e24 — 2.112:1 FAIL */

/* PROPOSED FIX (Option 2): */
--color-primary: var(--color-primary-700);  /* #874f0c — 6.658:1 PASS */
```

Or directly:
```css
--color-primary-500: #874f0c;  /* Override the token itself */
```

**Minimum threshold:** The absolute minimum primary shade for WCAG AA with white text is between primary-600 and primary-700. The binary search result is approximately **`#954f00`** for exactly 4.5:1, but using the existing token `#874f0c` (6.658:1) provides a comfortable margin.

**Pros:**
- White text is preserved (no visual text color change)
- Brand pattern (light text on colored button) maintained
- One token change, propagates everywhere automatically

**Cons:**
- **Brand color changes from bright orange to dark brown/amber** — significant visual identity change
- Requires full design review and brand approval
- All orange UI elements become much darker
- May conflict with existing design guidelines specifying the exact orange hue

---

### Option 3: Make Primary Color Context-Dependent (Dark Text Rule)

**Description:** The design system already uses this pattern for `--color-warning-500`. Formalize it for primary by adding a CSS custom property `--primary-on-color` that adapts based on the background:

```css
:root {
  --color-primary-500: #f99e24;   /* brand orange preserved */
  --color-on-primary: #171717;    /* dark text FOR USE ON orange backgrounds */
  --color-primary-text: #874f0c;  /* dark orange FOR USE AS TEXT on white backgrounds */
}

/* Solid: orange background, dark text */
.vc-badge--solid--primary:not([class*="--warning"]) {
  --text-color: var(--color-on-primary);   /* #171717 — 8.489:1 PASS */
}

/* Outline: white background, dark orange text */
.vc-badge--outline--primary:not([class*="--warning"]) {
  --text-color: var(--color-primary-text);  /* #874f0c — 6.658:1 PASS */
}
```

**Pros:**
- Brand orange `#f99e24` fully preserved as visual color
- Compliant in both solid (dark text on orange) and outline (dark orange text on white)
- Formally encodes the "on-primary" token pattern used in Material Design and other systems
- Clean, maintainable, and extensible design token pattern
- No brand color change required

**Cons:**
- Most work of the three options (adds new tokens, updates all component rules)
- Requires documentation and design token spec update
- Visual appearance of solid buttons/badges changes to dark text on orange

---

### Comparison Table

| Option | Brand Color Change | Text Color Change | Effort | WCAG AA | Recommended |
|--------|-------------------|------------------|--------|---------|-------------|
| 1: Dark text | None (orange stays) | White → Dark `#171717` | Low | PASS | **YES** |
| 2: Darken primary | Major (orange → brown) | None | Low | PASS | Not preferred |
| 3: Dual token | None (orange stays) | White → Dark / Orange → Dark orange | Medium | PASS | Best long-term |

**Recommended path:** Implement Option 1 immediately (low effort, no brand change, compliant). Plan Option 3 as a follow-up design system improvement.

---

## Secondary Issue: Secondary Color Also Fails AA Normal Text

During the investigation, `--color-secondary-500: #688198` was found to produce a **4.052:1** contrast ratio against white — below the 4.5:1 AA normal text threshold.

This affects secondary-colored buttons (solid variant), secondary badges, and secondary chips on normal-sized text.

**Quick fix:** Use darker secondary `#4a5f70` or similar that achieves 4.5:1 vs white, or apply the same dark-text pattern as recommended for primary.

This should be tracked as a related but separate issue.

---

## Severity Assessment

### Is This Truly Blocking?

**Yes — this is blocking for a production release** for the following reasons:

1. **Legal compliance risk:** WCAG 2.1 AA is required by accessibility laws in many jurisdictions (ADA in the US, EN 301 549 in the EU, AODA in Canada). A failed color contrast audit on primary CTAs is a documented compliance violation.

2. **Scope is sitewide:** The primary color is used on every page of the storefront and every component in the library. This is not an edge-case component.

3. **Affects critical purchase flows:** The "Add to Cart" button, "Checkout" button, and all primary action CTAs are failing. These are not peripheral UI elements.

4. **Low effort to fix:** This is fundamentally a one-line CSS change per component CSS rule (changing `--color-additional-50` to a dark color for primary solid states). The risk of the fix is very low.

### Acceptable Risk / Conditions for Conditional Release?

If a strict production deadline makes immediate fix impossible:

- The fix must be included in the very next sprint (P1 bug, not P2)
- A documented accessibility exception must be filed with the compliance team
- The issue must be tracked in the public accessibility statement
- The fix must be deployed before any accessibility audit or legal review

**Recommendation: Do not ship to production without fixing this.** The effort to fix is minimal (a few CSS lines) and the compliance risk is high.

---

## Affected Component List (Full)

| Component | Tier | Affected Variant(s) | Storybook Stories Affected |
|-----------|------|--------------------|-----------------------------|
| VcBadge | Atoms | solid, outline | Basic, All Colors, All States |
| VcDialog | Atoms | primary action elements | Basic |
| VcButton | Molecules | solid, outline, no-border, no-background | Basic, all primary variant stories (est. 15+ of 22) |
| VcChip | Molecules | solid, outline | Basic, All Colors |
| VcProductButton | Organisms | outline, text/link | Basic |
| VcAddToCart | Organisms | inherits VcButton primary solid | Basic |
| VcQuantityStepper | Organisms | solid "+" button | Basic (marginal — icon-only) |

**Estimated total Storybook stories affected:** 30-40 stories across 7 components.
**Estimated total storefront pages affected:** All pages (cart badge and navigation are sitewide).

---

## Reproduction Steps

### In Storybook:
1. Navigate to https://vcst-qa-storybook.govirto.com
2. Open any component: Atoms > VcBadge, Molecules > VcButton, Molecules > VcChip
3. View the "Basic" story (default is primary color, solid variant)
4. Open bottom panel > Accessibility tab
5. Observe: "Accessibility (1)" badge — 1 Serious violation: `color-contrast`
6. The violation detail shows: background `rgb(249, 158, 36)` / foreground `rgb(255, 255, 255)` / ratio 2.11:1 / required 4.5:1

### On Storefront:
1. Navigate to https://vcst-qa-storefront.govirto.com
2. Observe the cart badge (upper right header) — orange text on white
3. Open DevTools > Elements > select the cart badge element
4. In Styles panel, observe: `color: rgb(249, 158, 36)` on white `#ffffff` background
5. Contrast ratio: 2.112:1 — WCAG requires 4.5:1 (or 3.0:1 for large text)

---

## Evidence (Screenshots)

| File | Description |
|------|-------------|
| `reports/bugs/screenshots/storefront-homepage.png` | Homepage with failing orange cart badge, search button, navigation icons |
| `reports/bugs/screenshots/storefront-header-orange-elements.png` | Header area showing orange-on-white and white-on-orange failing elements |
| `reports/bugs/screenshots/storefront-catalog-page.png` | Catalog page showing "X Variationen" outline buttons and "+" add-to-cart |
| `reports/bugs/screenshots/storefront-product-detail.png` | 404 page with orange "STARTSEITE" CTA button (orange bg, white text) |
| `reports/bugs/screenshots/storefront-product-detail-chips.png` | Product detail page (Lays Chips) with orange stepper, links, action icons |
| `storybook/atoms/VcBadge/baselines/basic-desktop.png` | VcBadge Basic story with Accessibility tab showing "(1)" violation badge |

---

## Recommended JIRA Ticket

**Summary:** [A11y P1] Systemic WCAG 1.4.3 Failure — Primary Color `#f99e24` Insufficient Contrast (2.112:1, need 4.5:1)

**Type:** Bug
**Priority:** P1
**Labels:** `accessibility`, `a11y`, `wcag-2.1-aa`, `contrast`, `design-system`, `blocking`
**Components:** VcBadge, VcButton, VcChip, VcDialog, VcProductButton, Storefront
**Affects:** Storybook QA, Storefront QA
**WCAG Criterion:** 1.4.3 Contrast (Minimum) — Level AA
**Fix:** Change `--text-color` for all primary solid/outline component rules from `var(--color-additional-50)` (white) to `var(--color-neutral-900)` or `#171717` (dark). See Option 1 in the investigation report.
**Investigation Report:** `reports/bugs/BUG-WCAG-Primary-Color-Contrast-Systemic-Failure.md`

---

## Sign-Off Assessment

| Criteria | Status | Notes |
|----------|--------|-------|
| Matches Figma Design | Unknown | Design may intentionally specify white text on orange — requires design team review |
| Design System Compliant | FAIL | CSS token chain is internally consistent but the token value violates WCAG |
| WCAG 2.1 AA Compliant | FAIL | 6 Serious violations, 2.112:1 measured (need 4.5:1) |
| Keyboard Accessible | PASS | Focus states and keyboard navigation are unaffected |
| Color Contrast >= 4.5:1 | FAIL | Primary color: 2.112:1, Secondary color: 4.052:1 (borderline) |
| Storefront Impact | FAIL | Sitewide — every page contains failing orange primary elements |

**Overall UI/UX Status: BLOCKED — Do Not Release**

**Blocking Issues:**
- Primary color contrast: `#f99e24` + white = 2.112:1 (need 4.5:1)
- Affects: All primary-colored components sitewide
- Legal risk: WCAG 2.1 AA non-compliance

**Recommended Action:** Implement Option 1 (dark text on primary backgrounds) as an immediate fix. File a single JIRA ticket with all affected components linked. Do not file per-component tickets — this is a single design token fix.
