# VCST-4499 - Automation Test Cases Breakdown

**Date:** 2026-01-29
**Ticket:** VCST-4499
**PR:** #2138
**Test URL:** https://virtostart-demo-store.govirto.com/cart

---

## Test Cases for Automation

### TC-001: Basic Map Stability (Primary Bug Fix)

| Property | Details |
|----------|---------|
| **TC ID** | TC-001 |
| **Priority** | P0 - Critical |
| **Type** | Functional |
| **Automation Feasibility** | 🟡 Medium |
| **Estimated Effort** | 3-4 hours |
| **Framework** | Playwright |
| **Tags** | `@critical` `@smoke` `@bopis` `@map-stability` |

**Preconditions:**
- Cart contains at least 2 products
- Multiple pickup locations configured
- Test URL accessible

**Test Steps:**
```typescript
1. Navigate to cart page
2. Add products to cart (if not present)
3. Scroll to shipping section
4. Select "Pickup" option
5. Click "Select pickup location" button
6. Wait for modal to open and map to load
7. Capture initial map container dimensions (height, width)
8. Enter location name in search field (e.g., "Mall")
9. Assert map dimensions unchanged
10. Assert map position unchanged (no visual shift)
11. Click clear button (X) in search field
12. Assert map dimensions unchanged
13. Assert map position unchanged
14. Enter address in search field
15. Clear search field manually (select all + delete)
16. Assert map dimensions unchanged
17. Repeat steps 8-15 three times
18. Assert consistent behavior across iterations
```

**Expected Results:**
- Map modal opens successfully
- Map renders completely
- Map container dimensions remain constant during all search operations
- No visual "jumping" or layout shifts
- Search field clears properly
- Behavior consistent across multiple iterations

**Automation Implementation Notes:**
```typescript
// Pseudocode
const mapContainer = page.locator('[data-testid="map-container"]');
const initialBounds = await mapContainer.boundingBox();

// After search operation
const newBounds = await mapContainer.boundingBox();
expect(newBounds.height).toBe(initialBounds.height);
expect(newBounds.width).toBe(initialBounds.width);
expect(newBounds.x).toBe(initialBounds.x);
expect(newBounds.y).toBe(initialBounds.y);
```

**Challenges:**
- Google Maps async loading
- Need to wait for map tiles to load completely
- Visual stability verification requires bbox comparison

---

### TC-002: Desktop View - Location Selection Flow

| Property | Details |
|----------|---------|
| **TC ID** | TC-002 |
| **Priority** | P0 - Critical |
| **Type** | Functional |
| **Automation Feasibility** | 🟡 Medium |
| **Estimated Effort** | 4-5 hours |
| **Framework** | Playwright |
| **Tags** | `@critical` `@smoke` `@bopis` `@desktop` `@e2e` |

**Preconditions:**
- Desktop viewport (1920x1080 or similar)
- Cart has products
- Multiple pickup locations available

**Test Steps:**
```typescript
1. Set viewport to desktop size (1920x1080)
2. Navigate to cart with products
3. Select "Pickup" option
4. Click "Select pickup location"
5. Assert modal opens with desktop layout
6. Assert list visible on left, map on right
7. Click first location in the list
8. Assert location highlights on map
9. Wait for map pan animation to complete
10. Assert info window opens on marker
11. Click second location in list
12. Assert first location unhighlights
13. Assert second location highlights
14. Assert map pans to new location smoothly
15. Click marker directly on map
16. Assert info window opens
17. Click "Select" button in info window
18. Assert PickupLocationCard dialog opens
19. Assert card contains: name, address, hours, availability, contact
20. Click "Confirm" button
21. Assert modal closes
22. Assert pickup location appears in cart
```

**Expected Results:**
- Desktop layout renders (side-by-side)
- Location list and map both visible
- Clicking list items highlights markers
- Map pans smoothly to selected locations
- Info windows open correctly
- Only one location highlighted at a time
- PickupLocationCard displays complete information
- Selection saves to cart

**Automation Implementation Notes:**
```typescript
// Layout verification
await expect(page.locator('.location-list')).toBeVisible();
await expect(page.locator('.map-container')).toBeVisible();

// Check side-by-side layout
const listBox = await page.locator('.location-list').boundingBox();
const mapBox = await page.locator('.map-container').boundingBox();
expect(listBox.x).toBeLessThan(mapBox.x); // List on left

// Verify only one highlighted
const highlighted = page.locator('.location-item.highlighted');
await expect(highlighted).toHaveCount(1);
```

**Challenges:**
- Google Maps marker interactions
- Animation timing (need waitForLoadState)
- Info window race conditions

---

### TC-003: Mobile View - List/Map Toggle

| Property | Details |
|----------|---------|
| **TC ID** | TC-003 |
| **Priority** | P0 - Critical |
| **Type** | Functional |
| **Automation Feasibility** | 🟢 Easy |
| **Estimated Effort** | 2-3 hours |
| **Framework** | Playwright |
| **Tags** | `@critical` `@smoke` `@bopis` `@mobile` `@responsive` |

**Preconditions:**
- Mobile viewport (375x667)
- Cart has products

**Test Steps:**
```typescript
1. Set viewport to mobile (375x667)
2. Navigate to cart with products
3. Select "Pickup" option
4. Click "Select pickup location"
5. Assert modal opens showing list view by default
6. Assert List/Map toggle button visible
7. Click "Map" toggle button
8. Assert view switches to map
9. Assert map fills viewport
10. Assert list view hidden
11. Click "List" toggle button
12. Assert view switches back to list
13. Assert list fills viewport
14. Assert map view hidden
15. Switch to Map view again
16. Click on a marker
17. Assert info window opens
18. Click "Select" in info window
19. Assert PickupLocationCard opens
20. Assert card displays properly on mobile
21. Click "Confirm"
22. Assert modal closes and location set
```

**Expected Results:**
- Mobile layout displays correctly
- Toggle button visible and functional
- Views switch instantly
- Only one view visible at a time
- Each view properly sized for mobile viewport
- No horizontal scrolling
- Touch targets ≥44x44px
- Selection flow works on mobile

**Automation Implementation Notes:**
```typescript
// Mobile viewport
await page.setViewportSize({ width: 375, height: 667 });

// Toggle verification
await page.click('[data-testid="map-toggle"]');
await expect(page.locator('.map-view')).toBeVisible();
await expect(page.locator('.list-view')).not.toBeVisible();

// No horizontal scroll
const body = await page.locator('body').boundingBox();
expect(body.width).toBeLessThanOrEqual(375);
```

**Challenges:**
- Device emulation
- Touch event simulation
- Mobile-specific timing

---

### TC-004: Search Functionality

| Property | Details |
|----------|---------|
| **TC ID** | TC-004 |
| **Priority** | P1 - High |
| **Type** | Functional |
| **Automation Feasibility** | 🟡 Medium |
| **Estimated Effort** | 3-4 hours |
| **Framework** | Playwright |
| **Tags** | `@high` `@bopis` `@search` `@filtering` |

**Preconditions:**
- Modal accessible
- Multiple locations with different names
- Valid and invalid test addresses

**Test Steps:**
```typescript
1. Open pickup location modal
2. Enter partial location name "Mall" in search
3. Assert results filter to matching locations only
4. Assert map shows only matching markers
5. Assert list shows only matching locations
6. Assert map and list synchronized
7. Click clear button (X)
8. Assert all locations restored
9. Enter full address in search
10. Assert map zooms to address area
11. Assert nearby locations highlighted
12. Enter invalid address "XXXXXX123"
13. Assert appropriate error/empty state shown
14. Assert no crash, graceful error handling
15. Clear invalid search
16. Assert returns to normal state
17. Type rapidly: "M", "Ma", "Mal", "Mall"
18. Assert search debounces (not 4 API calls)
19. Assert reasonable API call count
```

**Expected Results:**
- Search accepts input correctly
- Results filter accurately
- Map and list stay synchronized
- Partial matches work
- Clear button restores all locations
- Address search zooms map
- Invalid addresses handled gracefully
- Rapid typing debounced
- Reasonable API call count

**Automation Implementation Notes:**
```typescript
// Search and filter
await page.fill('[data-testid="search-input"]', 'Mall');
await page.waitForResponse(resp => resp.url().includes('locations'));

const visibleLocations = page.locator('.location-item:visible');
await expect(visibleLocations).toHaveCount(expectedCount);

// Debounce verification
await page.route('**/api/locations**', route => {
  apiCallCount++;
  route.continue();
});

// Type rapidly
for (const char of 'Mall') {
  await page.type('[data-testid="search-input"]', char, { delay: 50 });
}
expect(apiCallCount).toBeLessThan(4); // Should be 1-2 due to debounce
```

**Challenges:**
- Debounce timing verification
- API call monitoring
- Google Maps marker visibility

---

### TC-005: Filter Operations

| Property | Details |
|----------|---------|
| **TC ID** | TC-005 |
| **Priority** | P1 - High |
| **Type** | Functional |
| **Automation Feasibility** | 🟢 Easy |
| **Estimated Effort** | 2-3 hours |
| **Framework** | Playwright |
| **Tags** | `@high` `@bopis` `@filtering` |

**Preconditions:**
- Locations with various availability statuses
- Distance data available

**Test Steps:**
```typescript
1. Open pickup location modal
2. Assert filter section visible and styled
3. Apply availability filter (if available)
4. Assert list shows only available locations
5. Assert unavailable locations greyed/hidden on map
6. Apply distance filter (if available)
7. Assert locations sorted by distance
8. Combine availability + distance filters
9. Assert both filters apply correctly
10. Enter search term while filters active
11. Assert search respects active filters
12. Clear all filters
13. Assert all locations return
14. Assert map shows all locations
```

**Expected Results:**
- Filter UI displays correctly
- Availability filter works
- Distance filter works
- Multiple filters combine properly
- Search respects active filters
- Clear filters restores all
- Map/list stay synchronized

**Automation Implementation Notes:**
```typescript
// Apply filter
await page.click('[data-testid="filter-available"]');
await expect(page.locator('.location-item:visible')).toHaveAttribute('data-available', 'true');

// Multiple filters
await page.click('[data-testid="filter-distance"]');
const locations = page.locator('.location-item:visible');
const count = await locations.count();
// Verify count reduced appropriately

// Clear filters
await page.click('[data-testid="clear-filters"]');
await expect(page.locator('.location-item:visible')).toHaveCount(totalCount);
```

**Challenges:**
- Dynamic filter availability
- State verification across map/list

---

### TC-006: Map Interaction & Info Windows

| Property | Details |
|----------|---------|
| **TC ID** | TC-006 |
| **Priority** | P1 - High |
| **Type** | Functional |
| **Automation Feasibility** | 🟠 Hard |
| **Estimated Effort** | 5-6 hours |
| **Framework** | Playwright |
| **Tags** | `@high` `@bopis` `@map` `@google-maps` |

**Preconditions:**
- Google Maps API configured
- Multiple locations with markers

**Test Steps:**
```typescript
1. Open pickup location modal
2. Assert map loads completely (no blank)
3. Assert markers visible
4. Click zoom in control
5. Assert map zooms smoothly
6. Click zoom out control
7. Assert map zooms smoothly
8. Drag map to pan
9. Assert map pans smoothly
10. Click marker A
11. Assert info window A opens
12. Immediately click marker B
13. Assert info window B opens, A closes
14. Assert only one info window visible
15. Rapidly click 5 markers in succession
16. Assert no crashes
17. Assert only one info window always visible
18. Click map background
19. Assert info window closes
20. Use keyboard (Tab) to navigate list
21. Assert map pans to corresponding location
22. Assert smooth pan animation with idle callback
```

**Expected Results:**
- Map renders completely
- All markers visible
- Zoom works smoothly
- Pan/drag works smoothly
- Info windows open correctly
- Only one info window at a time
- No race conditions
- Background click closes info window
- Keyboard navigation updates map
- Smooth animations

**Automation Implementation Notes:**
```typescript
// Google Maps interaction (challenging)
// Need to access Google Maps API directly
await page.evaluate(() => {
  const map = window.googleMapInstance;
  map.setZoom(map.getZoom() + 1);
});

// Info window race condition test
for (let i = 0; i < 5; i++) {
  await page.click(`[data-marker-id="${i}"]`, { delay: 100 });
}
const infoWindows = page.locator('.gm-style-iw');
await expect(infoWindows).toHaveCount(1);

// Pan animation wait
await page.waitForFunction(() => {
  const map = window.googleMapInstance;
  return !map.getBounds().equals(window.lastBounds);
});
```

**Challenges:**
- Google Maps is in iframe/shadow DOM
- Accessing Google Maps API directly
- Timing of animations
- Race condition verification

---

### TC-007: Pickup Location Card Component

| Property | Details |
|----------|---------|
| **TC ID** | TC-007 |
| **Priority** | P1 - High |
| **Type** | Functional |
| **Automation Feasibility** | 🟢 Easy |
| **Estimated Effort** | 2-3 hours |
| **Framework** | Playwright |
| **Tags** | `@high` `@bopis` `@component` |

**Preconditions:**
- Locations with complete information

**Test Steps:**
```typescript
1. Open pickup location modal
2. Click location (marker or list item)
3. Assert PickupLocationCard dialog opens
4. Assert card structure present
5. Assert location name displays
6. Assert address displays
7. Assert hours of operation display
8. Assert availability info (chip-based)
9. Assert contact info displays
10. Assert Confirm and Cancel buttons present
11. Click "Cancel" button
12. Assert dialog closes, returns to modal
13. Assert map position unchanged
14. Select location again
15. Assert card reopens
16. Click "Confirm" button
17. Assert card closes
18. Assert modal closes
19. Assert location set in cart
```

**Expected Results:**
- Card opens on selection
- All information displays
- Cancel returns to modal
- Confirm completes selection
- State preserved on cancel
- Location appears in cart

**Automation Implementation Notes:**
```typescript
// Verify card content
await expect(page.locator('[data-testid="location-card"]')).toBeVisible();
await expect(page.locator('[data-testid="location-name"]')).toContainText(/\w+/);
await expect(page.locator('[data-testid="location-address"]')).toBeVisible();
await expect(page.locator('[data-testid="location-hours"]')).toBeVisible();
await expect(page.locator('[data-testid="availability-chip"]')).toBeVisible();

// Cancel and verify state
await page.click('[data-testid="cancel-button"]');
await expect(page.locator('[data-testid="location-card"]')).not.toBeVisible();
await expect(page.locator('[data-testid="map-modal"]')).toBeVisible();
```

**Challenges:**
- Minimal - straightforward DOM interaction

---

### TC-008: Scroll Behavior & Modal Controls

| Property | Details |
|----------|---------|
| **TC ID** | TC-008 |
| **Priority** | P2 - Medium |
| **Type** | Functional |
| **Automation Feasibility** | 🟡 Medium |
| **Estimated Effort** | 2-3 hours |
| **Framework** | Playwright |
| **Tags** | `@medium` `@bopis` `@scroll` `@modal` |

**Preconditions:**
- Location list with enough items to scroll

**Test Steps:**
```typescript
1. Open pickup location modal
2. Assert modal structure (header, content, footer)
3. Scroll location list down
4. Assert list scrolls
5. Assert map remains static (no scroll)
6. Scroll to bottom of list
7. Assert scroll stops at end
8. Scroll to top of list
9. Assert scroll stops at top
10. Open location card
11. Assert card opens over modal
12. Attempt to scroll background modal
13. Assert background scroll disabled
14. Close card
15. Assert modal scroll re-enabled
16. Open and close modal 5 times rapidly
17. Assert no scroll issues
```

**Expected Results:**
- List scrolls independently
- Map does not scroll
- Scroll boundaries work
- Card disables background scroll
- Scroll re-enabled after close
- Rapid operations work correctly

**Automation Implementation Notes:**
```typescript
// Scroll verification
const listBefore = await page.locator('.location-list').evaluate(el => el.scrollTop);
await page.locator('.location-list').evaluate(el => el.scrollBy(0, 100));
const listAfter = await page.locator('.location-list').evaluate(el => el.scrollTop);
expect(listAfter).toBeGreaterThan(listBefore);

// Map static
const mapScrollBefore = await page.locator('.map-container').evaluate(el => el.scrollTop);
// ... scroll list ...
const mapScrollAfter = await page.locator('.map-container').evaluate(el => el.scrollTop);
expect(mapScrollAfter).toBe(mapScrollBefore);

// Background scroll disabled
await page.click('[data-testid="select-location"]');
const isScrollable = await page.locator('.modal-background').evaluate(el => {
  return window.getComputedStyle(el).overflow !== 'hidden';
});
expect(isScrollable).toBe(false);
```

**Challenges:**
- Scroll state verification
- Timing of scroll enable/disable

---

### TC-009: Responsive Breakpoint Testing

| Property | Details |
|----------|---------|
| **TC ID** | TC-009 |
| **Priority** | P1 - High |
| **Type** | Functional |
| **Automation Feasibility** | 🟡 Medium |
| **Estimated Effort** | 4-5 hours |
| **Framework** | Playwright |
| **Tags** | `@high` `@bopis` `@responsive` `@breakpoints` |

**Preconditions:**
- Browser dev tools for responsive testing

**Test Steps:**
```typescript
// For each breakpoint: 320px, 375px, 425px, 768px, 1024px, 1440px, 1920px
1. Set viewport to width
2. Navigate to cart
3. Open pickup modal
4. Assert appropriate layout for breakpoint
5. Test search functionality
6. Test location selection
7. Assert no horizontal scroll
8. Assert no layout breaks
9. Assert interactive elements work
10. Assert text readable and not truncated
```

**Expected Results:**
- Layout matches design at each breakpoint
- No broken layouts
- No horizontal scrolling
- All functionality works
- Interactive elements sized correctly
- Mobile toggle for <768px
- Desktop side-by-side for >=768px

**Automation Implementation Notes:**
```typescript
const breakpoints = [320, 375, 425, 768, 1024, 1440, 1920];

for (const width of breakpoints) {
  await test.step(`Test at ${width}px`, async () => {
    await page.setViewportSize({ width, height: 667 });
    await page.goto(cartUrl);

    // Assert appropriate layout
    if (width < 768) {
      await expect(page.locator('[data-testid="toggle-button"]')).toBeVisible();
    } else {
      await expect(page.locator('.location-list')).toBeVisible();
      await expect(page.locator('.map-container')).toBeVisible();
    }

    // Check no horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
}
```

**Challenges:**
- Multiple viewport configurations
- Layout verification at each size
- Time-consuming execution

---

### TC-010: Localization Testing

| Property | Details |
|----------|---------|
| **TC ID** | TC-010 |
| **Priority** | P3 - Low |
| **Type** | Functional |
| **Automation Feasibility** | 🟡 Medium |
| **Estimated Effort** | 6-8 hours |
| **Framework** | Playwright |
| **Tags** | `@low` `@bopis` `@localization` `@i18n` |

**Preconditions:**
- All 13 languages configured (de, en, es, fi, fr, it, ja, no, pl, pt, ru, sv, zh)

**Test Steps:**
```typescript
// For each language
1. Change language setting
2. Open pickup location modal
3. Assert all UI elements translated
4. Assert search placeholder translated
5. Assert button labels translated
6. Assert filter labels translated
7. Assert location card content appropriate
8. Assert text fits in containers
9. Assert no truncation
10. Test complete selection flow
```

**Expected Results:**
- All UI translated
- No translation keys visible
- Text fits containers
- No layout breaks
- Complete flow works in all languages
- Special characters display correctly

**Automation Implementation Notes:**
```typescript
const languages = ['de', 'en', 'es', 'fi', 'fr', 'it', 'ja', 'no', 'pl', 'pt', 'ru', 'sv', 'zh'];

for (const lang of languages) {
  await test.step(`Test language: ${lang}`, async () => {
    await page.goto(`${baseUrl}?lang=${lang}`);
    await openModal();

    // Check no translation keys (usually format: translation.key.name)
    const translationKeys = page.locator('text=/translation\\.|\\{\\{.*\\}\\}/');
    await expect(translationKeys).toHaveCount(0);

    // Check text overflow
    const buttons = page.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const hasOverflow = await button.evaluate(el => {
        return el.scrollWidth > el.clientWidth;
      });
      expect(hasOverflow).toBe(false);
    }
  });
}
```

**Challenges:**
- Large scope (13 languages)
- Text overflow detection
- Character set verification

---

### TC-011: Performance Testing

| Property | Details |
|----------|---------|
| **TC ID** | TC-011 |
| **Priority** | P2 - Medium |
| **Type** | Performance |
| **Automation Feasibility** | 🟠 Hard |
| **Estimated Effort** | 6-8 hours |
| **Framework** | Playwright + Lighthouse |
| **Tags** | `@medium` `@bopis` `@performance` |

**Preconditions:**
- Test environments with varying location counts (5, 50, 100, 200)
- Performance monitoring tools

**Test Steps:**
```typescript
// Test with different location counts
1. Modal open time measurement
2. Search response time
3. Filter response time
4. FPS during interactions
5. Memory usage monitoring
6. Network request count
```

**Expected Results:**
- 1-5 locations: Instant load
- 10-50 locations: <1s load
- 50-100 locations: <2s load
- 100+ locations: Clustering active
- 60fps interactions
- No memory leaks
- Reasonable API calls

**Automation Implementation Notes:**
```typescript
// Performance timing
await page.evaluate(() => performance.mark('modal-open-start'));
await page.click('[data-testid="open-modal"]');
await page.waitForSelector('[data-testid="map-modal"]');
await page.evaluate(() => performance.mark('modal-open-end'));

const timing = await page.evaluate(() => {
  performance.measure('modal-open', 'modal-open-start', 'modal-open-end');
  const measure = performance.getEntriesByName('modal-open')[0];
  return measure.duration;
});
expect(timing).toBeLessThan(1000); // <1s

// Memory leak detection
const initialMemory = await page.evaluate(() => performance.memory.usedJSHeapSize);
// ... open/close modal 10 times ...
const finalMemory = await page.evaluate(() => performance.memory.usedJSHeapSize);
const leakThreshold = initialMemory * 1.2; // 20% increase acceptable
expect(finalMemory).toBeLessThan(leakThreshold);

// Network monitoring
let requestCount = 0;
page.on('request', request => {
  if (request.url().includes('api/locations')) requestCount++;
});
await performSearch();
expect(requestCount).toBeLessThan(5);
```

**Challenges:**
- Requires performance API
- Environment-dependent results
- Memory leak detection reliability

---

### TC-012: Error Handling & Edge Cases

| Property | Details |
|----------|---------|
| **TC ID** | TC-012 |
| **Priority** | P3 - Low |
| **Type** | Functional |
| **Automation Feasibility** | 🟠 Hard |
| **Estimated Effort** | 5-6 hours |
| **Framework** | Playwright |
| **Tags** | `@low` `@bopis` `@error-handling` `@edge-cases` |

**Preconditions:**
- Ability to mock API responses
- Test data with edge cases

**Test Steps:**
```typescript
1. Mock API to return empty locations array
2. Assert empty state message displayed
3. Block Google Maps API
4. Assert graceful fallback/error
5. Mock geolocation denial
6. Assert app continues without geolocation
7. Test location with invalid coordinates (999, 999)
8. Assert error handled, no crash
9. Mock network error during search
10. Assert error message shown
11. Test location with 200+ character name
12. Assert text truncated/wrapped
13. Test special characters/emojis in location name
14. Assert displays correctly
```

**Expected Results:**
- Empty state handled gracefully
- API failures show error
- Geolocation denial doesn't block
- Invalid data handled
- Network errors shown
- Long text handled
- Special characters work
- No crashes

**Automation Implementation Notes:**
```typescript
// Mock empty response
await page.route('**/api/locations', route => {
  route.fulfill({ status: 200, body: JSON.stringify({ locations: [] }) });
});
await openModal();
await expect(page.locator('[data-testid="empty-state"]')).toBeVisible();

// Block Google Maps
await page.route('**/maps.googleapis.com/**', route => route.abort());
await openModal();
await expect(page.locator('[data-testid="map-error"]')).toBeVisible();

// Mock geolocation denial
await page.context().grantPermissions([], { origin: baseUrl });
await openModal();
// Should still work without geolocation

// Network error
await page.route('**/api/locations/search', route => route.abort('failed'));
await searchLocation('test');
await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
```

**Challenges:**
- Requires API mocking
- Environment configuration for error states
- Google Maps blocking

---

### TC-013: Browser Compatibility

| Property | Details |
|----------|---------|
| **TC ID** | TC-013 |
| **Priority** | P1 - High |
| **Type** | Cross-Browser |
| **Automation Feasibility** | 🟡 Medium |
| **Estimated Effort** | 8-10 hours |
| **Framework** | Playwright |
| **Tags** | `@high` `@bopis` `@cross-browser` |

**Preconditions:**
- Playwright with chromium, firefox, webkit

**Test Steps:**
```typescript
// For each browser: chromium, firefox, webkit
// Run subset of critical tests:
1. TC-001 (Map Stability)
2. TC-002 (Desktop Flow)
3. TC-004 (Search)
4. TC-006 (Map Interactions)
5. TC-007 (Location Card)
```

**Expected Results:**
- All functionality works in all browsers
- No browser-specific bugs
- Consistent appearance
- Performance acceptable

**Automation Implementation Notes:**
```typescript
import { chromium, firefox, webkit } from '@playwright/test';

const browsers = [
  { name: 'chromium', launch: chromium.launch },
  { name: 'firefox', launch: firefox.launch },
  { name: 'webkit', launch: webkit.launch },
];

for (const { name, launch } of browsers) {
  test.describe(`${name} tests`, () => {
    test('TC-001: Map Stability', async () => {
      const browser = await launch();
      const page = await browser.newPage();
      // ... run TC-001 ...
      await browser.close();
    });
    // ... other tests ...
  });
}
```

**Challenges:**
- Increased execution time (3x tests)
- Browser-specific quirks
- Webkit limitations

---

### TC-014: Accessibility Testing

| Property | Details |
|----------|---------|
| **TC ID** | TC-014 |
| **Priority** | P3 - Low |
| **Type** | Accessibility |
| **Automation Feasibility** | 🟡 Medium |
| **Estimated Effort** | 3-4 hours |
| **Framework** | Playwright + axe-core |
| **Tags** | `@low` `@bopis` `@a11y` `@accessibility` |

**Preconditions:**
- axe-core installed
- Screen reader testing (manual supplement)

**Test Steps:**
```typescript
1. Open modal using keyboard (Tab + Enter)
2. Assert focus moves to modal
3. Tab through all elements
4. Assert visible focus indicators
5. Assert logical tab order
6. Test keyboard navigation (arrows, Enter, Esc)
7. Run axe-core scan
8. Assert no critical violations
9. Check color contrast
```

**Expected Results:**
- Keyboard accessible
- Focus indicators visible
- Logical tab order
- 0 critical axe violations
- WCAG AA color contrast
- Screen reader compatible

**Automation Implementation Notes:**
```typescript
import { injectAxe, checkA11y } from 'axe-playwright';

await injectAxe(page);
await openModal();

// Run axe scan
await checkA11y(page, '[data-testid="map-modal"]', {
  detailedReport: true,
  detailedReportOptions: { html: true },
}, (violations) => {
  // Fail test if critical violations found
  const critical = violations.filter(v => v.impact === 'critical');
  expect(critical.length).toBe(0);
});

// Keyboard navigation
await page.keyboard.press('Tab');
const focused = await page.evaluate(() => document.activeElement.tagName);
expect(['BUTTON', 'INPUT', 'A']).toContain(focused);

// Color contrast (manual or via axe)
```

**Challenges:**
- Screen reader testing still needs manual
- Focus order verification
- axe-core has limitations

---

### TC-015: Integration Testing

| Property | Details |
|----------|---------|
| **TC ID** | TC-015 |
| **Priority** | P1 - High |
| **Type** | E2E Integration |
| **Automation Feasibility** | 🟢 Easy |
| **Estimated Effort** | 3-4 hours |
| **Framework** | Playwright |
| **Tags** | `@high` `@bopis` `@e2e` `@integration` |

**Preconditions:**
- Full cart and checkout flow enabled
- Session persistence enabled

**Test Steps:**
```typescript
1. Add products to cart
2. Assert cart updated
3. Select pickup location via modal
4. Assert location set in cart
5. Assert cart displays location details
6. Change to different pickup location
7. Assert cart updates
8. Proceed to checkout
9. Assert checkout loads
10. Assert pickup info in checkout
11. Complete order (in test mode)
12. Assert order confirmation shows pickup details
13. Return to cart
14. Switch to Delivery
15. Assert pickup cleared
16. Switch back to Pickup
17. Assert can select again
18. Refresh page
19. Assert pickup location persists
```

**Expected Results:**
- Complete flow works end-to-end
- Data persists across pages
- Location changes reflected immediately
- Can switch delivery methods
- Session persistence works
- Integration seamless

**Automation Implementation Notes:**
```typescript
// Complete E2E flow
await addProductToCart(page);
await selectPickupLocation(page, 'Store A');

// Verify in cart
const cartLocation = await page.locator('[data-testid="cart-pickup-location"]').textContent();
expect(cartLocation).toContain('Store A');

// Change location
await selectPickupLocation(page, 'Store B');
const updatedLocation = await page.locator('[data-testid="cart-pickup-location"]').textContent();
expect(updatedLocation).toContain('Store B');

// Proceed to checkout
await page.click('[data-testid="checkout-button"]');
await page.waitForURL('**/checkout');
const checkoutLocation = await page.locator('[data-testid="checkout-pickup-location"]').textContent();
expect(checkoutLocation).toContain('Store B');

// Complete order
await completeCheckout(page);
await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible();
const confirmationLocation = await page.locator('[data-testid="confirmation-pickup-location"]').textContent();
expect(confirmationLocation).toContain('Store B');
```

**Challenges:**
- Requires full environment
- Payment integration (use test mode)
- Session management

---

## Regression Test Cases

### REG-001: Standard Delivery Flow

| Property | Details |
|----------|---------|
| **TC ID** | REG-001 |
| **Priority** | P1 - High |
| **Type** | Regression |
| **Automation Feasibility** | 🟢 Easy |
| **Estimated Effort** | 2-3 hours |
| **Framework** | Playwright |
| **Tags** | `@high` `@regression` `@delivery` |

**Test Steps:**
```typescript
1. Add products to cart
2. Navigate to cart
3. Assert "Delivery" option available
4. Select "Delivery" option
5. Enter shipping address
6. Assert address form works
7. Assert address validation works
8. Save address
9. Assert address displays in cart
10. Proceed to checkout
11. Assert checkout works with delivery
```

**Expected Results:**
- Delivery option available
- Address form works as before
- No regression in delivery flow

**Automation Implementation:** Standard form interaction, straightforward.

---

### REG-002: Cart Operations

| Property | Details |
|----------|---------|
| **TC ID** | REG-002 |
| **Priority** | P1 - High |
| **Type** | Regression |
| **Automation Feasibility** | 🟢 Easy |
| **Estimated Effort** | 1-2 hours |
| **Framework** | Playwright |
| **Tags** | `@high` `@regression` `@cart` |

**Test Steps:**
```typescript
1. Add item to cart
2. Assert item appears
3. Change quantity
4. Assert quantity updates
5. Remove item
6. Assert item removed
7. Add multiple items
8. Assert all appear
9. Apply coupon (if available)
10. Assert calculations correct
```

**Expected Results:**
- All cart operations work normally
- No regression

**Automation Implementation:** Simple DOM interactions.

---

### REG-003: Other Modals/Dialogs

| Property | Details |
|----------|---------|
| **TC ID** | REG-003 |
| **Priority** | P2 - Medium |
| **Type** | Regression |
| **Automation Feasibility** | 🟢 Easy |
| **Estimated Effort** | 1-2 hours |
| **Framework** | Playwright |
| **Tags** | `@medium` `@regression` `@modals` |

**Test Steps:**
```typescript
1. Open other modals (quick view, login, etc.)
2. Assert they open correctly
3. Assert they close correctly
4. Assert scroll behavior correct
```

**Expected Results:**
- All other modals work normally
- No regression

**Automation Implementation:** Modal interaction tests.

---

### REG-004: Checkout Flow

| Property | Details |
|----------|---------|
| **TC ID** | REG-004 |
| **Priority** | P1 - High |
| **Type** | Regression |
| **Automation Feasibility** | 🟢 Easy |
| **Estimated Effort** | 2-3 hours |
| **Framework** | Playwright |
| **Tags** | `@high` `@regression` `@checkout` |

**Test Steps:**
```typescript
1. Add products to cart
2. Proceed to checkout
3. Enter/confirm shipping
4. Proceed to payment
5. Enter payment (test mode)
6. Complete order
7. Assert order confirmation
```

**Expected Results:**
- Checkout flow works normally
- No regression

**Automation Implementation:** E2E checkout flow.

---

### REG-005: Payment Processing

| Property | Details |
|----------|---------|
| **TC ID** | REG-005 |
| **Priority** | P1 - High |
| **Type** | Regression |
| **Automation Feasibility** | 🟡 Medium |
| **Estimated Effort** | 2-3 hours |
| **Framework** | Playwright |
| **Tags** | `@high` `@regression` `@payment` |

**Test Steps:**
```typescript
1. Proceed to checkout
2. Select payment method
3. Enter payment details (test mode)
4. Submit payment
5. Assert payment processes
6. Assert order completes
```

**Expected Results:**
- Payment works normally
- No regression

**Automation Implementation:** Payment gateway integration (use test mode).

---

### REG-006: Order History

| Property | Details |
|----------|---------|
| **TC ID** | REG-006 |
| **Priority** | P2 - Medium |
| **Type** | Regression |
| **Automation Feasibility** | 🟢 Easy |
| **Estimated Effort** | 1-2 hours |
| **Framework** | Playwright |
| **Tags** | `@medium` `@regression` `@order-history` |

**Test Steps:**
```typescript
1. Log in to account
2. Navigate to order history
3. Assert orders display
4. View pickup order details
5. Assert pickup location displays
6. View delivery order details
7. Assert delivery address displays
```

**Expected Results:**
- Order history displays correctly
- No regression

**Automation Implementation:** Simple navigation and assertion.

---

## Automation Summary Table

| TC ID | Feasibility | Priority | Effort | Framework | Execution Time |
|-------|-------------|----------|--------|-----------|----------------|
| TC-001 | 🟡 Medium | P0 | 3-4h | Playwright | ~3 min |
| TC-002 | 🟡 Medium | P0 | 4-5h | Playwright | ~5 min |
| TC-003 | 🟢 Easy | P0 | 2-3h | Playwright | ~2 min |
| TC-004 | 🟡 Medium | P1 | 3-4h | Playwright | ~3 min |
| TC-005 | 🟢 Easy | P1 | 2-3h | Playwright | ~2 min |
| TC-006 | 🟠 Hard | P1 | 5-6h | Playwright | ~5 min |
| TC-007 | 🟢 Easy | P1 | 2-3h | Playwright | ~2 min |
| TC-008 | 🟡 Medium | P2 | 2-3h | Playwright | ~2 min |
| TC-009 | 🟡 Medium | P1 | 4-5h | Playwright | ~10 min |
| TC-010 | 🟡 Medium | P3 | 6-8h | Playwright | ~20 min |
| TC-011 | 🟠 Hard | P2 | 6-8h | Playwright+Lighthouse | ~15 min |
| TC-012 | 🟠 Hard | P3 | 5-6h | Playwright | ~5 min |
| TC-013 | 🟡 Medium | P1 | 8-10h | Playwright | ~15 min |
| TC-014 | 🟡 Medium | P3 | 3-4h | Playwright+axe | ~3 min |
| TC-015 | 🟢 Easy | P1 | 3-4h | Playwright | ~5 min |
| REG-001 | 🟢 Easy | P1 | 2-3h | Playwright | ~2 min |
| REG-002 | 🟢 Easy | P1 | 1-2h | Playwright | ~1 min |
| REG-003 | 🟢 Easy | P2 | 1-2h | Playwright | ~1 min |
| REG-004 | 🟢 Easy | P1 | 2-3h | Playwright | ~3 min |
| REG-005 | 🟡 Medium | P1 | 2-3h | Playwright | ~3 min |
| REG-006 | 🟢 Easy | P2 | 1-2h | Playwright | ~1 min |

**Total Development Effort:** ~70-85 hours
**Total Execution Time:** ~108 minutes (~1.8 hours for full suite)

---

## Automation ROI Analysis

### Initial Investment
- **Development:** 70-85 hours
- **Infrastructure Setup:** 10-15 hours
- **CI/CD Integration:** 5-10 hours
- **Total:** ~85-110 hours

### Ongoing Costs
- **Maintenance:** ~5-10 hours/month
- **Test Updates:** ~3-5 hours/sprint
- **CI/CD Resources:** ~$50-100/month

### Returns
- **Manual Execution Time Saved:** ~4 hours/regression cycle
- **Frequency:** ~2-4 times/month
- **Time Saved/Month:** ~8-16 hours
- **ROI Break-even:** ~5-7 months

### Additional Benefits
- Faster feedback loops
- Consistent test execution
- Earlier bug detection
- Regression confidence
- Documentation through code

---

**Document Version:** 1.0
**Last Updated:** 2026-01-29
**Maintained By:** QA Automation Team
