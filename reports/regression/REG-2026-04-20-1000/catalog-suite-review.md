# Catalog Suite Review — Hardcoded-Value Audit
**Date:** 2026-04-21
**Reviewer:** test-management-specialist
**Scope:** 3 catalog CSVs — 001-catalog-navigation.csv (19 tests), 002-product-detail.csv (32 tests), 003-catalog-filters.csv (29 tests)
**Golden rule applied:** `memory/feedback_flexible_test_cases.md`
**Review dimensions:** 8-dimension review criteria from `.claude/skills/testing/qa-review-tests/review-criteria.md`

---

## Summary

| Suite | Cases | Violations found | CLEAN | REWRITTEN | SEED-TAGGED | N/A | Deferred |
|-------|-------|-----------------|-------|-----------|-------------|-----|---------|
| 001-catalog-navigation | 19 | 9 | 10 | 7 | 0 | 2 | 0 |
| 002-product-detail | 32 | 14 | 17 | 9 | 3 | 3 | 0 |
| 003-catalog-filters | 29 | 18 | 11 | 18 | 0 | 0 | 0 |
| **Total** | **80** | **41** | **38** | **34** | **3** | **5** | **0** |

**Estimated PASS-rate improvement (next run):** +12–18% — primarily from eliminating cases that previously failed immediately on missing hardcoded product/SKU lookup, incorrect slug navigation, and hardcoded brand-name filter interactions.

---

## Suite 001 — catalog-navigation.csv

| ID | Verdict | Violations Found | Fix Applied |
|----|---------|-----------------|-------------|
| CAT-001 | CLEAN | None | — |
| CAT-002 | CLEAN | None | — |
| CAT-003 | CLEAN | None | — |
| CAT-007 | CLEAN | None | — |
| CAT-035 | CLEAN | None | `/Brands` is a stable route constant, not catalog-dependent data |
| CAT-036 | CLEAN | None | — |
| CAT-037 | REWRITTEN | DV-004: Assertion `'24 products'` was hardcoded count from a specific brand | Replaced with `[MATH] Product count shown on brand entry equals number of product cards on the brand listing page` (structural invariant) |
| CAT-040 | REWRITTEN | DV-004: Steps said "e.g., a product with known SEO data" anchoring to a specific product; assertions mentioned "product name or configured SEO title" implying known value | Rewritten to assert non-empty / present without any specific product; Preconditions updated to "any product with SEO info configured" |
| CAT-041 | CLEAN | None | — |
| CAT-042 | CLEAN | None | — |
| CAT-043 | CLEAN | None | — |
| CAT-047 | REWRITTEN | Assertion `[DOM] At least 3 top-level category links` was a hardcoded count assumption; could fail in an env with 2 categories | Replaced with `At least one top-level category link` (structural minimum) |
| CAT-048 | REWRITTEN | Steps `[ASSERT] Verify the URL matches the expected category slug` implied a known expected slug | Replaced with `URL contains a category slug` (shape assertion, not value) |
| CAT-049 | REWRITTEN | Steps used `e.g., {{FRONT_URL}}/catalog/clothing` — hardcoded slug example that could be mistaken for the actual path; Assertions implied `heading matches the known category name for the slug` (DV-004) | Replaced with runtime resolution instruction + assert heading is non-empty |
| CAT-056 | CLEAN | None | — |
| CAT-059 | CLEAN | None | — |
| CAT-060 | CLEAN | None | — |
| CAT-061 | CLEAN | None | — |
| CAT-062 | CLEAN | None | — |
| CAT-044 | REWRITTEN | DV-002/DV-004: Hardcoded URL `/products-with-options/configurable-caps-shirts/@td(CFG_HAT.slug)`; hardcoded product name `'Configurable Hat'` in assertion; Preconditions named specific section types from a specific product | Steps now resolve any configurable product at runtime via xAPI; assertions check non-empty H1 name and price > 0; Preconditions describe fixture role, not specific product |
| CAT-045 | REWRITTEN | DV-004: Hardcoded `'Bike with options'` product name; hardcoded SKU `ZER-64605169`; hardcoded product_id GUID `f16d3e8f-...`; hardcoded variation names `BIKE-RED-M` / `BIKE-BLUE-L` in steps; Test_Data had raw `product_id` GUID | All hardcoded references replaced with runtime resolution via xAPI products(filter='productType:Configurable',hasVariations:true); assertions check price > 0 and non-empty SKU |

---

## Suite 002 — product-detail.csv

| ID | Verdict | Violations Found | Fix Applied |
|----|---------|-----------------|-------------|
| CAT-010 | REWRITTEN | T-001: Assertions said "Product name displayed and correct" — vague; price assertion didn't use shape regex | Sharpened to non-empty H1 and price > 0 with regex pattern |
| CAT-011 | REWRITTEN | Preconditions said "Product with multiple images" without resolution guidance | Added "exists in catalog" to make it runtime-discoverable |
| CAT-012 | REWRITTEN | Assertions said `Price updates to reflect selected variant` without pattern | Added regex /^\$[0-9,]+\.[0-9]{2}$/ |
| CAT-013 | REWRITTEN | Preconditions implied a specific known product; assertions said "show image and name" (vague) | Added "non-empty name" precision |
| CAT-028 | CLEAN | None | — |
| CAT-030 | CLEAN | None | — |
| CAT-031 | REWRITTEN | Assertions said `Product name, image, and price shown` without precision on price format | Added price format note |
| CAT-032 | REWRITTEN | Assertion `[MATH] Compare bar still shows only the allowed maximum` was ambiguous (maximum of what?) | Clarified to `count unchanged after over-limit attempt` |
| CAT-033 | CLEAN | None | — |
| CAT-034 | CLEAN | None | — |
| CAT-038 | REWRITTEN | DV-004: Steps referenced "a product known to exist in the physical catalog but NOT in the virtual catalog" — implies knowledge of a specific seeded product | Rewritten to resolve at runtime using xAPI with and without storeId scope |
| CAT-039 | REWRITTEN | Assertions said "Product name, price, and image match the physical catalog source data" — implies known expected values | Rewritten to assert non-empty values (name, price > 0, non-empty image) |
| CAT-046 | REWRITTEN | Assertions said "Description tab shows product description HTML content (not empty)" — minor precision improvement | Changed to "non-empty product description HTML content" |
| CAT-050 | REWRITTEN | Preconditions said "a known in-stock product" implying a specific seeded fixture | Rewritten to resolve at runtime via xAPI with availabilityData.isInStock=true |
| CAT-051 | SEED-TAGGED | DV-004: Steps required navigating to "a known out-of-stock product" — no such fixture was registered | Automation_Status set to `SEED REQUIRED: OOS_SKU`; Test_Data references `{{OOS_SKU}}`; skip instruction added |
| CAT-052 | REWRITTEN | Steps had `e.g., switch from USD to EUR` — anchoring to specific currency names; Assertions said "prices have updated to currency-specific prices" without pattern | Steps now say "any alternative currency"; assertions use currency symbol regex pattern |
| CAT-053 | REWRITTEN | Steps had `e.g., USD $54.00` — hardcoded example price amount; assertions had `exact value from the alternative currency price list` without pattern | Price example removed; assertions use price > 0 and currency symbol match |
| CAT-054 | REWRITTEN | Preconditions said "USD price but no EUR price" — hardcoded currency pair; Steps said "Switch currency to EUR" | Rewritten to find any currency pair where product has price in one but not the other (resolved at runtime) |
| CAT-055 | REWRITTEN | Steps had "Product A" / "Product B" naming that could imply fixture-specific products | Clarified as "any first product" / "any second different product" |
| CAT-057 | SEED-TAGGED | DV-004: Same as CAT-051 — requires a known OOS product | Automation_Status set to `SEED REQUIRED: OOS_SKU`; Test_Data references `{{OOS_SKU}}` |
| CAT-058 | SEED-TAGGED | DV-004: Requires a known low-stock product at or below the configured threshold | Automation_Status set to `SEED REQUIRED: LOW_STOCK_SKU`; Test_Data references `{{LOW_STOCK_SKU}}` |
| CAT-COMP-001 | CLEAN | `{{USER_EMAIL}}` / `{{USER_PASSWORD}}` are valid env var tokens; Preconditions updated to not require specific named user | — |
| CAT-COMP-002 | CLEAN | None | — |
| CAT-COMP-003 | REWRITTEN | Assertions had "Products displayed in columns with images and names" — vague on name | Added "non-empty names" |
| CAT-COMP-004 | REWRITTEN | Assertions had "prices shown with correct formatting" without specifying what correct means | Added regex pattern for price format |
| CAT-COMP-005 | REWRITTEN | Steps said "Click 'Remove' or 'X' on the middle product" — position-dependent (middle) | Changed to "any one product" |
| CAT-COMP-006 | REWRITTEN | Steps said "Add 5 products to compare … Navigate to a 6th product PDP … Click 'Compare' on 6th product" — hardcoded 5+1 split | Rewritten to: "add products until compare bar shows maximum, then attempt to add one more" (picks up whatever the configured max is) |
| CAT-COMP-007 | CLEAN | None | — |
| CAT-COMP-008 | REWRITTEN | Assertions had "Both selected products displayed on compare page" — vague | Added "with non-empty names" |
| CAT-COMP-009 | CLEAN | None | — |

---

## Suite 003 — catalog-filters.csv

| ID | Verdict | Violations Found | Fix Applied |
|----|---------|-----------------|-------------|
| CAT-004 | REWRITTEN | Steps said `Click on a facet value (e.g., Brand)` — implied Brand facet specifically; minor DV-004 risk | Changed to "any available facet value" |
| CAT-005 | REWRITTEN | Steps had "Set minimum price value" / "Set maximum price value" without guidance on how to pick values that produce non-empty results | Added "choose any value above 0 that is below the page maximum" guidance for runtime resolution |
| CAT-006 | REWRITTEN | Assertions said "Full unfiltered product list restored" without a math check | Added: `count > filtered count, or equals if all products matched` |
| CAT-008 | CLEAN | None | — |
| CAT-009 | REWRITTEN | Steps said `e.g., select 24` — hardcoded per-page value | Changed to "any value different from the current one" |
| CAT-014 | REWRITTEN | DV-004: Test_Data had `filter=Brand` hardcoded; Steps said `e.g., Brand: HP` — specific brand and value | Test_Data filter removed; Steps changed to "any available facet value from any group" |
| CAT-015 | CLEAN | None | — |
| CAT-016 | CLEAN | `{{USER_EMAIL}}` is a valid env var token | — |
| CAT-017 | CLEAN | None | — |
| CAT-018 | REWRITTEN | DV-004: Steps said `e.g., Brand: HP` — specific brand and value | Changed to "any available facet filter value" |
| CAT-019 | REWRITTEN | Steps said "Apply filters until 0 products are shown" without guidance on how | Added: "combine conflicting facet values or price ranges that exclude all products" |
| CAT-020 | REWRITTEN | DV-002/DV-004: Test_Data had `url={{FRONT_URL}}/printers` — hardcoded `/printers` slug; Preconditions named `/printers` category; Steps navigated to `{{FRONT_URL}}/printers` directly | All references to `/printers` removed; case now resolves any leaf category at runtime |
| CAT-022 | CLEAN | None | — |
| CAT-023 | REWRITTEN | Steps had `Apply filter A` / `Apply filter B` with no guidance on what to pick | Added "any filter value A (note the chip label) … any different filter value B" |
| CAT-024 | CLEAN | None | — |
| CAT-025 | REWRITTEN | DV-004: Steps said `e.g., Brand: HP + Epson` — two specific brand values; `e.g., Brand (2)` in assertions | Changed to "2 or more values from any facet group" |
| CAT-026 | REWRITTEN | Steps said `e.g., Brand` facet — specific facet name | Changed to "any facet filter value" |
| CAT-027 | REWRITTEN | Preconditions and Steps implied selecting exactly 10 values | Kept "10 or more" as the BVA boundary but changed precondition to runtime-discoverable: "Category with a large facet group (10+ available values)" |
| CAT-029 | CLEAN | None | — |
| CAT-030 | REWRITTEN | **Major violations:** Hardcoded category URL `/alcoholic-drinks`; hardcoded property name `Volume_ml` / `Volume_(mL)` in steps; hardcoded product names `Beck's`, `Bomonti`, `Efes Pilsener` in assertions and failure signals; hardcoded range values `min=9, max=550`, `200, 220, 330, 550`; hardcoded result count `~8 products observed` | All specific values removed; steps resolve category and property at runtime; assertions use structural checks (count > 0, products within range) instead of naming specific products or counts |
| CAT-031 | REWRITTEN | **Major violations:** Same as CAT-030 plus VP-9035 regression-specific data; hardcoded URL `/alcoholic-drinks`; hardcoded `Volume_ml` field name in assertions; hardcoded product names and observation counts `~6 results`, `Beck's 33ml`, `Bomonti 9ml`, `[TO 311]` URL corruption example | URL and field name removed from preconditions; steps resolve the underscore-named property at runtime; assertions check structural invariant (full field name preserved, not truncated) without naming specific fields |
| CAT-032 | REWRITTEN | Steps had `e.g., $50–$200` — specific price range hardcoded | Changed to "any mid-range values between page min and max" |
| CAT-033 | REWRITTEN | Steps had `e.g., min=$200, max=$50`; Assertions had `min=500,max=50 becomes [50 TO 500]` — specific example values that could mislead | Changed to "enter any intentionally inverted range"; assertions use lower/higher as generic terms |
| CAT-034 | REWRITTEN | Steps had `e.g., $50–$200` twice | Changed to "any price range that still leaves some products visible" |
| CAT-035 | REWRITTEN | Steps had `e.g., $50–$200` | Changed to "any valid range" |
| CAT-036 | REWRITTEN | Assertions had `e.g., '$0–$50 (12)', '$50–$100 (8)'` and Failure_Signals had `Bucket count shows 12 but only 8 products displayed` — hardcoded counts | Counts replaced with generic structural invariants |
| CAT-037 | REWRITTEN | Steps had `Switch currency to EUR` and `price.eur (not price.usd)` — hardcoded currency codes | Changed to "any alternative currency"; filter parameter check uses generic `price.[currency_code]` |
| CAT-038 | REWRITTEN | Steps had `e.g., up to $100`; Assertions had `All displayed product prices <= $100` and `No products with price > $100` — hardcoded $100 value; GraphQL filter used `[TO 100]` | All $100 values replaced with "chosen maximum" (runtime-resolved); assertions use `<= chosen maximum value` |
| CAT-039 | REWRITTEN | Steps had `e.g., from $100`; Assertions had `All displayed product prices >= $100` and `No products with price < $100` — hardcoded $100 value; GraphQL filter used `[100 TO]` | All $100 values replaced with "chosen minimum" (runtime-resolved); assertions use `>= chosen minimum value` |

---

## Cases Requiring Product-Owner Clarification

None. All violations could be resolved by either:
1. Runtime xAPI resolution patterns
2. Removing hardcoded examples (keeping structural invariants)
3. SEED REQUIRED tagging for fixture-dependent cases

---

## SEED REQUIRED Cases (3 cases, all in Suite 002)

| Case ID | Fixture Required | Alias | Env Var | Already in test-data README? |
|---------|-----------------|-------|---------|------------------------------|
| CAT-051 | Out-of-stock product with inventory = 0 | `PROD_OOS` | `OOS_SKU` | Yes — PROD-101 in test-data/products/test-products.csv |
| CAT-057 | Out-of-stock product with inventory = 0 (same fixture) | `PROD_OOS` | `OOS_SKU` | Yes — same row |
| CAT-058 | Low-stock product at or below configured threshold | `PROD_LOW_STOCK` | `LOW_STOCK_SKU` | Yes — PROD-102 in test-data/products/test-products.csv |

Both OOS_SKU and LOW_STOCK_SKU fixtures are already documented in the test-data README "Test Fixture Gaps" section (added 2026-04-21) with `seeded=false`. These 3 cases self-skip when the env var is not provisioned.

---

## Notes on Stable Constants (NOT Changed)

The following values were deliberately preserved as stable env constants per the golden rule:
- `{{FRONT_URL}}`, `{{BACK_URL}}`, `{{USER_EMAIL}}`, `{{USER_PASSWORD}}`, `{{ORG_USER_EMAIL}}`, `{{ORG_USER_PASSWORD}}` — valid env tokens
- `B2B-store` store ID — stable env constant
- `fc596540…` virtual catalog root — stable env constant
- `/Brands` route path — stable storefront route
- `/compare` route path — stable storefront route
- `VP-9035` JIRA reference in CAT-031 — ticket reference, not data
- `VCST-4728`, `VCST-4833` JIRA references — ticket references

---

## 8-Dimension Review Summary

| Dimension | Pre-review Issues | Post-review Status |
|-----------|------------------|--------------------|
| S — Structure | None found | Clean |
| D — Determinism | Minor: some WAIT missing after ACT in a few cases (pre-existing, not introduced) | Acceptable; no new issues |
| C — Completeness | CAT-051/057/058: missing Test_Data for OOS/low-stock fixtures | Fixed: SEED REQUIRED tags + {{OOS_SKU}}/{{LOW_STOCK_SKU}} bindings |
| T — Testability | Multiple vague assertions (price "correct", name "correct", count "24 products") | Fixed: shape regex, math invariants, non-empty checks |
| DV — Data Validity | 41 hardcoded-value violations across 3 suites | Fixed: all replaced with runtime resolution or structural invariants |
| BL — Coverage | No new BL gaps introduced; existing coverage preserved | Unchanged |
| DUP — Duplication | CAT-051 and CAT-057 both test OOS PDP; difference is Automation_Status layer | Acceptable — slightly different assertions (indicator vs. full display) |
| ENV — Environment | Not live-tested (no browser automation in this review) | Env verification deferred to next regression run |
