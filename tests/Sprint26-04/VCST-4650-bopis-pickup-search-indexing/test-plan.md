# Test Plan: VCST-4650 - BOPIS Pickup Location Search Address Indexing Fix

## Ticket Analysis

**JIRA Ticket:** [VCST-4650](https://virtocommerce.atlassian.net/browse/VCST-4650)
**Summary:** [BOPIS] [Product page] Pickup location search does not index address fields (city, street, postal code, country)
**Issue Type:** Bug
**Priority:** Medium-High (Severity)
**Status:** Ready for Test
**Sprint:** Sprint 26-04
**Fix Version:** TBD
**Parent Ticket:** VCST-4584 - [BOPIS] [Product details] Re-design the shipping options widget (Done)
**Linked PR:** #2181 (VirtoCommerce/vc-frontend)

**Reporter:** Found during VCST-4584 testing
**Assignee:** Oleg Zhuk (oleg@virtoworks.com)
**QA Lead:** qa-lead-orchestrator

---

## Bug Summary

The `productPickupLocations` GraphQL query keyword search on the product page BOPIS modal only matches against the location `name` field in Elasticsearch. Address fields (`address.city`, `address.line1`, `address.postalCode`, `address.countryCode`, `address.regionId`) are not indexed for search.

### Impact Evidence (from bug report)

| Search Term | Actual Results | Expected Results | Status |
|-------------|---------------|-----------------|--------|
| "New York" | 4 | 30+ | BROKEN - matches name only |
| "Brooklyn" | 5 | 5 | Works (coincidentally in names) |
| "Queens" | 3 | 3 | Works (coincidentally in names) |
| "10059" (postal code) | 0 | 1+ | BROKEN - postal not indexed |
| "Lexington Ave" (street) | 0 | 1+ | BROKEN - street not indexed |
| "USA" (country) | 0 | 80+ | BROKEN - country not indexed |

### Root Cause

`productPickupLocations` GraphQL query / VirtoCommerce.XPickup Elasticsearch indexer does not include address fields in the search index. Only the `name` field is searchable.

### Contrast with Cart Modal

`cartPickupLocations` query provides faceted filtering by Country, State/Province, City. The product page modal lacks these facets, making keyword search the only discovery mechanism - therefore address indexing is critical for this context.

---

## Scope Analysis

### Component Mapping

| Layer | Component | Expert |
|-------|-----------|--------|
| Backend | VirtoCommerce.XPickup / Elasticsearch indexer | qa-backend-expert |
| Backend | `productPickupLocations` GraphQL query | qa-backend-expert |
| Frontend | Product page BOPIS modal search | qa-frontend-expert |
| Frontend | Search result display and count | qa-frontend-expert |

### Affected Areas

- **Backend (Primary Fix Location):** Elasticsearch indexing for pickup locations - address fields must now be indexed
- **Frontend (Verification):** Product page pickup modal search behavior using the fixed backend
- **GraphQL Layer:** `productPickupLocations` query `keyword` parameter matching

---

## Test Objectives

1. Verify that searching by city now returns all pickup locations in that city
2. Verify that searching by postal code returns the correct pickup location(s)
3. Verify that searching by street address returns the correct pickup location(s)
4. Verify that searching by country code returns all pickup locations in that country
5. Verify that searching by location name still works (no regression)
6. Verify result counts match expected values from the bug report data table
7. Verify no regression in `cartPickupLocations` (cart BOPIS modal)
8. Verify no regression in the product page BOPIS modal UI/UX

---

## Team Assignment

### qa-backend-expert
**Scope:** GraphQL API verification of the fix
- Execute `productPickupLocations` GraphQL query directly with keyword parameters for each address field type
- Verify Elasticsearch index includes address fields (city, line1, postalCode, countryCode, regionId)
- Compare result counts against expected values from the bug evidence table
- Verify `cartPickupLocations` query is unaffected (no regression)
- Capture API response evidence (JSON payloads) for each test case

**Environment:** QA Backend - `BACK_URL` from .env
**Browser MCP:** playwright-edge (for Admin SPA if needed)

### qa-frontend-expert
**Scope:** Product page BOPIS modal end-to-end testing
- Navigate to a BOPIS-eligible product page on the storefront
- Open the "Check pickup locations" modal
- Execute all keyword search scenarios (city, postal code, street, country, name)
- Capture result counts and verify against expected values
- Test edge cases (no results, partial match, case sensitivity)
- Verify search UX (search button, result list, empty state message)
- Capture screenshots for each search scenario as evidence
- Test on desktop (1920x1080) and mobile (375x667)

**Environment:** QA Frontend - `FRONT_URL` from .env
**Browser MCP:** playwright-chrome

---

## Test Cases

See `test-cases.md` for full test case specifications.

---

## Test Data Requirements

- BOPIS-eligible product page URL (Bolts category per bug report)
- Known pickup location data:
  - Locations in "New York" city: expected 30+ results
  - Postal code "10059": expected 1+ result
  - Street "Lexington Ave": expected 1+ result
  - Country "USA": expected 80+ results
- QA test user credentials (`USER_EMAIL`, `USER_PASSWORD` from .env)
- Admin access for Elasticsearch index verification (`ADMIN`, `ADMIN_PASSWORD` from .env)

---

## Success Criteria

### Must Pass (Release Blockers)
- City keyword search returns correct count (30+ for "New York")
- Postal code search returns correct results
- Country code search returns correct results
- Location name search still works (no regression)

### Should Pass
- Street address search returns correct results
- Empty/no-match search shows appropriate empty state
- Cart BOPIS modal not regressed

### Nice to Have
- Mobile viewport search works correctly
- Performance within acceptable range (search response < 2s)

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Elasticsearch reindex required after backend fix | Testing blocked until reindex completes | Coordinate with DevOps/backend team |
| Expected counts may differ from bug report (data changes) | Test assertions need flexibility | Verify actual data counts in QA environment first |
| Address data quality in QA environment | Search may return fewer results than production | Document QA-specific expected counts |
| Cart BOPIS regression | Breaking existing functionality | Include cart modal smoke check |

---

## Testing Timeline

| Phase | Duration | Owner |
|-------|----------|-------|
| Backend API verification (GraphQL queries) | 45 min | qa-backend-expert |
| Frontend product page modal testing | 60 min | qa-frontend-expert |
| Results consolidation and reporting | 30 min | qa-lead-orchestrator |
| Total | ~2.25 hours | Team |

---

## Deliverables

1. `test-cases.md` - Full test case specifications
2. `test-execution-report.md` - Pass/fail results with evidence
3. `testrail-import.csv` - TestRail format for coverage tracking
4. `screenshots/desktop/` - Search result screenshots (desktop)
5. `screenshots/mobile/` - Search result screenshots (mobile)
6. JIRA ticket updated with test results and QA status comment

---

## Approval

**QA Lead:** qa-lead-orchestrator
**Date:** 2026-02-26
**Decision:** Proceed to testing - ticket is in "Ready for Test" status, requirements are clear
