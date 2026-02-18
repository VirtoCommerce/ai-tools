# Test Data Repository

**Purpose:** Centralized test data for all Virto Commerce B2B e-commerce regression testing.

**Last Updated:** 2026-02-06

---

## Directory Structure

```
test-data/
├── README.md                        # This file
├── users/                           # User accounts and credentials
│   ├── test-users.csv              # Personal user accounts
│   ├── organization-users.csv      # B2B organization users
│   └── admin-users.csv             # Admin/staff accounts
├── organizations/                   # B2B organizations
│   ├── sample-organizations.csv    # Special character testing
│   ├── test-organizations.csv      # Standard test orgs
│   └── search-test-data.csv        # Organization search test cases
├── products/                        # Product test data
│   ├── test-products.csv           # Standard products
│   ├── configurable-products.csv   # Products with variants
│   ├── bundle-products.csv         # Product bundles
│   └── out-of-stock-products.csv   # Inventory edge cases
├── addresses/                       # Shipping/billing addresses
│   ├── us-addresses.csv            # United States addresses
│   ├── international-addresses.csv # Non-US addresses
│   └── edge-case-addresses.csv     # Special characters, long names
├── payment/                         # Payment test data
│   ├── test-cards.csv              # Test credit/debit cards
│   ├── payment-scenarios.csv       # Success/failure scenarios
│   └── payment-processor-config.md # Processor-specific details
├── search-queries/                  # Search test data
│   ├── top-50-amazon.csv           # Common search terms
│   ├── top-100-aliexpress.csv      # Additional search terms
│   ├── special-character-search.csv # Edge cases
│   └── localized-search.csv        # Multi-language searches
├── bopis/                           # Buy Online Pickup In Store
│   ├── pickup-locations.csv        # Store locations
│   └── location-search-queries.csv # Location search terms
├── localization/                    # Multi-language data
│   ├── languages.csv               # Supported languages
│   └── translation-test-strings.csv # Test strings per language
├── inventory/                       # Stock and inventory
│   └── vc-inventory.csv            # Inventory test data
├── uploads/                         # Test file uploads
│   ├── images/                     # Product images, logos
│   ├── documents/                  # PDFs, spreadsheets
│   └── videos/                     # Video uploads
├── analytics/                       # Google Analytics test data
│   └── ga-events.csv               # Expected GA4 events
├── security/                        # Security testing data
│   ├── sql-injection-payloads.csv  # SQL injection tests
│   ├── xss-payloads.csv            # XSS attack vectors
│   └── invalid-inputs.csv          # Boundary/negative tests
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
Test accounts for authentication and authorization testing across user types.

### 2. Organizations (organizations/)
B2B company data for multi-organization, member management, and search testing.

### 3. Products (products/)
Product catalog data including standard, configurable, and bundle products.

### 4. Addresses (addresses/)
Shipping and billing addresses covering all regions, formats, and edge cases.

### 5. Payment (payment/)
Test payment cards for all processors (Skyflow, CyberSource, Authorize.Net, Datatrance).

### 6. Search Queries (search-queries/)
Search terms for product discovery, special characters, and localization.

### 7. BOPIS (bopis/)
Pickup locations and location search queries for Buy Online Pickup In Store.

### 8. Localization (localization/)
Multi-language support data for 13 supported languages.

### 9. Inventory (inventory/)
Stock levels, availability, and inventory management test data.

### 10. Uploads (uploads/)
Test files for file upload functionality (images, documents, videos).

### 11. Analytics (analytics/)
Expected Google Analytics 4 event data for tracking verification.

### 12. Security (security/)
Injection payloads, XSS vectors, and invalid inputs for security testing.

---

## Usage Guidelines

### Environment Variables (.env)
Many test data references use environment variables. See `config.js` for available vars:
- USER_EMAIL, USER_PASSWORD (personal user)
- USER2_EMAIL, USER2_PASSWORD (second personal user)
- USER_VIRTO, USER_VIRTO_PASSWORD (organization user)
- ADMIN, ADMIN_PASSWORD (admin user)
- Payment card details (SKYFLOW_*, CYBERSOURCE_*, AUTHORIZNET_*, DATATRANCE_*)

### CSV Format
All CSV files use consistent headers:
```csv
# Example: test-users.csv
user_id,email,password,first_name,last_name,account_type,organization,notes
```

### Data Refresh
Test data should be refreshed:
- **Daily:** Inventory levels, cart states
- **Weekly:** User sessions, temporary data
- **Monthly:** Product catalog, addresses
- **Quarterly:** Organizations, payment tokens

### Test Data Isolation
Each test should:
1. Use unique test data or create new data
2. Clean up after execution (delete created data)
3. Not depend on data from other tests
4. Handle missing/corrupted data gracefully

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
| 07-google-analytics-tests | analytics/, products/ |
| 08-security-tests | security/, users/ |
| 09-accessibility-tests | (uses all data types) |
| 10-localization-tests | localization/, products/ |
| 11-performance-tests | products/, users/ |
| 12-browser-compatibility-tests | (uses all data types) |
| 13-b2c-features-tests | products/, users/, addresses/ |
| 32-whitelabeling-tests | white-labeling/ |

---

## Data Generation

### Automated Data Generation
For large-scale testing, use data generation scripts:
```bash
# Generate 100 test users
node scripts/generate-users.js --count 100

# Generate product catalog
node scripts/generate-products.js --categories electronics,clothing
```

### Manual Data Creation
For specific edge cases, manually create CSV entries following existing templates.

---

## Data Maintenance

### Weekly Tasks
- [ ] Verify test user accounts active
- [ ] Check product availability
- [ ] Validate payment test cards
- [ ] Clear temporary data

### Monthly Tasks
- [ ] Update product pricing
- [ ] Refresh inventory levels
- [ ] Review and update addresses
- [ ] Audit organization memberships

### Quarterly Tasks
- [ ] Full data audit
- [ ] Add new test scenarios
- [ ] Remove obsolete data
- [ ] Update localization strings

---

## Security Notes

### Sensitive Data
- **NEVER commit real payment cards** - Use only test processor cards
- **NEVER commit real user credentials** - Use environment variables
- **NEVER commit API keys** - Use .env file (gitignored)

### Test Card Safety
All payment cards in `payment/test-cards.csv` are:
- Test mode cards from payment processors
- Non-functional in production
- Safe to commit to repository

---

## Related Documentation

- [Regression Test Suites](../regression/suites/README.md)
- [CLAUDE.md](../CLAUDE.md) - Project overview
- [config.js](../config.js) - Environment configuration
- [Bug Reports](../reports/bugs/) - Test data-related bugs

---

## Contact

For test data questions or updates, contact the QA team or see `.claude/agents/test-management-specialist` for automated assistance.
