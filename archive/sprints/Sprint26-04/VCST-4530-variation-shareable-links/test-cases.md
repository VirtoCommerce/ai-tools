# Test Cases: VCST-4530 - Shareable Clickable Link for Product Variations

**Jira:** https://virtocommerce.atlassian.net/browse/VCST-4530
**PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2182
**Environment:** ${FRONT_URL} (QA: https://vcst-qa-storefront.govirto.com)
**Date:** 2026-02-25
**Prepared by:** Test Management Specialist

---

## Summary

| Total | P1 | P2 | P3 | Functional | Regression | UX | Negative | Exploratory |
|-------|----|----|----|-----------|-----------|----|---------|------------|
| 29    | 14 | 11 | 4  | 18        | 5         | 3  | 2       | 1          |

### Coverage by Section

| Section | Test Cases |
|---------|-----------|
| Product Page / Variations - Default Layout | TC-001, TC-002 |
| Product Page / Variations - Table Layout | TC-003, TC-004, TC-009, TC-014 |
| Product Page / Variations - Shareability | TC-005 |
| Product Page / Variations | TC-006 |
| Product Page / Variations - Regression | TC-007, TC-011 |
| Product Page / Variations - Mobile | TC-008 |
| Product Page / Variations - Edge Cases | TC-010 |
| Product Page / Variations - URL Correctness | TC-012 |
| Product Page / Variations - UX | TC-013 |
| Category Page / Variations | TC-015 |
| Product Page / Variations - Cross-Browser | TC-016, TC-017 |
| Product Page / Variations - Accessibility | TC-018 |
| Product Page / Variations - Navigation | TC-019 |
| Product Page / Variations - Pagination | TC-020 |
| Product Page / Variations - Quality | TC-021 |
| **Catalog / List View - Variations** | **TC-022, TC-023, TC-024, TC-025, TC-026, TC-027, TC-028, TC-029** |

---

## Test Data Requirements

- **Product with default (card/list) layout variations:** A parent product whose `ProductVariationsLayout` property is NOT set to "Table", so variations render as `VcLineItem` cards. Required: at least 2 variations.
- **Product with table layout variations:** A parent product whose `ProductVariationsLayout` property is set to "Table", so variations render in `VcTable`. Required: at least 2 variations.
- **Variation with slug:** At least one variation must have the `slug` field populated in the Admin catalog (e.g., `my-variation-slug`). Expected URL: `/${FRONT_URL}/my-variation-slug`.
- **Variation with ID only (no slug):** At least one variation must have no `slug` set. Expected URL: `${FRONT_URL}/product/{variation-id}`.
- **Second browser / incognito window:** For shareability tests (TC-005, TC-016).
- **Logged-in B2B user:** `USER_EMAIL` / `USER_PASSWORD` from `.env` — for B2B add-to-cart regression.
- **Guest (not logged in):** Clear cookies/session for guest checkout tests.
- **Test product category:** `/products-with-options` or `/e2e-catalog` — confirm with QA lead which parent product has both variation layouts configured.

---

## TC-001: Default Layout - Variation Link Renders and Is Clickable (Slug Present)

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Title** | Default Layout - Variation Link Renders and Is Clickable (Slug Present) |
| **Section** | Product Page / Variations - Default Layout |
| **Type** | Functional |
| **Priority** | P1 |
| **Estimate** | 5 min |
| **References** | VCST-4530, PR #2182 (`variations-default.vue`) |

**Preconditions:**
1. QA environment accessible at `${FRONT_URL}`
2. A product with variations rendered in the default (card/list) layout exists in the catalog
3. At least one variation has a `slug` field configured in the Admin
4. No user login required (guest browse)

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to `${FRONT_URL}` | Homepage loads without errors |
| 2 | Navigate to the product page that uses the default variation layout (e.g., via `/products-with-options` or direct product URL) | Product detail page loads; "Variations" section is visible below the main product info |
| 3 | Scroll down to the Variations section | Variation items are displayed as `VcLineItem` card/list rows, each showing image, name, properties, price, and Add to Cart |
| 4 | Hover the mouse cursor over a variation item (on the name or image area) | Cursor changes to `pointer`; the item is visually highlighted as interactive |
| 5 | Note the `href` attribute of the variation link by right-clicking and inspecting or hovering to see URL preview in browser status bar | URL preview shows `${FRONT_URL}/{variation-slug}` (the SEO-friendly slug path) |
| 6 | Click on the variation item (name or image area) | Browser navigates away from the parent product page |
| 7 | Observe the loaded page URL in the browser address bar | URL is `${FRONT_URL}/{variation-slug}` — no `/product/` prefix in path |
| 8 | Verify the product page content matches the clicked variation | Product name, images, SKU, and properties on the loaded page match the specific variation that was clicked |
| 9 | Open browser DevTools (F12) → Console tab | Zero JavaScript errors or warnings related to navigation or routing |

**Pass Criteria:**
- Variation renders as a clickable link
- URL after click matches `/{slug}` format
- Correct variation page content displayed
- No JS console errors

**Fail Criteria:**
- Link is not clickable (no cursor change, no href)
- URL is wrong (parent product URL, 404, or empty)
- Wrong variation's page loads
- JS console error appears

---

## TC-002: Default Layout - Variation Link Fallback to ID Route (No Slug)

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Title** | Default Layout - Variation Link Renders Using ID Fallback (No Slug) |
| **Section** | Product Page / Variations - Default Layout |
| **Type** | Functional |
| **Priority** | P2 |
| **Estimate** | 5 min |
| **References** | VCST-4530, PR #2182, `getProductRoute` utility |

**Preconditions:**
1. A product with at least one variation that has NO `slug` configured in Admin catalog (slug field empty)
2. The variation must have a valid `id` (always present)

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to the parent product page containing the slug-less variation | Product page loads with variations section visible |
| 2 | Open browser DevTools → Network tab → filter by "graphql" | Identifies the variation's `id` value from the `products` query response (look for `variations` array) |
| 3 | Hover over the slug-less variation item in the default layout | Link href in status bar shows `${FRONT_URL}/product/{variation-id}` (router-named route fallback) |
| 4 | Click on the slug-less variation item | Browser navigates to the variation's product page |
| 5 | Check the browser URL | URL is `${FRONT_URL}/product/{variation-id}` — uses the ID-based route |
| 6 | Verify page content matches the variation | Correct variation product page displays |
| 7 | Check DevTools Console | No JavaScript errors |

**Pass Criteria:**
- When no slug is set, URL uses `/product/{id}` format
- Correct variation page loads
- No errors

---

## TC-003: Table Layout (Desktop) - Variation Title Is a Clickable Link (Slug Present)

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Title** | Table Layout (Desktop) - Variation Title Is a Clickable Link (Slug Present) |
| **Section** | Product Page / Variations - Table Layout |
| **Type** | Functional |
| **Priority** | P1 |
| **Estimate** | 5 min |
| **References** | VCST-4530, PR #2182 (`variations-table.vue` `#desktop-body` template) |

**Preconditions:**
1. Browser viewport set to desktop width (minimum 1280px — use 1920x1080)
2. A product page exists whose `ProductVariationsLayout` property is set to "Table"
3. At least one variation has a `slug` configured

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to the product page with table-layout variations at desktop viewport (1920x1080) | Product page loads; Variations section shows a data table with columns: Item, [property columns], Stock, Price, Quantity |
| 2 | Locate the "Item" column header in the variations table | Column exists, labeled "Item" (or locale equivalent) |
| 3 | Hover over the variation name text in the first row of the "Item" column | Cursor changes to `pointer`; variation name text is visually styled as a hyperlink (underline and/or color change per Coffee theme) |
| 4 | Note the link href by right-clicking the name → "Inspect" or checking status bar | href value equals `/${variation-slug}` |
| 5 | Click on the variation name in the "Item" column | Browser navigates to the variation's product page |
| 6 | Verify browser URL | URL is `${FRONT_URL}/{variation-slug}` |
| 7 | Verify page content is the correct variation | Product name, images, properties match the variation that was clicked |
| 8 | Navigate back (browser Back button) | Returns to the parent product page with the variations table |
| 9 | Check DevTools Console | No JS errors on either page load |

**Pass Criteria:**
- Variation name in "Item" column is a working hyperlink
- Navigates to `/{slug}` URL
- Correct page loads; Back navigation works

---

## TC-004: Table Layout (Desktop) - Variation Title Link Fallback to ID Route (No Slug)

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Title** | Table Layout (Desktop) - Variation Title Link Falls Back to ID Route (No Slug) |
| **Section** | Product Page / Variations - Table Layout |
| **Type** | Functional |
| **Priority** | P2 |
| **Estimate** | 5 min |
| **References** | VCST-4530, PR #2182, `getProductRoute` utility |

**Preconditions:**
1. Desktop viewport (>= 1280px)
2. Product with table layout containing a variation that has NO slug

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to the product page with table layout | Table renders with variation rows |
| 2 | Identify the variation row for a slug-less variation (check via Network tab GraphQL response if needed) | Row is visible in the "Item" column |
| 3 | Hover over the variation name in that row | Cursor shows `pointer`; link href in status bar shows `${FRONT_URL}/product/{variation-id}` |
| 4 | Click the variation name | Navigates to variation page |
| 5 | Verify URL is `/product/{variation-id}` | ID-based route is used |
| 6 | Verify correct variation page content | Correct variation loaded |
| 7 | Check DevTools Console | No JS errors |

---

## TC-005: Link Shareability - Copied URL Opens Correct Variation Page in New Session

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Title** | Link Shareability - Copied Variation URL Opens Correct Page in Fresh Session |
| **Section** | Product Page / Variations - Shareability |
| **Type** | Functional, End-to-End |
| **Priority** | P1 |
| **Estimate** | 10 min |
| **References** | VCST-4530 (core user story requirement) |

**Preconditions:**
1. Product with at least 2 variations, each with distinct slugs
2. Access to a second browser window or incognito/private mode

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to the parent product page (either layout) | Variations are visible with clickable links |
| 2 | Right-click on the first variation's link → select "Copy link address" | URL is copied to clipboard |
| 3 | Paste the URL into a text editor to verify its format | URL format is `${FRONT_URL}/{variation-slug}` or `${FRONT_URL}/product/{id}` |
| 4 | Open a new incognito/private browser window | Fresh session — no cookies, no history |
| 5 | Paste the copied URL into the incognito window address bar and press Enter | Page loads successfully (HTTP 200) |
| 6 | Verify the page displays the correct variation | Product name, images, SKU, description match the specific variation that was linked — NOT the parent product and NOT a different variation |
| 7 | Repeat steps 2-6 for a second variation from the same product | Second variation's direct URL also loads the correct variation page |
| 8 | Verify no redirect to parent product or 404 occurs | Direct URL resolves to the variation page without any intermediate redirect to the parent |

**Pass Criteria:**
- Copied URL is the variation's direct permalink
- Fresh-session load shows the exact variation
- No redirect to parent product; no 404

---

## TC-006: Link Opens in Same Tab by Default (No New Tab)

| Field | Value |
|-------|-------|
| **ID** | TC-006 |
| **Title** | Variation Link Opens in Same Browser Tab (Default Navigation Behavior) |
| **Section** | Product Page / Variations |
| **Type** | Functional |
| **Priority** | P2 |
| **Estimate** | 3 min |
| **References** | VCST-4530, `browserTarget` prop in `variations-default.vue` |

**Preconditions:**
1. Product page with variations in either layout
2. No special `browserTarget` configuration set to "new tab" in store config

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to product page with variations | Variations visible with links |
| 2 | Note the current number of open browser tabs (should be 1) | 1 tab open |
| 3 | Click on a variation link (left-click — standard click) | Navigation happens in the current tab |
| 4 | Verify the number of open browser tabs has not changed | Still 1 tab (no new tab opened) |
| 5 | Verify browser Back button is available and returns to previous product page | Back navigation works correctly |
| 6 | Middle-click (or Ctrl+click) the variation link | Opens in a new tab (standard browser behavior for middle-click — no special handling needed) |

**Pass Criteria:**
- Standard left-click navigates within the same tab
- Browser back button works
- No unintended tab spawning

---

## TC-007: Add-to-Cart Behavior Is Not Disrupted by the Link Addition

| Field | Value |
|-------|-------|
| **ID** | TC-007 |
| **Title** | Add-to-Cart Works Correctly — Link Area Does Not Intercept Cart Button Clicks |
| **Section** | Product Page / Variations - Regression |
| **Type** | Regression |
| **Priority** | P1 |
| **Estimate** | 10 min |
| **References** | VCST-4530, PR #2182 (slot rendering of `AddToCartSimple` inside linked `VcLineItem`) |

**Preconditions:**
1. Signed in as B2B user (`USER_EMAIL` / `USER_PASSWORD`) OR browsing as guest
2. Product page with variations (test both default layout and table layout)
3. Cart is empty at start (clear cart if needed)

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to product page with variations in **default layout** | Variations section visible as card/list items |
| 2 | Locate the "Add to Cart" button / quantity stepper for the first variation | Button is visible and enabled (if variation is in stock) |
| 3 | Set quantity to 1 (if stepper is shown) | Quantity field shows 1 |
| 4 | Click the "Add to Cart" button for the variation | Success notification appears (toast/snackbar); cart icon badge increments by 1 |
| 5 | Verify the current page URL has NOT changed (user is still on the parent product page) | URL remains on the parent product page — clicking Add to Cart did NOT trigger variation page navigation |
| 6 | Navigate to product page with variations in **table layout** | Variations table visible with "Quantity" column containing Add to Cart controls |
| 7 | Click "Add to Cart" button in the table's Quantity column for a variation | Cart badge increments; no page navigation |
| 8 | Navigate to the cart page (`${FRONT_URL}/cart`) | Cart page loads |
| 9 | Verify both added variations appear in the cart with correct names and quantities | Cart contains both items added in steps 4 and 7 |

**Pass Criteria:**
- Add to Cart buttons work for variations in both layouts
- Clicking Add to Cart does NOT navigate to the variation page
- Cart correctly reflects added items

---

## TC-008: Mobile Viewport - Default Layout Variation Links Are Tappable

| Field | Value |
|-------|-------|
| **ID** | TC-008 |
| **Title** | Mobile - Default Layout Variation Links Render and Navigate Correctly |
| **Section** | Product Page / Variations - Mobile |
| **Type** | Functional |
| **Priority** | P1 |
| **Estimate** | 10 min |
| **References** | VCST-4530, PR #2182 (`variations-default.vue`), mobile B2B storefront |

**Preconditions:**
1. Browser DevTools → set device emulation to iPhone 14 (390x844 viewport) OR use physical mobile device
2. Product page with variations in default layout
3. Guest browse (no login required)

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Open `${FRONT_URL}` on a mobile viewport (390x844 or equivalent) | Homepage loads with mobile navigation |
| 2 | Navigate to the product page with default-layout variations | Product page loads; variations section is visible and scrollable |
| 3 | Scroll down to the Variations section | Variation items (VcLineItem cards) render correctly — no overflow, no broken layout |
| 4 | Inspect the visual layout of each variation card | Each card shows: image, name, properties, price, Add to Cart button — all readable without horizontal scroll |
| 5 | Tap on a variation item (in the name or image area — the linked zone) | Browser navigates to the variation's product page |
| 6 | Verify the variation page URL is correct | URL matches `/{slug}` or `/product/{id}` |
| 7 | Verify the variation page content is correct | Correct variation product page displays on mobile |
| 8 | Tap the browser Back button | Returns to the parent product's variations section |
| 9 | Tap the "Add to Cart" button on a variation (not the linked area) | Cart action executes; does NOT navigate away (tap target is distinct from link area) |

**Pass Criteria:**
- Tap on variation name/image navigates to variation page
- Add to Cart tap does not trigger link navigation
- No layout breakage on mobile

---

## TC-009: Table Layout - Mobile Viewport Does Not Break (Desktop-Only Template)

| Field | Value |
|-------|-------|
| **ID** | TC-009 |
| **Title** | Table Layout - Mobile Viewport Renders Correctly Without Breaking |
| **Section** | Product Page / Variations - Table Layout Mobile |
| **Type** | Functional |
| **Priority** | P2 |
| **Estimate** | 5 min |
| **References** | VCST-4530, PR #2182 (`variations-table.vue` `#desktop-body` template is desktop-only) |

**Preconditions:**
1. Mobile viewport (390x844 or < 1024px width)
2. Product page with table layout variations

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Open product page with table layout on a mobile viewport (< 1024px wide) | Page loads without JS errors |
| 2 | Scroll to the Variations section | VcTable component renders in its mobile/responsive state — the `#desktop-body` slot (which contains the modified `VcProductTitle :to` binding) is NOT rendered |
| 3 | Verify variations are still displayed in a usable format on mobile | Mobile variation rows or fallback layout is visible and readable |
| 4 | Verify no broken HTML elements (stray `<a>` tags, `href="#"`, or undefined routes) | DOM inspection shows no malformed links |
| 5 | Check DevTools Console | No JS errors or warnings |
| 6 | Interact with any visible controls (e.g., Add to Cart) | Functionality works correctly on mobile |

**Pass Criteria:**
- Mobile viewport shows table layout's responsive state without errors
- The `#desktop-body` link changes do not affect mobile rendering

---

## TC-010: Edge Case - Variation With No Slug and No Valid ID

| Field | Value |
|-------|-------|
| **ID** | TC-010 |
| **Title** | Edge Case - Variation With Neither Slug Nor Valid ID Renders Without Broken Link |
| **Section** | Product Page / Variations - Edge Cases |
| **Type** | Negative |
| **Priority** | P3 |
| **Estimate** | 5 min |
| **References** | VCST-4530, `getProductRoute` returns `undefined` when `productId` is falsy |

**Preconditions:**
1. This is a data-dependent edge case — may require creating a test product with a variation that has an empty/null `id` (unlikely in production but possible in test data)
2. If this data state cannot be created in QA, this test case is executed via DOM inspection only

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to the product page (if test data available) or inspect DOM of a normal variation page | Variations section loads |
| 2 | Open DevTools → Elements tab → inspect a variation's rendered HTML | If `getProductRoute` returns `undefined`, the `VcLineItem` component should NOT render a clickable `<a>` element (or the route prop is absent) |
| 3 | Verify no `href` with value `undefined`, `null`, `#`, or empty string is present on variation elements | No broken anchor tags visible |
| 4 | Verify the variation item still displays its name, price, and Add to Cart correctly | Non-linked variations still render content correctly |
| 5 | Check DevTools Console for errors | No Vue warnings about undefined route prop; no JS errors |

**Pass Criteria:**
- `undefined` route results in no clickable link (not a broken `<a href="">`)
- Variation still renders usable content
- No Vue/JS errors in console

---

## TC-011: Regression - Full Product Page Feature Verification

| Field | Value |
|-------|-------|
| **ID** | TC-011 |
| **Title** | Regression - Core Product Page Features Are Unaffected |
| **Section** | Product Page / Regression |
| **Type** | Regression |
| **Priority** | P1 |
| **Estimate** | 15 min |
| **References** | VCST-4530, no backend/API changes in PR #2182 |

**Preconditions:**
1. Product page with variations accessible (both default and table layout)
2. Signed-in B2B user

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Open product page with default-layout variations | Page loads; breadcrumbs correct (Home > Category > Product Name) |
| 2 | Verify main product: name, hero images, description, SKU, price, "Add to Cart" all display | All elements present and correct |
| 3 | In the Variations section (default layout), verify each variation shows: image, name, property chips, list price, actual price, Add to Cart | All variation data renders correctly |
| 4 | Verify stock badges ("In Stock" / quantity / "0" out-of-stock) display correctly per variation | Badges match actual inventory status |
| 5 | Navigate to the same product or a different product with **table layout** variations | Table layout loads; column headers visible: Item, [property names], Stock, Price, Quantity |
| 6 | Verify table rows show correct data: variation name (now a link), property values, stock badge, price, Add to Cart stepper | All columns populate correctly for each variation row |
| 7 | Click the "Name / Item" column header in the table to test sorting | Table re-sorts by variation name (ascending/descending); no navigation triggered by sort click |
| 8 | If the product has more than one page of variations, click the pagination control | Pagination changes page; new set of variations loads |
| 9 | Verify pagination also works in default layout (if product has many variations) | Page 2 loads next set of variations; all are still clickable links |
| 10 | Open DevTools Console throughout all steps | Zero JS errors at any point |

**Pass Criteria:**
- All product page features work as before
- Sorting and pagination unaffected
- No layout breaks in either variation display mode

---

## TC-012: URL Structure Verification via DevTools Network Inspection

| Field | Value |
|-------|-------|
| **ID** | TC-012 |
| **Title** | URL Structure Verification - SEO Slug vs ID Route Confirmed via Network Tab |
| **Section** | Product Page / Variations - URL Correctness |
| **Type** | Functional |
| **Priority** | P1 |
| **Estimate** | 8 min |
| **References** | VCST-4530, `getProductRoute` routing logic |

**Preconditions:**
1. Browser DevTools available (F12)
2. Product page with variations (mix of slug and no-slug variations if possible)

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Open browser DevTools → Network tab → filter by "graphql" or "Fetch/XHR" | Network tab is filtering GraphQL requests |
| 2 | Navigate to the parent product page | A GraphQL request for the product (with variations) appears in the Network tab |
| 3 | Click on the GraphQL request → Preview/Response tab → find the `variations` array in the response | Each variation object has `id`, `slug`, `name` fields visible |
| 4 | Note the slug value for variation A and the id value for variation B (the one without slug) | Values recorded for verification |
| 5 | Hover over variation A's link in the default or table layout | Status bar shows `${FRONT_URL}/{slug-of-variation-A}` |
| 6 | Click variation A's link | URL bar shows `${FRONT_URL}/{slug-of-variation-A}` — no `/product/` prefix |
| 7 | Navigate back → hover over variation B's link (no slug) | Status bar shows `${FRONT_URL}/product/{id-of-variation-B}` |
| 8 | Click variation B's link | URL bar shows `${FRONT_URL}/product/{id-of-variation-B}` |
| 9 | Verify neither URL triggers a 404 or redirect loop | Both pages return HTTP 200; correct variation content shown |

**Pass Criteria:**
- Slug-based variations use `/{slug}` route
- ID-based variations use `/product/{id}` route
- Both resolve to HTTP 200 with correct content

---

## TC-013: UX - Link Visual Styling in Default Layout (Coffee Theme)

| Field | Value |
|-------|-------|
| **ID** | TC-013 |
| **Title** | UX - Variation Link Visual Styling Is Consistent in Default Layout |
| **Section** | Product Page / Variations - UX |
| **Type** | UX / Visual |
| **Priority** | P2 |
| **Estimate** | 5 min |
| **References** | VCST-4530, Coffee theme design system |

**Preconditions:**
1. Desktop viewport (1920x1080)
2. Product page with variations in default layout

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to product page with default-layout variations | Variations render as card/list items |
| 2 | In the resting state (no hover), observe variation name and image appearance | Variation items look consistent with other product cards on the storefront; no underline visible unless that is the design |
| 3 | Hover over the variation name | Cursor changes to `pointer`; visual feedback appears (color change, underline, or highlight per Coffee theme) |
| 4 | Hover over the variation image area | If image is also part of the linked region, cursor also shows `pointer` |
| 5 | Hover over the Add to Cart button / stepper area | Cursor shows `pointer` for the button — this is a distinct interactive zone from the navigation link |
| 6 | Take a screenshot of: resting state, hover-on-name state, hover-on-cart-button state | Screenshots saved to `screenshots/desktop/` folder |
| 7 | Compare visual styling against other `VcLineItem` links elsewhere on the storefront (e.g., cart page line items, wishlist items) | Styling is consistent with the component's existing link behavior |

**Pass Criteria:**
- Cursor pointer on hover over linked area
- No visual styling inconsistency with Coffee theme
- Add to Cart button is visually distinct from the navigation link

---

## TC-014: UX - Link Visual Styling in Table Layout (Coffee Theme)

| Field | Value |
|-------|-------|
| **ID** | TC-014 |
| **Title** | UX - Variation Title Link Styling Is Consistent in Table Layout |
| **Section** | Product Page / Variations - Table Layout UX |
| **Type** | UX / Visual |
| **Priority** | P2 |
| **Estimate** | 5 min |
| **References** | VCST-4530, `VcProductTitle :to` prop, Coffee theme |

**Preconditions:**
1. Desktop viewport (>= 1280px)
2. Product page with table layout variations

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to product page with table layout | Variations table renders with all columns |
| 2 | Observe the "Item" column in resting state | Variation names are styled; check if they match how product titles look on catalog listing pages (e.g., product title in `/products-with-options` catalog view) |
| 3 | Hover over a variation name in the "Item" column | Cursor changes to `pointer`; link hover effect applied (underline, color change per Coffee theme) |
| 4 | Observe the other table columns (property values, Stock, Price) | No pointer cursor; no link hover styling — these columns are NOT linked |
| 5 | Check the "Quantity" column (Add to Cart / stepper) | Cursor pointer on button elements only — stepper and Add to Cart button are interactive but not navigation links |
| 6 | Take a screenshot of the table in resting and hover states | Saved for design comparison |

**Pass Criteria:**
- Only the "Item" column name is styled as a link
- Other columns are not inadvertently styled as clickable
- Visual style consistent with catalog product title links

---

## TC-015: Category Page - Variation Links Behavior Baseline (Exploratory / Out-of-Scope Check)

| Field | Value |
|-------|-------|
| **ID** | TC-015 |
| **Title** | Category Page - Variation Chip/Swatch Links Are Not Affected by This PR |
| **Section** | Category Page / Variations |
| **Type** | Exploratory |
| **Priority** | P3 |
| **Estimate** | 5 min |
| **References** | VCST-4530 (Jira shows category page mockup — but PR #2182 does NOT modify category-page variation components) |

**Preconditions:**
1. Category page that shows products with visible variation swatches/chips (e.g., color swatches on product cards)
2. Navigate to `/products-with-options` or `/accessories`

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to a category listing page that shows products with variation swatches (e.g., `${FRONT_URL}/products-with-options`) | Product cards with variation chips/swatches are visible |
| 2 | Hover over a variation chip/swatch on a product card | Note: cursor behavior and any link behavior |
| 3 | Click a variation chip/swatch | Note: what happens — does it change the product card view, or navigate? |
| 4 | Document the current behavior | Document baseline: e.g., "color swatch changes card image but is not a direct link to the variation page" |
| 5 | Verify no regressions were introduced by PR #2182 on the category page | Category page variation chips behave the same as before this PR |

**Expected Result (Informational):**
- This PR does NOT modify category page variation components
- Variation links on category page maintain their pre-existing behavior (whether that is: swatch toggles card image, or link to variation PDP — document whichever applies)
- No regressions introduced on the category page

---

## TC-016: Cross-Browser - Firefox: Default Layout Variation Links

| Field | Value |
|-------|-------|
| **ID** | TC-016 |
| **Title** | Cross-Browser (Firefox) - Default Layout Variation Links Work Correctly |
| **Section** | Product Page / Variations - Cross-Browser |
| **Type** | Functional |
| **Priority** | P2 |
| **Estimate** | 5 min |
| **References** | VCST-4530, cross-browser matrix |

**Preconditions:**
1. Firefox browser (latest 2 versions)
2. Product page with variations in default layout

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Open `${FRONT_URL}` in Firefox | Homepage loads correctly in Firefox |
| 2 | Navigate to the product page with default-layout variations | Product page and variations section load without errors |
| 3 | Click on a variation item link | Navigates to the variation page in Firefox |
| 4 | Verify the URL is correct and page content matches the variation | Same result as in Chrome |
| 5 | Check Firefox browser console (F12 → Console) | No JS errors |

**Pass Criteria:**
- Same link behavior in Firefox as in Chrome
- No browser-specific rendering issues

---

## TC-017: Cross-Browser - Edge: Table Layout Variation Links

| Field | Value |
|-------|-------|
| **ID** | TC-017 |
| **Title** | Cross-Browser (Edge) - Table Layout Variation Title Links Work Correctly |
| **Section** | Product Page / Variations - Cross-Browser |
| **Type** | Functional |
| **Priority** | P2 |
| **Estimate** | 5 min |
| **References** | VCST-4530, enterprise browser matrix |

**Preconditions:**
1. Microsoft Edge browser (latest version)
2. Product page with table layout variations

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Open `${FRONT_URL}` in Edge | Homepage loads correctly |
| 2 | Navigate to product page with table layout variations at desktop viewport | Table layout renders correctly |
| 3 | Click on a variation name in the "Item" column | Navigates to the correct variation page |
| 4 | Verify URL and page content | Matches expected variation |
| 5 | Check Edge DevTools console | No JS errors |

**Pass Criteria:**
- Table layout variation links work in Edge
- Consistent with Chrome behavior

---

## TC-018: Keyboard Accessibility - Tab Navigation to Variation Links

| Field | Value |
|-------|-------|
| **ID** | TC-018 |
| **Title** | Keyboard Accessibility - Variation Links Are Keyboard-Navigable |
| **Section** | Product Page / Variations - Accessibility |
| **Type** | Accessibility |
| **Priority** | P2 |
| **Estimate** | 8 min |
| **References** | VCST-4530, WCAG 2.1 AA SC 2.1.1 (Keyboard) |

**Preconditions:**
1. Desktop viewport
2. Product page with variations in default layout (and/or table layout)
3. No mouse; keyboard-only interaction

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to the product page | Page loads |
| 2 | Press Tab repeatedly to move focus through the page | Focus indicator moves through interactive elements in logical DOM order |
| 3 | Tab until focus reaches the variations section | Focus enters the variations section |
| 4 | Tab to a variation item link (name or image in default layout; name in table layout) | Focus ring is visible on the variation link |
| 5 | Press Enter while variation link is focused | Navigates to the variation's product page (same behavior as mouse click) |
| 6 | Press browser Back (Alt+Left Arrow) to return | Returns to the parent product page with focus managed appropriately |
| 7 | Tab to a variation's Add to Cart button | Focus lands on the Add to Cart button / stepper independently from the variation link |
| 8 | Press Enter or Space on Add to Cart button | Add to Cart executes; no navigation to variation page |

**Pass Criteria:**
- Variation links reachable via Tab key
- Enter on focused link navigates correctly
- Focus indicator visible (no invisible focus)
- Add to Cart is separately keyboard-accessible

---

## TC-019: Browser Back/Forward Navigation After Variation Link Click

| Field | Value |
|-------|-------|
| **ID** | TC-019 |
| **Title** | Browser History - Back and Forward Navigation After Visiting Variation Page |
| **Section** | Product Page / Variations - Navigation |
| **Type** | Functional |
| **Priority** | P2 |
| **Estimate** | 5 min |
| **References** | VCST-4530, Vue Router navigation |

**Preconditions:**
1. Product page with variations accessible
2. Standard desktop browser

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to the parent product page | Page loads; URL = parent product URL |
| 2 | Click on variation A's link | Navigates to variation A's page; browser history now has 2 entries |
| 3 | Click on the variations section link or navigate back to the parent product page | URL changes to parent product |
| 4 | Click on variation B's link | Navigates to variation B's page |
| 5 | Press browser Back button (or Alt+Left Arrow) | Returns to parent product page (not variation A) |
| 6 | Press browser Forward button (Alt+Right Arrow) | Returns to variation B's page |
| 7 | Verify each history entry loads the correct page | Page content matches URL at each history state |
| 8 | Verify the variations section on the parent product is intact when navigating back | No stale or broken state in the variations section after navigating back |

**Pass Criteria:**
- Back/Forward browser navigation works correctly through variation link history
- Pages re-load with correct content at each history state

---

## TC-020: Multiple Variations Pagination - All Pages Have Clickable Links

| Field | Value |
|-------|-------|
| **ID** | TC-020 |
| **Title** | Pagination - Variation Links Are Clickable on All Pages of Paginated Variations |
| **Section** | Product Page / Variations - Pagination |
| **Type** | Functional |
| **Priority** | P2 |
| **Estimate** | 8 min |
| **References** | VCST-4530, `VcPagination` in `variations-default.vue`, `@page-changed` in `variations-table.vue` |

**Preconditions:**
1. A product with enough variations to trigger pagination (more than the default page size — typically > 10 variations)
2. If no such product exists in QA, skip or mark as N/A with note

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to the product page with paginated variations | First page of variations is shown; pagination control is visible at the bottom |
| 2 | Verify each variation on page 1 has a clickable link | All page-1 variation items have pointer cursor and valid href |
| 3 | Click the pagination control to go to page 2 | Second page of variations loads |
| 4 | Verify each variation on page 2 also has a clickable link | All page-2 variation items have pointer cursor and valid href |
| 5 | Click on a variation link from page 2 | Navigates to the correct variation page |
| 6 | Navigate back to the parent product | Returns to variations section; pagination should be preserved or reset to page 1 |

**Pass Criteria:**
- Variation links work on all pagination pages, not just page 1

---

## TC-021: No Console Errors on Full Page Interaction Session

| Field | Value |
|-------|-------|
| **ID** | TC-021 |
| **Title** | No JavaScript Errors Throughout Full Variation Link Interaction Session |
| **Section** | Product Page / Variations - Quality |
| **Type** | Regression |
| **Priority** | P1 |
| **Estimate** | 10 min |
| **References** | VCST-4530, overall quality gate |

**Preconditions:**
1. Browser DevTools open from the start, Console tab visible
2. DevTools Console set to "All levels" (not filtered to Errors only)
3. Product page with variations accessible

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Open DevTools Console, then navigate to the parent product page | Page loads; zero console errors or Vue warnings |
| 2 | Scroll through the entire product page including the variations section | No errors triggered by rendering variations with links |
| 3 | Hover over multiple variation links (default layout) | No errors on hover |
| 4 | Click variation link → navigate to variation page → navigate back | No errors during navigation or return |
| 5 | Open a product page with table layout variations | No errors on render |
| 6 | Hover over the "Item" column variation titles | No errors on hover |
| 7 | Click a table-layout variation title → navigate → back | No routing errors |
| 8 | Click Add to Cart on a variation | No errors during cart mutation |
| 9 | Review the full console log | Zero errors; zero Vue warnings about invalid props or undefined routes |

**Pass Criteria:**
- Zero JS errors across the entire interaction session
- No Vue prop validation warnings
- No failed network requests related to routing

---

## TC-022: Catalog List View - Switch to List Mode and Find a Product With Variations

| Field | Value |
|-------|-------|
| **ID** | TC-022 |
| **Title** | Catalog List View - Switch to List Mode and Locate a Product That Has Variations |
| **Section** | Catalog / List View - Variations |
| **Type** | Functional |
| **Priority** | P1 |
| **Estimate** | 5 min |
| **References** | VCST-4530, PR #2182, `product-card.vue` list viewMode, `view-mode.vue` toggle |

**Preconditions:**
1. QA environment accessible at `${FRONT_URL}`
2. A category page exists that contains at least one product with variations (i.e., `product.hasVariations` is true)
3. Guest browse (no login required)

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to `${FRONT_URL}` | Homepage loads without errors |
| 2 | Navigate to a product category that contains products with variations (e.g., `${FRONT_URL}/products-with-options` or `/e2e-catalog`) | Category listing page loads; products are displayed in the default view mode (grid or list) |
| 3 | Locate the view-mode toggle control in the toolbar (top-right area of the product grid, near the sort and filter controls) | View mode toggle buttons are visible — "Grid" icon and "List" icon |
| 4 | Click the "List" view mode button | Product listing switches to list view; each product card expands into a wider horizontal layout |
| 5 | Scan the product list for a product that shows a "Variations (N)" button (where N is a number such as "Variations (3)") | At least one product card shows the variations button with a count |
| 6 | Verify the product card in list mode shows: product image, name (as a link to the product), properties, price with "From" label, and the "Variations (N)" button | All elements are rendered correctly in list layout |
| 7 | Open browser DevTools → Console tab | No JavaScript errors during view mode switch or list rendering |

**Pass Criteria:**
- List view mode can be activated via the view mode toggle
- Products with variations show the "Variations (N)" button in list view
- Product card layout is correct in list mode
- No console errors

**Fail Criteria:**
- View mode toggle is not visible or does not switch to list mode
- Products with variations do not show a variations button in list view
- Console errors appear during view mode switch

---

## TC-023: Catalog List View - Click Variations Button to Expand Variation Line Items

| Field | Value |
|-------|-------|
| **ID** | TC-023 |
| **Title** | Catalog List View - Variations Button Expands to Show Variation Line Items With Links |
| **Section** | Catalog / List View - Variations |
| **Type** | Functional |
| **Priority** | P1 |
| **Estimate** | 8 min |
| **References** | VCST-4530, PR #2182, `product-card.vue` `handleVariationsClick`, `VariationsDefault` in `#expanded-content` slot |

**Preconditions:**
1. Category page loaded in **list view mode** (follow TC-022 steps 1–4)
2. At least one product with variations is visible in the list
3. The variations have slugs configured in the Admin catalog

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | In list view, locate a product card with a "Variations (N)" button (e.g., "Variations (3)") | Button is visible with the chevron-down icon |
| 2 | Click the "Variations (N)" button | Button shows a loading indicator briefly; then expands to reveal the variations section below the product card; button chevron changes to chevron-up |
| 3 | Observe the expanded variations section | Variations are rendered as `VcLineItem` card/list rows — each showing product image, name, properties, price, and Add to Cart button (identical component to the Product Detail Page default layout) |
| 4 | Verify the title above the variation list (e.g., "Available variations (3)") | Section heading is present and shows the correct count |
| 5 | Hover the mouse over a variation item's name or image area in the expanded section | Cursor changes to `pointer`; the item is visually highlighted as an interactive link |
| 6 | Note the `href` attribute of the variation link by checking the status bar or right-clicking → Inspect | URL preview shows `${FRONT_URL}/{variation-slug}` (slug-based route) |
| 7 | Verify all visible variation line items have the pointer cursor and a valid `href` | Each variation item in the expanded list is a clickable link |
| 8 | Open browser DevTools → Console tab | No JavaScript errors during expansion or link rendering |

**Pass Criteria:**
- "Variations (N)" button expands the variations section on click
- Expanded section shows variation line items via `VariationsDefault` component
- Each variation item has a valid clickable link (cursor pointer, href present)
- No console errors

**Fail Criteria:**
- Button click does not expand the variations section
- Expanded variations do not have clickable links (no href, no pointer cursor)
- Console errors appear

---

## TC-024: Catalog List View - Click Variation Link Navigates to Correct Variation Product Page

| Field | Value |
|-------|-------|
| **ID** | TC-024 |
| **Title** | Catalog List View - Clicking Variation Link Navigates to the Correct Variation Product Page |
| **Section** | Catalog / List View - Variations |
| **Type** | Functional |
| **Priority** | P1 |
| **Estimate** | 8 min |
| **References** | VCST-4530, PR #2182, `getProductRoute` in `variations-default.vue` |

**Preconditions:**
1. Category page loaded in list view mode
2. A product with at least 2 variations, each with distinct slugs, is visible
3. The "Variations (N)" section has been expanded (follow TC-023 steps 1–4)

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | In the expanded variations section of a product card in list view, identify two distinct variation line items | Both items are visible with their names, properties, and prices |
| 2 | Note the name and distinguishing properties of variation A (e.g., "Blue - Size M") | Properties noted for later verification |
| 3 | Click on variation A's name or image (the linked area) | Browser navigates away from the category list page |
| 4 | Observe the browser URL after navigation | URL is `${FRONT_URL}/{variation-A-slug}` — no `/product/` prefix; matches the slug of variation A |
| 5 | Verify the loaded page content matches variation A | Product name, images, SKU, color, size, and all properties on the loaded PDP match variation A specifically — not the parent product and not variation B |
| 6 | Press the browser Back button | Returns to the category list page; the category page scrolls back to (or near) the product card that was expanded |
| 7 | Expand the variations section again for the same product | Variations re-load and render with clickable links as before |
| 8 | Click on variation B's link | Navigates to `${FRONT_URL}/{variation-B-slug}` — a different URL from variation A |
| 9 | Verify the loaded page content matches variation B | Correct variation B product page loads; content is distinct from variation A |
| 10 | Open browser DevTools → Console tab at any point | No JavaScript errors or Vue router warnings throughout |

**Pass Criteria:**
- Each variation link in the catalog list view expanded section navigates to its own distinct product page
- URL matches the slug of the clicked variation
- Correct variation content loads (not the parent product, not a wrong variation)
- Browser back button returns to the category list
- No console errors

**Fail Criteria:**
- Click on variation link navigates to the parent product page instead of the variation
- URL does not contain the variation's slug (wrong URL or 404)
- All variation links point to the same page
- Console errors on navigation

---

## TC-025: Catalog List View - URL Correctness: Slug-Based vs ID-Based for Variation Links

| Field | Value |
|-------|-------|
| **ID** | TC-025 |
| **Title** | Catalog List View - Variation Link URL Uses Slug Route When Available, Falls Back to ID Route |
| **Section** | Catalog / List View - Variations - URL Correctness |
| **Type** | Functional |
| **Priority** | P2 |
| **Estimate** | 8 min |
| **References** | VCST-4530, PR #2182, `getProductRoute` utility |

**Preconditions:**
1. Category page loaded in list view mode
2. A product is available in the list that has two types of variations:
   - Variation A: has a `slug` field configured in Admin (e.g., `my-color-size-variant`)
   - Variation B: has no `slug` configured (slug field empty in Admin)
3. Expand the variations section for that product (follow TC-023)

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Open browser DevTools → Network tab → filter by "graphql" or "Fetch/XHR" | Network tab is filtering active |
| 2 | Click "Variations (N)" button for the target product in list view | Variations section expands; a GraphQL request for the product variations appears in Network tab |
| 3 | Click the GraphQL request in Network tab → Preview/Response → find the variations array | Each variation object shows `id`, `slug`, `name` fields |
| 4 | Note: variation A has a non-empty slug value; variation B has an empty or absent slug | Values recorded |
| 5 | Hover over variation A's link in the expanded section | Browser status bar shows `${FRONT_URL}/{slug-of-variation-A}` — slug-based route |
| 6 | Click variation A's link | URL bar shows `${FRONT_URL}/{slug-of-variation-A}` — no `/product/` prefix |
| 7 | Navigate back to the category list; re-expand the variations section | Returns to expanded list; variation B link is visible |
| 8 | Hover over variation B's link (no slug) | Browser status bar shows `${FRONT_URL}/product/{id-of-variation-B}` — ID-based fallback route |
| 9 | Click variation B's link | URL bar shows `${FRONT_URL}/product/{id-of-variation-B}` |
| 10 | Verify neither URL results in a 404 or redirect loop | Both pages return HTTP 200 with correct variation content |

**Pass Criteria:**
- Variations with a slug use the `/{slug}` URL pattern in catalog list view (same as PDP)
- Variations without a slug use the `/product/{id}` fallback URL pattern (same as PDP)
- Both routes resolve correctly
- URL routing behavior is consistent between PDP context and catalog list view context

**Fail Criteria:**
- Slug-based variations incorrectly use ID route in catalog list view
- ID fallback does not work (404 or undefined route)
- URL behavior differs between catalog list view and PDP for the same variation

---

## TC-026: Catalog List View - Browser Back Navigation After Clicking Variation Link

| Field | Value |
|-------|-------|
| **ID** | TC-026 |
| **Title** | Catalog List View - Browser Back Button Returns to Category List After Visiting Variation Page |
| **Section** | Catalog / List View - Variations - Navigation |
| **Type** | Functional |
| **Priority** | P1 |
| **Estimate** | 5 min |
| **References** | VCST-4530, PR #2182, Vue Router navigation history |

**Preconditions:**
1. Category page loaded in list view mode
2. A product with at least one variation (slug present) is visible and its variations section can be expanded
3. Guest browse

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to the category page in list view and note the current URL (e.g., `${FRONT_URL}/e2e-catalog`) | Category list URL noted |
| 2 | Expand the "Variations (N)" section for a product | Variation line items appear with clickable links |
| 3 | Click on a variation link | Browser navigates to the variation's product page; URL changes to `${FRONT_URL}/{variation-slug}`; browser history now has 2 entries |
| 4 | Verify the variation product page loads fully with correct content | Correct variation PDP is displayed |
| 5 | Press the browser Back button (or Alt+Left Arrow) | Browser navigates back to the category list page |
| 6 | Verify the category list page URL is restored | URL is back to the category URL noted in step 1 |
| 7 | Verify the category list page is still in list view mode (not reset to grid) | View mode remains as "list" — not reverted to grid by back navigation |
| 8 | Verify no JavaScript errors occurred throughout the navigation sequence | DevTools Console shows zero errors |

**Pass Criteria:**
- Back button returns to the category list page (not to an intermediate page)
- Category page URL is correct after back navigation
- List view mode is preserved after back navigation
- No console errors

**Fail Criteria:**
- Back button navigates to a wrong page (e.g., homepage or parent product PDP)
- Category list does not restore correctly (blank page or errors)
- View mode resets to grid after back navigation
- Console errors appear on back navigation

---

## TC-027: Catalog List View - Mobile Responsiveness of Variation Links

| Field | Value |
|-------|-------|
| **ID** | TC-027 |
| **Title** | Catalog List View - Mobile Viewport: Variation Expansion and Link Behavior |
| **Section** | Catalog / List View - Variations - Mobile |
| **Type** | Functional |
| **Priority** | P2 |
| **Estimate** | 10 min |
| **References** | VCST-4530, PR #2182, `product-card__variations-button` (hidden below `3xl` container breakpoint), `product-card__variations-link-button` (visible on mobile) |

**Preconditions:**
1. Browser DevTools → device emulation set to iPhone 14 (390x844 viewport) or equivalent narrow viewport
2. Category page accessible with at least one product with variations

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Open `${FRONT_URL}/e2e-catalog` (or equivalent) on mobile viewport (390x844) | Category page loads with mobile navigation |
| 2 | Observe the catalog view mode on mobile | On mobile, the list view may default to or be constrained to a mobile-appropriate layout; note which view mode is active |
| 3 | Locate a product with variations — observe what button/control is shown for the variations | On narrow viewports (below the `3xl` container breakpoint), the expand-in-place "Variations (N)" button (`product-card__variations-button`) is hidden; instead the `product-card__variations-link-button` is shown — a link button labeled "Variations (N)" that navigates to the full product page |
| 4 | Tap the variations link button (the one visible on mobile) | Behavior follows the `product-card__variations-link-button`: navigates to the parent product's PDP (`link` route = `getProductRoute(product.id, product.slug)`) |
| 5 | Verify the parent product PDP loads | Product detail page displays; on the PDP, the variations section renders as `VcLineItem` cards with clickable links (covered by TC-008) |
| 6 | Navigate back to the category list | Returns to the category page |
| 7 | Switch to a desktop viewport (1920x1080 via DevTools) to confirm the expand-in-place button appears at wide breakpoints | "Variations (N)" expand button with chevron-down becomes visible; "Variations (N)" link button is hidden |
| 8 | Expand variations at desktop viewport — verify variation links are clickable | Variation line items show with pointer cursor and valid hrefs as expected |
| 9 | Check DevTools Console throughout all steps | No JavaScript errors at any viewport |

**Pass Criteria:**
- On mobile (< `3xl` container breakpoint): the link button navigates to the product's PDP (expected design behavior, not a bug)
- On desktop (>= `3xl` breakpoint): the expand-in-place button works and expanded variations have clickable links
- No layout breakage at any viewport
- No console errors

**Fail Criteria:**
- The expand-in-place button appears on mobile and the expanded variations are not tappable
- The link button navigates to a wrong URL (not the parent product page)
- Layout is broken on mobile (overflow, truncation of variation items)
- Console errors at any viewport

---

## TC-028: Catalog List View - Add-to-Cart in Expanded Variations Does Not Navigate Away

| Field | Value |
|-------|-------|
| **ID** | TC-028 |
| **Title** | Catalog List View - Add-to-Cart in Expanded Variations Does Not Trigger Navigation Link |
| **Section** | Catalog / List View - Variations - Regression |
| **Type** | Regression |
| **Priority** | P1 |
| **Estimate** | 10 min |
| **References** | VCST-4530, PR #2182, `AddToCartSimple` slot inside linked `VcLineItem` in catalog list view |

**Preconditions:**
1. Category page loaded in list view mode at desktop viewport (>= 1280px wide, ensure the `3xl` container breakpoint is met)
2. A product with variations is visible; the variations section has been expanded
3. At least one variation is in stock
4. Signed in as B2B user (`USER_EMAIL` / `USER_PASSWORD`) or guest (depending on store configuration for add-to-cart availability)
5. Cart is empty at start (clear cart if needed)

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | In the expanded variations section of a product card in catalog list view, locate a variation that is in stock | The variation line item shows an "Add to Cart" button or quantity stepper |
| 2 | Note the current page URL (should be the category page URL) | Category page URL recorded |
| 3 | Set quantity to 1 (if stepper is shown) | Quantity field shows 1 |
| 4 | Click the "Add to Cart" button for the variation | Success notification (toast/snackbar) appears; cart icon badge increments by 1 |
| 5 | Verify the page URL has NOT changed | URL is still the category page URL — clicking "Add to Cart" did NOT navigate to the variation's product page |
| 6 | Verify the category list is still visible with the variations section still expanded | The expanded variations section is intact; the user remains on the catalog page |
| 7 | Navigate to the cart page (`${FRONT_URL}/cart`) | Cart page loads |
| 8 | Verify the variation just added appears in the cart with the correct product name, quantity, and price | Cart contains the variation item added from the catalog list view |
| 9 | Open browser DevTools → Console tab throughout all steps | No JavaScript errors at any step |

**Pass Criteria:**
- "Add to Cart" executes successfully from the expanded variations section in catalog list view
- Page remains on the category list after adding to cart (no navigation triggered)
- Cart correctly reflects the added variation
- No console errors

**Fail Criteria:**
- Clicking "Add to Cart" navigates to the variation's product page (link intercepts the cart click)
- Cart badge does not increment
- Wrong item appears in cart
- Console errors appear

---

## TC-029: Catalog List View - No Console Errors During Full Variation Expansion and Link Interaction

| Field | Value |
|-------|-------|
| **ID** | TC-029 |
| **Title** | Catalog List View - Zero JavaScript Errors During Full Variation Expand and Link Navigation Session |
| **Section** | Catalog / List View - Variations - Quality |
| **Type** | Regression |
| **Priority** | P1 |
| **Estimate** | 10 min |
| **References** | VCST-4530, overall quality gate for catalog list view context |

**Preconditions:**
1. Browser DevTools open from the start with Console tab visible and set to "All levels"
2. Category page accessible with products that have variations
3. Desktop viewport (1920x1080) to ensure the expand-in-place variations button is visible

**Test Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Open DevTools Console, then navigate to the category page | Category page loads; zero console errors |
| 2 | Switch to list view mode using the view mode toggle | View mode switches; zero console errors |
| 3 | Scroll through the list — observe multiple product cards including those with variations | No errors triggered by rendering product cards or variations buttons |
| 4 | Click the "Variations (N)" button to expand the first product's variations | Variations load and render; zero console errors during the async fetch and rendering of variation line items |
| 5 | Hover over each variation link in the expanded section | No errors on hover |
| 6 | Click a variation link and navigate to the variation's PDP | No errors during navigation (no Vue router warnings, no undefined route errors) |
| 7 | Navigate back to the category list | No errors on return; category list renders correctly |
| 8 | Expand variations for a second product (if available) | No errors on second expansion |
| 9 | Click "Add to Cart" on a variation from the expanded section | No errors during cart mutation |
| 10 | Collapse the variations section by clicking the "Variations (N)" button again (chevron should toggle) | Variations section collapses; no errors |
| 11 | Review the full console log | Zero JavaScript errors; zero Vue warnings about undefined route/to props or invalid VcLineItem :route prop |

**Pass Criteria:**
- Zero JavaScript errors across the entire catalog list view + variation expand + link navigation session
- No Vue prop validation warnings (especially for the `:route` prop on `VcLineItem`)
- No failed network requests (no 4xx or 5xx) related to variation data loading or link navigation
- Collapse/expand toggle works cleanly without errors

**Fail Criteria:**
- Any JavaScript error appears in DevTools Console during any step
- Vue warning about invalid `:route` prop or undefined value
- Network error (4xx/5xx) during variation loading
