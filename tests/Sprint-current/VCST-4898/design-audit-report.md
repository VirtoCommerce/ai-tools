# Design Audit Report — VCST-4898: [Lists] Redesign the list-item

**Ticket:** VCST-4898 (Story, P2 Medium)
**PR:** vc-frontend #2271
**Build verified:** `Ver. 2.49.0-pr-2271-ef5a-ef5a93c4` (confirmed in page footer)
**Page tested:** `https://vcst-qa-storefront.govirto.com/account/lists`
**Date:** 2026-05-06
**Auditor:** ui-ux-expert (Claude Sonnet 4.6)
**Theme:** Coffee
**Browsers:** Chrome DevTools MCP (desktop 1920x1080, tablet 768x1024, mobile 375x812)

---

## 1. Summary

| Dimension | Result |
|-----------|--------|
| Token verification | PARTIAL FAIL — `text-info-400` contrast failure |
| Figma comparison | NOT ACCESSIBLE — visual comparison limited to DOM/code analysis |
| Accessibility (WCAG 2.1 AA) | FAIL — contrast violation + missing ARIA on icons |
| Responsive layout | PASS |

**Overall verdict:** FAIL

---

## 2. Token Verification

### Computed values vs. CSS variables

| Element | Class Applied | Computed Value | Expected Token | Token Correct |
|---------|--------------|----------------|----------------|---------------|
| Private chip — lock icon | `text-info-700` | `rgb(50, 92, 118)` / `#325c76` | `info-700` (CSS var: `#325c76`) | PASS |
| Shared chip — users icon | `fill-primary` | fill: `rgb(153, 108, 90)` / `#996c5a` | Coffee `primary` token | PASS |
| Save-v2 date icon | `text-info-400` | `rgb(103, 170, 203)` / `#67aacb` | `info-400` (CSS var: `#67aacb`) | PASS (token matches) |
| Old class `fill-secondary` | — | Absent from DOM | Must be absent | PASS |
| Old class `fill-accent` | — | Absent from DOM | Must be absent | PASS |

### Token hierarchy verification

`info-400` (`#67aacb`, luminance 0.359) is lighter than `info-700` (`#325c76`, luminance 0.096) — hierarchy is correct as designed.

### Token class removal confirmation

- `fill-secondary` — 0 instances found in live DOM. Correctly removed from Private chip. PASS
- `fill-accent` — 0 instances found in live DOM. Correctly removed from Shared chip. PASS

### Assessment

Token values in the DOM match the Coffee theme CSS variables exactly. The redesign applied the correct token names. However, the `info-400` token, while correctly applied, produces a color that fails WCAG 1.4.11 contrast requirements — see Section 4.

---

## 3. Figma Comparison

**Status: Figma not accessible — visual comparison limited.**

The Figma MCP (`figma-remote-mcp`) requires OAuth authentication that was not completed in this session. The Figma node `https://www.figma.com/file/ryT9jc1XQ2MxZOD9FLycJc?node-id=3117%3A199814` could not be opened.

**Analysis based on DOM structure only:**

- **Save icon glyph:** The `save-v2` icon renders an SVG path consistent with a floppy-disk / save shape (confirmed via `M2.85714 0C1.28125 0...` path data). This is the expected glyph per the code change specification.
- **Date format:** The date renders as `May 4, 2026` — a short locale format (`"short"` i18n key as specified in the PR). This is a readable abbreviated format. If the Figma design shows a verbose date like "Saved: May 4, 2026" or a full ISO date, this should be flagged as a design intent question. Without Figma access, this cannot be confirmed.
- **Chip layout:** The icon + label pairing uses `flex items-center gap-1.5` which produces a standard inline icon-with-text layout. Consistent with typical Virto Commerce chip patterns.
- **Recommendation:** Complete Figma comparison manually by opening the Figma node with authenticated access and comparing the chip icon placement, gap, and typography.

---

## 4. Accessibility Audit (WCAG 2.1 AA)

### 4.1 Color Contrast

All icons rendered on the white card background (`bg-additional-50`, computed `rgb(255, 255, 255)`).

| Icon | Class | Computed Color | Background | Contrast Ratio | WCAG 1.4.11 Threshold (3:1) | Result |
|------|-------|---------------|------------|----------------|------------------------------|--------|
| lock-closed (Private chip) | `text-info-700` | `#325c76` | `#ffffff` | **7.17:1** | 3:1 required | PASS |
| users (Shared chip) | `fill-primary` | `#996c5a` | `#ffffff` | **4.52:1** | 3:1 required | PASS |
| save-v2 (date icon) | `text-info-400` | `#67aacb` | `#ffffff` | **2.56:1** | 3:1 required | **FAIL** |

**BUG-A11Y-001 (High):** The `save-v2` date icon (`text-info-400`, `#67aacb`) has a contrast ratio of **2.56:1** against the white card background — below the WCAG 1.4.11 minimum of 3:1 for graphical objects. This is a regression introduced by VCST-4898 (the previous "Saved:" text label had no icon; the new design added this icon). See evidence: `evidence/wishlist-card-contrast-fail-info400-desktop.png`.

### 4.2 Decorative vs. Meaningful Icon Semantics

**Save-v2 icon (`text-info-400`):**

```html
<span class="vc-icon text-info-400" style="width: 16px; height: 16px;">
  <svg viewBox="0 0 20 20" ...>...</svg>
</span>
<b>May 4, 2026</b>
```

- The icon is adjacent to the date text. It appears to be decorative (visual reinforcement of the date that follows).
- However, the SVG has **no `aria-hidden="true"`** on either the `<span>` or the `<svg>`. Screen readers will encounter the SVG inline, which has no accessible name, no `<title>`, and no `role`.
- WCAG 1.1.1 / 4.1.2 requirement: decorative icons must have `aria-hidden="true"` on the SVG or the wrapper span.
- **BUG-A11Y-002 (Medium):** Missing `aria-hidden="true"` on the `save-v2` icon SVG. Screen readers will encounter a nameless inline SVG.

**lock-closed icon (`text-info-700`) — Private chip:**

```html
<div class="flex items-center gap-1.5 ms-auto md:ms-0" [no aria attrs]>
  <span class="vc-icon text-info-700">[lock SVG, no aria-hidden]</span>
  <span>Private</span>
</div>
```

- The visible text label "Private" is present adjacent to the icon. The icon is therefore redundant/decorative in terms of conveying the "Private" status — the text alone conveys the meaning.
- No `aria-hidden` on the icon SVG.
- The chip container `div` has no `role`, no `aria-label`.
- Assessment: The text "Private" / "Shared" is read by screen readers correctly, conveying the privacy state. The icon is redundant and should have `aria-hidden="true"`. Current state results in a nameless SVG being encountered before the text — minor but avoidable confusion.
- **BUG-A11Y-003 (Low):** Lock-closed and users chip icons are missing `aria-hidden="true"`. The adjacent text label conveys the meaning, making the icons decorative — they should be hidden from the accessibility tree.

### 4.3 Date Labeling — Regression Check

The previous implementation displayed `Saved: <date>` as plain text. The new implementation displays an icon + `<b>May 4, 2026</b>`.

- The "Saved:" label has been removed (confirmed: locale key `shared.wishlists.list_card.saved` deleted in 14 locale files).
- The date is now announced by screen readers as a bare date string (e.g., "May 4, 2026") with no preceding label.
- The save-v2 icon carries no accessible text to describe what the date means (last modified? saved?).
- **BUG-A11Y-004 (High — Regression):** The date field has lost its semantic label. Screen readers previously announced context ("Saved: May 4, 2026"). Now they encounter a nameless icon followed by a bare date string with no label. Users relying on screen readers cannot determine what the date represents (is it a creation date? modification date? an order date?). This is an accessibility regression per WCAG 1.3.1 (Info and Relationships) — the relationship between the date value and its meaning is no longer conveyed programmatically.

  **Recommended fix:** Either restore a visually-hidden label (e.g., `<span class="sr-only">Last modified:</span>`) before the date, OR add `aria-label="Last modified: May 4, 2026"` to the wrapper div, OR add a `<title>Last modified</title>` inside the save-v2 SVG (with the SVG marked as `role="img"`).

### 4.4 Keyboard Navigation

Focusable elements per card (in tab order):
1. List name link (e.g., "0000 5/4/2026") — has accessible name via visible text. PASS
2. Options button (three-dot menu, `aria-haspopup="dialog"`) — **has no accessible name** (confirmed by Lighthouse). FAIL (pre-existing issue, not introduced by VCST-4898).

No phantom focusable elements introduced by the icon or date changes. The `vc-icon` spans have `iconTabindex: 0` phantom focusables — confirmed 0. PASS.

No keyboard trap found.

### 4.5 Lighthouse Accessibility Audit

- **Score:** 95/100 (snapshot mode, desktop)
- **Failed audits relevant to this PR:**

| Lighthouse Check | WCAG | Severity | Notes |
|-----------------|------|----------|-------|
| `button-name` — options buttons on cards have no accessible name | 4.1.2 | Serious | Pre-existing issue; not introduced by VCST-4898. The three-dot menu button has `aria-haspopup="dialog"` but no `aria-label`. Affects all 9 list cards. |
| `label-content-name-mismatch` — Account menu button visible text doesn't match aria-label | 2.5.3 | Serious | Pre-existing, page-level, not related to VCST-4898 (affects the header account button). |

- **Note:** Lighthouse automated scanning does not detect the `info-400` contrast failure (it only checks text contrast, not graphical object contrast). The contrast failure documented in §4.1 was identified through manual calculation.

---

## 5. Responsive Layout

| Breakpoint | Width | Result | Notes |
|-----------|-------|--------|-------|
| Desktop | 1920×1080 | PASS | Icon + date inline, chip inline, `md:flex md:items-center md:gap-6` layout correct. Save-v2 icon + `<b>date</b>` render on same row as `md:contents` parent. |
| Tablet | 768×1024 | PASS | Layout collapses to stacked row below list name/count. Date wrapper and chip remain visible. No overflow detected. |
| Mobile | 375×812 | PASS | Date wrapper (`flex items-center gap-1.5`) and status chip (`flex items-center gap-1.5 ms-auto`) both render on the same row (top=226 for both). Icon + date do not collapse onto the chip row. No overflow beyond viewport. Card width 437px fits within available space. Touch target for the options button remains 32×32px (below 44×44px minimum — pre-existing issue). |

All three breakpoints render the new icon+date layout correctly. No overflow. No layout breakage attributable to VCST-4898.

---

## 6. Bugs Found

| ID | Severity | WCAG SC | Description | Evidence |
|----|----------|---------|-------------|----------|
| BUG-A11Y-001 | High | 1.4.11 Non-text Contrast | `save-v2` date icon (`text-info-400`, `#67aacb`) has contrast ratio 2.56:1 against white card background — below 3:1 minimum for graphical objects. Introduced by VCST-4898. | `evidence/wishlist-card-contrast-fail-info400-desktop.png` |
| BUG-A11Y-002 | Medium | 1.1.1 Non-text Content | `save-v2` icon SVG has no `aria-hidden="true"`. It is a decorative icon (meaning conveyed by adjacent date text) but is exposed to screen readers as a nameless graphic. | DOM inspection |
| BUG-A11Y-003 | Low | 1.1.1 Non-text Content | `lock-closed` and `users` chip icons both lack `aria-hidden="true"`. Adjacent "Private"/"Shared" text conveys the meaning; icons are decorative and should be hidden from AT. | DOM inspection |
| BUG-A11Y-004 | High (Regression) | 1.3.1 Info and Relationships | Date field has lost its semantic label. Previous "Saved:" text clearly identified the date's meaning to screen readers. The new icon+date pattern provides no programmatic association between the date value and its meaning (last modified). Screen reader users hear a bare date with no context. | DOM inspection |

**Pre-existing issues (not introduced by VCST-4898 — for awareness only):**

| Pre-existing Issue | Severity | WCAG SC | Description |
|-------------------|----------|---------|-------------|
| Options button (three-dot menu) has no accessible name | High | 4.1.2 | The kebab-menu button on each card has `aria-haspopup="dialog"` but no `aria-label`, `title`, or visible text. Lighthouse `button-name` failure. |
| Touch target 32×32px | Medium | 2.5.5 (AAA) | The options button is 32×32px, below the 44×44px recommended minimum. Pre-existing. |

---

## Verdict: FAIL

Two High-severity issues were identified:

1. **BUG-A11Y-001** — `text-info-400` contrast ratio 2.56:1 fails WCAG 1.4.11 (3:1 required for graphical objects). The `info-400` token is too light for use as a standalone icon on a white background. Recommend using `info-500` or `info-600` instead, or verifying whether the design intent was to use this icon as purely decorative with `aria-hidden`.
2. **BUG-A11Y-004** — Removal of the "Saved:" label text is a screen-reader accessibility regression. The date's semantic meaning is no longer programmatically conveyed.

Token class migrations (`fill-secondary` → `text-info-700`, `fill-accent` → `fill-primary`) are correctly applied and verified. Responsive layout passes at all three breakpoints. The `info-700` (7.17:1) and `fill-primary` (4.52:1) icons pass WCAG 1.4.11.
