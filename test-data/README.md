# Test Data Repository

**Purpose:** Centralized test data for all Virto Commerce B2B e-commerce regression testing.

**Last Updated:** 2026-03-26

---

## Test Data References (`@td()` Syntax)

Regression suite CSVs reference test data using the `@td()` notation instead of hardcoding values. This eliminates duplication and drift risk.

### Syntax

```
# Alias form (recommended — uses aliases.json registry)
@td(CYBERSOURCE_VISA.number)     → 4622943127013705
@td(COUPON_10PCT.code)           → QA10OFF
@td(STORE_PRIMARY.id)            → B2B-store
@td(ADDR_LA.city)                → Los Angeles
@td(ACME_ADMIN.email)            → test-john.mitchell-20260310@test-agent.com

# Direct form (for one-off lookups)
@td(payment/test-cards, processor=CyberSource&card_type=Visa, card_number)
```

### How It Works

1. Suite CSV contains `@td(ALIAS.field)` tokens in the `Test_Data` column
2. **CI mode**: `lib/test-data-resolver.ts` resolves all tokens before injecting CSV into agent prompt
3. **Interactive mode**: Orchestrator agents resolve tokens by reading `aliases.json` + CSV files
4. Agents receive fully resolved values — no @td() parsing needed during test execution

### Alias Registry

All aliases are defined in [`aliases.json`](aliases.json). Each alias maps to:
- `file` — CSV file path (relative to `test-data/`, without `.csv` extension)
- `filter` — key-value pairs to find the right row
- `fields` — shorthand names → CSV column names

### Validation

Run `npx tsx scripts/validate-td-refs.ts` to verify all `@td()` references across all suites resolve correctly.

---

## Directory Structure

```
test-data/
├── README.md                        # This file
├── b2b/                             # B2B test data (orgs, contacts, users) — SEEDED
│   ├── organizations.csv           # 8 orgs (4 seeded with platform IDs)
│   ├── contacts.csv                # 13 contacts (10 seeded with platform IDs)
│   ├── users.csv                   # 13 users (10 seeded with platform IDs)
│   ├── roles.csv                   # 5 B2B role definitions
│   ├── addresses.csv               # 15 addresses (org + contact level)
│   ├── load-test-data.js           # JS loader module for agents/scripts
│   ├── _seed-results-orgs.json     # Live platform IDs (source of truth)
│   └── seed-report-20260310.md     # Human-readable seed report
├── users/                           # Personal user accounts
│   ├── test-users.csv              # 50 personal user templates
│   ├── agent-user-pool.csv         # 3 dedicated users for parallel agents (1 per browser slot)
│   └── seed-agent-users.md         # REST API seeding scripts for agent pool users
├── organizations/                   # B2B organizations (legacy, special chars)
│   ├── sample-organizations.csv    # Special character testing
│   ├── search-test-data.csv        # Organization search test cases
│   └── search-test-plan.md         # Search test plan
├── catalogs/                        # Catalog seed data
│   ├── catalogs.csv
│   ├── categories.csv
│   └── properties.csv
├── products/                        # Product test data
│   ├── test-products.csv           # Standard products
│   ├── products-full.csv           # Full product definitions
│   └── configurable-products.csv   # Products with variants
├── pricing/                         # Pricing seed data
│   ├── price-lists.csv
│   └── prices.csv
├── inventory/                       # Inventory seed data
│   ├── fulfillment-centers.csv
│   └── stock-levels.csv
├── stores/                          # Store configurations
│   ├── stores.csv
│   └── bopis-locations.csv
├── addresses/                       # Shipping/billing addresses
│   └── us-addresses.csv            # United States addresses
├── payment/                         # Payment test data
│   ├── test-cards.csv              # Test credit/debit cards
│   ├── payment-scenarios.csv       # Success/failure scenarios
│   └── payment-processor-config.md # Processor-specific details
├── promotions/                      # Marketing promotions & coupons (VCST-4590)
│   ├── promotions.csv              # 16 promotion definitions (reward types, conditions, exclusivity)
│   ├── coupons.csv                 # 18 coupon codes (usage limits, expiry, edge cases)
│   ├── conditions.csv              # 4 cart/catalog conditions
│   ├── rewards.csv                 # 15 reward configurations (%, $, shipping, gift, category)
│   ├── edge-cases.csv              # 8 edge case scenarios with setup and expected behavior
│   ├── qa-bulk-coupons.csv         # 3-code CSV for Admin bulk import test
│   └── setup-guide.md             # REST API seeding scripts + cleanup
├── search-queries/                  # Search test data
│   ├── top-50-amazon.csv           # Common search terms
│   └── top-100-aliexpress.csv      # Additional search terms
├── bopis/                           # Buy Online Pickup In Store
│   └── pickup-locations.csv        # Store locations
├── localization/                    # Multi-language data
│   └── languages.csv               # Supported languages
├── uploads/                         # Test file uploads (flat directory)
│   ├── *.png, *.jpg, *.webp        # Image files
│   ├── *.pdf, *.xlsx               # Document files
│   ├── *.mp4                       # Video files
│   └── *.svg, *.avif               # Other formats
├── cms/                             # CMS PageBuilder test data
│   └── pagebuilder-pages.md        # 5 test pages with block structures, access matrices, scheduling
└── white-labeling/                  # White labeling test data (VCST-4637)
    ├── organizations.csv           # Org configs (5 orgs, different WL setups)
    ├── link-lists.csv              # Menu/footer link list items (22 links)
    ├── users.csv                   # Test users per org (6 users)
    ├── graphql-queries.md          # GraphQL queries for verification
    └── setup-guide.md              # Step-by-step data setup instructions
```

---

## Agent Testing Workflow

The B2B test data in `b2b/` is **seeded on the live platform** and can be consumed by agents during testing.

### How Agents Use Test Data

```
1. /qa-seed-data b2b          ← Generate test data via REST API (already done: 2026-03-10)
2. Agent reads CSVs or loader  ← Get entity IDs, credentials, test scenarios
3. Agent executes tests         ← Uses real platform IDs for API/UI testing
4. /qa-seed-data teardown      ← Clean up when done
```

### Loader Module (recommended for scripts)

```js
import { b2b } from './test-data/b2b/load-test-data.js';

// Get credentials by role
const admin = b2b.credentials('Org Admin');
// → { userName, email, password, contactName, orgKey, platformRoles }

// RBAC test set (admin + buyer + viewer from same org)
const rbac = b2b.rbacTestSet();
// → { admin, buyer, viewer, password }

// Multi-org isolation test set
const multiOrg = b2b.multiOrgTestSet();
// → { acmeCorp, techFlow, buildRight, acmeWest, password }

// Lookup by org
const techFlowUsers = b2b.usersForOrg('TechFlow');
```

### For LLM Agents (read CSVs directly)

Agents read `test-data/b2b/users.csv` to get:
- `platform_id` — live entity ID on the platform
- `user_name` / `email` — login credentials
- `password` — `TestPass123!` for all seeded users
- `roles` — platform role name
- `status` — `Approved` (seeded) or empty (not yet created)
- `seeded` — `true` if entity exists on platform, `false` if template only
- `test_purpose` — what scenario this user enables

### Seeded vs Template Data

| Column: `seeded` | Meaning |
|-------------------|---------|
| `true` | Entity exists on platform with `platform_id` — ready for testing |
| `false` | Template only — needs `/qa-seed-data` to create on platform |

### Available Test Scenarios (from seeded data)

| Scenario | Users | Orgs |
|----------|-------|------|
| RBAC (admin/buyer/viewer) | John, Sarah, Mike | AcmeCorp |
| Multi-buyer approval | Sarah + Lisa | AcmeCorp |
| Multi-org switching | John vs Emily | AcmeCorp vs TechFlow |
| Parent-child org hierarchy | John → Robert | AcmeCorp → AcmeWest |
| Multi-language/currency | Hans (de-DE, EUR) | AcmeCorp |
| Cross-org order isolation | Sarah vs David | AcmeCorp vs TechFlow |
| Industrial product focus | Carlos + Angela | BuildRight |

### Postman Collection

**"VC B2B Test Data — Orgs, Contacts, Users"** in VirtoPlatform workspace — 22 requests covering full CRUD + teardown. All templates include `status: Approved`.

---

## Test Data Categories

### 1. B2B (b2b/) — SEEDED
B2B organizations, contacts, and users with **live platform IDs**. Primary test data for agent-driven testing. See Agent Testing Workflow above.

### 2. Users (users/)
Personal user accounts for authentication and authorization testing. Additional credentials stored in `.env` (USER_EMAIL, USER2_EMAIL, USER_VIRTO, ADMIN).
- `test-users.csv` — 50 personal user templates (not seeded by default)
- `agent-user-pool.csv` — **3 dedicated users for parallel agent testing** (1 per browser slot). Prevents session/cart/order conflicts when agents run simultaneously. See `seed-agent-users.md` for seeding instructions.
- `seed-agent-users.md` — REST API scripts to create agent pool users on the platform

### 3. Organizations (organizations/)
Legacy B2B company data for special character testing and search. For seeded orgs with platform IDs, use `b2b/` instead.

### 3. Products (products/)
Product catalog data including standard products, variant templates, and configurable products.
- `test-products.csv` — 100 standard products for general testing
- `configurable-products.csv` — 10 QA environment configurable products with section types, slugs, and IDs (used by Suite 36)
- `products-full.csv` — Full product definitions for seeding

### 4. Addresses (addresses/)
US shipping and billing addresses.

### 5. Payment (payment/)
Test payment cards for all processors (Skyflow, CyberSource, Authorize.Net, Datatrance).

### 6. Search Queries (search-queries/)
Search terms for product discovery testing.

### 7. BOPIS (bopis/)
Pickup locations for Buy Online Pickup In Store.

### 8. Localization (localization/)
Supported languages list for multi-language testing.

### 9. Uploads (uploads/)
Test files for file upload functionality (images, documents, videos) — flat directory.

### 10. White Labeling (white-labeling/)
Organization-specific branding test data with GraphQL verification queries.

### 11. CMS / PageBuilder (cms/)
5 test page definitions for PageBuilder (Builder.io integration) with block structures, access control matrices, scheduling configs, and language verification. Covers all 14 designer block types across homepage, B2B gated content, multi-language policy, scheduled promo, and org-restricted support page scenarios. References users from `b2b/users.csv` for access control testing.

### 12. Promotions (promotions/)
Marketing promotions and coupon codes for VCST-4590 testing. Covers 4 reward types (% off, $ off, free shipping, gift item), 3 condition types (category, cart threshold, shipping method), exclusivity modes, usage limits, coupon-level expiry, and 8 edge case scenarios. See `promotions/setup-guide.md` for REST API seeding scripts.

---

## Usage Guidelines

### Environment Variables (.env)
Many test data references use environment variables. See `config.js` for available vars:
- USER_EMAIL, USER_PASSWORD (personal user)
- USER2_EMAIL, USER2_PASSWORD (second personal user)
- USER_VIRTO, USER_VIRTO_PASSWORD (organization user)
- ADMIN, ADMIN_PASSWORD (admin user)
- Payment card details (SKYFLOW_*, DATATRANCE_*)

### CSV Format
All CSV files use consistent headers with descriptive column names.

### Test Data Isolation
Each test should:
1. Use unique test data or create new data
2. Clean up after execution (delete created data)
3. Not depend on data from other tests

---

## Regression Suite Mapping

| Regression Suite | Primary Test Data |
|------------------|-------------------|
| 01-smoke-tests | users/, products/, payment/ |
| 02-authentication-tests | users/, organizations/ |
| 03-catalog-search-tests | products/, search-queries/ |
| 04a/04b/04c-cart-checkout-orders | products/, addresses/, payment/ |
| 05-bopis-pickup-tests | bopis/, products/, addresses/ |
| 06-payment-tests | payment/, products/ |
| 10-localization-tests | localization/, products/ |
| 32-whitelabeling-tests | white-labeling/ |
| 36-configurable-products | products/configurable-products.csv, promotions/coupons.csv, uploads/, b2b/users.csv |
| 059/060-cms-pagebuilder | cms/pagebuilder-pages.md, b2b/users.csv |
| VCST-4590-coupons | promotions/ |

---

## Security Notes

- **NEVER commit real payment cards** — Use only test processor cards
- **NEVER commit real user credentials** — Use environment variables
- **NEVER commit API keys** — Use .env file (gitignored)

All payment cards in `payment/test-cards.csv` are test mode cards from payment processors, non-functional in production.

---

## Test Fixture Gaps Blocking Regression — Seed These

**Status (2026-04-21):** Templates added to CSVs + aliases registered. `seeded=false` / `platform_id=""` — not yet provisioned on QA. Env vars declared in `config.js` as optional (empty default) — agents that need these fixtures will fail-fast with a clear "not provisioned" signal until QA seeding completes.

| Fixture | Template row | Alias | Env var | Provisioned |
|---------|-------------|-------|---------|-------------|
| VALID_COUPON_CODE | `promotions/coupons.csv` COU-026 | `COUPON_VALID` | `VALID_COUPON_CODE` | ☐ |
| OOS_SKU | `products/test-products.csv` PROD-101 + stock STK-063..065 | `PROD_OOS` | `OOS_SKU` | ☐ |
| LOW_STOCK_SKU | `products/test-products.csv` PROD-102 + stock STK-066 | `PROD_LOW_STOCK` | `LOW_STOCK_SKU` | ☐ |
| PACK_SIZE_SKU | `products/test-products.csv` PROD-103 + stock STK-067 | `PROD_PACK_SIZE` | `PACK_SIZE_SKU` | ☐ |
| TIER_PRICED_SKU | `products/test-products.csv` PROD-104 + stock STK-068 + prices PR-TIER-001..003 | `PROD_TIER_PRICED` | `TIER_PRICED_SKU` | ☐ |
| CONFIGURABLE_SKU | reuses `products/configurable-products.csv` CFG-001 | `PROD_CONFIGURABLE` | `CONFIGURABLE_SKU` | ✓ (existing fixture, needs env var binding) |
| MULTI_ORG_USER | `b2b/users.csv` USR-014 | `USER_MULTI_ORG` | `MULTI_ORG_USER_EMAIL` / `MULTI_ORG_USER_PASSWORD` | ☐ |
| EUR_USER | reuses `b2b/users.csv` USR-011 (Hans Mueller) | `USER_EUR` | `EUR_USER_EMAIL` / `EUR_USER_PASSWORD` | ✓ (existing user, needs env var binding) |

**Admin-config-only (no test-data row — requires store/org flips):**
- `MinOrderTotal=50` — Admin > Stores > [Store] > General (DESTRUCTIVE — isolated runs only)
- Net-30 / On Account payment terms — Admin > Customers > Organizations > [Org]
- Order approval workflow w/ buyer limit — Admin > Customers > Organizations > [Org]
- 2+ saved addresses for `USER_EMAIL` — Storefront action
- Saved tokenized card for `USER_EMAIL` — Storefront action

All fixtures should be stable, non-destructive, and reusable across runs. The following table documents the admin paths to provision each one.

| Env Var | Fixture Spec | Suites Affected | Admin Path to Provision |
|---------|-------------|-----------------|------------------------|
| `LOW_STOCK_SKU` | Product with in-stock quantity ≤ 10 (e.g. 5 units). Must be in virtual B2B catalog. Does NOT go OOS — just near-limit. | 028, 029 | Admin > Catalog > Products > [Product] > Inventory > set fulfillment center stock to ≤ 10 |
| `OOS_SKU` | Product with inventory permanently = 0. Never restocked. Distinct from LOW_STOCK_SKU. Used as stable out-of-stock fixture. | 029 | Admin > Catalog > Products > create dedicated OOS product; Admin > Inventory > set stock = 0 for all fulfillment centers |
| `PACK_SIZE_SKU` | Product with minimum order quantity (MOQ) = 6 (pack size). Adding qty < 6 should show pack-size validation. | 028 | Admin > Catalog > Products > [Product] > Properties > set MinQuantity / PackSize = 6 |
| `TIER_PRICED_SKU` | Product with quantity-break tier pricing: e.g. 1–9 units = standard price, 10–19 = 10% off, 20+ = 20% off. | 029 | Admin > Pricing > Price Lists > [Price List] > add tier prices for SKU |
| `MULTI_ORG_USER_EMAIL` + `MULTI_ORG_USER_PASSWORD` | User who is a simultaneous member of TWO separate B2B organizations. Triggers org-selector UI in cart/checkout. | 028 | Admin > Customers > Contacts > [Contact] > add to second Organization |
| `EUR_USER_EMAIL` + `EUR_USER_PASSWORD` | User account with EUR as default currency (not USD). Cart should display prices in EUR. | 030 | Admin > Customers > Members > [User] > set default currency = EUR; OR create new user with EUR preference |
| `VALID_COUPON_CODE` | Active coupon code applicable to all users (guest + registered + B2B). No expiry during regression window. Single-use limit ≥ 100 (or unlimited). | 029, 030, 011 (CHK-018), 013 (CHK-037) | Admin > Marketing > Promotions > create promotion with coupon code; set applicability = all users; set usage limit ≥ 100 |
| `CONFIGURABLE_SKU` | Configurable product with at least one variant selector (e.g. Color or Size). Must appear in B2B virtual catalog. | 030 | Admin > Catalog > Products > create configurable product with variation properties; link to B2B virtual catalog |
| `2+ saved addresses for {{USER_EMAIL}}` | The USER_EMAIL account must have at least 2 saved shipping addresses in different shipping zones for CHK-059; at least 6 for CHK-060 pagination test. | 011 (CHK-059, CHK-060) | Storefront > {{USER_EMAIL}} account > Addresses > add 2–6 distinct US addresses |
| `Saved tokenized credit card for {{USER_EMAIL}}` | USER_EMAIL must have at least one saved/tokenized credit card on file (CyberSource or other processor). | 011 (CHK-056, CHK-057) | Storefront > {{USER_EMAIL}} > Payment methods > save a card during a prior checkout |
| `MinOrderTotal store setting` | Store must have MinOrderTotal configured (e.g. $50) so orders below threshold are blocked. | 011 (CHK-054, CHK-055, CHK-084, CHK-085) | Admin > Stores > [Store] > General > Minimum order total = 50; restore to 0 after tests |
| `Net-30 payment method for {{ORG_USER_EMAIL}} org` | B2B organization for ORG_USER_EMAIL must have Net 30 / On Account payment terms configured. Also requires store-level On Account payment method enabled. | 013 (CHK-032) | Admin > Customers > Organizations > [Org] > Payment terms = Net 30; Admin > Stores > Payment methods > enable On Account |
| `Approval workflow for {{ORG_USER_EMAIL}} org` | B2B org must have order approval workflow enabled with a buyer purchase limit (e.g. ≤ $100 auto-approved, above = Pending Approval). | 013 (CHK-033, CHK-034) | Admin > Customers > Organizations > [Org] > Order approval > enable; set buyer limit threshold |

**Total blocked cases unblocked when all fixtures provisioned:** approximately 35 cases across the 6 suites.

**Priority order for seeding (highest BLOCKED-rate reduction first):**
1. `VALID_COUPON_CODE` — unblocks 4 cases across suites 029, 030, 011, 013
2. `OOS_SKU` — unblocks 3 cases in suite 029 (CART-046, CART-082, plus CART-023/045 rewrites)
3. `MinOrderTotal` store setting — unblocks 4 cases in suite 011 (CHK-054, -055, -084, -085)
4. Approval workflow seed — unblocks 2 critical cases in suite 013 (CHK-033, -034)
5. `2+ saved addresses` for USER_EMAIL — unblocks 2 cases in suite 011 (CHK-059, -060)
6. `MULTI_ORG_USER_EMAIL` — unblocks 2 cases in suite 028 (CART-052, -053)
7. `LOW_STOCK_SKU` — unblocks 2 cases in suite 028 (CART-037), suite 029 (CART-082)
8. `TIER_PRICED_SKU` — unblocks 1 case in suite 029 (CART-078)
9. `PACK_SIZE_SKU` — unblocks 2 cases in suite 028 (CART-054, -055)
10. `EUR_USER_EMAIL` — unblocks 1 case in suite 030 (CART-059)
11. `CONFIGURABLE_SKU` — unblocks 1 case in suite 030 (CART-061)
12. `Saved tokenized credit card` — unblocks 2 cases in suite 011 (CHK-056, -057)
13. `Net-30 payment terms` — unblocks 1 case in suite 013 (CHK-032)

---

## Catalog Suite Seed Requirements (2026-04-21 review)

Review performed by test-management-specialist as part of catalog-suite hardcoded-value audit (REG-2026-04-20-1000).
Full report: `reports/regression/REG-2026-04-20-1000/catalog-suite-review.md`

### New Fixture Dependencies Identified

The following test cases in catalog suites 001–003 now reference env vars for fixture-dependent scenarios. Cases self-skip (Automation_Status = SEED REQUIRED) when the env var is not provisioned.

| Case ID | Suite | Fixture | Env Var | Template Row | Status |
|---------|-------|---------|---------|-------------|--------|
| CAT-051 | 002-product-detail | Out-of-stock product (inventory = 0, stable) | `OOS_SKU` | `products/test-products.csv` PROD-101 | Not provisioned |
| CAT-057 | 002-product-detail | Out-of-stock product (same fixture as CAT-051) | `OOS_SKU` | `products/test-products.csv` PROD-101 | Not provisioned |
| CAT-058 | 002-product-detail | Low-stock product (inventory at or below configured threshold, e.g., 1–5 units) | `LOW_STOCK_SKU` | `products/test-products.csv` PROD-102 | Not provisioned |

### Seeding Instructions

**OOS_SKU (PROD-101):** Create a dedicated product in the B2B virtual catalog with inventory permanently set to 0 across all fulfillment centers. Do not use a regularly-sold product — this must be a stable OOS fixture that is never restocked.
Admin path: `Admin > Catalog > Products > Add product` (type: Physical, category: any B2B-mixed category) then `Admin > Inventory > [product] > set all fulfillment center stock = 0`

**LOW_STOCK_SKU (PROD-102):** Create a product in the B2B virtual catalog with stock between 1 and the store's configured low-stock threshold (typically 5 units). Must remain below threshold — do not use a regularly-sold product.
Admin path: `Admin > Catalog > Products > Add product` then `Admin > Inventory > [product] > set stock = 3` (or whatever value triggers the low-stock badge)

### Unchanged Stable Constants

The catalog suite review confirmed the following are stable env constants and were NOT changed:
- `{{FRONT_URL}}` / `{{USER_EMAIL}}` / `{{USER_PASSWORD}}` / `{{ORG_USER_EMAIL}}` / `{{ORG_USER_PASSWORD}}` — standard env vars
- `B2B-store` store ID and `fc596540…` virtual catalog root — stable QA environment constants
- `/Brands` and `/compare` route paths — stable storefront routes

---

## Related Documentation

- [Regression Test Suites](../regression/suites/README.md)
- [CLAUDE.md](../CLAUDE.md) - Project overview
- [config.js](../config.js) - Environment configuration
