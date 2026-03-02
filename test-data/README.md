# Test Data Repository

**Purpose:** Centralized test data for all Virto Commerce B2B e-commerce regression testing.

**Last Updated:** 2026-03-02

---

## Directory Structure

```
test-data/
├── README.md                        # This file
├── users/                           # User accounts and credentials
│   └── test-users.csv              # Personal user accounts
├── organizations/                   # B2B organizations
│   ├── sample-organizations.csv    # Special character testing
│   ├── search-test-data.csv        # Organization search test cases
│   └── search-test-plan.md         # Search test plan
├── products/                        # Product test data
│   ├── test-products.csv           # Standard products
│   └── configurable-products.csv   # Products with variants
├── addresses/                       # Shipping/billing addresses
│   └── us-addresses.csv            # United States addresses
├── payment/                         # Payment test data
│   ├── test-cards.csv              # Test credit/debit cards
│   ├── payment-scenarios.csv       # Success/failure scenarios
│   └── payment-processor-config.md # Processor-specific details
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

## Test Data Categories

### 1. Users (users/)
Test accounts for authentication and authorization testing. Additional credentials stored in `.env` (USER_EMAIL, USER2_EMAIL, USER_VIRTO, ADMIN).

### 2. Organizations (organizations/)
B2B company data for multi-organization, member management, and search testing.

### 3. Products (products/)
Product catalog data including standard and configurable products.

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
| 36-configurable-products | products/configurable-products.csv |

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
