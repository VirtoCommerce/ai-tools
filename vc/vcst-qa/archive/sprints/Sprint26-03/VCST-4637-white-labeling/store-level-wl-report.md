# VCST-4637: Store-Level White Labeling Verification Report

**Date:** 2026-02-17
**Tester:** qa-backend-expert (Claude Opus 4.6)
**Environment:** QA
**Platform Version:** 3.1004.0
**Storefront Version:** 2.42.0-pr-2110-2190-2190c09e
**Admin URL:** https://vcst-qa.govirto.com
**Storefront URL:** https://vcst-qa-storefront.govirto.com
**Store ID:** B2B-store
**Browser:** Microsoft Edge (via playwright-edge MCP)
**Ticket:** VCST-4637

---

## Objective

Investigate the store-level White Labeling (WL) configuration for B2B-store to understand:

1. What store-level WL settings are currently configured in the Admin SPA
2. How store-level WL settings interact with org-level WL on the storefront
3. Whether store-level WL is a factor in why Contoso and ACME Store 2 org-level WL configs are not rendering on the storefront

---

## Executive Summary

This investigation uncovered a **critical data contamination bug** in the White Labeling module: the store-level WL record and the ACME Store 3 organization-level WL record are the **same database record** (ID: `ab3f8422-b1b5-4a8c-b517-d02076788606`). There is no separate store-level WL record in the database. This means:

- The Admin SPA's "Store > White Labeling" blade is actually editing ACME Store 3's org record
- The REST API endpoint `/api/white-labeling/store/B2B-store` returns ACME Store 3's org data
- Store-level WL cannot function as a fallback because it does not exist as an independent record
- GraphQL returns completely different data than the REST API for store-level queries

Additionally, the storefront testing confirms that **only WL Test Org** correctly renders custom menus/footers. Contoso and ACME Store 2 continue to show defaults despite having correct org-level WL configurations in the database.

**Overall Result: FAIL -- 3 bugs found (1 Critical, 1 High, 1 Medium)**

---

## Part 1: Admin SPA -- Store-Level White Labeling Settings

### 1.1 Navigation Path

Stores > B2B-store > White Labeling (blade at bottom of store settings)

### 1.2 Current Store-Level WL Configuration

| Field | Value | Notes |
|-------|-------|-------|
| Enabled | ON (true) | Toggle is checked |
| Logo | VOLVO logo | Image src: `logo_organization-acme-store-3_1771335285225.png` |
| Favicon | (empty) | No favicon uploaded |
| Theme preset name | Mercury | Selected from dropdown |
| Main menu link list | (EMPTY) | No link list selected |
| Footer link list | (EMPTY) | No link list selected |

**Screenshot:** `screenshots/store-level/01-store-wl-blade-overview.png`
**Screenshot:** `screenshots/store-level/02-store-wl-blade-fields-detail.png`

### 1.3 Critical Finding: Store-Level WL Previously Had Link Lists

Comparing with earlier screenshots from the same session:

| Field | Earlier State (retest/08) | Current State |
|-------|--------------------------|---------------|
| Enabled | OFF | ON |
| Main menu link list | `catalog-menu` | (EMPTY) |
| Footer link list | `footer-links` | (EMPTY) |
| Theme preset name | Mercury | Mercury |
| Logo | VOLVO | VOLVO |

The Main menu and Footer link list fields became empty because:
- The store-level blade is actually editing ACME Store 3's org record (same DB record)
- When ACME Store 3's org WL was configured (during the retest phase), the link list names were intentionally cleared to empty
- This change propagated to the store-level blade because they share the same record

**Screenshots (historical):**
- `screenshots/retest/08-store-wl-settings-before.png` - Before: catalog-menu + footer-links populated
- `screenshots/retest/09-store-wl-enabled-saved.png` - After enabling toggle

### 1.4 REST API Verification: Store-Level Record

```
GET /api/white-labeling/store/B2B-store
```

Response:
```json
{
  "isEnabled": true,
  "organizationId": "organization-acme-store-3",
  "logoUrl": "https://vcst-qa.govirto.com/cms-content/assets/customization/logo_organization-acme-store-3_1771335285225.png",
  "footerLinkListName": "",
  "mainMenuLinkListName": "",
  "themePresetName": "Mercury",
  "storeId": "B2B-store",
  "id": "ab3f8422-b1b5-4a8c-b517-d02076788606"
}
```

**BUG EVIDENCE:** The response contains `organizationId: "organization-acme-store-3"` -- a store-level record should NOT contain an organizationId. Furthermore, the record ID `ab3f8422-b1b5-4a8c-b517-d02076788606` is identical to the ACME Store 3 org WL record (verified below).

### 1.5 REST API Comparison: Store-Level vs ACME Store 3 Org-Level

| Field | Store endpoint | ACME Store 3 org endpoint | Match? |
|-------|---------------|--------------------------|--------|
| **Endpoint** | `/api/white-labeling/store/B2B-store` | `/api/white-labeling/organization/organization-acme-store-3` | -- |
| **Record ID** | `ab3f8422-b1b5-4a8c-b517-d02076788606` | `ab3f8422-b1b5-4a8c-b517-d02076788606` | **SAME** |
| organizationId | organization-acme-store-3 | organization-acme-store-3 | SAME |
| storeId | B2B-store | B2B-store | SAME |
| isEnabled | true | true | SAME |
| mainMenuLinkListName | "" | "" | SAME |
| footerLinkListName | "" | "" | SAME |
| themePresetName | Mercury | Mercury | SAME |
| logoUrl | ...logo_organization-acme-store-3_... | ...logo_organization-acme-store-3_... | SAME |

**Conclusion:** There is NO separate store-level WL record. The `/api/white-labeling/store/{storeId}` endpoint returns the ACME Store 3 org record because that record happens to have `storeId: "B2B-store"` set.

### 1.6 All Organization WL Records (REST API)

| Organization | Record ID | isEnabled | Main Menu | Footer | Theme | storeId |
|-------------|-----------|-----------|-----------|--------|-------|---------|
| Contoso | d1578620-... | true | main-menu-electronics | footer-electronics | (null) | (null) |
| ACME Store 2 | fb158466-... | true | main-menu-fashion | footer-fashion | (null) | (null) |
| ACME Store 3 | ab3f8422-... | true | (empty) | (empty) | Mercury | B2B-store |
| WL Test Org | d36f3ffb-... | true | main-menu-electronics | footer-electronics | (null) | (null) |

**Key observation:** Only ACME Store 3's WL record has `storeId: "B2B-store"` set. The other organizations have `storeId: null`. This is likely why the store endpoint returns ACME Store 3's record -- the query probably looks for any WL record with `storeId = "B2B-store"` and ACME Store 3's record is the only match.

### 1.7 GraphQL vs REST API Comparison

```graphql
{
  whiteLabelingSettings(storeId: "B2B-store") {
    storeId organizationId logoUrl themePresetName
    mainMenuLinks { title url }
    footerLinks { title url }
  }
}
```

| Field | REST API (store endpoint) | GraphQL (store-level) | Match? |
|-------|--------------------------|----------------------|--------|
| storeId | B2B-store | B2B-store | YES |
| organizationId | organization-acme-store-3 | null | **NO** |
| themePresetName | Mercury | **black-gold** | **NO** |
| logoUrl | ...logo_organization-acme-store-3_... | ...logo_B2B-store_... | **NO** |
| mainMenuLinks | (empty string) | null | N/A (different format) |
| footerLinks | (empty string) | [] (empty array) | N/A (different format) |

**Conclusion:** GraphQL and REST API read from DIFFERENT data sources or records. GraphQL appears to have a separate cached or hardcoded store-level configuration with `themePresetName: "black-gold"` and a different logo URL (`logo_B2B-store_...`). This is an independent data inconsistency bug.

---

## Part 2: Storefront Verification

### 2.1 Test Matrix -- Organization Switching

All tests performed logged in as Elena Mutykova on the QA storefront.

| Organization | Main Menu | Footer | WL Working? | Screenshot |
|-------------|-----------|--------|-------------|------------|
| **WL Test Org** | Custom electronics (7 items): Support, About Us, Tablets, Phones, Laptops, Products, Home | Custom electronics (4 items): Warranty, Support, Terms of Service, Privacy Policy | **PASS** | 05, 06 |
| **Contoso** | Default catalog (15 items): Alcoholic Drinks, Accessories, Jewelry and gems, Car covers, Home appliance, Juice, Kitchen supplies, Products with options, Soft drinks, Snacks, Printers, Rental home, TV new, All BRANDS, SEE ALL PRODUCTS | Default (7 sections): Account details, About us, Popular categories, Online resources, External links, Customer support, Brands | **FAIL** | 04 |
| **ACME Store 2** | Default catalog (15 items) -- same as above | Default (7 sections) -- same as above | **FAIL** | 07 |
| **ACME Store 3** | Default catalog (15 items) -- same as above | Default (7 sections) -- same as above | Expected (no link lists configured) | 03 |

### 2.2 WL Test Org -- PASS

After switching to WL Test Org in the org switcher dropdown:

- **Header:** Shows "WL Test Org" as org name next to B2B-store logo
- **Main Navigation:** Custom 7-item menu matching `main-menu-electronics` link list
  - Support | About Us | Tablets | Phones | Laptops | Products | Home
- **Footer:** Custom 4-item footer matching `footer-electronics` link list
  - WARRANTY | SUPPORT | TERMS OF SERVICE | PRIVACY POLICY
- **Account menu:** Shows "WL Test Org / Elena Mutykova"

**Screenshots:**
- `screenshots/store-level/05-storefront-wl-test-org-custom-menu.png`
- `screenshots/store-level/06-storefront-wl-test-org-custom-footer.png`

### 2.3 Contoso -- FAIL

After switching to [E2E Test] Contoso Ltd.:

- **Expected:** Custom 7-item electronics menu + 4-item electronics footer (from `main-menu-electronics` and `footer-electronics`)
- **Actual:** Default 15-item catalog menu + 7-section default footer
- **REST API confirms** Contoso has correct WL config: `mainMenuLinkListName: "main-menu-electronics"`, `footerLinkListName: "footer-electronics"`

**Screenshot:** `screenshots/store-level/04-storefront-contoso-default-menu.png`

### 2.4 ACME Store 2 -- FAIL

After switching to ACME Store 2:

- **Expected:** Custom 7-item fashion menu + 4-item fashion footer (from `main-menu-fashion` and `footer-fashion`)
- **Actual:** Default 15-item catalog menu + 7-section default footer
- **REST API confirms** ACME Store 2 has correct WL config: `mainMenuLinkListName: "main-menu-fashion"`, `footerLinkListName: "footer-fashion"`

**Screenshot:** `screenshots/store-level/07-storefront-acme-store2-default-menu.png`

### 2.5 ACME Store 3 -- Expected Defaults

After switching to ACME Store 3:

- **Expected:** Default menu and footer (since its WL config has empty link list names)
- **Actual:** Default 15-item catalog menu + 7-section default footer
- **Result:** This is the expected behavior -- no custom link lists are configured for ACME Store 3

### 2.6 Store-Level WL as Fallback?

The original hypothesis was that store-level WL might serve as a fallback when org-level WL has no link lists configured (like ACME Store 3). However, since:

1. There is no actual store-level WL record (the record is ACME Store 3's org record)
2. The "store-level" record has empty link list names
3. The storefront shows default menus for all orgs except WL Test Org

**Conclusion:** Store-level WL is NOT functioning as a fallback because it does not exist as an independent entity. The default 15-item catalog menu and 7-section footer are the hardcoded storefront defaults, not sourced from any WL configuration.

---

## Part 3: Root Cause Analysis

### 3.1 Why Does WL Test Org Work But Others Don't?

Comparing the WL records reveals a key difference:

| Organization | storeId in WL record | WL on Storefront |
|-------------|---------------------|------------------|
| WL Test Org | null | **WORKS** |
| Contoso | null | Does NOT work |
| ACME Store 2 | null | Does NOT work |
| ACME Store 3 | B2B-store | Expected defaults |

Both WL Test Org and Contoso have identical configurations (same link lists, both enabled, both `storeId: null`), yet only WL Test Org renders correctly. This suggests the issue is NOT in the data configuration but in the **GraphQL resolver logic** that the storefront uses.

### 3.2 GraphQL organizationId Handling

Testing GraphQL with different organizationId values:

| Query organizationId | Response organizationId | Custom menus returned? |
|---------------------|------------------------|----------------------|
| (none -- store level) | null | NO (mainMenuLinks: null) |
| WL Test Org (0f944e75-...) | 0f944e75-... (echoed back) | NO (mainMenuLinks: null) |
| Contoso (37644943-...) | null | NO (mainMenuLinks: null) |
| ACME Store 2 (organization-acme-store-2) | null | NO (mainMenuLinks: null) |
| ACME Store 3 (organization-acme-store-3) | null | NO (mainMenuLinks: null) |

Observations:
- WL Test Org is the ONLY org where GraphQL echoes back the organizationId, but even then, `mainMenuLinks` is null
- For all other orgs, GraphQL returns `organizationId: null`, ignoring the parameter
- **Despite GraphQL returning null for mainMenuLinks**, WL Test Org still gets custom menus on the storefront

### 3.3 Possible Explanation

The storefront may be using a **different mechanism** than the `whiteLabelingSettings` GraphQL query to resolve WL for certain organizations. Possibilities:

1. **Direct REST API calls** from the storefront for some orgs (bypassing GraphQL)
2. **Server-side rendering (SSR) middleware** that resolves WL before the page loads
3. **A different GraphQL query or mutation** not yet discovered
4. **Cookie/session-based WL resolution** where WL Test Org was the most recently configured and cached
5. **Race condition** where WL Test Org was configured last and its settings are being returned as defaults

The fact that WL Test Org works despite GraphQL returning `mainMenuLinks: null` strongly suggests the storefront uses a code path other than the `whiteLabelingSettings` query for resolving menus and footers.

---

## Bugs Found

### BUG-1: Store-Level WL Record Contaminated with Organization Data (CRITICAL)

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Priority** | P1 |
| **Component** | WhiteLabeling Module / Data Layer |
| **Affects** | Store-level WL feature, Admin SPA store WL blade |

**Summary:** The REST API endpoint `GET /api/white-labeling/store/B2B-store` returns an organization-level WL record (ACME Store 3's record, ID: `ab3f8422-b1b5-4a8c-b517-d02076788606`) instead of a dedicated store-level record. The record contains `organizationId: "organization-acme-store-3"`, which should not exist in a store-level record.

**Impact:**
- There is no independent store-level WL record in the database
- The Admin SPA "Store > White Labeling" blade edits ACME Store 3's org record instead of a store-level record
- Changes made in the store-level blade affect ACME Store 3's org settings and vice versa
- Store-level WL cannot serve as a fallback for orgs without WL config

**Root Cause Hypothesis:** The WL record for ACME Store 3 has `storeId: "B2B-store"` set, which causes the store-level API endpoint to match and return this org record. A proper store-level record should have `storeId` set but `organizationId` should be null.

**Steps to Reproduce:**
1. Call `GET /api/white-labeling/store/B2B-store`
2. Call `GET /api/white-labeling/organization/organization-acme-store-3`
3. Compare record IDs -- they are identical: `ab3f8422-b1b5-4a8c-b517-d02076788606`

### BUG-2: GraphQL whiteLabelingSettings Ignores organizationId Parameter (HIGH)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Priority** | P1 |
| **Component** | WhiteLabeling Module / GraphQL xAPI Resolver |
| **Affects** | Storefront org-specific branding |

**Summary:** The `whiteLabelingSettings` GraphQL query accepts an `organizationId` parameter but ignores it for most organizations. Only WL Test Org has its organizationId echoed back in the response, but even then, `mainMenuLinks` remains null.

**Steps to Reproduce:**
```graphql
{
  whiteLabelingSettings(storeId: "B2B-store", organizationId: "37644943-0a80-4070-b948-14491e47fe20") {
    storeId organizationId themePresetName
    mainMenuLinks { title url }
    footerLinks { title url }
  }
}
```
Expected: `organizationId: "37644943-..."`, `mainMenuLinks` populated from `main-menu-electronics`
Actual: `organizationId: null`, `mainMenuLinks: null`

### BUG-3: GraphQL Store-Level Data Inconsistent with REST API (MEDIUM)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Priority** | P2 |
| **Component** | WhiteLabeling Module / GraphQL xAPI Resolver |

**Summary:** GraphQL `whiteLabelingSettings(storeId: "B2B-store")` returns `themePresetName: "black-gold"` and `logoUrl: "logo_B2B-store_..."`, while the REST API store endpoint returns `themePresetName: "Mercury"` and `logoUrl: "logo_organization-acme-store-3_..."`. These are different values for the same store, indicating the GraphQL resolver reads from a different data source.

---

## Screenshots Index

| # | Filename | Description |
|---|----------|-------------|
| 01 | `01-store-wl-blade-overview.png` | Admin SPA: Store-level WL blade overview |
| 02 | `02-store-wl-blade-fields-detail.png` | Admin SPA: Detailed field values in WL blade |
| 03 | `03-storefront-acme3-default-menu.png` | Storefront: ACME Store 3 with default 15-item menu |
| 04 | `04-storefront-contoso-default-menu.png` | Storefront: Contoso with default menu (FAIL) |
| 05 | `05-storefront-wl-test-org-custom-menu.png` | Storefront: WL Test Org with custom 7-item electronics menu (PASS) |
| 06 | `06-storefront-wl-test-org-custom-footer.png` | Storefront: WL Test Org with custom 4-item electronics footer (PASS) |
| 07 | `07-storefront-acme-store2-default-menu.png` | Storefront: ACME Store 2 with default menu (FAIL) |

---

## Data Summary: CMS Link Lists vs Storefront Rendering

| Link List Name | Items | Used By (WL Config) | Renders on Storefront? |
|---------------|-------|---------------------|----------------------|
| main-menu-electronics | 7 | Contoso, WL Test Org | Only for WL Test Org |
| footer-electronics | 4 | Contoso, WL Test Org | Only for WL Test Org |
| main-menu-fashion | 7 | ACME Store 2 | NO |
| footer-fashion | 4 | ACME Store 2 | NO |
| catalog-menu | 15 | (default, no WL) | YES (default fallback) |
| footer-links | 7 sections | (default, no WL) | YES (default fallback) |

---

## Recommendations

1. **P1 - Fix data contamination:** Create a proper store-level WL record that is independent from any org-level records. The store-level record should have `organizationId: null` and `storeId: "B2B-store"`.

2. **P1 - Fix GraphQL resolver:** The `whiteLabelingSettings` query must:
   - Respect the `organizationId` parameter and fetch org-specific WL settings
   - Resolve `mainMenuLinkListName` / `footerLinkListName` into actual `mainMenuLinks` / `footerLinks` arrays
   - Return consistent data with the REST API

3. **P2 - Investigate WL Test Org success:** Determine WHY WL Test Org renders correctly while Contoso and ACME Store 2 (with identical configurations) do not. This will reveal the actual code path the storefront uses for WL resolution.

4. **P2 - Admin SPA guard:** Add validation in the Admin SPA store-level WL blade to prevent it from editing an org-level record. If no store-level record exists, the blade should create one.

---

## Backend Sign-Off

| Criteria | Status | Notes |
|----------|--------|-------|
| Store-level WL accessible in Admin SPA | PASS | Blade opens and settings are editable |
| Store-level WL has independent record | **FAIL** | BUG-1: Shares record with ACME Store 3 org |
| Store-level REST API returns correct data | **FAIL** | Returns org data with organizationId set |
| GraphQL store-level data matches REST API | **FAIL** | BUG-3: Different theme and logo returned |
| GraphQL respects organizationId parameter | **FAIL** | BUG-2: Parameter ignored for most orgs |
| Org WL renders on storefront (WL Test Org) | PASS | Custom electronics menu and footer shown |
| Org WL renders on storefront (Contoso) | **FAIL** | Default menu and footer shown |
| Org WL renders on storefront (ACME Store 2) | **FAIL** | Default menu and footer shown |
| Org WL renders on storefront (ACME Store 3) | PASS | Default menu and footer (expected -- no link lists) |
| Store-level WL fallback works | **FAIL** | No independent store-level record exists |

**Overall Backend Status: FAIL**

| Role | Agent | Decision | Date |
|------|-------|----------|------|
| **Backend Expert** | qa-backend-expert | BLOCKED | 2026-02-17 |
| **QA Lead** | qa-lead-orchestrator | PENDING | -- |

**Blocking Issues:**
- BUG-1 (Critical): Store-level WL data contamination -- no independent store record exists
- BUG-2 (High): GraphQL organizationId parameter ignored -- org WL not resolvable via xAPI
- BUG-3 (Medium): GraphQL/REST data inconsistency for store-level WL

**Recommendation:** All 3 bugs must be addressed before the White Labeling feature can be considered functional for multi-org scenarios. The investigation should prioritize understanding why WL Test Org works while identically-configured Contoso does not, as this will likely reveal the actual resolution mechanism the storefront uses.
