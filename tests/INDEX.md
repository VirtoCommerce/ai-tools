# Tests Index

Active test cases organized by VCST ticket number. Each directory contains test plans, test cases, execution reports, and evidence.

## Tests by Domain

### BOPIS (Buy Online Pickup In Store)
| Ticket | Description | Status |
|--------|-------------|--------|
| [VCST-3865-pickup-filters](VCST-3865-pickup-filters/) | Pickup location filtering | Active |
| [VCST-4447-pickup-filters-search](VCST-4447-pickup-filters-search/) | Pickup search filters | Active |
| [VCST-4499-BOPIS](VCST-4499-BOPIS/) | Buy Online Pickup In Store flow | Active |
| [VCST-4518-pickup-map-width](VCST-4518-pickup-map-width/) | Pickup map responsive design | Active |
| [VCST-4578-bopis-search-clear](VCST-4578-bopis-search-clear/) | BOPIS search clear button | Active |
| [VCST-4579-ios-safari-zoom-fix](VCST-4579-ios-safari-zoom-fix/) | iOS Safari zoom handling for BOPIS | Active |

### Cart & Checkout
| Ticket | Description | Status |
|--------|-------------|--------|
| [VCST-3928-save4later-delay-fix](VCST-3928-save4later-delay-fix/) | Save for later functionality fix | Active |

### Payment
| Ticket | Description | Status |
|--------|-------------|--------|
| [VCST-3387-credit-card-checkout](VCST-3387-credit-card-checkout/) | CyberSource credit card validation | Active |

### Catalog & Search
| Ticket | Description | Status |
|--------|-------------|--------|
| [VCST-4357-org-search](VCST-4357-org-search/) | Organization search functionality | Active |
| [VCST-4514-filter-badge-disappears](VCST-4514-filter-badge-disappears/) | Filter badge UI bug | Active |

### Product Variations
| Ticket | Description | Status |
|--------|-------------|--------|
| [B2C-Variations](B2C-Variations/) | Product variations testing | Active |
| [VCST-4373](VCST-4373/) | Variant picker comprehensive testing | Active |

### Analytics
| Ticket | Description | Status |
|--------|-------------|--------|
| [google-analytics](google-analytics/) | GA4 event tracking tests | Active |

### Admin & Storybook
| Ticket | Description | Status |
|--------|-------------|--------|
| [VCST-4256-improve-page-builder-admin](Sprint26-02/VCST-4256-improve-page-builder-admin/) | Admin page builder tests | Active |
| [VCST-4351](Sprint26-02/VCST-4351/) | Storybook component testing (12 reports) | Active |
| [VCST-4233-storybook-migration-part7](Sprint26-03/VCST-4233-storybook-migration-part7/) | Storybook StoryFn to StoryObj migration (Part 7) - 5 components, 68 stories | ✅ Completed |

### Sprint 26-04 (Current)
| Ticket | Description | Status |
|--------|-------------|--------|
| [VCST-4445-youtube-isolation](Sprint26-04/VCST-4445-youtube-isolation/) | YouTube embed isolation | Active |
| [VCST-4530-variation-shareable-links](Sprint26-04/VCST-4530-variation-shareable-links/) | Product variation shareable links | Active |
| [VCST-4565-bopis-pickup-selected-modal](Sprint26-04/VCST-4565-bopis-pickup-selected-modal/) | BOPIS pickup selection modal | Active |
| [VCST-4618-cart-pickup-duplicate-key](Sprint26-04/VCST-4618-cart-pickup-duplicate-key/) | Cart pickup duplicate key fix | Active |
| [VCST-4650-bopis-pickup-search-indexing](Sprint26-04/VCST-4650-bopis-pickup-search-indexing/) | BOPIS pickup search indexing | Active |
| [VCST-save-for-later-investigation](Sprint26-04/VCST-save-for-later-investigation/) | Save for later investigation | Active |

### Regression & Retests
| Ticket | Description | Status |
|--------|-------------|--------|
| [VCST-4502-retest](VCST-4502-retest/) | Regression retest suite | Active |

## Test Directory Structure

Each test directory should contain:

```
VCST-XXXX-feature/
├── test-plan.md              # Test strategy and scope
├── test-cases.md             # Detailed test specifications (or .csv)
├── test-execution-report.md  # Results with pass/fail status
├── testrail-import.csv       # TestRail import format (optional)
├── README.md                 # Quick overview (optional)
└── screenshots/
    ├── desktop/
    └── mobile/
```

## Related Resources

- [Regression Test Suites](../regression/suites/) - 36 CSV test suites (1,194 test cases)
- [Suite to Test Mapping](../regression/mapping.md) - Links suites to implementations
- [Bug Reports](../reports/bugs/) - Bug reports with evidence
- [Test Data](../test-data/) - Test fixtures and sample data
