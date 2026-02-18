# VCST-4637: White Labeling - Final Verification Report

**Date:** 2026-02-17
**Tester:** qa-backend-expert (Claude Opus 4.6 via Playwright Edge MCP)
**Ticket:** VCST-4637
**Environment:** QA
**Platform Version:** 3.1004.0
**Storefront Version:** 2.42.0-pr-2110-2190-2190c09e
**Admin URL:** https://vcst-qa.govirto.com
**Storefront URL:** https://vcst-qa-storefront.govirto.com
**Store ID:** B2B-store

---

## Executive Summary

This report documents the end-to-end verification of the White Labeling feature for VCST-4637. The testing covered three phases:

1. **Phase 1 (Admin SPA):** Verified and confirmed White Labeling configurations for [E2E Test] Contoso Ltd. and ACME Store 2 via the Admin SPA UI.
2. **Phase 2 (Storefront):** Verified storefront behavior across 4 organizations by switching between them and documenting main menu and footer content.
3. **Phase 3 (Report):** This consolidated report with findings, evidence, and recommendations.

### Overall Result: FAIL - White Labeling Not Rendering Per-Organization on Storefront

The Admin SPA correctly stores per-organization White Labeling configurations (verified via UI and REST API). However, the storefront does NOT render organization-specific menus and footers for Contoso or ACME Store 2. Only the WL Test Org displays a custom (electronics-themed) menu. This confirms the previously reported GraphQL xAPI bug where the `organizationId` parameter is ignored by the `whiteLabelingSettings` query.

---

## Phase 1: Admin SPA Configuration Verification

### 1.1 [E2E Test] Contoso Ltd.

| Setting | Expected Value | Actual Value | Status |
|---------|---------------|--------------|--------|
| Enabled | ON | ON | PASS |
| Main menu link list | main-menu-electronics | main-menu-electronics | PASS |
| Footer link list | footer-electronics | footer-electronics | PASS |

**Verification:** Opened organization detail blade via Contacts > right-click > Manage. Opened White Labeling blade. Values were already correctly configured. Closed and re-opened blade to confirm persistence.

**Screenshots:**
- `screenshots/final/05-contoso-wl-before.png` - WL blade showing correct configuration
- `screenshots/final/06-contoso-wl-verified.png` - Re-opened blade confirming persistence

### 1.2 ACME Store 2

| Setting | Expected Value | Actual Value | Status |
|---------|---------------|--------------|--------|
| Enabled | ON | ON | PASS |
| Main menu link list | main-menu-fashion | main-menu-fashion | PASS |
| Footer link list | footer-fashion | footer-fashion | PASS |

**Verification:** Opened organization detail blade via Contacts > right-click > Manage. Opened White Labeling blade. Values were already correctly configured. Closed and re-opened blade to confirm persistence.

**Screenshots:**
- `screenshots/final/08-acme2-wl-current-state.png` - WL blade showing correct configuration
- `screenshots/final/09-acme2-wl-verified.png` - Re-opened blade confirming persistence

### Phase 1 Conclusion

Both organizations have correct White Labeling configurations persisted in the Admin SPA. The REST API (`GET /api/white-labeling/organization/{orgId}`) also confirms correct data storage (documented in `retest-backend-report.md`).

---

## Phase 2: Storefront Verification

**Test User:** Elena Mutykova (mutykovaelena@gmail.com)
**Method:** Logged in to storefront, switched between organizations using the Account menu > Organizations dropdown, captured main menu items and footer sections for each.

### 2.1 WL Test Org (Baseline - Electronics Theme)

**WL Admin Config:** Enabled=ON, Main menu=`main-menu-electronics`, Footer=`footer-electronics`

**Main Menu (7 items):**
| # | Menu Item |
|---|-----------|
| 1 | Support |
| 2 | About Us |
| 3 | Tablets |
| 4 | Phones |
| 5 | Laptops |
| 6 | Products |
| 7 | Home |

**Footer (4 items):**
| # | Footer Item |
|---|------------|
| 1 | Warranty |
| 2 | Support |
| 3 | Terms of Service |
| 4 | Privacy Policy |

**Result: PASS** - WL Test Org displays a DIFFERENT menu and footer from the store default. The electronics-themed menu (7 items) and minimal footer (4 items) match the expected `main-menu-electronics` / `footer-electronics` link lists (which have 7 and 4 items respectively, confirmed in Admin > Content > Link lists).

**Screenshots:**
- `screenshots/final/12-storefront-wltest-header.png`
- `screenshots/final/13-storefront-wltest-footer.png`

---

### 2.2 [E2E Test] Contoso Ltd. (Electronics Theme Expected)

**WL Admin Config:** Enabled=ON, Main menu=`main-menu-electronics`, Footer=`footer-electronics`
**Expected:** Same electronics-themed menu as WL Test Org (7 items + 4 footer items)

**Main Menu (15 items - DEFAULT store menu):**
| # | Menu Item |
|---|-----------|
| 1 | Alcoholic Drinks |
| 2 | Accessories |
| 3 | Jewelry and gems |
| 4 | Car covers |
| 5 | Home appliance |
| 6 | Juice |
| 7 | Kitchen supplies |
| 8 | Products with options |
| 9 | Soft drinks |
| 10 | Snacks |
| 11 | Printers |
| 12 | Rental home |
| 13 | TV new |
| 14 | All BRANDS |
| 15 | SEE ALL PRODUCTS |

**Footer (7 sections - DEFAULT store footer):**
| # | Section | Items |
|---|---------|-------|
| 1 | Account details | Orders, Notifications, Quote requests |
| 2 | About us | About Virto, Our partners, Manufacturer partners, News, Careers, News |
| 3 | Popular categories | Allbiz, Computer Office Education, Consumer Electronics, Home Appliances, Phones and Accessories |
| 4 | Online resources | Sign Up, Catalog, Demo Landing, Builder I.O |
| 5 | External links | Vcst-admin, Virto-start |
| 6 | Customer support | Catalog, Contact Us, Find a Branch |
| 7 | Brands | All popular brands |

**Result: FAIL** - Contoso displays the DEFAULT store menu (15 items) and DEFAULT store footer (7 sections), NOT the electronics-themed white-labeled menu. The WL configuration (`main-menu-electronics` / `footer-electronics`) is NOT being applied on the storefront despite being correctly stored in the Admin backend.

**Screenshots:**
- `screenshots/final/10-storefront-contoso-header.png`
- `screenshots/final/11-storefront-contoso-footer.png`

---

### 2.3 ACME Store 2 (Fashion Theme Expected)

**WL Admin Config:** Enabled=ON, Main menu=`main-menu-fashion`, Footer=`footer-fashion`
**Expected:** Fashion-themed menu and footer (7 menu items + 4 footer items from fashion link lists)

**Main Menu (15 items - DEFAULT store menu):**
| # | Menu Item |
|---|-----------|
| 1 | Alcoholic Drinks |
| 2 | Accessories |
| 3 | Jewelry and gems |
| 4 | Car covers |
| 5 | Home appliance |
| 6 | Juice |
| 7 | Kitchen supplies |
| 8 | Products with options |
| 9 | Soft drinks |
| 10 | Snacks |
| 11 | Printers |
| 12 | Rental home |
| 13 | TV new |
| 14 | All BRANDS |
| 15 | SEE ALL PRODUCTS |

**Footer (7 sections - DEFAULT store footer):**
| # | Section | Items |
|---|---------|-------|
| 1 | Account details | Orders, Notifications, Quote requests |
| 2 | About us | About Virto, Our partners, Manufacturer partners, News, Careers, News |
| 3 | Popular categories | Allbiz, Computer Office Education, Consumer Electronics, Home Appliances, Phones and Accessories |
| 4 | Online resources | Sign Up, Catalog, Demo Landing, Builder I.O |
| 5 | External links | Vcst-admin, Virto-start |
| 6 | Customer support | Catalog, Contact Us, Find a Branch |
| 7 | Brands | All popular brands |

**Result: FAIL** - ACME Store 2 displays the DEFAULT store menu and footer, NOT the fashion-themed white-labeled menu. The WL configuration (`main-menu-fashion` / `footer-fashion`) is NOT being applied on the storefront despite being correctly stored in the Admin backend.

**Screenshots:**
- `screenshots/final/14-storefront-acme2-header.png`
- `screenshots/final/15-storefront-acme2-footer.png`

---

### 2.4 ACME Store 3 (Default/Fallback Expected)

**WL Admin Config:** Enabled=ON, Main menu=(empty), Footer=(empty), Theme=Mercury, Logo=VOLVO
**Expected:** Default store menu and footer (no custom link lists configured)

**Main Menu (15 items - DEFAULT store menu):**
| # | Menu Item |
|---|-----------|
| 1 | Alcoholic Drinks |
| 2 | Accessories |
| 3 | Jewelry and gems |
| 4 | Car covers |
| 5 | Home appliance |
| 6 | Juice |
| 7 | Kitchen supplies |
| 8 | Products with options |
| 9 | Soft drinks |
| 10 | Snacks |
| 11 | Printers |
| 12 | Rental home |
| 13 | TV new |
| 14 | All BRANDS |
| 15 | SEE ALL PRODUCTS |

**Footer (7 sections - DEFAULT store footer):**
| # | Section | Items |
|---|---------|-------|
| 1 | Account details | Orders, Notifications, Quote requests |
| 2 | About us | About Virto, Our partners, Manufacturer partners, News, Careers, News |
| 3 | Popular categories | Allbiz, Computer Office Education, Consumer Electronics, Home Appliances, Phones and Accessories |
| 4 | Online resources | Sign Up, Catalog, Demo Landing, Builder I.O |
| 5 | External links | Vcst-admin, Virto-start |
| 6 | Customer support | Catalog, Contact Us, Find a Branch |
| 7 | Brands | All popular brands |

**Result: PASS (expected behavior)** - ACME Store 3 has no custom menu/footer link lists configured (empty values), so it correctly falls back to the default store menu and footer.

**Note:** ACME Store 3 has a Mercury theme preset and VOLVO logo configured, but the theme preset and logo customization were not visually distinguishable in this test (the store logo area showed the default B2B-store logo). This may indicate the theme preset / logo aspects of WL also have issues, or the Mercury preset is visually identical to the default.

**Screenshots:**
- `screenshots/final/16-storefront-acme3-header.png`
- `screenshots/final/17-storefront-acme3-footer.png`

---

## Phase 2 Summary: Storefront Comparison Matrix

| Organization | WL Enabled | Menu Config | Footer Config | Expected Menu | Actual Menu | Expected Footer | Actual Footer | Result |
|-------------|-----------|-------------|---------------|---------------|-------------|-----------------|---------------|--------|
| WL Test Org | ON | main-menu-electronics | footer-electronics | Electronics (7 items) | Electronics (7 items) | Electronics (4 items) | Electronics (4 items) | **PASS** |
| Contoso | ON | main-menu-electronics | footer-electronics | Electronics (7 items) | DEFAULT (15 items) | Electronics (4 items) | DEFAULT (7 sections) | **FAIL** |
| ACME Store 2 | ON | main-menu-fashion | footer-fashion | Fashion (7 items) | DEFAULT (15 items) | Fashion (4 items) | DEFAULT (7 sections) | **FAIL** |
| ACME Store 3 | ON | (empty) | (empty) | DEFAULT (15 items) | DEFAULT (15 items) | DEFAULT (7 sections) | DEFAULT (7 sections) | **PASS** |

**Pass Rate:** 2/4 (50%)

---

## Root Cause Analysis

### Why WL Test Org Works But Contoso and ACME Store 2 Do Not

The critical question is: WL Test Org and Contoso have the **exact same WL configuration** (`main-menu-electronics` / `footer-electronics`), yet WL Test Org shows the custom menu while Contoso does not.

**Confirmed Root Cause: GraphQL xAPI Bug (documented in `retest-backend-report.md`)**

The `whiteLabelingSettings` GraphQL query **ignores the `organizationId` parameter**. All queries return the same store-level default data regardless of which organization is specified:

```graphql
query {
  whiteLabelingSettings(storeId: "B2B-store", organizationId: "37644943-0a80-4070-b948-14491e47fe20") {
    organizationId
    mainMenuLinks { title url }
    footerLinks { title url }
  }
}
# Returns: organizationId: null, mainMenuLinks: null, footerLinks: []
# Same result for ANY organizationId value
```

**However**, the WL Test Org somehow receives the correct electronics menu. This may indicate:
1. The storefront has an alternative code path for the currently active organization that bypasses the broken GraphQL query.
2. The WL Test Org's data may be cached or resolved differently at the session/user level.
3. There may be a `userId`-based resolution that happens to pick up WL Test Org's config for this particular user session.

**This discrepancy warrants further investigation by the development team.**

### Data Layer Verification

| Layer | Contoso Data Correct? | ACME Store 2 Data Correct? | Notes |
|-------|----------------------|---------------------------|-------|
| Admin SPA UI | YES | YES | Both show correct link list names |
| REST API | YES | YES | `/api/white-labeling/organization/{id}` returns correct data |
| GraphQL xAPI | NO | NO | `organizationId` parameter ignored, always returns store defaults |
| Storefront Rendering | NO | NO | Shows default menus, not org-specific |

---

## Bugs Found

### BUG-1: GraphQL `whiteLabelingSettings` Ignores `organizationId` Parameter (Previously Reported)

- **Severity:** High (P1)
- **Impact:** Storefront cannot display per-organization menus/footers for any organization
- **Reproduction:** Send GraphQL query with any valid `organizationId` -- response always returns `organizationId: null` and store-level defaults
- **Affected Orgs:** All organizations except possibly the one resolved via an alternative code path
- **Details:** See `retest-backend-report.md` Section 5

### BUG-2 (Observation): Inconsistent WL Behavior Between Organizations

- **Severity:** Medium (P2)
- **Impact:** WL Test Org receives custom menus while identically-configured Contoso does not
- **Details:** Both orgs have `main-menu-electronics` / `footer-electronics`, but only WL Test Org renders the custom menu on the storefront. This inconsistency suggests the WL resolution logic has an unreliable or partially-working code path.

---

## Screenshot Evidence Index

### Phase 1: Admin SPA Configuration

| # | Filename | Description |
|---|----------|-------------|
| 01 | `01-admin-contacts-list.png` | Admin Contacts list showing organizations |
| 02 | `02-contoso-members-blade.png` | Contoso organization members blade |
| 03 | `03-contoso-detail-navigate.png` | Navigating to Contoso detail |
| 04 | `04-contoso-context-menu.png` | Contoso context menu (right-click > Manage) |
| 05 | `05-contoso-wl-before.png` | Contoso WL blade: Enabled=ON, main-menu-electronics, footer-electronics |
| 06 | `06-contoso-wl-verified.png` | Contoso WL blade re-opened: persistence confirmed |
| 07 | `07-acme2-detail-blade.png` | ACME Store 2 detail blade |
| 08 | `08-acme2-wl-current-state.png` | ACME Store 2 WL blade: Enabled=ON, main-menu-fashion, footer-fashion |
| 09 | `09-acme2-wl-verified.png` | ACME Store 2 WL blade re-opened: persistence confirmed |

### Phase 2: Storefront Verification

| # | Filename | Organization | Content |
|---|----------|-------------|---------|
| 10 | `10-storefront-contoso-header.png` | Contoso | Header + main menu (default, 15 items) |
| 11 | `11-storefront-contoso-footer.png` | Contoso | Footer (default, 7 sections) |
| 12 | `12-storefront-wltest-header.png` | WL Test Org | Header + main menu (electronics, 7 items) |
| 13 | `13-storefront-wltest-footer.png` | WL Test Org | Footer (electronics, 4 items) |
| 14 | `14-storefront-acme2-header.png` | ACME Store 2 | Header + main menu (default, 15 items) |
| 15 | `15-storefront-acme2-footer.png` | ACME Store 2 | Footer (default, 7 sections) |
| 16 | `16-storefront-acme3-header.png` | ACME Store 3 | Header + main menu (default, 15 items) |
| 17 | `17-storefront-acme3-footer.png` | ACME Store 3 | Footer (default, 7 sections) |

All screenshots stored in: `tests/VCST-4637-white-labeling/screenshots/final/`

---

## Related Reports

| Report | Path | Description |
|--------|------|-------------|
| Backend Retest Report | `tests/VCST-4637-white-labeling/retest-backend-report.md` | Test data re-creation, REST API verification, GraphQL bug discovery |
| Org Assignment Report | `tests/VCST-4637-white-labeling/retest-assign-org-report.md` | Assigning user to WL Test Org, initial storefront comparison |
| Code Review Report | `tests/VCST-4637-white-labeling/code-review-report.md` | White Labeling module code analysis |
| Test Cases | `tests/VCST-4637-white-labeling/test-cases.md` | Comprehensive test case definitions |
| GraphQL Test Cases | `tests/VCST-4637-white-labeling/graphql-whitelabeling-pagecontext/test-cases.md` | GraphQL-specific WL test cases |

---

## BACKEND SIGN-OFF

| Criteria | Status | Notes |
|----------|--------|-------|
| Admin WL config saves correctly | PASS | Both Contoso and ACME Store 2 persist WL settings correctly |
| REST API returns correct org WL data | PASS | `/api/white-labeling/organization/{id}` returns correct data |
| GraphQL returns correct org WL data | **FAIL** | `organizationId` parameter ignored, always returns store defaults |
| Storefront renders org-specific menus | **FAIL** | Only WL Test Org shows custom menu; Contoso and ACME Store 2 show defaults |
| Storefront renders org-specific footers | **FAIL** | Only WL Test Org shows custom footer; others show defaults |
| WL disabled org shows defaults | PASS | ACME Store 3 (empty menu/footer config) correctly shows defaults |
| Data persistence across blade close/reopen | PASS | All WL settings persist after closing and reopening blades |

**Overall Backend Status:** FAIL

| Role | Agent | Decision | Date |
|------|-------|----------|------|
| **Backend Expert** | qa-backend-expert | BLOCKED | 2026-02-17 |
| **QA Lead** | qa-lead-orchestrator | PENDING | - |

### Decision: BLOCKED

**Blocking Issues:**
1. GraphQL `whiteLabelingSettings` query ignores `organizationId` parameter (P1 bug)
2. Storefront cannot display per-organization menus/footers for 2 out of 3 configured organizations

**Recommendation:**
- The White Labeling module's GraphQL resolver must be fixed to correctly pass the `organizationId` to the data layer and return organization-specific settings.
- After the fix, retest all 4 organizations on the storefront to confirm per-org menus and footers render correctly.
- Investigate why WL Test Org receives custom menus while identically-configured Contoso does not -- this inconsistency may reveal a secondary bug in the resolution logic.
