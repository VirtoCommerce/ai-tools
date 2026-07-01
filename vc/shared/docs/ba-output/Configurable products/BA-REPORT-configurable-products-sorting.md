# BA Report: Configurable Products — Configuration Options & Sorting

**Date:** 2026-03-16
**Analyst:** BA System Analyzer + BA Story Writer (Agentic QA)
**JIRA Ticket:** [VCST-4774](https://virtocommerce.atlassian.net/browse/VCST-4774)
**Environment:** QA (`vcst-qa-storefront.govirto.com` / Admin `vcst-qa.govirto.com`)
**Platform:** 2.44.0-pr-2100-9ae9 / Admin SPA 3.1007.0

---

## 1. Objective

Analyze configurable products in Virto Commerce: investigate configuration options, section types, and sorting possibilities — both on the Admin SPA and storefront. Produce improvement stories and JIRA tickets.

---

## 2. Configuration Options — Four Section Types

| Type | User Action | Key Fields | Admin Editable Fields |
|------|------------|------------|----------------------|
| **Product** | Select from catalog products (radio buttons) | `options[]` with prices, quantity | Product reference, Quantity |
| **Variation** | Select from parent product's own variant SKUs | Same as Product, references variant SKUs | (Currently buggy — renders empty) |
| **Text** | Type custom text or pick predefined values | `maxLength`, `allowCustomText`, `allowTextOptions` | Section name, max length, allow toggles |
| **File** | Upload files (logo, artwork, PDF) | MIME types, max size (~9.5MB), max count (2-5) | Section name, required toggle |

### Section Metadata

| Field | Purpose |
|-------|---------|
| `id` | UUID (runtime-resolved, not hardcoded) |
| `name` | Section header on PDP |
| `description` | Optional subtitle |
| `type` | Product, Variation, Text, File |
| `isRequired` | `true` = must complete before add-to-cart (BL-CAT-006) |

### Test Products in QA

| Product | Sections | Types |
|---------|----------|-------|
| Configurable Hat | 4 (all optional) | Product + Product + Text + File |
| Custom T-shirt | 4 (first required) | Product(req) + Text + Product + File |
| Base product EN | 3 (all required) | File(req) + Text(req) + Product(req) |
| Bike with options | 3 (last required) | Text + Variation(empty/bug) + Product(req) |
| Off-Road Bike | 3 (all optional) | Variation(empty/bug) + Variation(empty/bug) + Text |

---

## 3. Admin SPA Investigation

**Navigation path:** Catalog > [Category] > [Configurable Product] > Configuration widget (right panel)

### Current State

| Aspect | State | Evidence |
|--------|-------|----------|
| Section ordering | Drag-and-drop works; hidden `displayOrder` field (0, 1, 2) | `08-sections-display-order-column-revealed.png` |
| **Option ordering** | **No mechanism** — insertion order only | `06-options-grid-menu-columns.png` |
| Option drag handle | Icon appears but is **non-functional** | `03-section-options-list.png` |
| Display Order on options | **Absent from data model** | Not in Grid Menu column list |
| Option edit form | Only 1 field: Quantity | `04-option-edit-form.png` |
| Section edit form | Name, Description, Type (read-only), Required toggle | `09-text-section-edit-form.png` |

**Option grid columns (complete list):** Actions, Created By, Created Date, Id, Img, Modified By, Modified Date, Product Id, Product Type, Product name, Quantity, Section Id, Text

**No "Display Order", "Sort order", "Priority", or "Position" column exists.**

### Admin Screenshots (10 files in `docs/ba-output/`)

| File | Content |
|------|---------|
| `02-product-configuration-sections-list.png` | Configuration panel with 3 sections |
| `03-section-options-list.png` | Options grid (Img, Product name, Quantity) |
| `04-option-edit-form.png` | Option edit — only Quantity field |
| `05-variation-section-no-options.png` | Variation type — empty, no options |
| `06-options-grid-menu-columns.png` | All available option columns — no sort order |
| `07-sections-grid-menu-columns.png` | Section columns — Display Order present but hidden |
| `08-sections-display-order-column-revealed.png` | Display Order values 0, 1, 2 |
| `09-text-section-edit-form.png` | Text section edit form |
| `10-offroad-bike-sections-display-order.png` | Second product confirming same pattern |

---

## 4. Storefront (Frontend) Investigation

### 4.1 Sort Options on Category/Search Pages

| Label | URL param |
|-------|-----------|
| Featured | (default, no param) |
| Alphabetically, A-Z | `?sort=name-ascending` |
| Alphabetically, Z-A | `?sort=name-descending` |
| Price, low to high | `?sort=price-ascending` |
| Price, high to low | `?sort=price-descending` |
| Date, new to old | `?sort=date-descending` |
| Date, old to new | `?sort=date-ascending` |

### 4.2 Price Sort Bug (High Severity)

**Confirmed on both category pages and search results.**

Products displaying "From $X" (`minVariationPrice`) sort incorrectly:

| Sort | Expected Position (Base product EN, "From $5") | Actual Position |
|------|------------------------------------------------|-----------------|
| Price ascending | 1st (cheapest) | **Last** (8th of 8) |
| Price descending | Last (cheapest) | **First** |

**Root cause:** Backend sort uses `listPrice` on the base product, which is `null` for configurable/variation products. The `minVariationPrice` that drives the "From $X" display is NOT used as the sort key. Null prices are pushed to the boundary.

**Search confirmation:** "hat" query — Men's Adjustable Scholarship Hat ("From $4.00") ranks at position 3 behind Configurable Hat ($10.00) in price ascending.

### 4.3 Filter + Sort Interaction (ECL-3.2)

**NOT reproduced.** Applying a facet filter while price sort is active correctly preserves the sort. URL: `?sort=price-ascending&facets=%22Color%22:%22Beige%22`. The sort dropdown continues to show the correct value.

### 4.4 PDP Configuration Sections — Configurable Hat

| # | Section | Type | Required | Options |
|---|---------|------|----------|---------|
| 1 | Select your fav color | Product | No | Black hat ($10), Beige hat ($500), Green hat ($18), Red hat ($14), None |
| 2 | Select print-ready cap | Product | No | NY ($8), H ($10), P ($16), Bird ($20), S ($11) |
| 3 | Customize text for your cap | Text | No | NY, S, Bird, DKNY, TGIF + freeform |
| 4 | Add photo | File | No | File upload |

**Price behavior:** Sidebar shows running total = base price + selected option prices x quantities. Options show absolute prices, not "+$X" surcharge format.

### 4.5 Option Order Consistency: Admin vs API vs Storefront

| Position | Admin (insertion order) | API (`productConfiguration`) | Storefront | Match |
|----------|------------------------|------------------------------|------------|-------|
| 1 | Black hat — $10.00 | Black hat — $10.00 | Black hat — $10.00 | YES |
| 2 | Beige hat — $500.00 | Beige hat — $500.00 | Beige hat — $500.00 | YES |
| 3 | Green hat — $18.00 | Green hat — $18.00 | Green hat — $18.00 | YES |
| 4 | Red hat — $14.00 | Red hat — $14.00 | Red hat — $14.00 | YES |

**100% consistent.** Storefront faithfully renders API response order = Admin insertion order. No client-side reordering.

### Storefront Screenshots (22 files in `docs/ba-output/frontend-investigation/`)

| File | Content |
|------|---------|
| `01-category-page-initial.png` | Default Featured sort, 8 products |
| `02-sort-dropdown-open.png` | Sort dropdown options |
| `03-sort-price-low-to-high.png` | Price ascending — anomaly visible |
| `04-sort-price-high-to-low.png` | Price descending — anomaly visible |
| `05-sort-name-az.png` | Alphabetical — correct |
| `06-color-filter-expanded.png` | Filter expanded with sort active |
| `07-filter-applied-sort-preserved.png` | Sort preserved after filter (ECL-3.2 not repro) |
| `08-configurable-hat-pdp.png` | Configurable Hat PDP |
| `09-configurable-hat-sections-expanded.png` | All sections expanded |
| `10-hat-option-selected-price-update.png` | Price update on option select |
| `11-custom-tshirt-pdp.png` | Custom T-shirt (required section) |
| `12-base-product-en-pdp.png` | Base product EN (file + text) |
| `13-search-configurable-price-asc.png` | Search "configurable" — correct |
| `14-search-configurable-price-desc.png` | Search "configurable" — correct |
| `15-search-hat-price-asc.png` | Search "hat" — anomaly visible |

---

## 5. Bugs & Issues Summary

| # | Location | Issue | Severity | Status |
|---|----------|-------|----------|--------|
| BUG-1 | Category — price sort | "From $X" products sort by `null` listPrice, not minVariationPrice | **High** | New — needs JIRA |
| BUG-2 | Search — price sort | Same as BUG-1 in search results | **High** | New — needs JIRA |
| BUG-3 | PDP — Variation sections | "Bike with options" and "Off-Road Bike" Variation sections render empty | **P2** | Known (March 13 regression) |
| BUG-4 | PDP — Configurable Hat qty | Quantity stepper disabled after option selection | **P1** | Known (March 13 regression) |
| UX-1 | Listing cards | "From $X" uses base price, not minimum configured price | Medium | Story CP-SORT-01 |
| UX-2 | PDP options | Prices shown as absolute ($10), not additive (+$10) | Low | Observation |
| UX-3 | PDP options | $500 option mixed with $10-$18 options — no in-section sort | Low | Story CP-SORT-03 |
| GAP-1 | Admin — options | No display order / sort order field or drag-and-drop for options | Medium | **VCST-4774** |

---

## 6. Improvement Stories (Epic: CP-SORT)

| ID | Title | Type | Priority | Effort | JIRA |
|----|-------|------|----------|--------|------|
| CP-SORT-01 | Show Effective Minimum Price on Listing Cards | Improvement | High | M (1-2w) | — |
| CP-SORT-02 | Preserve Sort Order When Applying Facet Filters | Bug Fix | High | S (1-3d) | — |
| CP-SORT-03 | Sort Options Within Configuration Section on PDP | Feature | Medium | M (1-2w) | — |
| CP-SORT-04 | Set Display Order of Section Options in Admin | Feature | Medium | S (1-3d) | **VCST-4774** |

**Recommended implementation order:**
1. **CP-SORT-02** — standalone frontend fix, no API changes (NOTE: ECL-3.2 not reproduced; may be downgraded)
2. **CP-SORT-04** — establish `SortOrder` data model (VCST-4774 created)
3. **CP-SORT-01 + CP-SORT-03** — can run in parallel once above are merged

Full story details: [`docs/ba-output/user-stories/EPIC-CP-SORT-stories.md`](user-stories/EPIC-CP-SORT-stories.md)

---

## 7. Technical Architecture Notes

### GraphQL `productConfiguration` Query
```graphql
productConfiguration(
  configurableProductId: String!
  storeId: String!
  userId: String
  cultureName: String
  currencyCode: String
) -> ConfigurationQueryResponseType
```

Returns `configurationSections[]` each with `options[]` (`ConfigurationLineItemType`):
- `id`, `text`, `quantity`, `product { id, name, code }`
- `listPrice`, `salePrice`, `extendedPrice`, `discountAmount`

### Sort Architecture
- Storefront sort dropdown sends `?sort=price-ascending` URL param
- Backend resolves to xAPI `products(sort: "price:asc")` query
- Sort key is `listPrice` on the product index document
- `minVariationPrice` is computed and displayed but NOT used for sorting
- **Fix required:** Use `effectiveMinPrice` = max(`listPrice`, `minVariationPrice`) for sort

### Option Order Pipeline
```
Admin insertion order → DB row order → productConfiguration API → Storefront render
```
No reordering at any layer. Adding `SortOrder` to the DB + API will flow through automatically.

---

## 8. Artifacts Produced

| Artifact | Path |
|----------|------|
| This report | `docs/ba-output/BA-REPORT-configurable-products-sorting.md` |
| User stories (4) | `docs/ba-output/user-stories/EPIC-CP-SORT-stories.md` |
| Stories index | `docs/ba-output/user-stories/README.md` |
| Admin screenshots (10) | `docs/ba-output/02-*.png` through `10-*.png` |
| Frontend screenshots (22) | `docs/ba-output/frontend-investigation/*.png` |
| Frontend findings report | `docs/ba-output/frontend-investigation/FINDINGS-REPORT.md` |
| JIRA ticket | [VCST-4774](https://virtocommerce.atlassian.net/browse/VCST-4774) — CP-SORT-04 |
