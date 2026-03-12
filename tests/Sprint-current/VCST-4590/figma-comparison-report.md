# Figma Design Comparison Report — VCST-4590
## Coupons & Vouchers Page

**Ticket:** VCST-4590 — [Marketing] Coupons and Vouchers Page
**Figma File:** STOREFRONT DRAFT • 3 — Page: "VCDZ-816 • Coupons • Page"
**Figma URL:** https://www.figma.com/design/ryT9jc1XQ2MxZOD9FLycJc/%F0%9F%94%B6--STOREFRONT-DRAFT-%E2%80%A2-3?node-id=2550-1957
**Environment:** https://vcst-qa-storefront.govirto.com/account/coupons
**Theme tested:** Dark (Coffee theme, dark mode)
**Viewports tested:** 1920×1080 (desktop), 390×844 (iPhone 12 Pro / mobile)
**Audit date:** 2026-03-11
**Auditor:** ui-ux-expert

---

## Reference Screenshots

| Asset | Path |
|-------|------|
| Figma design reference | `tests/Sprint-current/VCST-4590/screenshots/figma-coupons-page-design.png` |
| Storefront actual (pre-capture) | `tests/Sprint-current/VCST-4590/screenshots/storefront-coupons-page-actual.png` |
| Live desktop viewport | `tests/Sprint-current/VCST-4590/screenshots/deviation-full-viewport.png` |
| Mobile viewport (390px) | `tests/Sprint-current/VCST-4590/screenshots/mobile-390px.png` |

---

## Executive Summary

The Coupons & Promotions page is functionally implemented and structurally sound. The overall layout, sidebar navigation, heading, coupon list, expiry dates, and copy button are all present. Several deviations from the Figma design were identified — most are minor cosmetic differences attributable to the dark theme adaptation. Two issues have WCAG 2.1 AA compliance implications.

**Overall Design Fidelity Score: 73 / 100**

| Category | Score |
|----------|-------|
| Layout & Structure | 90 / 100 |
| Coupon Card Design | 60 / 100 |
| Typography & Colors | 75 / 100 |
| Spacing & Alignment | 85 / 100 |
| Responsive Behavior | 80 / 100 |
| Accessibility (WCAG 2.1 AA) | 55 / 100 |

---

## Side-by-Side Comparison Table

| Element | Figma Design | Actual Implementation | Match |
|---------|-------------|----------------------|-------|
| Page heading text | "ALL COUPONS & PROMOTIONS" | "ALL COUPONS & PROMOTIONS" (text-transform: uppercase applied in CSS) | PASS |
| Heading font | Lato, bold, ~30px | Lato, 700 weight, 30px, letter-spacing: 0.75px | PASS |
| Heading color | White/light on dark | rgb(238, 226, 221) — warm off-white | PASS |
| Heading background | Green/teal pill/bar behind heading | Transparent (`rgba(0,0,0,0)`) — no colored background bar | FAIL |
| Sidebar sections | PURCHASING / MARKETING / CORPORATE / USER | PURCHASING / MARKETING / CORPORATE / USER | PASS |
| Sidebar active item | "Coupons & promotions" highlighted | Active with `--active` class, bg rgb(34,40,43), text rgb(245,245,245) | PASS |
| Discount badge column | Colored pill badge on left: "$100 OFF", "FREE", "30% OFF", "25% OFF" | Not present — no discount amount badge column | FAIL |
| Coupon title column | One column: campaign/coupon display name | Two columns: `coupon-item__title` (20px, teal) + `coupon-item__name` (16px, off-white) | FAIL |
| Coupon name color | Teal/green (#2F7750 approximate) | color(srgb 0.184314 0.466667 0.313726) ≈ rgb(47,119,80) — teal-green | PASS |
| Description text | Small gray/muted body copy | rgb(238, 226, 221), 14px — correct weight and size | PASS |
| Expiry label "Expires" | Muted gray, small text | color 155,155,155 (gray), 12px — matches intent | PASS |
| Expiry date value | Date adjacent to label | rgb(238,226,221), 12px — clear and readable | PASS |
| Copy button border style | Solid border in Figma | Dashed border (border-style: dashed) | FAIL |
| Copy button shape | Rounded rectangle | border-radius: 4px — matches | PASS |
| Code value in button | Large bold monospace-style | 16px, font-weight: 700, color rgb(238,226,221) | PASS |
| "Click to copy" label | Below the code, small text | 12px, color rgb(88,107,116) — present | PASS |
| "Tap to copy" mobile label | Shown on mobile | display:none on desktop, available on mobile | PASS |
| Row separator | Visible border/divider between rows | `border-bottom: 0px` — no visible separator between rows | FAIL |
| Hover state on copy button | Background color change on hover | Hover bg: `--color-secondary-100` (#22282b) — subtle dark hover present | PASS |
| Focus indicator on copy button | Expected visible outline | outline: none — NO focus-visible outline | FAIL |
| aria-label on copy button | Expected accessible label | `aria-label` attribute absent | FAIL |
| Mobile: sidebar visible | Sidebar hidden on mobile | `max-md:hidden` class — sidebar correctly hidden | PASS |
| Mobile: card layout wraps | Cards stack vertically on mobile | Cards reflow to stacked layout at mobile breakpoint | PASS |
| Page-level empty state | Not specified in Figma | Not tested (coupons present in test env) | N/A |

---

## Detailed Deviations

### DEV-01 — Missing Colored Discount Amount Badge Column
**Severity: P2 (Significant)**
**WCAG Impact:** None
**Component:** `coupon-item`

**Figma:** Each coupon card has a prominent colored pill badge on the far left showing the discount value — e.g., "$100 OFF" (orange/amber), "FREE" (green), "30% OFF" (blue), "25% OFF" (purple). This is the most visually dominant element in the card and immediately communicates value to the user.

**Actual:** The coupon grid has 5 child elements: `coupon-item__title`, `coupon-item__name`, `coupon-item__description`, `coupon-item__end-date`, `coupon-item__code`. There is no discount badge column. The leftmost visible element is the campaign title (teal text).

**Evidence:** DOM inspection shows `.coupon-item` children contain no badge/amount element. The `vc-badge` component found in the snapshot belongs to the sidebar menu item `vc-menu-item__prepend`, not the coupon card.

**UX Impact:** Users cannot immediately see the discount value at a glance. They must read the description to understand the offer. This reduces scanability and conversion potential for the coupons page.

**Recommendation:** Add a `coupon-item__badge` element as the first grid column. Use `VcBadge` component with color variant mapped to discount type (percent off, fixed off, free shipping, free item). The badge value should be derived from the promotion's reward type and amount.

---

### DEV-02 — Duplicate Title + Name Columns (Redundant Display)
**Severity: P2 (Significant)**
**WCAG Impact:** Screen reader confusion (duplicate text nodes)
**Component:** `coupon-item__title` + `coupon-item__name`

**Figma:** A single column shows the coupon display name (e.g., "Götting Reduction", "Spring Collection Sale"). One text element per coupon, styled in teal/green.

**Actual:** Two separate columns render for every coupon:
- `coupon-item__title` — 20px, font-weight 700, color teal (rgb 47,119,80), spans 2/12 grid columns, 169px wide
- `coupon-item__name` — 16px, font-weight 700, color off-white (rgb 238,226,221), spans 3/12 grid columns, 263px wide

For all 14 standard coupons, both columns display **identical text** (e.g., "Super Discount" / "Super Discount"). Only the VCST-4590 test coupon differs: title = "QA Test - VCST-4590 Coupon Public" (internal name), name = "QA Coupon English Name" (localized public name).

**Root Cause Analysis:** `coupon-item__title` likely renders the internal campaign name (admin-facing identifier) while `coupon-item__name` renders the localized public name. When no localization is configured, both fall back to the same string. This is a data/display logic issue, not purely cosmetic.

**UX Impact:** Wastes horizontal real estate (5/12 grid columns on duplicate data). Creates visual noise. Screen readers announce the same text twice consecutively.

**Recommendation:** Either (a) hide `coupon-item__title` when it equals `coupon-item__name`, or (b) use `coupon-item__title` as a secondary "internal label" visible only to B2B admins, or (c) remove `coupon-item__title` from the storefront display entirely and rely solely on `coupon-item__name` as Figma shows.

---

### DEV-03 — Copy Button Border Style: Dashed vs Solid
**Severity: P3 (Minor)**
**WCAG Impact:** WCAG 1.4.11 Non-text Contrast — marginal
**Component:** `coupon-item__code-button`

**Figma:** The "Click to copy" button has a solid border, giving it a clear card-like appearance.

**Actual:** CSS rule `.coupon-item__code-button { border-style: dashed }`. The dashed border is visible in the screenshot and gives the button a dotted/cut-coupon aesthetic (intentional coupon metaphor), but deviates from the Figma spec.

**Evidence:** CSS extracted from stylesheet: `border-style: dashed; border-width: 1px; border-color: rgb(from var(--co...)`. Computed: `borderColor: color(srgb 0.294118 0.352941 0.384314)` = rgb(75,90,98).

**Note:** A dashed border may be an intentional design choice post-Figma (coupon metaphor). Flagged for design team confirmation rather than definitive bug.

**Non-text Contrast:** Button border (rgb 75,90,98) on card background (rgb 17,15,14) = **2.67:1** contrast ratio. This fails WCAG 1.4.11 Non-text Contrast (requires 3:1). See DEV-07.

---

### DEV-04 — Missing Row Separator / Divider Between Coupon Items
**Severity: P3 (Minor)**
**WCAG Impact:** None
**Component:** `coupon-item` / `promotion-coupons__wrapper`

**Figma:** Coupon rows are visually separated by a horizontal divider line (light gray border between rows).

**Actual:** `coupon-item { border-bottom: 0px solid ... }` — border width is zero. Items are separated only by the 20px gap in the parent flex container (`gap-y-5`). The gap provides adequate visual separation, but lacks the explicit divider shown in Figma.

**Recommendation:** Either add `border-bottom: 1px solid var(--color-neutral-300)` to `.coupon-item` or confirm the gap-only approach is the accepted design direction.

---

### DEV-05 — Heading Background: Missing Colored Bar/Pill
**Severity: P3 (Minor)**
**WCAG Impact:** None
**Component:** `promotion-coupons > h1`

**Figma:** The "ALL COUPONS & PROMOTIONS" heading appears to sit on or inside a teal/green-accented background bar spanning the content area width.

**Actual:** `h1.vc-typography--variant--h1` has `background: rgba(0,0,0,0)` (transparent). The heading sits directly on the page background with no colored backdrop. The page background is the global dark theme color.

**Note:** This deviation is low severity. The heading is still clearly readable (contrast ratio 15.07:1). The green accent may have been intentional in Figma but dropped during implementation as unnecessary complexity.

---

### DEV-06 — Missing Focus-Visible Indicator on Copy Button (WCAG 2.4.7)
**Severity: P1 (Blocker — WCAG Critical)**
**WCAG Criterion:** 2.4.7 Focus Visible (AA) + 2.4.11 Focus Appearance (AAA reference)
**Component:** `coupon-item__code-button`

**Actual:** `outline: rgb(238, 226, 221) none 0px` — the outline is `none`. No `:focus-visible` CSS rule was found in the stylesheet for `.coupon-item__code-button`. Keyboard users tabbing to the copy button receive **no visual focus indicator**.

**Evidence:** JavaScript extraction of all CSS rules for `.coupon-item__code-button` found only two rules:
1. Base styles (border, flex, etc.)
2. `:hover` rule (background color change)

No `:focus` or `:focus-visible` rule exists.

**Impact:** Keyboard-only users (mobility impairments) and screen-magnification users cannot determine which copy button currently has focus when tabbing through 15 coupon rows. This is a WCAG 2.4.7 violation.

**Recommendation:** Add to stylesheet:
```css
.coupon-item__code-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

---

### DEV-07 — Copy Button Border Contrast Fails WCAG 1.4.11 (Non-text Contrast)
**Severity: P1 (Blocker — WCAG Critical)**
**WCAG Criterion:** 1.4.11 Non-text Contrast (AA)
**Component:** `coupon-item__code-button`

**Measured values:**
- Button border color: rgb(75, 90, 98)
- Card background: rgb(17, 15, 14)
- Calculated contrast ratio: **2.67:1**
- Required minimum (WCAG 1.4.11): **3:1**

The copy button border fails the non-text contrast requirement. Users with low vision may not be able to perceive the button boundary against the dark background.

**Recommendation:** Increase border color lightness. Target ≥ rgb(90, 110, 120) or use `var(--color-secondary-300)` which should provide ≥ 3:1 against the dark card background.

---

### DEV-08 — Missing aria-label on Copy Button (WCAG 4.1.2)
**Severity: P1 (Blocker — WCAG Critical)**
**WCAG Criterion:** 4.1.2 Name, Role, Value (AA)
**Component:** `coupon-item__code-button`

**Actual:** `<button type="button" class="coupon-item__code-button">` — no `aria-label` attribute present.

**Accessible name computation:** The button's accessible name is derived from its text content: "SUPER Click to copy Tap to copy" (all three `<span>` elements concatenated). While this technically gives the button an accessible name, the name is ambiguous when there are 15 copy buttons on the page — a screen reader user hears "SUPER Click to copy Tap to copy" without knowing which coupon it belongs to.

**Recommendation:** Add a dynamic aria-label:
```html
<button aria-label="Copy coupon code SUPER for Super Discount" ...>
```
Or use `aria-describedby` pointing to the coupon name element.

---

### DEV-09 — Coupon Title Color Contrast (WCAG 1.4.3)
**Severity: P2 (Significant — WCAG Medium)**
**WCAG Criterion:** 1.4.3 Contrast (Minimum) (AA)
**Component:** `coupon-item__title`

**Measured values:**
- Title text color: color(srgb 0.184314 0.466667 0.313726) ≈ rgb(47, 119, 80)
- Card background: rgb(17, 15, 14)
- Calculated contrast ratio: **3.53:1**
- Required for normal text (20px bold = large text threshold): ≥ 3:1 (large text AA)

**Result:** The title text at 20px bold qualifies as "large text" (≥18pt = 24px, or ≥14pt bold = 18.67px). At 20px bold it is technically large text. The 3.53:1 ratio **passes large text AA** but **fails normal text AA** (4.5:1).

**Assessment:** PASS for large text AA. However, the margin is thin (3.53 vs 3.0 threshold). Any slight rendering change or font subpixel variation could push this below threshold. Flagged as amber — recommend increasing to ≥ 4.5:1 for robustness.

**Recommendation:** Lighten the teal to approx rgb(65, 160, 110) which would achieve ~5:1 on this background while retaining the brand green hue.

---

### DEV-10 — "Click to copy" Label Contrast (WCAG 1.4.3)
**Severity: P2 (Significant — WCAG Medium)**
**WCAG Criterion:** 1.4.3 Contrast (Minimum) (AA)
**Component:** `coupon-item__click-label`

**Measured values:**
- Label color: color(srgb 0.345098 0.419608 0.454902) = rgb(88, 107, 116)
- Button background: color(srgb 0.0784314 0.0901961 0.0980392) = rgb(20, 23, 25)
- Calculated contrast ratio: **3.23:1**
- Required for 12px normal text: **4.5:1**

**Result:** FAIL — normal text at 12px requires 4.5:1, actual is 3.23:1.

The "Click to copy" sub-label is the secondary instruction text inside the copy button. At 12px it is well below the large-text threshold and requires the full 4.5:1 ratio.

**Recommendation:** Increase label color lightness. Target ≥ rgb(120, 145, 158) to achieve ≥ 4.5:1 on the button background.

---

## Responsive Behavior Assessment

### Desktop (1920×1080)
The page renders correctly at desktop width. The sidebar sits flush left, the content area takes the remaining width (1144px). The 12-column grid for coupon items distributes: 2col title + 3col name + 4col description + 1col expiry + 2col code = 12 columns. This is well-proportioned with the 20px column gap.

### Mobile (390×844 — iPhone 12 Pro)
Sidebar is hidden via `max-md:hidden`. Coupon items reflow to a narrower grid. The heading and items stack correctly. The `coupon-item__title` column remains visible alongside the `coupon-item__name` on mobile — the redundant duplicate (DEV-02) is still present at mobile width, potentially causing layout crowding at narrow widths.

The mobile layout shows a reasonable adaptation. The Figma mobile page ("VCDZ-816 • Coupons • Mobile") was referenced but could not be fully inspected without Figma tool access in this session. Based on the available mobile screenshot, the implementation appears functional at mobile breakpoint.

---

## Accessibility Summary (WCAG 2.1 AA)

| Criterion | Requirement | Result | Severity |
|-----------|-------------|--------|----------|
| 1.4.3 Contrast — coupon title (large text) | ≥ 3:1 | 3.53:1 PASS | Amber |
| 1.4.3 Contrast — "Click to copy" label | ≥ 4.5:1 | 3.23:1 FAIL | P2 |
| 1.4.3 Contrast — heading text | ≥ 4.5:1 | 15.07:1 PASS | — |
| 1.4.3 Contrast — body/description text | ≥ 4.5:1 | 15.07:1 PASS | — |
| 1.4.3 Contrast — "Expires" label | ≥ 4.5:1 | 6.88:1 PASS | — |
| 1.4.11 Non-text Contrast — copy button border | ≥ 3:1 | 2.67:1 FAIL | P1 |
| 2.1.1 Keyboard — all functionality accessible | Full keyboard | PASS (tab navigable) | — |
| 2.4.7 Focus Visible — copy button | Visible focus indicator | FAIL — no outline | P1 |
| 4.1.2 Name, Role, Value — copy button | Accessible name | Partial FAIL — ambiguous name | P1 |
| 1.3.1 Info and Relationships — heading h1 | Correct heading level | PASS (h1 used) | — |
| 2.1.2 No Keyboard Trap | Users can navigate away | PASS | — |

---

## Bug Summary

| ID | Description | Severity | WCAG | Recommendation |
|----|-------------|----------|------|----------------|
| BUG-UI-01 | Copy button has no focus-visible outline | P1 | 2.4.7 | Add `:focus-visible` outline CSS rule |
| BUG-UI-02 | Copy button border contrast 2.67:1 (fails 3:1 minimum) | P1 | 1.4.11 | Increase border color lightness |
| BUG-UI-03 | Copy button aria-label missing / ambiguous | P1 | 4.1.2 | Add dynamic aria-label with coupon name + code |
| BUG-UI-04 | Discount amount badge column absent (vs Figma) | P2 | — | Implement `coupon-item__badge` with VcBadge |
| BUG-UI-05 | "Click to copy" label contrast 3.23:1 (fails 4.5:1) | P2 | 1.4.3 | Lighten label color to ≥ rgb(120,145,158) |
| BUG-UI-06 | Duplicate title + name columns showing identical text | P2 | — | Hide title when equal to name, or remove title column |
| BUG-UI-07 | Copy button border dashed (vs solid in Figma) | P3 | — | Confirm intentional or change to solid |
| BUG-UI-08 | No row separator between coupon items (vs Figma) | P3 | — | Add 1px border-bottom or confirm gap-only is accepted |
| BUG-UI-09 | Heading has no colored background bar (vs Figma) | P3 | — | Confirm whether teal bar was dropped intentionally |

---

## Recommendations Summary

**Must Fix (P1 — WCAG compliance):**
1. Add `:focus-visible` outline to `.coupon-item__code-button`
2. Increase copy button border color contrast to ≥ 3:1
3. Add descriptive `aria-label` to each copy button (include coupon name + code)

**Should Fix (P2 — design fidelity / UX):**
4. Implement colored discount amount badge column as shown in Figma
5. Fix "Click to copy" label contrast to ≥ 4.5:1
6. Resolve duplicate title/name display (hide title when redundant)

**Consider (P3 — minor cosmetic):**
7. Confirm dashed vs solid border decision with design team
8. Confirm row separator preference with design team
9. Confirm heading background bar was intentionally dropped

---

## Overall Design Fidelity Score: 73 / 100

The implementation delivers the core user value of the coupons page — users can see available coupons, read descriptions and expiry dates, and copy coupon codes. The dark theme adaptation is generally well executed with good contrast on body text. The main gaps are the absence of the discount amount badge (the most prominent visual element in the Figma design), the redundant title column, and three WCAG AA violations that need correction before the feature can be signed off.

---

*Report generated by ui-ux-expert agent. Screenshots saved to `tests/Sprint-current/VCST-4590/screenshots/`.*
