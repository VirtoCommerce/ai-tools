# VCST-4637: Store-Level White Labeling Update Bug Report

**Date:** 2026-02-17
**Tester:** qa-backend-expert (automated via Playwright Edge MCP)
**Environment:** QA
**Platform Version:** 3.1004.0
**Storefront Version:** 2.42.0-pr-2110-2190-2190c09e
**Admin URL:** https://vcst-qa.govirto.com
**Storefront URL:** https://vcst-qa-storefront.govirto.com
**Store ID:** B2B-store
**Ticket:** VCST-4637

---

## Bug Summary

**BUG: Store-Level White Labeling Updates Do Not Take Effect on Storefront**

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Priority** | P1 |
| **Component** | WhiteLabeling Module / Store-Level Settings |
| **Status** | CONFIRMED |

---

## Test Procedure

### Step 1: Document Before State

Navigated to Admin SPA > Stores > B2B-store > White Labeling blade.

**Before state:**
| Field | Value |
|-------|-------|
| Enabled | ON (true) |
| Logo | VOLVO logo |
| Favicon | (empty) |
| Theme preset name | Mercury |
| Main menu link list | **(EMPTY)** |
| Footer link list | **(EMPTY)** |

**Screenshot:** `screenshots/store-level-update/01-before-state-wl-blade.png`

### Step 2: Update Store-Level WL Settings

Changed the store-level WL settings to use known-working link lists:

| Field | Before | After |
|-------|--------|-------|
| Main menu link list | (empty) | `main-menu-electronics` |
| Footer link list | (empty) | `footer-electronics` |
| Enabled | ON | ON (unchanged) |
| Theme preset name | Mercury | Mercury (unchanged) |

**Note:** `main-menu-electronics` and `footer-electronics` are confirmed working CMS link lists - they render correctly for WL Test Org at the org level.

**Screenshot:** `screenshots/store-level-update/02-filled-before-save.png`

### Step 3: Save and Verify Persistence

1. Clicked Save in the White Labeling blade
2. Closed and reopened the White Labeling blade
3. **Result: Changes PERSISTED** - both `main-menu-electronics` and `footer-electronics` are still shown after reopen

**Screenshot:** `screenshots/store-level-update/03-persisted-after-reopen.png`

### Step 4: Verify on Storefront (Logged-in User with No-WL Org)

1. Opened storefront https://vcst-qa-storefront.govirto.com
2. Logged in as mutykovaelena@gmail.com
3. Switched to ACME Store 3 (has NO org-level WL link lists configured - should fall back to store-level)
4. **Result: DEFAULT menu still displayed** - 15-item catalog menu, NOT the electronics menu

**Expected:** Custom electronics menu (7 items: Support, About Us, Tablets, Phones, Laptops, Products, Home) from store-level `main-menu-electronics` link list
**Actual:** Default catalog menu (15 items: Alcoholic Drinks, Accessories, Jewelry and gems, etc.)

**Screenshot:** `screenshots/store-level-update/04-storefront-menu-acme3-logged-in.png`

---

## Bug Verdict: CONFIRMED

**Store-level WL updates save correctly in Admin SPA but DO NOT take effect on the storefront.**

### Evidence Chain

1. Admin SPA: Store-level WL settings saved with `main-menu-electronics` and `footer-electronics` (persisted after reopen)
2. CMS link lists: `main-menu-electronics` confirmed working (renders correctly for WL Test Org at org level)
3. Storefront: User with ACME Store 3 (no org-level WL) still sees default 15-item menu instead of store-level electronics menu
4. Store-level WL fallback is NOT functioning

### Possible Root Causes

1. **Data contamination (from BUG-1 in store-level-wl-report.md):** The store-level WL record shares the same database ID as ACME Store 3's org record (`ab3f8422-b1b5-4a8c-b517-d02076788606`). When saving store-level settings, the changes may be written to the org record rather than creating/updating a true store-level record.

2. **GraphQL resolver doesn't read store-level link lists:** The `whiteLabelingSettings` GraphQL query may not be resolving `mainMenuLinkListName` / `footerLinkListName` from the store-level record into actual `mainMenuLinks` / `footerLinks` arrays for the storefront to consume.

3. **Frontend PageContext doesn't request store-level fallback:** The `getPageContextQuery.graphql` may not trigger store-level WL resolution when the user's org has no WL config.

4. **Cache invalidation:** Store-level WL changes may be cached and require a backend restart or cache clear to propagate.

---

## Steps to Reproduce

1. Log in to Admin SPA > Stores > B2B-store > White Labeling
2. Set Main menu link list = `main-menu-electronics`
3. Set Footer link list = `footer-electronics`
4. Ensure Enabled = ON
5. Click Save
6. Verify settings persisted (close and reopen blade)
7. Open storefront, log in as any user
8. Switch to an organization with NO org-level WL config (e.g., ACME Store 3)
9. **Expected:** Electronics menu (7 items) and electronics footer (4 items)
10. **Actual:** Default catalog menu (15 items) and default footer (7 sections)

---

## Relationship to Other Bugs

| Bug | Severity | Relationship |
|-----|----------|-------------|
| BUG-1: Store/ACME Store 3 record contamination | Critical | Root cause - no independent store-level record exists |
| BUG-2: GraphQL ignores organizationId | High | Related - GraphQL resolver has org-level issues too |
| BUG-3: GraphQL/REST data inconsistency | Medium | Related - different data sources for same store |
| BUG-FE-WL-001: Standalone query missing mainMenuLinks | P2 | May compound this issue on org switch |
| **This bug: Store-level WL not applied** | **High/P1** | **Store-level fallback is completely broken** |

---

## Screenshots Reference

| # | Filename | Description |
|---|----------|-------------|
| 01 | `01-before-state-wl-blade.png` | Admin: Store WL blade before changes (empty link lists) |
| 02 | `02-filled-before-save.png` | Admin: Store WL blade with electronics link lists filled in |
| 03 | `03-persisted-after-reopen.png` | Admin: Store WL blade after save - changes persisted |
| 04 | `04-storefront-menu-acme3-logged-in.png` | Storefront: ACME Store 3 still showing default menu (BUG) |

All screenshots saved to: `tests/VCST-4637-white-labeling/screenshots/store-level-update/`
