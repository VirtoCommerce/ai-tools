# White Labeling Test Data Setup Guide

**Ticket:** VCST-4637
**Date:** 2026-02-17
**Prerequisites:** PRs #21 (backend) and #2110 (frontend) deployed to QA

---

## Overview

This guide walks through creating all test data needed for white labeling regression testing. Complete all steps in order.

---

## Step 1: Create Link Lists in Content Module (Admin SPA)

Link lists are managed in the Content module. Each link list defines a set of navigation links.

### 1.1 Create `main-menu-electronics`

1. Log in to Admin SPA (`BACK_URL`)
2. Navigate to **Content** > **Link Lists**
3. Click **Add Link List**
4. Name: `main-menu-electronics`
5. Add links (in order):

| Title | URL | Priority | Parent |
|-------|-----|----------|--------|
| Home | / | 1 | (none) |
| Products | /products | 2 | (none) |
| Laptops | /products/laptops | 1 | Products |
| Phones | /products/phones | 2 | Products |
| Tablets | /products/tablets | 3 | Products |
| About Us | /about | 3 | (none) |
| Support | /support | 4 | (none) |

6. Save

### 1.2 Create `main-menu-fashion`

1. Click **Add Link List**
2. Name: `main-menu-fashion`
3. Add links:

| Title | URL | Priority | Parent |
|-------|-----|----------|--------|
| Home | / | 1 | (none) |
| Shop | /shop | 2 | (none) |
| Men | /shop/men | 1 | Shop |
| Women | /shop/women | 2 | Shop |
| Kids | /shop/kids | 3 | Shop |
| New Arrivals | /new-arrivals | 3 | (none) |
| Contact | /contact | 4 | (none) |

4. Save

### 1.3 Create `footer-electronics`

| Title | URL | Priority |
|-------|-----|----------|
| Privacy Policy | /privacy | 1 |
| Terms of Service | /terms | 2 |
| Support | /support | 3 |
| Warranty | /warranty | 4 |

### 1.4 Create `footer-fashion`

| Title | URL | Priority |
|-------|-----|----------|
| Shipping Info | /shipping | 1 |
| Returns & Exchanges | /returns | 2 |
| Size Guide | /size-guide | 3 |
| Contact Us | /contact | 4 |

---

## Step 2: Create/Configure Test Organizations

Use existing organizations in QA or create new ones. The key is setting the white labeling configuration.

### 2.1 Organization A: Electronics Store

1. Navigate to **Organizations** in Admin SPA
2. Find or create "Electronics Store" organization
3. Open organization settings
4. Navigate to **White Labeling** section
5. Set:
   - **Main menu link list**: `main-menu-electronics`
   - **Footer link list**: `footer-electronics`
6. Save

### 2.2 Organization B: Fashion Boutique

1. Find or create "Fashion Boutique" organization
2. White Labeling settings:
   - **Main menu link list**: `main-menu-fashion`
   - **Footer link list**: `footer-fashion`
3. Save

### 2.3 Organization C: Default Company

1. Find or create "Default Company" organization
2. White Labeling settings:
   - **Main menu link list**: (leave empty)
   - **Footer link list**: (leave empty)
3. Save

### 2.4 Organization D: Menu Only Corp

1. Find or create "Menu Only Corp" organization
2. White Labeling settings:
   - **Main menu link list**: `main-menu-electronics`
   - **Footer link list**: (leave empty)
3. Save

### 2.5 Organization E: Footer Only Corp

1. Find or create "Footer Only Corp" organization
2. White Labeling settings:
   - **Main menu link list**: (leave empty)
   - **Footer link list**: `footer-electronics`
3. Save

---

## Step 3: Create/Assign Test Users

Each test user must be a member of the appropriate organization(s).

### 3.1 Single-org users

| Email | Organization | Purpose |
|-------|-------------|---------|
| wl-electronics@virtocommerce.com | Electronics Store | Full WL config |
| wl-fashion@virtocommerce.com | Fashion Boutique | Different WL config |
| wl-default@virtocommerce.com | Default Company | Fallback testing |
| wl-menuonly@virtocommerce.com | Menu Only Corp | Partial config |
| wl-footeronly@virtocommerce.com | Footer Only Corp | Partial config |

### 3.2 Multi-org user (for org switching tests)

| Email | Organizations | Purpose |
|-------|--------------|---------|
| wl-multi@virtocommerce.com | Electronics Store + Fashion Boutique | Org switch menu update |

**Create users:**
1. Navigate to **Customers** > **Contacts** in Admin SPA
2. Create each user with password `Test123!`
3. Assign to the organization(s) listed above
4. Verify user can log in to storefront

---

## Step 4: Verify Setup via GraphQL

After all data is created, verify using the GraphQL playground.

### 4.1 Open GraphQL Playground

Navigate to: `{BACK_URL}/ui/playground`

### 4.2 Test Electronics Org Query

```graphql
query {
  whiteLabelingSettings(storeId: "B2B-store", cultureName: "en-US") {
    labelingSetting {
      mainMenuLinkListName
      footerLinkListName
    }
    mainMenuLinks {
      title
      url
      priority
      childItems {
        title
        url
        priority
      }
    }
    footerLinks {
      title
      url
      priority
    }
  }
}
```

**Expected:** `mainMenuLinks` returns 4 top-level items (Home, Products, About Us, Support) with Products having 3 children.

### 4.3 Test Fashion Org Query

Switch organization context and run the same query.

**Expected:** `mainMenuLinks` returns 4 items (Home, Shop, New Arrivals, Contact) with Shop having 3 children.

### 4.4 Test Default Org Query

**Expected:** `mainMenuLinks` returns empty array `[]` or null.

---

## Step 5: Quick Smoke Verification on Storefront

### 5.1 Electronics User

1. Open storefront (`FRONT_URL`)
2. Sign in as `wl-electronics@virtocommerce.com`
3. Verify main menu shows: Home, Products (dropdown: Laptops, Phones, Tablets), About Us, Support
4. Verify footer shows: Privacy Policy, Terms of Service, Support, Warranty

### 5.2 Fashion User

1. Sign in as `wl-fashion@virtocommerce.com`
2. Verify main menu shows: Home, Shop (dropdown: Men, Women, Kids), New Arrivals, Contact
3. Verify footer shows: Shipping Info, Returns & Exchanges, Size Guide, Contact Us

### 5.3 Multi-Org User

1. Sign in as `wl-multi@virtocommerce.com`
2. Select "Electronics Store" org
3. Verify Electronics menu/footer
4. Switch to "Fashion Boutique" org
5. Verify Fashion menu/footer

---

## Troubleshooting

| Issue | Solution |
|-------|---------|
| MainMenuLinkListName field not in Admin UI | Backend PR #21 not deployed. Check module version. |
| mainMenuLinks not in GraphQL response | Backend PR #21 not deployed. Check GraphQL schema. |
| Storefront shows default menu despite config | Frontend PR #2110 not deployed. Check frontend build. |
| Org switch doesn't update menu | Clear browser cache. Check if frontend refetches WL settings on org change. |
| Link list not found | Verify exact name match (case-sensitive) between org config and Content link list name. |
| 500 error on GraphQL query | Check backend logs. Verify database migration applied (MainMenuLinkListName column exists). |

---

## Data Cleanup (Post-Testing)

After testing is complete:
1. Reset organization white labeling settings to original values
2. Delete test link lists (or leave for future regression)
3. Delete/deactivate test user accounts (or leave for future regression)
4. Document any org IDs used in test execution report

---

## Files in This Directory

| File | Purpose |
|------|---------|
| `organizations.csv` | Organization configs (5 orgs with different WL setups) |
| `link-lists.csv` | All link list items (22 links across 4 lists) |
| `users.csv` | Test user accounts (6 users) |
| `graphql-queries.md` | GraphQL queries for setup verification and testing |
| `setup-guide.md` | This file |
