# BUG: BOPIS Pickup Location Search Input Has 14px Font-Size (iOS Zoom Risk)

**Jira Ticket:** [VCST-4579](https://virtocommerce.atlassian.net/browse/VCST-4579)

## Summary
The search input field in the BOPIS "Pick points" modal uses a font-size of 14px, which is below the 16px threshold that causes iOS Safari to auto-zoom when the input is focused. This creates a poor user experience on iOS devices where the page zooms in unexpectedly when users tap the search field.

## Environment
- **URL:** https://vcst-qa-storefront.govirto.com/cart
- **Viewport:** Mobile (375x667)
- **Browser Tested:** Chrome (via Playwright)
- **Affected Browser:** iOS Safari (all versions)
- **Date:** 2026-01-30

## Severity
**Minor** - Affects user experience on iOS devices but does not block functionality

## Steps to Reproduce
1. Navigate to https://vcst-qa-storefront.govirto.com/ on a mobile viewport (375x667) or iOS device
2. Add a product to cart
3. Go to Cart page
4. Ensure "Pickup" delivery option is selected
5. Click the edit button (pencil icon) next to the Pickup point to open the "Pick points" modal
6. Tap on the search input field
7. **On iOS Safari:** Observe that the page zooms in when the input is focused

## Expected Behavior
- The page should NOT zoom when focusing on the search input
- Input fields should have a minimum font-size of 16px on mobile to prevent iOS auto-zoom

## Actual Behavior
- The search input field has a computed font-size of **14px**
- On iOS Safari, this triggers automatic page zoom when the input is focused
- The viewport meta tag does NOT prevent zoom: `width=device-width, initial-scale=1, viewport-fit=cover`

## Technical Analysis

### Input Field Properties
```
Element: input[placeholder="Search "]
Font-size: 14px (BELOW 16px threshold)
Font-family: Lato, sans-serif
Height: 30px
Padding: 0px 8px
CSS Class: vc-input__input
```

### Viewport Meta Tag
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```
- Does NOT include `maximum-scale=1` or `user-scalable=no`
- This allows iOS Safari to zoom on input focus

### Other Affected Inputs in Modal
| Input Placeholder | Font-Size | Visible |
|-------------------|-----------|---------|
| Search | 14px | Yes |
| Search Country | 14px | No (hidden in dropdown) |
| Search State / Province | 14px | No (hidden in dropdown) |
| Search City | 14px | No (hidden in dropdown) |

### Comparison with Other Inputs
| Input Placeholder | Font-Size | Status |
|-------------------|-----------|--------|
| Enter a promo-coupon | 16px | OK |
| Search (in modal) | 14px | ISSUE |

## Search Functionality Test
Despite the font-size issue, the search functionality itself works correctly:
1. Entered "Mall" in search field
2. Clicked search button (magnifying glass icon)
3. Results filtered correctly to show locations containing "Mall":
   - Atlantic Terminal Mall
   - Fulton Mall
   - KYOTO AEON MALL KUMIYAMA
   - Manhattan Mall
   - Staten Island Mall
   - etc.

## Recommended Fix

### Option 1: Increase Font-Size (Recommended)
Update the CSS for `.vc-input__input` class in mobile context to use minimum 16px:
```css
@media (max-width: 768px) {
  .vc-input__input {
    font-size: 16px;
  }
}
```

### Option 2: Use Transform Scale (Visual Alternative)
If 16px appears too large visually, use CSS transform:
```css
.vc-input__input {
  font-size: 16px;
  transform: scale(0.875); /* 14/16 = 0.875 */
  transform-origin: left center;
}
```

### Option 3: Viewport Meta (Not Recommended)
Adding `maximum-scale=1` to viewport is NOT recommended as it impacts accessibility for users who need to zoom.

## Console Errors
No JavaScript errors related to search functionality. Only unrelated 404 errors for missing images:
```
Failed to load resource: the server responded with a status of 404 ()
@ https://vcst-qa.govirto.com/cms-content/assets/catalog/6032b/DRH-42771013/Images/threecentsCherry-Soda-1-e1585652933596_216x216_md.png
```

## Screenshots

### Evidence Flow
1. `MOBILE-SEARCH-00-homepage.png` - Initial homepage on mobile viewport
2. `MOBILE-SEARCH-01-cart-page.png` - Cart page with items
3. `MOBILE-SEARCH-02-shipping-section.png` - Shipping details section visible
4. `MOBILE-SEARCH-03-pickup-point-visible.png` - Pickup point with edit button
5. `MOBILE-SEARCH-04-modal-opened.png` - Pick points modal opened
6. `MOBILE-SEARCH-05-text-entered.png` - "Mall" typed in search field
7. `MOBILE-SEARCH-06-after-search-click.png` - Search results showing Mall locations
8. `MOBILE-SEARCH-07-country-filter-open.png` - Country filter dropdown open

## Related Issues
- All search inputs in filter dropdowns (Country, State/Province, City) also use 14px font-size
- The promo-coupon input correctly uses 16px font-size

## Testing Notes
- The zoom behavior was not reproducible in Playwright/Chrome as it is iOS Safari-specific
- Manual testing on an actual iOS device is recommended to confirm the zoom behavior
- The search functionality itself works correctly regardless of the font-size issue

## References
- [Apple Developer Documentation on Input Zoom](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/UsingtheViewport/UsingtheViewport.html)
- iOS Safari auto-zooms on input focus when font-size < 16px to improve readability
