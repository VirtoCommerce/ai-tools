# Test Data Repository

**Purpose:** Centralized test data for all Virto Commerce B2B e-commerce regression testing.

**Last Updated:** 2026-03-02

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

### 11. Promotions (promotions/)
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
| 04-cart-checkout-tests | products/, addresses/, payment/ |
| 05-bopis-pickup-tests | bopis/, products/, addresses/ |
| 06-payment-tests | payment/, products/ |
| 10-localization-tests | localization/, products/ |
| 32-whitelabeling-tests | white-labeling/ |
| 36-configurable-products | products/configurable-products.csv, promotions/coupons.csv, uploads/, b2b/users.csv |
| VCST-4590-coupons | promotions/ |

---

## Security Notes

- **NEVER commit real payment cards** — Use only test processor cards
- **NEVER commit real user credentials** — Use environment variables
- **NEVER commit API keys** — Use .env file (gitignored)

All payment cards in `payment/test-cards.csv` are test mode cards from payment processors, non-functional in production.

---

## Related Documentation

- [Regression Test Suites](../regression/suites/README.md)
- [CLAUDE.md](../CLAUDE.md) - Project overview
- [config.js](../config.js) - Environment configuration
