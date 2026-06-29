# VCST-4612: Auto-Scroll Bug Investigation - Off-Road Bike Configurable Product

## Summary

**Bug:** When clicking a radio button in the **Tyres** configuration section on the Off-Road Bike product page, the page auto-scrolls approximately 1282 pixels downward to the bottom of the Tyres list, and the radio button selection reverts to "None" instead of the clicked option.

**Status:** REPRODUCED - Intermittent (race condition)

**URL:** https://virtostart-demo-store.govirto.com/products-with-options/build-the-bike-of-your-dreams/off-road-bike

**Environment:**
- Storefront: virtostart-demo-store.govirto.com
- Version: 2.41.0
- Browser: Chrome (Playwright Chromium)
- Viewport: 1920x1080
- Date: 2026-02-11

---

## Reproduction Conditions

The bug reproduces **specifically** under these conditions:

1. **Fresh page load** (navigate to the product URL or hard refresh)
2. **Tyres accordion expanded for the FIRST time** (Engine section is already expanded by default)
3. **First radio button click** in the Tyres section after expansion

### Reliable Reproduction Steps:

1. Navigate to: `https://virtostart-demo-store.govirto.com/products-with-options/build-the-bike-of-your-dreams/off-road-bike`
2. Wait for the page to fully load
3. Scroll down to the "CONFIGURE THE PARAMETERS" section
4. Click the **Tyres** accordion header to expand it
5. Immediately click any tyre radio button (e.g., "Pirelli Angel Scooter F+R M/C 100/80 -14 54S")

**Expected:**
- The selected tyre radio button becomes checked (filled orange)
- The price updates to reflect the tyre selection
- The page scroll position remains unchanged

**Actual:**
- The page auto-scrolls ~1282px downward (from scrollY 550 to scrollY 1832)
- The radio button selection reverts back to "None"
- The price remains at $550.00 (no tyre added)
- The Tyres accordion header still shows "Personalize your selection further (optional)" instead of the selected tyre name
- The user loses their viewport position and must scroll back up manually

---

## Detailed Test Results

### Tests That DID Trigger the Bug:

| Test | Condition | Before scrollY | After scrollY | Delta | Selection Result |
|------|-----------|---------------|--------------|-------|-----------------|
| Test 4 | First click on Pirelli Angel after first Tyres expansion | 900 | 1832 | +932 | Reverted to "None" |
| Test 13 | Fresh page load, first Tyres expansion, first click on Pirelli Angel | 550 | 1832 | +1282 | Reverted to "None" |

### Tests That Did NOT Trigger the Bug:

| Test | Condition | Before scrollY | After scrollY | Delta | Selection Result |
|------|-----------|---------------|--------------|-------|-----------------|
| Test 1 | Engine radio button click (already expanded) | 550 | 550 | 0 | Correct |
| Test 2 | Engine "None" re-selection | 550 | 550 | 0 | Correct |
| Test 5 | Avon Viper Stryke (first tyre in list, after bug already triggered) | 900 | 900 | 0 | Correct |
| Test 6 | Switch between tyre options (Avon to Pirelli Diablo) | 900 | 900 | 0 | Correct |
| Test 7 | Click Bridgestone from lower scroll position | 1200 | 1200 | 0 | Correct |
| Test 8 | Reset to None then re-click Pirelli Angel (same session) | 900 | 900 | 0 | Correct |
| Test 9 | Click MICHELIN after collapse/expand cycle | 900 | 900 | 0 | Correct |
| Test 14 | Second click on Pirelli Angel after bug occurred | 900 | 900 | 0 | Correct |

### Pattern Analysis:

The bug appears to be a **race condition** tied to the first-time initialization of the Tyres accordion section. Key observations:

1. **Engine section** (expanded on page load) NEVER triggers the bug -- its radio buttons always work correctly
2. **Tyres section** (collapsed on page load, user must expand) triggers the bug on the FIRST click after expansion on a fresh page load
3. Once the bug has triggered once, subsequent clicks in the Tyres section work perfectly
4. Collapsing and re-expanding the Tyres section does NOT re-trigger the bug (only fresh page load does)

### Scroll Event Analysis:

Using `requestAnimationFrame`-based scroll monitoring, the scroll jump was captured as:
```json
{
  "from": 550,
  "to": 1832,
  "delta": 1282,
  "timestamp": 1770804694614
}
```

The scroll occurs as a **single instantaneous jump** (one frame), not a smooth scroll. This suggests a programmatic `scrollIntoView()` or `element.focus()` call is being triggered internally.

### Dual Bug Behavior:

When the bug triggers, TWO things go wrong simultaneously:
1. **Auto-scroll:** Page jumps to the bottom of the Tyres list (where the "None" radio button is)
2. **Selection revert:** The clicked radio button is NOT selected; "None" remains checked

This suggests the following mechanism:
- User clicks a tyre radio button
- A configuration update/recalculation is triggered
- During the async update, the component re-renders
- The re-render scrolls to the "None" option (possibly via `scrollIntoView` on the checked element)
- The selection state is reset to "None" due to the re-render overriding the user's click

---

## Browser Console Errors

No JavaScript application errors were found related to the auto-scroll behavior. All console errors are:

1. **CSP violations** (Content Security Policy) for Azure Monitor / Visual Studio telemetry -- not related
2. **404 resource errors** for 3 product images -- not related
3. **ProductGuide script loading warnings** -- not related

---

## Affected Component

- **Section:** "Configure the parameters" > "Tyres" accordion
- **Component type:** Radio button group within collapsible accordion
- **Product type:** Configurable product with multiple configuration sections (Engine, Tyres)
- **Interaction:** First radio button selection after accordion expansion on fresh page load

---

## Impact

**Severity:** Medium-High

- **User Experience:** When a user opens the Tyres section and tries to select a tyre for the first time, their click is "eaten" -- the selection does not take effect, and the page jumps away from their current position. The user must:
  1. Realize the selection did not work
  2. Scroll back up to find the Tyres section
  3. Click the desired tyre option again (which will work on the second attempt)

- **Conversion impact:** Users configuring an Off-Road Bike (or any configurable product with multiple collapsible sections) may be confused by the unexpected scroll and failed selection, potentially abandoning the configuration process.

- **Scope:** Likely affects ALL configurable products with collapsed configuration sections, not just the Off-Road Bike. Any section that starts collapsed and contains radio button options may exhibit this behavior.

---

## Suggested Root Cause Investigation

The development team should investigate:

1. **Vue/React component lifecycle** in the configuration accordion -- specifically what happens during the first render after the Tyres section expands
2. **`scrollIntoView()` calls** in the radio button or accordion component code -- there may be a `scrollIntoView` call on the default-selected "None" radio button that fires during initialization
3. **State management race condition** -- the GraphQL mutation or state update triggered by the radio click may be overridden by a component initialization/mount event
4. **`focus()` calls** on radio buttons during accordion expansion -- browser `focus()` can trigger auto-scrolling to the focused element

---

## Screenshots

All screenshots saved to: `tests/VCST-4612/screenshots/desktop/`

| File | Description |
|------|-------------|
| `01-off-road-bike-initial-page-load.png` | Initial page load, viewport at top |
| `02-off-road-bike-full-page.png` | Full page screenshot showing entire layout |
| `03-off-road-bike-config-section-before-click.png` | Config section visible, Engine expanded, Tyres collapsed |
| `04-off-road-bike-engine-selected-no-scroll.png` | Engine radio button selected -- NO scroll (working correctly) |
| `05-off-road-bike-none-reselected-no-scroll.png` | Engine "None" re-selected -- NO scroll (working correctly) |
| `06-off-road-bike-tyres-expanded.png` | Tyres accordion expanded, showing tyre options |
| `07-off-road-bike-tyres-scrolled-down.png` | Scrolled to see more tyre options |
| `08-off-road-bike-AUTO-SCROLL-BUG-after-tyre-click.png` | **BUG: After clicking Pirelli Angel -- page jumped to bottom** |
| `09-off-road-bike-before-avon-click.png` | Before clicking Avon Viper (after bug already triggered) |
| `10-off-road-bike-avon-selected-no-scroll.png` | Avon selected correctly on second attempt -- NO scroll |
| `11-off-road-bike-scrolled-to-lower-tyres.png` | Scrolled to lower tyre options |
| `12-off-road-bike-scrolled-to-none-tyre.png` | Bottom of tyre list with "None" visible |
| `13-off-road-bike-before-second-pirelli-angel-attempt.png` | Before second reproduction attempt |
| `14-off-road-bike-pirelli-angel-selected-second-attempt.png` | Pirelli Angel selected correctly on retry (same session) |
| `15-off-road-bike-AUTO-SCROLL-BUG-REPRODUCED-fresh-load.png` | **BUG REPRODUCED: Fresh page load, first click -- page jumped again** |
| `16-off-road-bike-second-click-works-correctly.png` | Second click after bug works correctly |

---

## Conclusion

The auto-scroll bug on VCST-4612 is **confirmed and reproducible** on the Off-Road Bike configurable product page. The bug is a race condition that occurs on the first radio button click in a collapsed-then-expanded configuration section after a fresh page load. It manifests as both an unexpected scroll jump (~1282px) and a failed radio button selection (reverts to "None").

The bug was reproduced **2 out of 2 attempts** when following the exact reproduction steps (fresh page load + first Tyres expansion + first click). It did NOT reproduce on subsequent clicks within the same page session (0 out of 8+ attempts), confirming it is tied to the first-time initialization of the accordion component.
