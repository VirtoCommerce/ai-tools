# Bug Report: Chip Text Alignment Issue

## Bug ID
VCST-4499-CHIP-ALIGN-001

## Severity
**P2 - Content Visibility Bug** (Upgraded from Visual/UI)

⚠️ **UPDATE:** Bug is more severe than initially assessed - icon is HIDDEN and text is NOT FULLY DISPLAYED

## Status
New - Found during TC-006 execution (2026-01-29)

## Environment
- **Application**: VCST QA Storefront
- **URL**: https://vcst-qa-storefront.govirto.com
- **Build**: Ver. 2.41.0-pr-2138-b3bd-b3bd5de4
- **Browser**: Playwright automation
- **Component**: Pickup Location Modal - Location List Items

## Summary
When availability chip content is long (e.g., "Delivery 2-3 days [global transfer]"), the icon and text are not vertically aligned. The icon stays at the top while the text is not centered with it, causing poor visual alignment.

## Steps to Reproduce
1. Navigate to cart page
2. Add products to cart
3. Select 'Pickup' option
4. Click 'Select pickup location'
5. Observe location list items with long availability text:
   - Berjaya Megamall Kuantan
   - Best Buy; San Francisco
   - Billund, Lego House
   - Bloomingdale's
   - Bronx Terminal Market
   - Bronx Zoo
   - Brooklyn Bridge Park

## Expected Result
✅ Icon and text should be vertically centered together (align-items: center)
✅ Both should maintain consistent alignment regardless of text length
✅ Visual harmony between icon and text

## Actual Result
❌ **Icon is completely HIDDEN** - Delivery truck icon not visible in long chips
❌ **Text is TRUNCATED/CUT OFF** - "Delivery 2-3 days [global transfer]" not fully displayed
❌ **Content overflow issue** - Chip container doesn't accommodate full content
❌ Poor visual appearance and missing critical information

## Comparison
- **Short chips** ("Today"): Alignment appears acceptable
- **Long chips** ("Delivery 2-3 days [global transfer]"): Clear misalignment
- **Medium chips** ("Via transfer"): May also be affected

## Visual Evidence
Screenshot: `.playwright-mcp/chip-alignment-bug.png`

Locations affected in list:
- Lines 692-694: Bloomingdale's chip
- Lines 701-703: Bronx Terminal Market chip
- Multiple other locations with long availability text

## Technical Analysis
**Structure in snapshot:**
```yaml
- generic [ref=e6397]:  # Chip container
  - img [ref=e6399]      # Icon (stays at top)
  - text: Delivery 2-3 days [global transfer]  # Text (not aligned)
```

**Root Cause:**
The chip container likely missing proper flexbox alignment:
```css
/* Missing or incorrect: */
.chip-container {
  display: flex;
  align-items: center; /* Required for vertical centering */
}
```

## Impact
- **Critical Information Loss**: Users cannot see delivery icon (important visual indicator)
- **Content Truncation**: Users cannot read full availability text ("Delivery 2-3 days [global transfer]")
- **User Experience**: Severely reduced - missing critical delivery information
- **Usability**: Users may not understand delivery options without full text
- **Accessibility**: Significant impact - missing visual and text content
- **Severity**: Medium-High - Affects information visibility and user decision-making

## Affected Components
1. **Location List Items** (select-address-map-list__item) - CONFIRMED
2. **PickupLocationCard** - To be verified (appeared aligned in screenshot)
3. Other components using similar chips - Unknown

## Test Coverage Gap
**Current test cases DO NOT catch this bug:**
- TC-009 (Responsive Breakpoint Testing) - Closest but focuses on breakpoints, not component alignment
- TC-014 (Accessibility Testing) - Might catch it if affects a11y, not guaranteed

**Recommendation:**
Add **TC-016: Component Visual Alignment** test case to validate:
- Chip icon and text vertical alignment
- Various text lengths rendering correctly
- Visual snapshot comparison

## Proposed Fix
CSS updates for chip container to fix overflow and visibility:
```css
.availability-chip,
.location-chip {
  display: flex;
  align-items: center;  /* Vertical centering */
  gap: 4px;             /* Consistent spacing between icon and text */
  overflow: visible;    /* Prevent content hiding */
  white-space: normal;  /* Allow text wrapping */
  max-width: none;      /* Remove width constraints */
  /* OR */
  min-width: fit-content; /* Ensure container accommodates content */
}

/* Icon should always be visible */
.availability-chip img,
.location-chip img {
  flex-shrink: 0;       /* Prevent icon from shrinking */
  display: block;       /* Ensure icon displays */
}

/* Text should wrap or truncate gracefully with ellipsis */
.availability-chip span,
.location-chip span {
  overflow: hidden;
  text-overflow: ellipsis; /* Show ... if truncation necessary */
  /* OR allow wrapping: */
  word-wrap: break-word;
}
```

## Related Issues
- Part of VCST-4499 BOPIS feature testing
- Found during Map Interaction testing (TC-006)

## Next Steps
1. ✅ Documented bug
2. ⏳ Continue systematic test execution
3. ⏳ Verify if PickupLocationCard has same issue
4. ⏳ Add to bug tracking system
5. ⏳ Propose test case enhancement (TC-016)

---

**Reported by**: Claude Code Automated Testing
**Date**: 2026-01-29
**Test Session**: VCST-4499 PR#2138 Systematic Testing
