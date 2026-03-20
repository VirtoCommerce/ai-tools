# EPIC-CP-SORT: Configurable Product Sorting Improvements

**Goal:** Eliminate misleading price signals and uncontrolled sort state for configurable products so that shoppers make informed decisions and operators have full control over option presentation.

**Success Metric:** Price-sort bounce rate on configurable product category pages decreases by >= 15%; zero reported incidents of silent sort-reset after filter application; Admin SPA option reorder capability ships and is used on >= 50% of configured sections within 30 days of release.

**Stories in this Epic:**

| ID | Title | Effort | Priority |
|----|-------|--------|----------|
| CP-SORT-01 | Show Effective Minimum Price on Configurable Product Listing Cards | M | High |
| CP-SORT-02 | Preserve Sort Order When Shopper Applies Facet Filters | S | High |
| CP-SORT-03 | Allow Shoppers to Sort Options Within a Configuration Section | M | Medium |
| CP-SORT-04 | Allow Catalog Managers to Set Display Order of Section Options in Admin | S | Medium |

**Epic Acceptance Criteria:**

- [ ] Configurable product listing cards show "From $X" where $X accounts for required option surcharges
- [ ] Price sort on category pages ranks configurable products by effective minimum price, not base price
- [ ] Applying any facet filter does not reset the active sort selection
- [ ] Shoppers can reorder options within a PDP configuration section by price or name
- [ ] Catalog managers can drag-reorder options in the Admin SPA configuration section editor

---

## CP-SORT-01 — Show Effective Minimum Price on Configurable Product Listing Cards

**Type:** Improvement
**Module:** Catalog / xAPI
**Priority:** High
**Effort:** M (1–2 weeks)
**Sprint:**

### Story Statement

```
As a registered B2C customer or B2B purchasing agent browsing a category page,
I want to see "From $X" on configurable product cards where $X reflects the base price
plus the cheapest required configuration options,
So that I can compare configurable products by realistic minimum cost and am not
misled by a $0 or artificially low base price into the wrong sort position.
```

### Background / Context

Configurable products in the Virto Commerce storefront support four section types: Product, Variation, Text, and File. Required sections must be completed before "Add to Cart" is enabled (BL-CAT-006). When a product has a $0 base price and $500 in mandatory option surcharges, the listing card currently shows "$0.00" and the product sorts to the top of "Price: Low to High" — directly contradicting the shopper's intent. The `minVariationPrice` pattern already solves an analogous problem for variation products; this story extends that concept to configurable products by computing a minimum effective price at index time.

### Acceptance Criteria

**AC-1: Effective minimum price displayed on listing card**
Given a configurable product where at least one section is marked required
And the cheapest combination of required option surcharges totals $X
When a shopper views the product card on any category listing page
Then the card displays "From $[base + X]" in place of the flat base price
And the "From" prefix renders in the same typographic style used for variation products

**AC-2: Products with no required sections show base price without "From" prefix**
Given a configurable product where all sections are optional
When a shopper views the product card on any category listing page
Then the card displays the base price without the "From" prefix

**AC-3: Price sort uses effective minimum price**
Given a category page containing a mix of configurable and standard products
When a shopper selects "Price: Low to High" sort
Then configurable products are ranked by (base price + cheapest required options total), not by base price alone
And the visible "From $X" label matches the rank position in the sorted list

**AC-4: Price sort descending is consistent**
Given the same category page
When a shopper selects "Price: High to Low" sort
Then configurable products are ranked by effective minimum price descending
And the sort order is stable (no random reshuffling on page reload)

**AC-5: Mixed listing with variation and configurable products**
Given a category page that contains variation products, configurable products, and simple products
When sorted by price ascending
Then all three product types are ranked using their respective effective minimum prices
And no product type systematically clusters at top or bottom due to price calculation differences

**AC-6: Zero required options with $0 base price edge case**
Given a configurable product with $0 base price and no required sections
When a shopper views the listing card
Then the card displays "$0.00" without a "From" prefix
And the product sorts correctly at the low end of price ascending

**AC-7: Error — effective price index field missing**
Given the xAPI index does not yet contain `effectiveMinPrice` for an older product document
When the listing page loads
Then the system falls back to `listPrice` for that product's sort value
And logs a warning-level server event, does NOT show a broken UI state

### Out of Scope

- Effective price calculation on the PDP itself (handled in a separate PDP pricing story)
- Dynamic recalculation in real-time as a shopper selects options on the listing card
- Multi-currency effective price computation beyond the store's default display currency
- Effective price for Text or File section types (surcharges rarely apply; defer to follow-on)

### Dependencies

- **Depends on:** xAPI indexing pipeline supports adding computed fields to the product index document
- **Blocked by:** Agreement on field naming convention (`effectiveMinPrice` vs `minConfigurablePrice`) with platform team
- **Enables:** CP-SORT-03 (option-level sorting on PDP), future "smart sort" feature

### Definition of Done

- [ ] Feature works in Chrome, Firefox, Safari, Edge
- [ ] Responsive: works on mobile (375px), tablet (768px), desktop (1280px+)
- [ ] Unit tests written and passing (>= 80% coverage for new code)
- [ ] Integration test: xAPI returns `effectiveMinPrice` for products with required sections
- [ ] E2E test: price sort on category page ranks configurable product by effective min price
- [ ] Code reviewed and approved by 1+ team member
- [ ] No new console errors or warnings introduced
- [ ] Accessibility: "From" prefix does not break screen reader price announcement
- [ ] Localization: "From" prefix uses i18n key `product.price.from`, no hardcoded text
- [ ] BA sign-off on acceptance criteria
- [ ] xAPI index migration documented; re-index runbook written and reviewed

### UI/UX Notes

**Layout:**
- "From $X" label occupies the same position as the existing price label on the product card
- The word "From" appears as a smaller prefix (e.g., `text-xs` or `text-sm`) directly before the formatted price, consistent with how it is rendered on variation product cards today

**States to handle:**
- Default: "From $[effective min price]" for products with required sections
- Loading: skeleton placeholder identical to current price skeleton
- No required sections: plain "$[base price]" (no prefix)
- $0 effective min price: "$0.00" without prefix, special case — do not hide
- Stale index / missing field: fall back to base price display silently

**Interaction details:**
- No new interactive elements; this is a display change only
- Existing VC component `vc-product-price` should be extended to accept an `isFrom: boolean` prop and render the prefix when true
- Tooltip on hover is NOT required for MVP

**Existing VC component to reuse:**
- `vc-product-price` (Vue storefront, Coffee theme)
- `vc-product-card` wrapper

### Technical Notes

**API endpoints involved:**
- `POST /graphql` — `products` query: add `effectiveMinPrice` field to `ProductType`
- `POST /graphql` — `productConfiguration` query: used to compute effective price at index time

**VC modules affected:**
- `VirtoCommerce.Xapi` — add `effectiveMinPrice` to `ProductType` schema and resolver
- `VirtoCommerce.CatalogPublishing` or equivalent indexing pipeline — compute and store `effectiveMinPrice` when a configurable product is published/updated
- `vc-storefront` (Coffee theme) — update `vc-product-price` component and listing card template

**Data model impact:**
- New indexed field: `effectiveMinPrice` (decimal, per currency) on the product search document
- Computation logic: iterate required sections, sum cheapest option surcharge per section, add to `listPrice`
- Text and File section types: treat surcharge as $0 for MVP (no numeric surcharge model)
- Re-index required for all existing configurable products after deployment

**Performance considerations:**
- Computation runs at index time, not query time — no runtime performance impact
- Re-indexing scope: configurable products only; filter by product type to limit re-index cost
- Cache invalidation: when any option surcharge changes, trigger selective re-index of the parent configurable product

**Security considerations:**
- `effectiveMinPrice` is a read-only computed field; no write surface introduced
- Existing catalog visibility and pricing-tier rules (price lists, customer segments) still govern which price is displayed — `effectiveMinPrice` uses the same `listPrice` anchor

### Test Scenarios

| Scenario | Input | Expected Output | Test Type |
|----------|-------|-----------------|-----------|
| Required section with surcharge | Product: $100 base, required section with options at $50/$75/$100 | Card shows "From $150" | E2E |
| All optional sections | Product: $100 base, all sections optional | Card shows "$100.00" (no "From") | Unit |
| Multiple required sections | Product: $0 base, 2 required sections cheapest combo $200+$300 | Card shows "From $500" | Unit |
| Price sort ascending | Mixed catalog: configurable ($0 base, $500 min), simple ($300) | Simple product ranks above configurable | E2E |
| Missing index field | Old product document lacking `effectiveMinPrice` | Falls back to base price, no UI error | Integration |
| Currency change | Store switches display currency mid-session | "From" price recalculates in new currency | Integration |
| $0 base $0 required options | Free configurable product | Shows "$0.00" without "From" prefix | Unit |

---

## CP-SORT-02 — Preserve Sort Order When Shopper Applies Facet Filters

**Type:** Bug Fix
**Module:** Catalog / Storefront
**Priority:** High
**Effort:** S (1–3 days)
**Sprint:**

### Story Statement

```
As a registered B2C customer or guest shopper on a category listing page,
I want my chosen sort order to remain active when I apply or remove facet filters,
So that I do not have to re-select my sort preference after each filter interaction
and can efficiently narrow down results without losing my browsing context.
```

### Background / Context

This is a known observed issue matching ECL-3.2 (sort state loss on filter interaction). When a user selects "Price: Low to High" and then applies a facet filter (brand, color, category, etc.), the storefront silently resets the sort parameter to the default ("Featured"). The issue affects all product types but is particularly disruptive on configurable product category pages where price sorting is the primary comparison mechanism. The root cause is likely that the filter change triggers a fresh route navigation or query rebuild that drops the `sort` query parameter. This must be fixed before the configurable product effective-price sort (CP-SORT-01) ships, because a resetting sort would negate that improvement.

### Acceptance Criteria

**AC-1: Sort selection persists after applying a single facet filter**
Given a shopper has selected "Price: Low to High" on a category page
When the shopper clicks any facet checkbox (e.g., a brand or color filter)
Then the product list reloads with the filter applied
And the sort selector still shows "Price: Low to High"
And the products are still ordered by price ascending

**AC-2: Sort selection persists after removing a facet filter**
Given a shopper has an active filter and "Price: High to Low" sort selected
When the shopper removes the active filter
Then the product list reloads without the filter
And the sort selector still shows "Price: High to Low"
And the products are still ordered by price descending

**AC-3: Sort persists across multiple filter interactions**
Given a shopper selects "A-Z" sort and applies three sequential facet filters
When each filter is applied one after another
Then the sort selector shows "A-Z" after each filter change
And the product order is alphabetical ascending after each filter change

**AC-4: Sort parameter is reflected in the URL**
Given a shopper selects any non-default sort
When the page loads with that sort active
Then the URL query string contains the sort parameter (e.g., `?sort=price-asc`)
And copying the URL and reloading preserves both the sort and any active filters

**AC-5: Default sort is correctly applied when no sort is selected**
Given a shopper has not selected a sort
When a facet filter is applied
Then the sort selector shows "Featured" (or the store-configured default)
And no spurious sort parameter appears in the URL

**AC-6: Error — invalid sort parameter in URL**
Given the URL contains an unrecognized sort value (e.g., `?sort=unknown`)
When the page loads
Then the system defaults to "Featured" sort silently
And the sort selector shows "Featured"
And no JavaScript error is thrown in the browser console

### Out of Scope

- Persisting sort selection across browser sessions (localStorage/cookie-based persistence is a separate enhancement)
- Persisting sort selection when navigating away to a PDP and returning via browser back
- Server-side rendering sort persistence (SSR cache behavior)

### Dependencies

- **Depends on:** No external dependencies — this is a self-contained storefront routing fix
- **Blocked by:** Nothing; can be developed immediately
- **Enables:** CP-SORT-01 (effective price sort is only useful if it does not reset on filter)

### Definition of Done

- [ ] Feature works in Chrome, Firefox, Safari, Edge
- [ ] Responsive: sort persistence verified on mobile (375px), tablet (768px), desktop (1280px+)
- [ ] Unit tests: sort parameter serialization/deserialization to URL query string
- [ ] E2E test: apply filter after sort, verify sort selector value and product order preserved
- [ ] Regression: existing filter-only flows (no sort selected) still work correctly
- [ ] Code reviewed and approved by 1+ team member
- [ ] No new console errors or warnings introduced
- [ ] Accessibility: sort selector ARIA state does not change unexpectedly on filter
- [ ] Localization: no hardcoded sort label strings introduced
- [ ] BA sign-off on acceptance criteria

### UI/UX Notes

**Layout:**
- The sort selector (dropdown or button group above the product grid) must not visually reset when filters are applied
- The selected option in the sort control must remain highlighted/selected after any filter interaction

**States to handle:**
- Sort active + filter applied: both sort indicator and filter chips visible simultaneously
- Sort active + all filters removed: sort indicator remains, filter chips disappear
- Page reload with sort + filter in URL: both restored correctly from URL

**Interaction details:**
- The sort selector label should remain unchanged during the filter-triggered loading state (skeleton/spinner on product grid only)
- No new UI elements required; this is a state-management fix

**Existing VC component to reuse:**
- The existing sort dropdown/selector component in the Coffee theme
- Vue Router query parameter management utilities

### Technical Notes

**API endpoints involved:**
- `POST /graphql` — `products` query: `sort` parameter must be passed on every request, including filter-triggered re-queries
- No API changes required; this is a frontend-only fix

**VC modules affected:**
- `vc-storefront` (Coffee theme) — category listing page component, filter interaction handler, Vue Router integration

**Data model impact:**
- None — no schema or database changes required
- URL query string: standardize sort param key (e.g., `sort`) and value format (e.g., `price-asc`, `price-desc`, `name-asc`, `featured`)

**Root cause (hypothesis):**
- Filter facet click handler rebuilds the route query object from scratch using only facet state, discarding sort state
- Fix: merge current sort state into the route query object when constructing filter-triggered navigation

**Performance considerations:**
- Fix adds one additional query parameter to filter requests — negligible performance impact
- Ensure sort parameter is included in cache key if any response caching is active

**Security considerations:**
- Sort parameter is read-only and consumer-facing; no privilege escalation risk
- Input sanitization: validate `sort` param against allowed values before passing to xAPI

### Test Scenarios

| Scenario | Input | Expected Output | Test Type |
|----------|-------|-----------------|-----------|
| Sort then filter | Select "Price: Low to High", apply Brand filter | Sort remains "Price: Low to High", products filtered and sorted | E2E |
| Filter then sort | Apply Color filter, then select "A-Z" sort | Products filtered and sorted A-Z | E2E |
| Remove filter | Sort active, remove filter chip | Sort remains active, all products shown sorted | E2E |
| URL round-trip | Bookmark URL with sort + filter params | Page restores both sort and filter on load | E2E |
| Multiple filters | Apply 3 filters sequentially with price sort active | Sort preserved after each filter step | E2E |
| Invalid sort in URL | `?sort=xyz` | Defaults to Featured, no JS error | Unit |
| Default sort + filter | No sort selected, apply filter | Sort remains Featured, URL has no sort param | Unit |
| Network failure during filter | API timeout on filtered request | Sort selector not reset; error toast shown | Integration |

---

## CP-SORT-03 — Allow Shoppers to Sort Options Within a Configuration Section on PDP

**Type:** Feature
**Module:** Catalog / Storefront (PDP)
**Priority:** Medium
**Effort:** M (1–2 weeks)
**Sprint:**

### Story Statement

```
As a registered B2C customer or B2B purchasing agent on a product detail page,
I want to sort the options displayed within a configuration section by price (low to high,
high to low) or by name (A-Z, Z-A),
So that when a section has many options I can quickly find the cheapest or locate a
specific option alphabetically without scrolling through the entire fixed list.
```

### Background / Context

Configuration sections on the PDP render an `options[]` array in a fixed order determined by Admin setup (creation order). For sections with 10 or more options — common in product/component selection scenarios (e.g., "Choose your processor", "Select your finish color") — this creates friction. B2B purchasing agents comparing costs across a configuration must manually scan the entire list. The `productConfiguration` GraphQL query returns options in fixed order with no built-in sort parameter. This story adds client-side sorting controls within each section; server-side option ordering (CP-SORT-04) is the Admin-facing complement.

### Acceptance Criteria

**AC-1: Sort controls appear for sections with sufficient options**
Given a configuration section on a PDP contains 5 or more options
When the shopper views the section
Then a sort control (dropdown or icon-button group) is visible within the section header area
And the control offers at minimum: "Default", "Price: Low to High", "Price: High to Low", "Name: A-Z", "Name: Z-A"

**AC-2: Options with no surcharge price are sortable by name only**
Given a configuration section contains options where none have a defined surcharge price (e.g., text input type)
When the shopper views the section
Then the price sort options are disabled or hidden
And only "Default", "Name: A-Z", "Name: Z-A" are offered

**AC-3: Sort by price low to high**
Given a configuration section with mixed surcharge prices (some $0, some > $0)
When the shopper selects "Price: Low to High"
Then options re-render ordered from lowest to highest surcharge
And options with $0 surcharge appear first
And the currently selected option (if any) retains its visual selected state

**AC-4: Sort by price high to low**
Given the same section with active "Price: High to Low" sort
When the section renders
Then options are ordered from highest surcharge to lowest
And $0 surcharge options appear last

**AC-5: Sort by name A-Z**
Given a configuration section with any option types
When the shopper selects "Name: A-Z"
Then options re-render in ascending alphabetical order by option label
And the sort is locale-aware (uses locale-sensitive string comparison)

**AC-6: Sort resets when navigating away and returning**
Given a shopper sorted a section by price
When the shopper navigates to a different page and returns via browser back
Then the section reverts to Default order
And no sort preference is persisted to localStorage or cookies for MVP

**AC-7: Selected option is not lost when sort changes**
Given a shopper has selected an option in a section
When the shopper changes the sort order of that section
Then the previously selected option remains selected (checked/highlighted)
And the "Add to Cart" enabled/disabled state is unchanged

**AC-8: Sort controls absent for sections with fewer than 5 options**
Given a configuration section contains 4 or fewer options
When the shopper views the section
Then no sort control is rendered for that section
And the existing layout is unchanged

**AC-9: Error — options fail to load**
Given the `productConfiguration` API returns an error or empty `options[]`
When a shopper views the section
Then no sort control is rendered
And the section displays an appropriate empty/error state message
And no JavaScript error is thrown in the console

### Out of Scope

- Persisting shopper sort preference per section across sessions
- Sorting across sections (global "sort all sections by price" control)
- Server-side sort parameter on `productConfiguration` query (deferred to a future API enhancement)
- Sections with fewer than 5 options (not worth the UI complexity)
- File upload section types (no sortable attributes apply)

### Dependencies

- **Depends on:** CP-SORT-04 is independent but complementary — Admin default order (CP-SORT-04) defines "Default" in this story's sort control
- **Blocked by:** Nothing; can be developed in parallel with CP-SORT-04
- **Enables:** Future: persistent user sort preference (localStorage); future: server-side option sort API

### Definition of Done

- [ ] Feature works in Chrome, Firefox, Safari, Edge
- [ ] Responsive: sort control usable on mobile (375px) — inline compact layout; tablet (768px); desktop (1280px+)
- [ ] Unit tests: sort logic (price asc/desc, name asc/desc) with edge cases ($0 prices, equal prices, equal names)
- [ ] Unit test: selected option state preserved across sort changes
- [ ] E2E test: shopper sorts a section with 10+ options by price, verifies order and selected state
- [ ] Code reviewed and approved by 1+ team member
- [ ] No new console errors or warnings introduced
- [ ] Accessibility: sort control is keyboard navigable; ARIA label e.g. `aria-label="Sort options in [section name]"`; sort change announced to screen reader via `aria-live`
- [ ] Localization: sort label strings use i18n keys; price formatting uses existing currency formatter
- [ ] BA sign-off on acceptance criteria

### UI/UX Notes

**Layout:**
- Sort control renders inside the section header row, right-aligned, as a compact dropdown (select element or `vc-dropdown`)
- On mobile (< 768px): sort control collapses to an icon button (sort icon) that opens a bottom sheet or dropdown
- Section header structure: `[Section title] [Required badge?] ... [Sort dropdown]`

**States to handle:**
- Default: no sort applied, options in API order
- Sort active: options reordered, sort dropdown shows active selection
- Option selected + sort change: selected option retains visual highlight in new position
- No price surcharges: price sort options disabled (greyed) in dropdown
- Empty section / API error: no sort control rendered

**Interaction details:**
- Sort dropdown label: "Sort by: Default" (changes to reflect active sort)
- On sort change: immediate client-side re-render, no API call needed
- Animation: simple CSS order transition (100ms) to avoid jarring reorder
- Section sort is independent per section (sorting section A does not affect section B)

**Existing VC component to reuse:**
- `vc-select` or native `<select>` in Coffee theme for the sort dropdown
- Existing option item component (checkbox, swatch, or list item) — no changes to option rendering itself

### Technical Notes

**API endpoints involved:**
- `POST /graphql` — `productConfiguration` query: no changes required for MVP (client-side sort only)
- Future: add `sort` argument to `ConfigurationSection.options` field resolver

**VC modules affected:**
- `vc-storefront` (Coffee theme) — PDP configuration section component
- No backend changes required for MVP

**Data model impact:**
- None for MVP
- Option object already contains `price` (surcharge) and `name`/`label` fields — confirm field names via `productConfiguration` introspection before implementation

**Performance considerations:**
- Sorting is purely client-side on an in-memory array — negligible performance cost even for 100+ options
- No debouncing required; sort is applied synchronously on selection change

**Security considerations:**
- No new API surface; read-only client-side operation
- No user input is sent to the server as a result of sort interaction

### Test Scenarios

| Scenario | Input | Expected Output | Test Type |
|----------|-------|-----------------|-----------|
| Sort price asc | Section with options at $50, $10, $0, $200 | Order: $0, $10, $50, $200 | Unit |
| Sort price desc | Same section | Order: $200, $50, $10, $0 | Unit |
| Sort name A-Z | Options: "Zinc", "Aluminum", "Bronze" | Order: Aluminum, Bronze, Zinc | Unit |
| Sort name Z-A | Same options | Order: Zinc, Bronze, Aluminum | Unit |
| Selected state preserved | Option "Bronze" selected, sort changes to price asc | "Bronze" still selected, appears in correct sorted position | E2E |
| No price surcharges | Section with $0 options only | Price sort options disabled in dropdown | Unit |
| < 5 options | Section with 4 options | Sort control not rendered | Unit |
| Mobile layout | Viewport 375px, section with 10 options | Sort icon button visible, tappable, opens sort menu | E2E |
| Keyboard navigation | Tab to sort dropdown, select "Price: Low to High" via keyboard | Options reorder, ARIA live region announces change | E2E |
| API error | `productConfiguration` returns error | No sort control, error state shown, no JS error | Integration |

---

## CP-SORT-04 — Allow Catalog Managers to Set Display Order of Section Options in Admin

**Type:** Feature
**Module:** Catalog / Admin SPA
**Priority:** Medium
**Effort:** S (1–3 days)
**Sprint:**

### Story Statement

```
As a catalog manager in the Virto Commerce Admin SPA,
I want to drag-reorder or set an explicit display position for options within a
configuration section,
So that the storefront presents options in a deliberate merchandising order (e.g.,
most popular first, cheapest first, or brand-standard sequence) without relying on
the implicit creation order.
```

### Background / Context

Currently the Admin SPA has no UI control for the order in which configuration section options appear on the storefront. Order is implicitly determined by the sequence in which options were created — a behavior that is invisible to catalog managers and produces unpredictable storefronts when options are added, removed, or re-added over time. This story adds a `sortOrder` (integer) field to the option data model and exposes drag-to-reorder in the Admin SPA section editor. The storefront complement (CP-SORT-03) uses this Admin-defined order as its "Default" sort mode.

### Acceptance Criteria

**AC-1: Drag-to-reorder within section options list**
Given a catalog manager opens a configuration section in the Admin SPA
When the section has at least 2 options
Then each option row displays a drag handle icon on the left
And the manager can drag an option row to a new position within the same section
And releasing the drag saves the new order without requiring a separate "Save" click

**AC-2: Explicit sort order field is editable**
Given a catalog manager opens an individual option edit form
When the form is displayed
Then a numeric "Display order" field is present (integer, min 0)
And changing the value and saving reorders the option relative to other options in the same section

**AC-3: Sort order is persisted and reflected on the storefront**
Given a catalog manager has set option A to position 1 and option B to position 2
When a shopper views the configuration section on the storefront PDP
Then option A appears before option B
And the storefront order matches the Admin-set order (the "Default" sort in CP-SORT-03)

**AC-4: Sort order is preserved when a new option is added**
Given existing options have explicit sort orders (1, 2, 3)
When the manager adds a new option without specifying a sort order
Then the new option is appended at the end (sort order = max + 1)
And existing option orders are not changed

**AC-5: Duplicate sort order values are resolved without data loss**
Given two options are manually set to the same sort order value
When the section is saved
Then the system resolves the conflict by assigning sequential order to the duplicates (e.g., last-saved gets lower priority)
And no option is lost or overwritten
And the manager sees an informational message: "Duplicate display orders were automatically resolved."

**AC-6: Drag is constrained to the same section**
Given a manager is viewing a product with multiple configuration sections
When the manager drags an option row
Then the drag is constrained within the current section's option list
And the option cannot be dropped into a different section

**AC-7: Error — save fails**
Given the manager reorders options and the API call to save fails (network error or 5xx)
When the save is attempted
Then the section reverts to the pre-drag order visually
And a toast notification shows: "Failed to save option order. Please try again."
And the manager's changes are not silently lost

**AC-8: Audit log entry on reorder**
Given a manager reorders options and the save succeeds
When the reorder is committed
Then an audit log entry is created recording the user, timestamp, section ID, and the new order
And the audit log is accessible via the existing platform audit log viewer

### Out of Scope

- Dragging options between different configuration sections
- Bulk reorder (e.g., "sort all sections alphabetically" button) — deferred to follow-on
- Reorder within the section type list (section-level ordering is a separate concern)
- API-only sort order management without Admin SPA UI

### Dependencies

- **Depends on:** `sortOrder` field must be added to the option data model and persisted by the catalog module
- **Blocked by:** Data model change approval from platform team
- **Enables:** CP-SORT-03 "Default" sort mode; future: bulk merchandising reorder tools

### Definition of Done

- [ ] Feature works in Chrome, Firefox, Safari, Edge (Admin SPA)
- [ ] Responsive: Admin SPA is desktop-first; verify at 1280px+ minimum
- [ ] Unit tests: sort order conflict resolution logic
- [ ] Unit test: new option appended at max + 1 when no sort order specified
- [ ] Integration test: save reorder via API, verify `sortOrder` persisted in DB
- [ ] E2E test: drag option A below option C in Admin, verify storefront order updated
- [ ] Code reviewed and approved by 1+ team member
- [ ] No new console errors or warnings introduced
- [ ] Accessibility: drag handle has `aria-roledescription="drag handle"` and keyboard-reorder fallback (Up/Down arrow keys on focused row)
- [ ] Localization: all new UI strings (drag handle tooltip, "Display order" label, conflict toast) use i18n keys
- [ ] Documentation: Admin user guide updated with reorder instructions
- [ ] BA sign-off on acceptance criteria
- [ ] DB migration script written and reviewed

### UI/UX Notes

**Layout:**
- In the configuration section editor (Admin SPA), the options table/list gains a drag handle column as the leftmost column
- Drag handle icon: six-dot grid icon (standard drag indicator), 24x24px, cursor changes to `grab` on hover
- "Display order" numeric input appears as an inline editable field in the option row or in the option detail flyout/drawer

**States to handle:**
- Default: options listed in current sort order with drag handles visible
- Dragging: source row shows placeholder (ghost), drop target shows insertion indicator line
- Saving: brief loading indicator on the section; success is silent (no toast)
- Save error: section reverts to pre-drag state; error toast appears (see AC-7)
- Single option in section: drag handle rendered but non-functional (only one item)

**Interaction details:**
- Drag and drop library: use existing drag-and-drop library already in the Admin SPA (if Vuedraggable or similar is present, reuse it)
- Keyboard reorder fallback: when a drag handle row is focused, Up/Down arrow keys move the option one position
- Auto-save on drop: no explicit "Save" button needed for drag reorder; use optimistic update + rollback on error
- "Display order" field: accepts integers 0–9999; validates on blur; shows inline error "Must be a whole number" for non-integer input

**Existing VC component to reuse:**
- Existing Admin SPA table/list component
- Existing drag-and-drop library (confirm with Admin SPA tech lead before introducing a new dependency)
- `vc-toast` for error notification

### Technical Notes

**API endpoints involved:**
- `PUT /api/catalog/configurationSections/{sectionId}/options/{optionId}` — add `sortOrder` field to request/response body
- `PUT /api/catalog/configurationSections/{sectionId}/options/reorder` — new bulk reorder endpoint (array of `{optionId, sortOrder}` pairs) for drag-reorder save
- Alternatively: reuse existing option update endpoint with a `PATCH` call per option; evaluate with backend team

**VC modules affected:**
- `VirtoCommerce.Catalog` module — add `SortOrder` (int) to the configuration option entity and repository
- Admin SPA — configuration section editor component
- `VirtoCommerce.Xapi` — update `productConfiguration` query to return options ordered by `SortOrder`

**Data model impact:**
- New column: `SortOrder INT NOT NULL DEFAULT 0` on the configuration option table
- Migration: set initial `SortOrder` values equal to row insertion order for existing records (preserve current behavior)
- Index: add DB index on `(SectionId, SortOrder)` for efficient ordered retrieval

**Performance considerations:**
- Reorder save: use a single bulk endpoint call rather than N individual PUT calls to avoid N+1 HTTP overhead
- xAPI query: options already fetched per section; adding `ORDER BY SortOrder` is a trivial DB-level sort

**Security considerations:**
- Reorder API requires `catalog:edit` permission (same as option create/update)
- Audit log write requires no additional permissions — uses existing audit infrastructure
- `SortOrder` is an internal merchandising field; not exposed in public-facing API responses beyond option list order

### Test Scenarios

| Scenario | Input | Expected Output | Test Type |
|----------|-------|-----------------|-----------|
| Drag option to new position | Drag option C from position 3 to position 1 | Option C appears first; A and B shift down | E2E |
| Edit display order field | Set option B "Display order" to 0 | Option B moves to top of section | E2E |
| New option appended | Add new option with no sort order | New option appears at end with SortOrder = max + 1 | Integration |
| Duplicate sort orders | Two options both set to SortOrder 5 | Conflict auto-resolved; both options present; info message shown | Unit |
| Storefront order matches Admin | Admin sets order A, C, B | Storefront PDP section shows A, C, B in Default sort | E2E |
| Save API failure | Network error on reorder save | Section reverts to previous order; error toast shown | Integration |
| Keyboard reorder | Focus drag handle row, press Up arrow | Option moves up one position | E2E |
| Cross-section drag attempt | Drag option from section 1 toward section 2 | Drag is rejected; option returns to original position | E2E |
| DB migration | Existing products after migration | Options appear in same order as before migration (creation order preserved) | Integration |
| Audit log | Manager reorders and saves | Audit log contains entry with user, timestamp, section ID, new order array | Integration |
