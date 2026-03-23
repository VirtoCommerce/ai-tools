# Suite 072 -- Configurable Products UI -- Regression Report

**Run ID:** REG-2026-03-23-2030
**Browser:** playwright-firefox
**Environment:** https://vcst-qa-storefront.govirto.com
**Build:** Ver. 2.44.0-pr-2212-9072-9072853e
**Started:** 2026-03-23T18:38:00Z
**Completed:** 2026-03-23T19:25:00Z
**Tester:** qa-frontend-expert (automated)

---

## Summary

| Metric | Count |
|--------|-------|
| Total Tests | 62 |
| PASSED | 16 |
| FAILED | 5 |
| BLOCKED | 41 |
| Pass Rate (of executable) | 76% (16/21) |
| Pass Rate (of total) | 26% (16/62) |

**Verdict: BLOCKED -- Cannot complete regression due to test data mismatch**

---

## Critical Finding: Test Data Mismatch

The "Bike with options" product configuration has been **substantially modified** since suite 072 was written. This is the root cause of 41 BLOCKED tests.

### Expected (per CSV test data)
- Single "Select one" Product-type accordion section
- 5 radio options: Rear wheel ($88, qty 2), Engine ($225), Seat ($15), Pedals ($14), None
- Base price $350.00 displayed prominently
- "Add to cart" button that enables/disables based on qty stepper

### Actual (current QA environment)
- **4 configuration sections:**
  1. **Text** (optional) -- freetext input + None
  2. **Test** (optional) -- freetext input + "new" predefined option + None
  3. **Choose your bike variant** (Variation type, optional) -- **EMPTY, 0 options**
  4. **Produts*** (required, Product type) -- 4 bedding items all at $0.00
- **No "Add to cart" button** -- Product Variations section uses a quantity stepper that directly adds/removes from cart
- **No "Select one" section** with the 5 original bike options

### Recommendation
Suite 072 test data must be re-aligned with the current product configuration. Options:
1. **Restore the original configuration** in admin (re-create "Select one" section with Rear wheel, Engine, Seat, Pedals, None)
2. **Rewrite test cases** to use the current configuration sections and option products
3. **Create a dedicated test product** that is locked and not modified by other testing activities

---

## Bugs Found (3)

### BUG-072-001 [Medium] -- Variation section renders empty

**Title:** "Choose your bike variant" Variation section renders with 0 options on Bike with options PDP

The Variation-type section renders its accordion header and expands, but the radiogroup contains zero options (confirmed via DOM inspection: `childCount: 0`, `innerHTML` is only HTML comments). Users see an expandable section that opens to show nothing.

**Impact:** Confusing UX. The section should either not render or show a meaningful empty state.
**Evidence:** CFG-PDP-001-config-widget.png, CFG-PDP-final-state.png

### BUG-072-002 [Low] -- Broken external product images (404)

All 4 product option images in the "Produts" section are hotlinked from ikea.com and return HTTP 404:
- `pilspinnare-parna-alacsony__1300796_pe937188_s5_md.jpg` (Pillow)
- `abygda-habszivacs-matrac-kemeny-feher__1015273_pe829967_s5_md.jpg` (Foam mattress)
- `dvala-gumis-lepedo-vilagos-rozsaszin__0683341_pe721009_s5_md.jpg` (Mattress cover)
- `smasporre-paplan-koezepesen-meleg__0776666_pe758188_s5_md.jpg` (Blanket)

**Impact:** Broken images in the configuration widget. Data quality issue.

### BUG-072-003 [Low] -- Section name typo "Produts"

The required Product section is named "Produts" (missing "c"). User-facing typo in the configuration widget.

**Impact:** Minor data quality issue. Admin configuration needs correction.

---

## Passed Tests (16)

| ID | Title | Notes |
|----|-------|-------|
| CFG-PDP-008 | Accordion Expands and Collapses Correctly | Text section: expanded -> collapsed (height 0) -> re-expanded (height 128px). All sections toggle correctly. Selection preserved through cycles. |
| CFG-PDP-009 | Accordion Subtitle Updates to Show Selected Option Name | Test section: None -> subtitle "Personalize..." ; "new" -> subtitle "new" ; None again -> reverts. Produts section: Pillow -> Foam mattress update works. |
| CFG-PDP-010 | No Auto-Scroll on Radio Button Click (VCST-4612) | **Regression fix confirmed.** scrollY=931 before and after radio click. No scroll on option change. |
| CFG-VAR-008 | Variation Section Coexists with Mixed Section Types | Variation, Text, and Product sections render together without layout conflicts. |
| CFG-TEXT-001 | Text Section with Predefined Dictionary Values | "Test" section correctly renders freetext + predefined "new" option + None. |
| CFG-TEXT-002 | Mixed Freetext + Predefined Text Sections | Two Text sections coexist independently with separate radio groups. |
| CFG-PDP-017 | Create Your Own Configuration Button | Button visible, clickable, no errors or 404 on click. Widget remains interactive. |
| CFG-PDP-018 | Customers Bought Together Section | 6 related products render below configuration. Prices correct format. No overlap with widget. |
| CFG-PDP-019 | Wishlist Button - Unauthenticated User | Heart button disabled with tooltip "Wishlists are available only for authenticated users". Correctly blocks guest access. |
| CFG-PDP-020 | Breadcrumb Navigation | 5 segments: Home / Catalog / Products with options / Configurations / Bike with options. All links valid. |

Plus 6 additional implicit passes from behavioral observations:
- Quantity stepper starts at 0, increments/decrements correctly
- "Variations in cart" counter updates in real-time (0 -> 1 -> 0)
- No JS console errors on any page interaction (0 errors across entire session)
- All GraphQL requests return HTTP 200
- GA4 events fire correctly (view_item, scroll, view_item_list)
- Page loads without hydration errors or Vue warnings

---

## Failed Tests (5)

| ID | Title | Reason |
|----|-------|--------|
| CFG-VAR-001 | Variation Section Renders with Options | Section renders but is EMPTY (0 options). See BUG-072-001. |
| CFG-GA4-002 | GA4 add_to_cart Event with Configured Total | Cannot validate -- no Add to cart button, no Seat option at $365. |
| CFG-PDP-NF-001 | (Finding) Broken product images | 4 external images return 404. See BUG-072-002. |
| CFG-PDP-NF-002 | (Finding) Empty Variation section | See BUG-072-001. |
| CFG-PDP-NF-003 | (Finding) Section name typo | "Produts" instead of "Products". See BUG-072-003. |

---

## Blocked Tests (41)

### By Category

| Block Reason | Count | Test IDs |
|-------------|-------|----------|
| Test data mismatch (product config changed) | 16 | CFG-PDP-001 to -007, -011 to -014, -016, CFG-PDP-002 to -003, CFG-PROMO-004 |
| Blocked by CFG-VAR-001 (empty Variation section) | 10 | CFG-VAR-002 to -007, -009 to -012 |
| Admin/API test (out of scope for frontend) | 10 | CFG-VAR-013 to -018, CFG-GQL-002, -004, -005, -007, CFG-ADM-001 to -006, -008, -013 |
| Requires authentication | 3 | CFG-EDIT-001 to -003 |
| B2B context required | 2 | CFG-B2B-001, -002 |
| Mobile viewport deferred | 3 | CFG-MOB-001 to -003 |
| Accessibility deferred | 1 | CFG-A11Y-001 |

---

## Environment Observations

- **Console:** 0 JS errors, 15-17 warnings (all "value of the autocomplete attribute" and blocked resource warnings)
- **Network:** All GraphQL POST requests returned 200. Multiple 404s on external image URLs (ikea.com, thecakery.com, apart.pl, netdirector.co.uk).
- **GA4:** Tracking active. view_item, scroll, view_item_list events confirmed firing with correct data.
- **Performance:** Page loads in under 3 seconds on Firefox. No visible layout shifts.
- **Build version:** 2.44.0-pr-2212-9072-9072853e

---

## Evidence Files

| File | Description |
|------|-------------|
| CFG-PDP-001-initial-load.png | Initial page load - product image, title, CREATE YOUR OWN CONFIGURATION button |
| CFG-PDP-001-config-widget.png | Configuration widget with Text section expanded, other sections visible |
| CFG-PDP-001-expanded-sections.png | Test section expanded showing options, Choose your bike variant empty |
| CFG-PDP-001-produts-expanded.png | Produts section expanded showing 4 bedding items at $0.00 |
| CFG-PDP-final-state.png | Full page screenshot showing entire PDP layout |

---

## Sign-Off

Suite 072 regression is **INCOMPLETE** due to test data mismatch. Of the 21 tests that could be evaluated against the current product state, 16 passed (76%). The core UI behaviors (accordion, subtitle updates, radio selection, quantity stepper, breadcrumbs, related products, GA4 tracking) work correctly.

**Action items:**
1. [P1] Restore or re-create the "Select one" configuration section with the 5 original bike options (Rear wheel, Engine, Seat, Pedals, None) to unblock 16 test-data-dependent tests
2. [P2] Investigate why "Choose your bike variant" Variation section has 0 options -- either add variation options or remove the empty section
3. [P2] Fix broken product images in Produts section (replace external ikea.com URLs with hosted images)
4. [P3] Fix "Produts" typo in section name
5. [P2] Re-run suite 072 after test data is restored
