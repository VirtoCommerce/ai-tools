# Visual & Behavioral Bug Detection Checklist

> Extracted from qa-frontend-expert agent. Read before any test session. Run these checks on EVERY page.

---

## A. Component Behavior States

For every interactive component, verify all states:

**Interactive States:**
- Default — renders correctly with proper styling
- Hover — visual feedback (color change, underline, shadow, cursor: pointer)
- Active/Pressed — visual feedback on click/tap
- Focus — visible focus ring/outline (keyboard navigation)
- Disabled — grayed out, cursor: not-allowed, not clickable
- Loading — spinner/skeleton/shimmer, not frozen UI
- Error — red border, error message, icon
- Empty — meaningful message, not blank
- Selected/Active — highlighted, checked, filled
- Expanded/Collapsed — smooth transition, icon rotation

**Component-Specific:**
- Dropdowns — open/close, selectable, close on outside click/Escape
- Modals — animation, overlay dims, close on X/outside click/Escape
- Accordions — smooth expand/collapse, single-mode if applicable
- Tabs — correct active, content switches, no flash
- Tooltips — appear on hover/focus, positioned correctly, no overflow
- Toasts — appear, auto-dismiss, manual dismiss
- Carousels — arrows, indicators, auto-play pauses on hover
- Quantity selectors — increment/decrement, min/max, manual input validated
- Toggle switches — visual matches actual state, animated
- Date pickers — opens correctly, selection works

**Timing & Transitions:**
- No abrupt appearance/disappearance (use transitions)
- Animations smooth (no jank/stuttering)
- Loading states < 200ms after action
- Debounced inputs not laggy
- Double-click prevention on submit
- Optimistic UI updates feel instant

---

## B. UI Bugs & Visual Glitches

**Element Rendering:**
- No overlapping elements
- No clipped/cut-off text, icons, images
- No invisible interactive elements
- No phantom borders/shadows
- No visual artifacts
- No flickering elements
- No FOUC (flash of unstyled content)
- No flash of wrong content

**Z-Index & Layering:**
- Modals above everything (including sticky headers)
- Dropdowns above surrounding content
- Tooltips above parents
- Sticky header above page content
- No element covering interactive elements
- Overlay covers entire viewport

**Colors & Typography:**
- Text readable (sufficient contrast)
- No invisible text (matching background)
- Font weights correct
- No mixed font families
- Links distinguishable from body text
- Error=red, success=green
- Placeholder styled differently from user input

**Icons & Images:**
- No broken image icons
- Icons vertically aligned with text
- SVGs scale, no pixelation
- No stretched/squished images
- Alt text present
- Loading placeholders before images
- Favicon loads

**Spacing & Alignment:**
- Consistent padding within similar components
- Consistent margins between sections
- Text alignment consistent
- Labels align with inputs
- Button text centered
- List items evenly spaced
- No single-pixel misalignments
- No extra whitespace at bottom

---

## C. Layout Breaks

Check at EVERY viewport (320, 375, 428, 768, 1024, 1280, 1920):

**Overflow Issues:**
- No horizontal scrollbar where unintended
- No text overflowing containers
- No button text spilling outside
- Tables don't break layout on small screens
- Long URLs/SKUs don't push containers wider
- Images don't overflow

**Responsive Breakpoints:**
- Smooth transitions between breakpoints
- No elements disappearing unexpectedly
- No incorrect stacking (overlapping instead of stacking)
- Grid columns collapse properly (4 > 2 > 1)
- Sidebar collapses at correct breakpoint
- Full-width elements no side gaps

**Container Issues:**
- Content doesn't shift with scrollbar appear/disappear
- Fixed-width containers don't overflow mobile
- Flex items don't shrink to unreadable
- Absolutely positioned elements stay in containers
- Sticky elements don't overlap other content

**Specific Patterns:**
- Header: full-width, all items accessible
- Navigation: hamburger works, mega-menu no overflow
- Product grid: same height per row, no orphan gaps
- Forms: labels/inputs aligned, errors don't shift layout
- Footer: full-width, columns stack on mobile
- Modals: centered, no overflow, scrollable if tall
- Tables: responsive, no cut-off data

**CLS (Content Layout Shift):**
- No content jumping when images/fonts/ads load
- No buttons moving after async render
- Reserve space for dynamic content
- CLS < 0.1

---

## D. Content Verification

**Text Content:**
- No placeholder text ("Lorem ipsum", "TBD", "TODO", "test")
- No debug text ("undefined", "null", "NaN", "[object Object]")
- No raw HTML rendered ("<br>", "&amp;")
- No encoding issues (mojibake)
- No untranslated i18n keys
- No empty headings/paragraphs
- No duplicate content

**Dynamic Content:**
- Product names not truncated without ellipsis
- Prices correct format ($1,234.56)
- Dates user-friendly (not ISO/timestamps)
- Singular/plural correct (0/1/many)
- Empty states have helpful messaging
- Error messages user-friendly
- Success messages confirm action

**Admin <-> Storefront Consistency:**
- Product names match
- Prices match (including sale)
- Inventory status matches availability
- Category structure matches navigation
- Order totals match
- Customer info matches

---

## E. Scrolling Behavior

**Page Scroll:**
- Smooth (60fps)
- Position preserves on back navigation
- Scroll-to-top button appears
- Anchor links smooth scroll
- Infinite scroll loads at threshold with indicator
- Pagination resets scroll to top

**Sticky Elements:**
- Header doesn't cover content (padding compensation)
- Sticky cart bar doesn't overlap footer
- Sticky filters scroll independently
- No flicker during scroll
- "Back to Top" doesn't overlap CTAs

**Modal Scrolling:**
- Background page DOES NOT scroll when modal open
- Long modal content IS scrollable
- Closing modal restores scroll position
- Body scroll resumes immediately after close

**Mobile Scroll:**
- No rubber-band interfering with pull-to-refresh
- Horizontal swipe on carousel doesn't trigger page back
- Momentum scrolling in overflow containers
- Virtual keyboard doesn't cause scroll jumps
- Country dropdown scrollable on mobile

---

## F. Focus Management & Keyboard Navigation

**Tab Order:**
- Logical reading order (left-to-right, top-to-bottom)
- No jumps to unexpected elements
- Shift+Tab works backwards
- All interactive elements reachable
- Non-interactive not in tab order
- Skip-to-content link available
- Tab follows visual order

**Focus Visibility:**
- Visible focus indicator on focused element
- Sufficient contrast
- Consistent style
- :focus-visible support

**Focus Trap (Modals):**
- Opening moves focus INTO modal
- Tab cycles WITHIN modal only
- Shift+Tab wraps from first to last
- Escape closes and returns focus to trigger

**Focus Restoration:**
- Close modal -> focus to trigger
- Submit form -> focus to success/next
- Delete item -> focus to next item
- Pagination/filter -> focus to results

**Keyboard Shortcuts:**
- Enter/Space activates buttons/links
- Enter submits forms
- Space toggles checkboxes
- Arrows navigate radio/tabs/menus/dropdowns
- Escape closes overlays
- Type-ahead in selects

---

## G. Quick Bug Detection (Run on EVERY Page)

**5-Second Visual Scan:**
- Anything broken? (overlaps, gaps, misalignment)
- Anything missing? (images, text, sections)
- Anything unexpected? (debug text, raw data, wrong language)
- Layout feel right? (spacing, hierarchy, balance)

**Interaction Check:**
- Every click produces expected feedback?
- Hover effects on all interactive elements?
- Loading states during async operations?
- Error states display correctly?

**Scroll & Viewport Check:**
- Horizontal scrollbar where shouldn't be?
- Content shift on load?
- Sticky elements correct?
- Content accessible behind fixed elements?

**Keyboard Check (once per flow):**
- Entire flow completable keyboard-only?
- Focus always visible?
- Logical order?
- Trapped correctly in modals?
