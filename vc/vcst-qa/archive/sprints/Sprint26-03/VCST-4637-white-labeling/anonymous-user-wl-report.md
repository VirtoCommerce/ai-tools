# VCST-4637: White Labeling - Anonymous User Verification Report

**Date:** 2026-02-17
**Tester:** qa-backend-expert (automated via Playwright Chrome MCP)
**Environment:** QA
**Platform Version:** 3.1004.0
**Storefront Version:** 2.42.0-pr-2110-2190-2190c09e
**Storefront URL:** https://vcst-qa-storefront.govirto.com
**Admin URL:** https://vcst-qa.govirto.com
**Store ID:** B2B-store
**Ticket:** VCST-4637

---

## Objective

Verify that store-level white labeling settings are applied for anonymous (not logged in) users on the storefront. Anonymous users have no organization context, so store-level WL should be the only WL source.

---

## Store-Level WL Configuration (at time of test)

| Field | Value |
|-------|-------|
| Enabled | ON |
| Logo | VOLVO logo |
| Theme preset name | Mercury |
| Main menu link list | `main-menu-electronics` (set during store-level update test) |
| Footer link list | `footer-electronics` (set during store-level update test) |

**Screenshots:** `screenshots/anonymous/01-admin-store-wl-config.png`, `screenshots/anonymous/02-admin-store-wl-logo-detail.png`

---

## Anonymous User Storefront Behavior

### Main Menu (Anonymous)

**Expected:** Custom electronics menu (7 items) from store-level `main-menu-electronics` link list:
- Support, About Us, Tablets, Phones, Laptops, Products, Home

**Actual:** DEFAULT catalog menu (15 items):
- All products, Alcoholic Drinks, Accessories, Car covers, Home appliance, Juice, Kitchen supplies, Products with options, Soft drinks, Snacks, Printers, Rental home, TV new, All BRANDS, SEE ALL PRODUCTS

**Result: FAIL** - Store-level WL main menu is NOT applied for anonymous users.

**Screenshot:** `screenshots/anonymous/04-anonymous-storefront-header-menu.png`

### Footer (Anonymous)

**Expected:** Custom electronics footer (4 sections) from store-level `footer-electronics` link list:
- Warranty, Support, Terms of Service, Privacy Policy

**Actual:** DEFAULT footer (7 sections):
- Account Details, About Us, Popular Categories, Online Resources, External Links, Customer Support, Brands

**Result: FAIL** - Store-level WL footer is NOT applied for anonymous users.

**Screenshot:** `screenshots/anonymous/05-anonymous-storefront-footer.png`

### Theme/Logo (Anonymous)

| Element | Expected (from Store WL) | Actual | Match? |
|---------|--------------------------|--------|--------|
| Logo | VOLVO logo | Virto Commerce logo | NO |
| Theme | Mercury | Default theme | NO |

**Result: FAIL** - Store-level WL theme and logo are also NOT applied for anonymous users.

---

## Analysis

### Store-Level WL is Completely Non-Functional for Anonymous Users

Despite having store-level WL configured with:
- Enabled = ON
- Main menu link list = `main-menu-electronics`
- Footer link list = `footer-electronics`
- Theme = Mercury
- Logo = VOLVO

Anonymous users see the absolute default storefront with no WL applied at all. This means:

1. **The storefront does not request store-level WL for anonymous users**, OR
2. **The GraphQL resolver does not resolve store-level WL when no organizationId/userId is provided**, OR
3. **The PageContext query for anonymous users does not include WL fields**

### Comparison: Anonymous vs Logged-in Users

| Feature | Anonymous User | Logged-in (ACME Store 3 - no WL) | Logged-in (WL Test Org - with WL) |
|---------|---------------|-----------------------------------|-----------------------------------|
| Main Menu | Default (15 items) | Default (15 items) | Custom electronics (7 items) |
| Footer | Default (7 sections) | Default (7 sections) | Custom electronics (4 items) |
| Theme | Default | Default | Applied (if set) |
| Logo | Virto Commerce | Virto Commerce | VOLVO (if set) |
| Store-Level WL Applied? | NO | NO | N/A (org-level used) |

**Key insight:** Store-level WL is not applied for ANY user - neither anonymous nor logged-in users without org-level WL. The store-level WL fallback mechanism appears completely broken.

---

## Bug Summary

**BUG: Store-Level White Labeling Not Applied for Anonymous Users**

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Priority** | P1 |
| **Component** | WhiteLabeling Module / Store-Level Fallback |
| **Related To** | Store-level WL update bug (same root cause) |

This is the same root issue as the store-level update bug: store-level WL settings save in Admin but never take effect on the storefront, regardless of whether the user is logged in or anonymous.

---

## Steps to Reproduce

1. Configure store-level WL in Admin SPA (Stores > B2B-store > White Labeling) with link lists and theme
2. Save and verify persistence
3. Open storefront in incognito/new browser (no login)
4. **Expected:** Custom menu, footer, theme, logo from store-level WL
5. **Actual:** Default storefront with no WL applied

---

## Screenshots Reference

| # | Filename | Description |
|---|----------|-------------|
| 01 | `01-admin-store-wl-config.png` | Admin: Store-level WL config overview |
| 02 | `02-admin-store-wl-logo-detail.png` | Admin: Store-level WL logo detail |
| 03 | `03-storefront-logged-in-state.png` | Storefront: Logged-in state before testing anonymous |
| 04 | `04-anonymous-storefront-header-menu.png` | Storefront: Anonymous user - default menu (BUG) |
| 05 | `05-anonymous-storefront-footer.png` | Storefront: Anonymous user - default footer (BUG) |

All screenshots saved to: `tests/VCST-4637-white-labeling/screenshots/anonymous/`
