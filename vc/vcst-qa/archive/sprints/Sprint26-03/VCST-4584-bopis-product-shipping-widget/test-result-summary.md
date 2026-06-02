# VCST-4584 — Test Result Summary

**Ticket:** [VCST-4584](https://virtocommerce.atlassian.net/browse/VCST-4584)
**PR:** [#2181](https://github.com/VirtoCommerce/vc-frontend/pull/2181) (27 files changed)
**Feature:** BOPIS Product Details Shipping Widget Redesign
**Date:** 2026-02-19
**Environment:** QA (`https://vcst-qa-storefront.govirto.com`), v2.42.0-pr-2181-2d87
**Browsers:** Chrome, Edge

---

## Overall: 57 PASS / 8 FAIL across 65 test areas

---

## Testing Rounds

| # | Agent | Scope | Pass | Fail | Bugs |
|---|-------|-------|------|------|------|
| 1 | qa-frontend-expert | Product page widget, BOPIS regression (36 test cases) | 36 | 0 | 0 |
| 2 | ui-ux-expert | UI Kit components: VcRadioButton, VcPopover, VcTooltip (6 test cases) | 6 | 0 | 0 |
| 3 | qa-backend-expert | GraphQL API deep testing (10 test areas) | 6 | 4 | 5 |
| 4 | qa-frontend-expert | Deep keyword search testing (13 test areas) | 10 | 3 | 5 |
| **Total** | | **65 test areas** | **58** | **7** | **10** |

---

## Bugs Filed in JIRA

| JIRA | Severity | Title | Status |
|------|----------|-------|--------|
| [VCST-4650](https://virtocommerce.atlassian.net/browse/VCST-4650) | Medium-High | Pickup location search does not index address fields | Open |
| [VCST-4651](https://virtocommerce.atlassian.net/browse/VCST-4651) | Medium | Search does not handle whitespace correctly (leading spaces, spaces-only, double spaces) | Open |
| [VCST-4652](https://virtocommerce.atlassian.net/browse/VCST-4652) | High | GraphQL `productPickupLocations` leaks .NET stack traces in error responses | Open |
| [VCST-4653](https://virtocommerce.atlassian.net/browse/VCST-4653) | Medium | GeoLocation reversed coordinate order | **Cancelled — Not a Bug** (test data quality issue) |

### Bugs NOT filed (lower priority, not requested)

| ID | Severity | Title | Notes |
|----|----------|-------|-------|
| API-BUG-3 | Low | Negative `first` parameter accepted without validation | Returns 1 item silently |
| API-BUG-4 | Medium | `sort: "name"` parameter non-functional | May be by design (sorts by availability) |
| API-BUG-5 | Low | Google Maps deprecated `<gmp-pin>` API warnings (46+) | Tech debt, no current impact |
| SEARCH-BUG-3 | Medium | Only 50 of 102 locations displayed, no pagination | `first: 50` hardcoded in frontend |

---

## What Passed

- **Product page widget** — CTA button, modal open/close, location list, Google Map, search, responsive layout (375px–1920px), availability badges, working hours, contact info
- **UI Kit components** — VcRadioButton `noIndicator` prop, VcPopover `max-w-full` overflow fix, VcTooltip on availability chips (VCST-4613)
- **Cart vs Product modal** — Correct behavioral differences (radio buttons in cart, no radio in product; facets in cart only)
- **GraphQL API** — Schema structure, pagination mechanics, performance (~150ms avg), authentication context, data population rates
- **Search** — Partial name matching, case insensitivity, special character handling, XSS safety, long string handling, empty state UX

## What Failed

1. **Security:** Stack traces leaked in GraphQL error responses (VCST-4652)
2. **Search gaps:** Address fields (city, street, country) not indexed (VCST-4650)
3. **Whitespace:** Leading spaces cause zero results in product modal but not cart modal (VCST-4651)
4. **Display limit:** Only 50 of 102 locations shown, no "load more" or pagination

---

## GeoLocation Investigation (VCST-4653)

**Verdict: Not a Bug.** Coordinate format is standard `lat,lng`. The 4 outlier locations are Postman-generated fake test data with invalid values. Frontend validates ranges and gracefully skips invalid entries. Admin panel Location field has no input validation (accepts anything). Ticket closed as Cancelled.

---

## Recommendation

**PR #2181 is functionally complete and ready for merge** with the following caveats:

- **VCST-4652 (stack trace disclosure)** — should be fixed before production, security risk
- **VCST-4650 (address search)** and **VCST-4651 (whitespace)** — can ship, improve in follow-up
- **50-location limit** — consider adding pagination or increasing `first` parameter

---

## Artifacts

| File | Description |
|------|-------------|
| `test-plan.md` | Test plan v2.0 (42 test cases, 8 sections) |
| `test-cases.md` | 42 detailed test case specifications |
| `testrail-import.csv` | TestRail import (42 rows) |
| `test-execution-report.md` | UI Kit component test results (6/6 pass) |
| `graphql-api-test-report.md` | GraphQL API deep test report (10 areas, 5 bugs) |
| `deep-keyword-search-test-report.md` | Keyword search test report (13 areas, 5 bugs) |
| `geolocation-investigation-report.md` | Coordinate format audit (102 locations) |
| `admin-pickup-location-geolocation-findings.md` | Admin panel geolocation inspection |
| `screenshots/desktop/` | 39 frontend screenshots |
| `screenshots/admin/` | 13 admin panel screenshots |
