# Feature Domain Map — Expected Test Coverage

This file maps every known application feature to its expected test coverage. Used by the gap analysis to identify missing areas.

## Original Source: TestRail Exports

The `test-suites ( export from Test-rail )/` directory contains the **canonical test case inventory** exported from TestRail. These are the authoritative original test cases that the regression suites were derived from. During gap analysis, compare regression suites against these exports to detect:
- Test cases present in TestRail but missing from regression suites
- Test intent or coverage depth lost during migration to agent-native CSV format
- Section/domain mappings that may have shifted

| Export Directory | Content |
|-----------------|---------|
| `Frontend/Frontend26-02.csv.csv` | Latest frontend export (Sprint 26-02) — registration, catalog, cart, checkout, orders, BOPIS, payment, B2B |
| `Frontend/frontend-26-01.csv` | Previous frontend baseline (Sprint 26-01) |
| `Frontend/suites/` | 12 categorized suites: auth, catalog, product details, cart, checkout, BOPIS, orders, lists, B2B, analytics, UI/UX, l10n |
| `Backend (admin site)/` | 20 module exports: Catalog, Store, Pricing, Inventory, Marketing, Notifications, Orders, Customer, Platform, Shipping, Search, Assets, CMS, SEO, WhiteLabeling, Push Messages, Image Tools, CSV Import/Export, Elastic Search |
| `E2E/configurable-products/` | E2E configurable product import |
| `Frontend/ga4-test-data.csv` | GA4 analytics test data |

## Feature → Manifest Domain Mapping

Feature domains in this file map to `domain` field values in `config/test-suites.json`:

| Feature Domain(s) | Manifest Domain | Selection |
|-------------------|----------------|-----------|
| AUTH | auth-security | `domain:auth-security` |
| CATALOG, SEARCH, COMPARE | catalog-search | `domain:catalog-search` |
| CART, CHECKOUT, PAYMENT, ORDERS, BOPIS | purchase-flow | `domain:purchase-flow` |
| QUOTES, B2B-ORG, B2B-MEMBERS, LISTS, DASHBOARD | customer-b2b | `domain:customer-b2b` |
| NOTIFICATIONS, ADMIN-IMPERSONATION | cross-cutting | `domain:cross-cutting` |

Use manifest domain selections for regression scoping: when a feature domain has gaps, run the corresponding `domain:*` selection to validate existing coverage.

## Coverage Thresholds

| Priority | Minimum Cases | Must Include |
|----------|---------------|--------------|
| P0 | 5+ per feature | Happy path + top 3 error paths + 1 integration |
| P1 | 3+ per feature | Happy path + top error path |
| P2 | 1+ per feature | Happy path |

## Domain → Feature → Expected Coverage

### AUTH — Authentication & Registration
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Personal registration | 5+ | Suite 02 | Covered |
| Org registration | 5+ | Suite 02 | Covered |
| Sign in / Sign out | 5+ | Suite 02 | Covered |
| Password reset | 3+ | Suite 02 | Covered |
| SSO (Azure/Google) | 2+ | Suite 02 | Covered |
| Account menu navigation | 3+ | Suite 02 | Covered |
| Session management (concurrent, expiry) | 3+ | Suite 02, 08 | Covered |
| Email verification flows | 3+ | Suite 02 | Covered |

### CATALOG — Catalog & Product Discovery
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Category navigation | 5+ | Suite 03 | Covered |
| Faceted filtering | 5+ | Suite 03 | Covered |
| Product detail page | 5+ | Suite 03 | Covered |
| Sorting & pagination | 3+ | Suite 03 | Covered |
| Product comparison | 3+ | Suite 03 | Covered |
| Brands page | 1+ | Suite 03 | Covered |
| Virtual catalogs (B2B) | 3+ | Suite 03 | Covered |

### SEARCH — Search
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Global search | 5+ | Suite 03 | Covered |
| Autocomplete/suggestions | 5+ | Suite 03 | Covered |
| Search history | 3+ | Suite 03 | Covered |
| No results handling | 3+ | Suite 03 | Covered |
| Scoped/org search | 2+ | Suite 03 | Covered |

### CART — Cart Operations
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Add to cart (all product types) | 5+ | Suite 04 | Covered |
| Quantity management | 5+ | Suite 04 | Covered |
| Remove / Clear cart | 3+ | Suite 04 | Covered |
| Save for later | 3+ | Suite 04 | Partial |
| Coupon codes | 3+ | Suite 04 | Covered |
| Cart persistence (sign out/in) | 3+ | None | **GAP** |
| Mixed cart (pickup + delivery) | 3+ | Suite 05 | Partial |
| Price change during session | 3+ | None | **GAP** |
| Cart validation errors block checkout | 3+ | None | **GAP** |

### CHECKOUT — Checkout Flows
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Standard delivery checkout | 5+ | Suite 04 | Covered |
| Guest checkout | 5+ | None | **GAP** |
| B2B checkout (PO number, approval) | 5+ | None | **GAP** |
| New address at checkout | 3+ | Suite 04 | Partial |
| Saved address selection | 3+ | Suite 04 | Partial |
| Billing ≠ shipping | 3+ | None | **GAP** |
| Subscription/recurring orders | 3+ | None | **GAP** |
| Checkout field validation | 3+ | None | **GAP** |

### PAYMENT — Payment Processing
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| CyberSource | 5+ | Suite 06 | Covered |
| Skyflow | 3+ | Suite 06 | Partial (1 basic test) |
| Authorize.Net | 3+ | Suite 06 | Partial (1 basic test) |
| Datatrance | 3+ | Suite 06 | Partial (1 basic test) |
| Declined card recovery | 3+ | None | **GAP** |
| PCI compliance | 5+ | Suite 06, 08 | Covered |

### ORDERS — Order Management
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Order history (list) | 3+ | Suite 04 | Covered |
| Order detail page | 3+ | Suite 04 | Covered |
| Reorder flow | 3+ | None | **GAP** |
| Order status tracking | 3+ | None | **GAP** |
| Invoice/PDF download | 3+ | None | **GAP** |
| Return/RMA request | 3+ | None | **GAP** |

### BOPIS — Pickup In Store
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Location selector | 5+ | Suite 05 | Covered |
| Map interactions | 5+ | Suite 05 | Covered |
| Search/filter locations | 5+ | Suite 05 | Covered |
| Integration with checkout | 3+ | Suite 05 | Covered |

### QUOTES — B2B Quotes & RFQ
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Create RFQ from cart | 5+ | None | **GAP** |
| Quote negotiation | 5+ | None | **GAP** |
| Accept/reject quote | 3+ | None | **GAP** |
| Quote → order conversion | 3+ | None | **GAP** |
| Quote history & status | 3+ | None | **GAP** |
| Quote expiry | 2+ | None | **GAP** |

### B2B-ORG — Multi-Organization
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Org switcher | 5+ | None | **GAP** |
| Cart isolation between orgs | 3+ | None | **GAP** |
| Org-specific pricing | 3+ | None | **GAP** |
| Ship-to per company | 3+ | None | **GAP** |
| Default org on sign-in | 2+ | None | **GAP** |

### B2B-MEMBERS — Company Members & Roles
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Invite member | 3+ | None | **GAP** |
| Edit member role | 3+ | None | **GAP** |
| Block/unblock member | 3+ | None | **GAP** |
| Delegated purchasing (approval) | 5+ | None | **GAP** |

### LISTS — Lists & Quick Order
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Wishlist CRUD | 5+ | Suite 13 | Covered |
| Shared lists | 3+ | None | **GAP** |
| Bulk order page | 5+ | None | **GAP** |
| Quick order by SKU | 3+ | None | **GAP** |
| Add list to cart | 3+ | Suite 13 | Partial |

### DASHBOARD — Account Dashboard
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Dashboard page content | 3+ | None | **GAP** |
| Recent orders widget | 2+ | None | **GAP** |
| Monthly spend display | 2+ | None | **GAP** |

### NOTIFICATIONS — User Notifications
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Notification dropdown (nav) | 3+ | None | **GAP** |
| Back-in-stock alerts | 3+ | None | **GAP** |
| Points/loyalty history | 2+ | None | **GAP** |

### COMPARE — Product Comparison
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Add products to compare | 3+ | None | **GAP** |
| Compare page display | 3+ | None | **GAP** |
| Remove from compare | 2+ | None | **GAP** |

### ADMIN-IMPERSONATION — Login on Behalf
| Feature | Expected Tests | Current Suites | Status |
|---------|---------------|----------------|--------|
| Impersonate user | 3+ | Suite 02 (2 tests) | **Shallow** |
| Switch companies while impersonating | 3+ | None | **GAP** |
| Stop impersonation | 2+ | None | **GAP** |
