# BUG: [Configurable products] Auto-scroll triggered when clicking radio button

**JIRA Ticket:** VCST-4612
**Severity:** Medium
**Priority:** P2
**Type:** Bug
**Status:** Reproduced
**Environment:** QA Storefront - https://vcst-qa-storefront.govirto.com
**Browser:** Chrome (Chromium via Playwright MCP, 1920x1080 viewport)
**Store Version:** 2.42.0-pr-2149-8584-85843c7b
**Date:** 2026-02-11
**Tested By:** qa-frontend-expert

---

## Summary

On configurable product pages, clicking a radio button to select a configuration option triggers an unwanted auto-scroll when the selected option's name is long enough to cause the accordion section header to wrap to multiple lines. The scroll offset matches exactly the height change of the section header, indicating the browser is compensating for a DOM layout shift caused by the text content update in the section header.

---

## Steps to Reproduce

1. Navigate to: `https://vcst-qa-storefront.govirto.com/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options`
2. Scroll down to the **"CONFIGURE THE PARAMETERS"** section
3. Observe the **"SELECT ONE"** accordion section is open, with "None" selected and the subtitle text reading "Personalize your selection further (optional)" (single line)
4. Note the current scroll position (e.g., scrollY = 700)
5. Click the radio button for **"200CC 250CC 4-Stroke Engine Motor For Motorcycle Dirt Bike ATV Engine CG250 with 5-Speed Manual Transmission, Aluminum Alloy CDI 10.0KW/7000Rpm 14.5Nm Vertical Single Cylinder Engine Motor Complete Kit"**
6. **Observe:** The page auto-scrolls down by approximately 14 pixels

---

## Expected Behavior

Clicking a radio button for product configuration should NOT trigger any auto-scroll. The user's viewport position should remain unchanged regardless of which option is selected.

---

## Actual Behavior

The page auto-scrolls when clicking a radio button if the selected option's name causes the section header subtitle text to change height (i.e., wrap to a new line or collapse to fewer lines).

**Measured scroll behavior:**

| Transition | Header Height Before | Header Height After | Scroll Delta | Direction |
|---|---|---|---|---|
| None -> "200CC Engine..." (long name) | 46px (1 line) | 60px (2 lines) | **+14px** | Scroll DOWN |
| "200CC Engine..." -> "Seat" (short name) | 60px (2 lines) | 46px (1 line) | **-14px** | Scroll UP |
| "Seat" -> "Pedals" (both short names) | 46px (1 line) | 46px (1 line) | **0px** | No scroll |
| "Pedals" -> "Rear wheel, 26\"..." (fits 1 line) | 46px (1 line) | 46px (1 line) | **0px** | No scroll |
| None -> "Rear wheel, 26\"..." (fits 1 line) | 46px (1 line) | 46px (1 line) | **0px** | No scroll |

**Key finding:** The scroll delta is always exactly equal to the header height change. The auto-scroll only occurs when the subtitle text wraps to a different number of lines.

---

## Root Cause Analysis

When a radio button is clicked, the section header subtitle updates to show the selected option's name. If the new name is significantly longer than the previous text, it wraps to a second line, increasing the header height. This DOM height change pushes content below it downward, and the browser (or a Vue/React scroll-anchoring mechanism) compensates by auto-scrolling to keep the focused element or the content in the same relative viewport position.

The scroll compensation is a **layout shift side-effect**. The accordion header dynamically changes height based on the selected option's text length, and the browser applies scroll anchoring to compensate for the shift.

**Component involved:** The accordion/collapsible section header in the configurable product "Configure the parameters" widget. Specifically, the subtitle element (`generic[ref=e1944]` / `generic[ref=e426]`) that displays either:
- "Personalize your selection further (optional)" (when None is selected)
- The selected product's full name (when an option is selected)

---

## Products Tested

| Product | URL | Has Radio Buttons | Bug Reproduced | Notes |
|---|---|---|---|---|
| **Bike with options** | `/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options` | Yes (5 options) | **YES** | Reproduces when selecting "200CC Engine" (very long name) |
| **Vintage Wedding Cake** | `/products-with-options/configurations/dreamy-cakes/vintage-wedding-cake-2` | Yes (3 options per section) | No | All option names are short ("Flowers: Lily", "Flowers: Roses") - no text wrapping |
| **Entertainment set** | `/products-with-options/configurations/create-your-own-entertainments/entertainment-set-board-games-movies-online-games` | Only "None" radio + file upload | N/A | Only 1 radio option, cannot switch |

---

## Reproduction Rate

- **100%** on the "Bike with options" product when selecting "200CC Engine" from any shorter-named option
- **100%** consistent: every time the header height changes, the scroll delta matches exactly
- **0%** when switching between options that produce the same header height

---

## Impact

- **User Experience:** Disorienting for users as the page jumps when selecting configuration options. The scroll is subtle (~14px) but noticeable, especially with repeated interactions.
- **Cumulative effect:** If a user clicks back and forth between options, the scroll compounds, gradually shifting the user's viewport.
- **Mobile impact:** Likely more noticeable on mobile viewports where 14px represents a larger percentage of visible content.

---

## Console Errors

No JavaScript errors related to the scroll behavior were detected in the browser console. The only console errors present were unrelated 404s for missing product images:
```
[ERROR] Failed to load resource: 404 - 475635_25ym_honda_crf450rx_1__md.jpg
```

---

## Suggested Fix

1. **Option A (CSS fix):** Set a fixed height or `min-height` on the accordion section header to prevent height changes when the subtitle text changes. Use `text-overflow: ellipsis` and `white-space: nowrap` with `overflow: hidden` on the subtitle element to prevent text wrapping.

2. **Option B (CSS fix):** Add `overflow-anchor: none` CSS property to the accordion header container to prevent browser scroll anchoring from compensating for the height change.

3. **Option C (JS fix):** Before updating the subtitle text, record `window.scrollY`, then after the DOM update, restore the scroll position with `window.scrollTo(0, savedScrollY)` to counteract the browser's auto-scroll compensation.

4. **Option D (Design fix):** Truncate long product names in the accordion header with an ellipsis, ensuring the header always fits on one line regardless of the selected option's name length.

---

## Evidence

### Screenshots

- **Before click (None selected, 1-line header):** `screenshots/desktop/VCST-4612-before-engine-click-baseline.png`
- **After click (200CC Engine selected, 2-line header, scrolled +14px):** `screenshots/desktop/VCST-4612-after-engine-click-scroll-detected.png`
- **Configuration section overview:** `screenshots/desktop/VCST-4612-config-section-before-click.png`

### Scroll Event Log (programmatic evidence)

```json
// Test: None -> "200CC Engine" (fresh page load, scrollY=700)
{
  "eventCount": 2,
  "events": [
    { "scrollY": 700, "timestamp": 1770803807756 },
    { "scrollY": 714, "timestamp": 1770803813591 }
  ],
  "currentScrollY": 714
}

// Test: "200CC Engine" -> "Seat" (header shrinks)
{
  "eventCount": 2,
  "events": [
    { "scrollY": 700, "timestamp": 1770803711611 },
    { "scrollY": 686, "timestamp": 1770803717230 }
  ],
  "currentScrollY": 686
}

// Test: "Seat" -> "Pedals" (same header height)
{
  "eventCount": 0,
  "events": [],
  "currentScrollY": 686
}
```

### Header Height Measurements

```json
// None selected (or any short name: Seat, Pedals, Rear wheel)
{ "headerHeight": 46, "text": "Select one  Personalize your selection further (optional)" }

// "200CC Engine" selected (long name wraps to 2 lines)
{ "headerHeight": 60, "text": "Select one  200CC 250CC 4-Stroke Engine Motor For Motorcycle Dirt Bike ATV Engine CG250 with 5-Speed..." }
```

---

## Labels

`frontend`, `configurable-products`, `radio-button`, `scroll`, `layout-shift`, `ux`, `css`

## Component

Configurable Product Detail Page - Configuration Parameters Widget

## Affects Version

2.42.0-pr-2149-8584-85843c7b

## Linked Issues

VCST-4612
