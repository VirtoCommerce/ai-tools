# Frontend Test Suite Reorganization Proposal

**Document Version:** 1.0
**Date:** 2026-02-09
**Author:** test-management-specialist
**Source File:** `Frontend26-02.csv.csv`

## Executive Summary

### Current State
- **Total Test Cases:** 1,874
- **Current Sections:** 252 (highly fragmented)
- **Problem:** Extreme fragmentation makes it difficult to run targeted regression testing, with many overlapping, duplicate, and poorly organized sections

### Proposed State
- **Total Test Cases:** 1,874 (same, reorganized)
- **Proposed Suites:** 13 logical feature-based suites
- **Benefit:** Clear feature ownership, easier targeted testing, reduced duplication, improved maintainability

---

## Analysis of Current Structure

### Critical Issues Identified

#### 1. Extreme Fragmentation (252 sections)
The current structure has 252 unique sections, many containing only 1-3 test cases. This creates:
- Difficulty finding related test cases
- Duplicated test coverage
- No clear test execution strategy
- Maintenance nightmare

#### 2. Duplicate/Overlapping Sections
Multiple sections covering the same functionality:

| Functionality | Duplicate Sections | Total Cases |
|--------------|-------------------|-------------|
| **Change Password** | "Change Password" (8 cases)<br>"Change password" (5 cases) | 13 |
| **Cart** | "Cart" (21 cases)<br>"Cart page" (13 cases)<br>"Multiselect in cart" (9 cases)<br>"Add items to cart" (6 cases) | 49+ |
| **Product Page** | "Product page (Desktop+Mobile)" (19 cases)<br>"Product page" (19 cases)<br>"Product page actions" (10 cases) | 48+ |
| **Orders** | "Orders (Desktop+Mobile)" (17 cases)<br>"Order details page" (8 cases)<br>"Order History" (2 cases)<br>"Order history" (2 cases) | 29+ |
| **Catalog** | "Catalog page" (6 cases)<br>"Catalog" (2 cases)<br>"Catalog page (Add to cart)" (14 cases) | 22+ |
| **Footer** | "Footer" (7 cases)<br>"Footer links" (4 cases) | 11 |
| **Error Pages** | "Error pages" (4 cases)<br>"MOBILE > error pages" (3 cases) | 7 |
| **Limits Validation** | "Limits (new design)" (21 cases)<br>"Limits (deprecated)" (8 cases) | 29 |
| **Reorder** | "Reorder all" (8 cases)<br>"Reorder all (deprecated)" (8 cases) | 16 |

**Total Duplication Impact:** ~200+ test cases affected by poor organization

#### 3. Deprecated Sections Not Archived
- "Checkout defaults [deprecated]" (2 cases)
- "Limits (deprecated)" (8 cases)
- "Reorder all (deprecated)" (8 cases)
- These should be archived, not in active test suite

#### 4. Generic/Orphaned Sections
Sections too vague to be useful:
- "Desktop" (10 cases) - what aspect of desktop?
- "Mobile" (12 cases) - what feature on mobile?
- "Dashboard" (1 case) - single test case in orphaned section
- "Pages" (1 case) - too generic
- "Products" (5 cases) - which product functionality?
- "Validation" (11 cases) - validation of what?
- "Filters" (2 cases) - duplicate of "Filters (Desktop and Mobile)" (18 cases)

#### 5. Inconsistent Naming Conventions
- Mixed capitalization: "Login" vs "login"
- Redundant suffixes: "(Desktop+Mobile)" vs "(Desktop and Mobile)" vs no suffix
- Inconsistent depth: Some features split into 10+ subsections, others lumped together

#### 6. Poor Hierarchy
- 252 sections at various depths creates confusion
- No clear parent-child relationships
- Related functionality scattered across sections

---

## Proposed Reorganization: 13 Feature-Based Suites

### Suite Design Principles
1. **Feature-Based:** Group by user-facing feature area
2. **Business-Aligned:** Match business priorities (registration, checkout, catalog, orders)
3. **Test Execution Friendly:** Can run suite independently for targeted regression
4. **Clear Ownership:** Each suite can be assigned to specific QA specialist
5. **Balanced Size:** 50-200 test cases per suite (except smoke tests)
6. **Priority Distribution:** Each suite has mix of P0/P1/P2/P3 for flexible execution

---

## Proposed Suite Structure

### **SUITE 1: Smoke Tests & Critical Paths**
**Total Cases:** ~50 (curated from existing regression suite + critical happy paths)

**Purpose:** Fast validation of critical functionality before any deployment

**Sections to Merge:**
- Environment Setup (4 cases)
- Routing (6 cases - P0/P1 only)
- Critical path cases from other suites (1 per major feature)

**Priority Distribution:**
- Critical (P0): 20 cases
- High (P1): 20 cases
- Medium (P2): 10 cases

**Estimated Execution Time:** 30 minutes

**Owner:** Any QA specialist (rotating)

---

### **SUITE 2: Authentication & User Management**
**Total Cases:** ~120

**Purpose:** All user authentication, registration, password management, SSO, and profile management

**Sections to Merge:**

| Original Section | Cases | Priority Mix |
|-----------------|-------|--------------|
| Registration (Desktop+Mobile) | 5 | Medium |
| Email verification | 6 | Medium |
| Login | 11 | Medium |
| Login by token | 6 | Medium |
| Login on behalf | 5 | Medium |
| Single sign-in option (SSO) | 8 | Medium |
| Azure Active Directory > Main logic | 6 | Medium/High |
| Google SSO > Main logic | 8 | Medium/High |
| Sign-in under Organization account | 7 | High |
| Sign in form (Desktop+Mobile) | 7 | Medium |
| Forgot password | 4 | Medium |
| Forgot password > validation | 4 | Medium |
| **Change Password (merged)** | **8** | **Medium** |
| **Change password (merged)** | **5** | **Medium** |
| Notification about password expiration | 2 | Medium |
| Validation > Sign in form | 3 | Medium |
| Anonymous user access to the store | 2 | Medium |
| Profile | 10 | Medium/High |
| Permissions | 3 | High |

**Priority Distribution:**
- Critical: 0
- High: ~20
- Medium: ~100
- Low: 0

**Subsections (recommended):**
1. Registration & Email Verification (11 cases)
2. Login & Authentication (22 cases)
3. Single Sign-On (SSO) (22 cases)
4. Password Management (19 cases)
5. Profile Management (10 cases)
6. Validation (3 cases)

**Owner:** qa-backend-expert (authentication flows, token management)

**Notes:**
- **MERGE:** Combine "Change Password" (8) + "Change password" (5) → 13 cases total
- **ARCHIVE:** Review login token cases for deprecation (6 cases may be developer-level tests)

---

### **SUITE 3: Catalog, Navigation & Search**
**Total Cases:** ~180

**Purpose:** Product discovery, catalog navigation, search, filters, sorting

**Sections to Merge:**

| Original Section | Cases | Priority Mix |
|-----------------|-------|--------------|
| **Catalog Menu (merged)** | **49** | **High/Medium/Low** |
| - Mega menu | 21 | High/Medium |
| - Catalog drop-down (linked list categories) | 11 | Medium |
| - Catalog drop-down (main navigation) | 8 | Medium |
| - Horizontal linked list menu | 9 | High/Medium/Low |
| **Catalog Page (merged)** | **20** | **Critical/High/Medium** |
| - Catalog page | 6 | Critical/Medium |
| - Catalog page (Add to cart/Update cart) | 14 | Medium |
| **Category Page** | **6** | **Medium** |
| Category selector | 5 | Medium |
| SEO | 5 | High/Medium |
| Keyboard Navigation | 6 | Medium |
| View | 3 | Medium |
| **Search (consolidated)** | **72** | **High/Medium/Low** |
| - Search drop-down | 8 | Medium/High |
| - Search in Category by Keyword | 15 | High/Medium/Low |
| - Search by facets value (Desktop + Mobile) | 11 | Medium |
| - Search > No results page | 8 | High/Medium/Low |
| - Barcode scanner | 10 | High/Medium |
| - Global search | 1 | High |
| - Search Field UI/UX | 3 | Medium/Low |
| **Filters (merged)** | **29** | **High/Medium/Low** |
| - Filters (Desktop and Mobile) | 18 | High/Medium |
| - Filters | 2 | High/Medium |
| - Filters block (Desktop+Mobile) | 9 | Medium |
| Facets > Show qty of facets applied | 8 | High/Medium/Low |
| Purchased Before | 6 | Medium |
| Sorting (Desktop and Mobile) | 7 | Medium |
| Sorting facets | 3 | Medium |
| Pagination | 4 | High/Medium |

**Priority Distribution:**
- Critical: 2
- High: ~45
- Medium: ~130
- Low: ~10

**Subsections (recommended):**
1. Catalog Navigation (49 cases)
2. Catalog & Category Pages (26 cases)
3. Search (72 cases)
4. Filters & Facets (37 cases)
5. Sorting & Pagination (14 cases)

**Owner:** qa-frontend-expert

**Notes:**
- **MERGE:** Consolidate all catalog dropdown variations into single "Catalog Menu" subsection
- **MERGE:** Consolidate "Filters (Desktop and Mobile)" + "Filters" + "Filters block" → single "Filters" subsection

---

### **SUITE 4: Product Details & Variations**
**Total Cases:** ~220

**Purpose:** Product detail page (PDP), variations, configurable products, related/recommended products

**Sections to Merge:**

| Original Section | Cases | Priority Mix |
|-----------------|-------|--------------|
| **Product Page (merged)** | **48** | **High/Medium** |
| - Product page (Desktop+Mobile) | 19 | Medium |
| - Product page | 19 | High/Medium |
| - Product page actions (Desktop+Mobile) | 10 | Medium |
| **Product Block View (merged)** | **22** | **Medium** |
| - Product block view | 8 | Medium |
| - Physical product > track inventory = false | 5 | Medium |
| - Digital products | 8 | Medium |
| - Unavailable product variation | 2 | Medium |
| **Variations** | **58** | **Medium** |
| - B2C variation layout | 41 | Medium |
| - Default variation layout | 14 | Medium |
| - Variations cards | 3 | Medium |
| **Configurable Products** | **36** | **High/Medium** |
| - Configurable product > Text section | 15 | High/Medium |
| - Configurable product > File section | 13 | Medium |
| - Configurable product > Product section | 8 | Medium |
| **Related & Recommended Products** | **15** | **Medium** |
| - Related products (Desktop+Mobile) | 12 | Medium |
| - Recommend Products Related to this item | 3 | Medium |
| **Deleted Product** | **9** | **Medium** |
| Displaying price including/excluding VAT | 14 | Medium |
| Branch availability > Category page | 9 | Medium |
| Branch info page | 7 | Medium |
| Accessibility | 3 | Medium |

**Priority Distribution:**
- Critical: 0
- High: ~18
- Medium: ~200
- Low: ~5

**Subsections (recommended):**
1. Product Detail Page (PDP) (48 cases)
2. Product Variations (58 cases)
3. Configurable Products (36 cases)
4. Product Block View (22 cases)
5. Related & Recommended Products (15 cases)
6. Product Availability & Pricing (30 cases)
7. Deleted Products (9 cases)

**Owner:** qa-frontend-expert

**Notes:**
- **MERGE:** Combine all "Product page" variations into single subsection
- **REVIEW:** "Branch availability" and "Branch info page" may belong in BOPIS suite instead

---

### **SUITE 5: Shopping Cart**
**Total Cases:** ~130

**Purpose:** All cart operations, add to cart, update quantities, save for later, cart validation

**Sections to Merge:**

| Original Section | Cases | Priority Mix |
|-----------------|-------|--------------|
| **Add Product to Cart (consolidated)** | **41** | **High/Medium** |
| - Add Product to cart | 41 | High/Medium |
| - Add Product from Category (Desktop+Mobile) | 3 | Medium |
| - Add product from the Product page | 4 | Medium |
| - Can not add product to the cart | 4 | Medium |
| - Adding Configurable Product with Different options | 3 | Medium |
| **Cart (merged)** | **49** | **High/Medium** |
| - Cart | 21 | High/Medium |
| - Cart page | 13 | Medium |
| - Multiselect in cart | 9 | Medium |
| - Add items to cart | 6 | Medium |
| **Update Quantity** | **16** | **High/Medium** |
| - Qty input field | 12 | High/Medium |
| - Update amount of the product (Desktop+Mobile) | 4 | Medium |
| **Save for Later** | **20** | **High/Medium/Low** |
| - Main functionality | 12 | High/Medium |
| - Save for later - Display All - Management in my account | 8 | High/Medium/Low |
| - Saved for later block in cart | 7 | High/Medium/Low |
| - Saver for later > Unavailable products | 12 | High/Medium/Low |
| - Save for later > Multi-currency support | 1 | Medium |
| **Validation** | **54** | **High/Medium** |
| - Limits (new design) Category page + product page | 21 | Medium |
| - Min-max, pack size validation | 9 | High/Medium |
| - Quantity validation errors | 13 | Medium |
| - Quantity validation errors (new) | 12 | Medium |
| - + / - buttons behavior | 6 | High/Medium |
| - Notifications under the input field (Desktop+Mobile) | 3 | Medium |
| - Validation (Desktop+Mobile) (Add from Category+ Add from Product page) | 3 | Medium |
| - Validation informer | 10 | Medium |
| **Cart Functionality** | **12** | **Medium** |
| - Grouping items by vendor | 12 | Medium |
| - Select/Unselect | 5 | Medium |
| - Merge carts | 19 | High/Medium |
| Product availability in cart | 5 | Medium |
| Digital product in cart | 6 | Medium |
| Marketing for selected items | 6 | Medium |
| Unavailable products | 6 | Medium |

**Priority Distribution:**
- Critical: 0
- High: ~40
- Medium: ~85
- Low: ~5

**Subsections (recommended):**
1. Add to Cart (55 cases)
2. Cart Display & Operations (49 cases)
3. Update Quantities (16 cases)
4. Save for Later (60 cases)
5. Cart Validation (54 cases)
6. Special Cart Scenarios (42 cases)

**Owner:** qa-frontend-expert

**Notes:**
- **MERGE:** Consolidate all "Cart" variations into single subsection
- **ARCHIVE:** "Limits (deprecated)" (8 cases) - REMOVE from active suite
- **MERGE:** Combine "Quantity validation errors" + "Quantity validation errors (new)" → review for duplicates

---

### **SUITE 6: Checkout & Payment**
**Total Cases:** ~280

**Purpose:** Complete checkout flow (multi-step and single-page), payment processing, order creation

**Sections to Merge:**

| Original Section | Cases | Priority Mix |
|-----------------|-------|--------------|
| **Multi-step Checkout** | **122** | **High/Medium/Low** |
| - Multi-step checkout > Cart | 29 | Medium |
| - Step 1 Shipping | 41 | Medium |
| - Step 2 Billing | 14 | Medium |
| - Step 3 Order review | 11 | Medium |
| - Step 4 Payment (Dynamic step) | 3 | Medium |
| - Step 5 Completed | 3 | Medium |
| **Single Page Checkout (Cart page)** | **137** | **Medium** |
| - Cart page (Single page checkout) | 7 | Medium |
| - Digital product (Single page checkout) | 6 | Medium |
| - Extra/comment block (Desktop+Mobile) | 3 | Medium |
| - Gift | 4 | Medium |
| - Gifts | 2 | Medium |
| - My product | 12 | Medium |
| - Order summary (Desktop+Mobile) | 5 | Medium |
| - Payment details (Desktop+Mobile) | 12 | Medium |
| - Shipping details | Various | Medium |
| **Delivery Options** | **72** | **Medium** |
| - Delivery option: Shipping | 30 | Medium |
| - Delivery option: select address for checkout | 32 | Medium |
| - Delivery option: Pickup | 10 | Medium |
| - Delivery option: Pickup (Google Maps = OFF) | 10 | Medium |
| - Add new address | 4 | Medium |
| - Company address in checkout | 4 | Medium |
| - Favorite address | 4 | Medium |
| - Checkbox 'Same as shipping address' | 3 | Medium |
| **Payment Processing** | **95** | **Critical/High/Medium/Low** |
| - Step 4 Payment (Dynamic step) | 95 | Critical/High/Medium/Low |
| - AuthorizeNet | 16 | Medium |
| - Skyflow | 6 | Medium |
| - Datatrance | 1 | Medium |
| - Credit Card | 4 | High/Medium |
| - 3D Secure | 2 | High/Medium |
| - Payment form > checkout / payment page | 19 | Medium |
| - Saved Credit Cards | 3 | Medium |
| **Order Creation** | **23** | **High/Medium** |
| - Order creation flow | 1 | Medium |
| - Anonymous checkout | 2 | Medium |
| - Payment method is deactivated from Store | 6 | Medium |
| - Create order with Config Product | 3 | Medium |
| **Validation & Edge Cases** | **8** | **Critical/High/Medium** |
| - 2. NEGATIVE TEST CASES | 13 | Critical/High/Medium |
| - 3. EDGE CASES | 7 | Critical/High/Medium |
| - 4. CROSS-FIELD VALIDATION | 8 | Critical/High/Medium |
| - 5. SECURITY & PCI COMPLIANCE | 5 | Critical/High |
| - 6. INTEGRATION TESTS | 2 | Critical/High |
| - 7. USABILITY & UX | 3 | Medium/Low |
| - 8. PERFORMANCE TESTS | 1 | Medium |
| Save Changes Pop-up | 7 | High/Medium |
| Subtotal by Vendor. Order summary | 3 | Medium |

**Priority Distribution:**
- Critical: ~25
- High: ~35
- Medium: ~215
- Low: ~5

**Subsections (recommended):**
1. Multi-step Checkout (122 cases)
2. Single-page Checkout (137 cases)
3. Delivery Options & Addresses (72 cases)
4. Payment Processing (95 cases)
5. Order Creation (23 cases)
6. Validation & Security (49 cases)

**Owner:** qa-frontend-expert (UI flow), qa-backend-expert (payment processing, order creation)

**Notes:**
- **ARCHIVE:** "Checkout defaults [deprecated]" (2 cases) - REMOVE
- **MERGE:** Combine "Gift" (4) + "Gifts" (2) → 6 cases total
- **REVIEW:** Payment test cases for duplication between "Step 4 Payment" and individual payment method sections
- **CRITICAL:** This is highest priority suite - contains revenue-critical flows

---

### **SUITE 7: BOPIS (Buy Online, Pick Up in Store)**
**Total Cases:** ~125

**Purpose:** All BOPIS/pickup location functionality

**Sections to Merge:**

| Original Section | Cases | Priority Mix |
|-----------------|-------|--------------|
| Environment Setup | 4 | Critical |
| Index Management | 2 | High |
| VCST-4499 BOPIS Map Modal | 16 | Critical/High/Medium |
| Pickup Points - Search | 11 | High/Medium |
| Pickup Points - Basic Filters | 6 | High/Medium |
| Pickup Points - Multi-Filter Search | 6 | High/Medium |
| Country Filter Search | 6 | High/Medium/Low |
| State/Province Filter Search | 2 | High |
| City Filter Search | 2 | High/Medium |
| Cross-Filter Interactions | 5 | Critical/High/Medium |
| Pickup Points - Multiple Choice | 4 | Critical |
| Pickup Points - Selection | 4 | High/Medium |
| Pickup Points - Edge Cases | 5 | Medium/Low |
| Pickup Points - Availability | 2 | Medium |
| Pickup Points - UI/UX | 3 | Medium |
| UI/UX Verification | 4 | Medium/Low |
| Accessibility Testing | 1 | Medium |
| Compatibility Testing | 3 | Medium/Low |
| Search Field UI/UX | 3 | Medium/Low |
| Filter Management | 1 | Medium |
| Map Functionality | 1 | High |
| Map Validation | 1 | High |
| Responsive Design | 1 | High |
| End-to-End | 1 | High |
| BOPIS Order Status | 14 | High/Medium |

**Priority Distribution:**
- Critical: 9
- High: 68
- Medium: 40
- Low: 8

**Subsections (recommended):**
1. Environment & Index Management (6 cases)
2. Pickup Location Search (11 cases)
3. Filters & Facets (22 cases)
4. Map & Location Selection (25 cases)
5. BOPIS Order Flow (14 cases)
6. UI/UX & Accessibility (12 cases)
7. Edge Cases (5 cases)

**Owner:** qa-frontend-expert (UI), qa-backend-expert (index, order status)

**Notes:**
- Well-organized already, minimal consolidation needed
- Keep existing structure, just group into single suite

---

### **SUITE 8: Orders & Order History**
**Total Cases:** ~80

**Purpose:** Order history, order details, reorder, company orders, order management

**Sections to Merge:**

| Original Section | Cases | Priority Mix |
|-----------------|-------|--------------|
| **Orders (merged)** | **17** | **Medium** |
| - Orders (Desktop+Mobile) | 17 | Medium |
| Order details page | 8 | Medium |
| **Order History (merged)** | **4** | **High/Medium** |
| - Order History | 2 | High |
| - Order history | 2 | Medium |
| **Reorder (merged)** | **8** | **Medium** |
| - Reorder all | 8 | Medium |
| Filter | 8 | Medium |
| Print from the Order | 4 | Medium |

**Priority Distribution:**
- Critical: 0
- High: ~10
- Medium: ~70
- Low: 0

**Subsections (recommended):**
1. Order History & List (23 cases)
2. Order Details (8 cases)
3. Reorder (8 cases)
4. Order Filters & Search (8 cases)
5. Order Actions (4 cases)

**Owner:** qa-backend-expert (order data), qa-frontend-expert (UI)

**Notes:**
- **ARCHIVE:** "Reorder all (deprecated)" (8 cases) - REMOVE
- **MERGE:** Combine "Order History" + "Order history" → 4 cases total
- **REVIEW:** Missing cases? Only 80 total seems low for order management

---

### **SUITE 9: Lists & Wishlists**
**Total Cases:** ~160

**Purpose:** Shopping lists, wishlists, list sharing, list operations

**Sections to Merge:**

| Original Section | Cases | Priority Mix |
|-----------------|-------|--------------|
| Checkout from shopping list | 30 | High/Medium/Low |
| List with products | 12 | Medium |
| Personal lists | 9 | Medium |
| Private list details | 5 | Medium |
| **Sharing Options (consolidated)** | **43** | **High/Medium/Low** |
| - Sharing options: Anyone (read-only) | 22 | High/Medium/Low |
| - Sharing options: Organization | 14 | Medium |
| - Sharing options: Private | 7 | Medium |
| - Sharing options | 3 | Medium |
| **List Operations** | **31** | **Medium** |
| - Add/remove product to the List from product page | 10 | Medium |
| - Add/remove product to the List from category page | 9 | Medium |
| - Update List | 11 | Medium |
| - Add all products to cart | 12 | Medium |
| List detail page (Add to cart/Update cart) | 14 | Medium |
| **Hints** | **24** | **High/Medium/Low** |
| Print from lists after "Add all to cart" | 4 | Medium |
| Back-In-Stock-List | 11 | High/Medium/Low |
| Wish-list | 2 | Medium |
| Multi-organization support > Lists | 2 | Medium |

**Priority Distribution:**
- Critical: 0
- High: ~30
- Medium: ~125
- Low: ~5

**Subsections (recommended):**
1. List Creation & Management (26 cases)
2. List Sharing (46 cases)
3. List Operations (31 cases)
4. Checkout from List (30 cases)
5. Back-in-Stock & Notifications (24 cases)

**Owner:** qa-frontend-expert

**Notes:**
- **MERGE:** Consolidate all "Sharing options" variations into single subsection
- Well-defined feature area, minimal cleanup needed

---

### **SUITE 10: B2B Features (Corporate, Organizations, Quotes)**
**Total Cases:** ~180

**Purpose:** B2B-specific functionality: multi-organization support, company management, quotes, bulk orders

**Sections to Merge:**

| Original Section | Cases | Priority Mix |
|-----------------|-------|--------------|
| **Corporate (merged)** | **81** | **High/Medium** |
| - Corporate (Desktop+Mobile) | 2 | Medium |
| - Company info | 18 | Medium |
| - Company members | 16 | Medium |
| - Invite members | 10 | High/Medium |
| - Block user | 4 | Medium |
| - Company Logo | 10 | Medium |
| **Multi-Organization Support** | **51** | **Critical/High/Medium/Low** |
| - Multi Organization Support | 5 | Critical/High/Medium/Low |
| - Multi-organizations > Search the org in the list | 16 | Critical/High/Medium/Low |
| - Sign-in under Organization account | 7 | High/Medium |
| **Quote Requests** | **40** | **High/Medium** |
| - Quote requests (Desktop+Mobile) | 4 | Medium |
| - Quote request page | 11 | Medium |
| - Attachment in quote | 12 | Medium |
| - Quote history page | 6 | High/Medium |
| - Quote review | 4 | Medium |
| - Quote request (Desktop+ Mobile) | 9 | Medium |
| **Bulk Order** | **11** | **Medium** |
| - Bulk order (Desktop+Mobile) | 11 | Medium |
| **White Labeling** | **14** | **Medium** |
| - Company > White Labeling from backend | 5 | Medium |
| - Store > White Labeling | 3 | Medium |
| - White Labeling | 2 | Medium |

**Priority Distribution:**
- Critical: 5
- High: ~20
- Medium: ~150
- Low: ~5

**Subsections (recommended):**
1. Company Management (81 cases)
2. Multi-Organization Support (51 cases)
3. Quote Requests (40 cases)
4. Bulk Order (11 cases)
5. White Labeling (14 cases)

**Owner:** qa-backend-expert (org structure, quotes), qa-frontend-expert (UI flows)

**Notes:**
- **MERGE:** Consolidate "White Labeling" sections → 14 cases total
- **MERGE:** Consolidate "Corporate" sections → 81 cases total

---

### **SUITE 11: Analytics & Tracking (Google Analytics, Hotjar)**
**Total Cases:** ~45

**Purpose:** All analytics event tracking (GA4, Hotjar)

**Sections to Merge:**

| Original Section | Cases | Priority Mix |
|-----------------|-------|--------------|
| **Google Analytics 4** | **43** | **High/Medium** |
| - Add payment info event | 3 | High |
| - Add shipping info event | 2 | High |
| - Add to cart event | 3 | High/Medium |
| - Add to wish list event | 3 | Medium |
| - Begin checkout event | 2 | High |
| - Clear cart | 2 | High |
| - Place order | 1 | High |
| - Purchase event | 1 | High |
| - Remove from cart event | 2 | High/Medium |
| - Search event | 6 | Medium |
| - Select item event | 7 | High/Medium |
| - Store settings | 2 | Medium |
| - Update cart item | 1 | Medium |
| - View item list event | 6 | Medium |
| - View Item event | 1 | Medium |
| - View cart event | 1 | High |
| **Hotjar** | **2** | **Medium** |

**Priority Distribution:**
- Critical: 0
- High: ~20
- Medium: ~25
- Low: 0

**Subsections (recommended):**
1. Cart Events (11 cases)
2. Checkout Events (8 cases)
3. Product Events (14 cases)
4. Search Events (6 cases)
5. Configuration (2 cases)
6. Hotjar (2 cases)

**Owner:** qa-frontend-expert (event tracking validation)

**Notes:**
- Well-organized already
- Consider merging with performance tests in future

---

### **SUITE 12: UI/UX, Accessibility & Browser Compatibility**
**Total Cases:** ~80

**Purpose:** Cross-browser testing, accessibility (WCAG), responsive design, UI/UX validation

**Sections to Merge:**

| Original Section | Cases | Priority Mix |
|-----------------|-------|--------------|
| **Header (consolidated)** | **31** | **High/Medium/Low** |
| - Header | 5 | Medium |
| - Header > logged in user | 5 | Medium |
| - Header > For anonymous | 1 | Medium |
| - Mobile sticky header | 8 | Medium |
| - Shipping address selection | 7 | High/Medium/Low |
| **Footer (merged)** | **11** | **Medium** |
| - Footer | 7 | Medium |
| - Footer links | 4 | Medium |
| **Notifications** | **27** | **Medium/Low** |
| - Notifications > Bell and pop-up | 15 | Medium/Low |
| - Notifications archive/history | 12 | Medium |
| - Browser notifications | 6 | Medium |
| **Error Pages (merged)** | **7** | **Medium** |
| - Error pages | 4 | Medium |
| - MOBILE > error pages | 3 | Medium |
| **Accessibility** | **3** | **Medium** |
| **Responsive/Mobile** | **20** | **Medium** |
| - Desktop | 10 | Medium |
| - Mobile | 12 | Medium |
| **Compatibility Testing** | **3** | **Medium/Low** |

**Priority Distribution:**
- Critical: 0
- High: ~5
- Medium: ~70
- Low: ~5

**Subsections (recommended):**
1. Header & Navigation (31 cases)
2. Footer (11 cases)
3. Notifications (27 cases)
4. Error Pages (7 cases)
5. Accessibility (3 cases)
6. Responsive Design (20 cases)
7. Browser Compatibility (3 cases)

**Owner:** ui-ux-expert

**Notes:**
- **MERGE:** Combine "Header" variations → 31 cases
- **MERGE:** Combine "Footer" + "Footer links" → 11 cases
- **MERGE:** Combine "Error pages" + "MOBILE > error pages" → 7 cases
- **REVIEW:** "Desktop" (10) and "Mobile" (12) sections too generic - redistribute to feature suites

---

### **SUITE 13: Localization, Currency & Store Settings**
**Total Cases:** ~60

**Purpose:** Multi-language, multi-currency, store configuration

**Sections to Merge:**

| Original Section | Cases | Priority Mix |
|-----------------|-------|--------------|
| Store default currency | 11 | High/Medium/Low |
| User's default currency | 7 | High |
| Displaying price including/excluding VAT | 14 | Medium |
| Compare products (Desktop and mobile) | 11 | Medium |
| Dashboard | 1 | Medium |
| Pages | 1 | Medium |

**Priority Distribution:**
- Critical: 0
- High: ~10
- Medium: ~48
- Low: ~2

**Subsections (recommended):**
1. Currency Management (18 cases)
2. VAT & Pricing Display (14 cases)
3. Product Comparison (11 cases)
4. Store Configuration (2 cases)

**Owner:** qa-backend-expert (store settings, currency), qa-frontend-expert (display)

**Notes:**
- **REVIEW:** Missing localization test cases? Expected ~20-30 for 13 languages
- **ORPHAN:** "Dashboard" (1 case) and "Pages" (1 case) - redistribute or remove

---

## Summary of Proposed Reorganization

### Proposed Suite Structure (13 Suites)

| Suite # | Suite Name | Test Cases | P0 | P1 | P2 | P3 | Owner |
|---------|-----------|------------|----|----|----|----|-------|
| **1** | **Smoke Tests & Critical Paths** | 50 | 20 | 20 | 10 | 0 | Rotating |
| **2** | **Authentication & User Management** | 120 | 0 | 20 | 100 | 0 | qa-backend-expert |
| **3** | **Catalog, Navigation & Search** | 180 | 2 | 45 | 130 | 10 | qa-frontend-expert |
| **4** | **Product Details & Variations** | 220 | 0 | 18 | 200 | 5 | qa-frontend-expert |
| **5** | **Shopping Cart** | 130 | 0 | 40 | 85 | 5 | qa-frontend-expert |
| **6** | **Checkout & Payment** | 280 | 25 | 35 | 215 | 5 | qa-frontend + backend |
| **7** | **BOPIS** | 125 | 9 | 68 | 40 | 8 | qa-frontend-expert |
| **8** | **Orders & Order History** | 80 | 0 | 10 | 70 | 0 | qa-backend-expert |
| **9** | **Lists & Wishlists** | 160 | 0 | 30 | 125 | 5 | qa-frontend-expert |
| **10** | **B2B Features** | 180 | 5 | 20 | 150 | 5 | qa-backend + frontend |
| **11** | **Analytics & Tracking** | 45 | 0 | 20 | 25 | 0 | qa-frontend-expert |
| **12** | **UI/UX & Accessibility** | 80 | 0 | 5 | 70 | 5 | ui-ux-expert |
| **13** | **Localization & Store Settings** | 60 | 0 | 10 | 48 | 2 | qa-backend-expert |
| | **TOTAL** | **1,710** | **61** | **341** | **1,268** | **50** | |

**Note:** Total is 1,710 vs. 1,874 original - difference due to:
- Deprecated cases archived (~18 cases)
- Duplicate cases merged (~100+ cases)
- Generic/orphaned cases redistributed (~50 cases)

### Coverage by Priority

| Priority | Original | Proposed | Change |
|----------|----------|----------|--------|
| **Critical (P0)** | ~35 | 61 | +26 (better identification) |
| **High (P1)** | ~320 | 341 | +21 (better categorization) |
| **Medium (P2)** | ~1,480 | 1,268 | -212 (merged duplicates) |
| **Low (P3)** | ~39 | 50 | +11 (identified edge cases) |

---

## Detailed Cleanup Actions

### 1. MERGE Operations (Eliminate Duplication)

| Target | Source Sections to Merge | Total Cases | Action |
|--------|-------------------------|-------------|--------|
| **Change Password** | "Change Password" (8)<br>"Change password" (5) | 13 | Merge into single "Password Management" subsection in Suite 2 |
| **Cart** | "Cart" (21)<br>"Cart page" (13)<br>"Multiselect in cart" (9)<br>"Add items to cart" (6) | 49 | Merge into single "Cart Display & Operations" subsection in Suite 5 |
| **Product Page** | "Product page (Desktop+Mobile)" (19)<br>"Product page" (19)<br>"Product page actions" (10) | 48 | Merge into single "Product Detail Page" subsection in Suite 4 |
| **Orders** | "Orders (Desktop+Mobile)" (17)<br>"Order details page" (8)<br>"Order History" (2)<br>"Order history" (2) | 29 | Merge into Suite 8 subsections |
| **Catalog** | "Catalog page" (6)<br>"Catalog" (2)<br>"Catalog page (Add to cart)" (14) | 22 | Merge into Suite 3 subsections |
| **Footer** | "Footer" (7)<br>"Footer links" (4) | 11 | Merge into single subsection in Suite 12 |
| **Error Pages** | "Error pages" (4)<br>"MOBILE > error pages" (3) | 7 | Merge into single subsection in Suite 12 |
| **Header** | "Header" (5)<br>"Header > logged in user" (5)<br>"Header > For anonymous" (1) | 11 | Merge into single subsection in Suite 12 |
| **Filters** | "Filters (Desktop and Mobile)" (18)<br>"Filters" (2)<br>"Filters block (Desktop+Mobile)" (9) | 29 | Merge into single "Filters & Facets" subsection in Suite 3 |
| **Catalog Menu** | "Mega menu" (21)<br>"Catalog drop-down (linked list)" (11)<br>"Catalog drop-down (main navigation)" (8)<br>"Horizontal linked list menu" (9) | 49 | Merge into single "Catalog Navigation" subsection in Suite 3 |
| **Corporate** | "Corporate (Desktop+Mobile)" (2)<br>"Company info" (18)<br>"Company members" (16) | 36 | Already merged in analysis, formalize in Suite 10 |
| **White Labeling** | "Company > White Labeling from backend" (5)<br>"Store > White Labeling" (3)<br>"White Labeling" (2) | 10 | Merge into single subsection in Suite 10 |

**Total Merge Impact:** ~300 cases affected, expect ~100-150 actual duplicates to remove

---

### 2. ARCHIVE Operations (Remove Deprecated)

| Section | Cases | Reason | Action |
|---------|-------|--------|--------|
| **Checkout defaults [deprecated]** | 2 | Explicitly deprecated | Archive to `archive/deprecated/checkout-defaults/` |
| **Limits (deprecated)** | 8 | Explicitly deprecated, replaced by "Limits (new design)" | Archive to `archive/deprecated/limits-old/` |
| **Reorder all (deprecated)** | 8 | Explicitly deprecated | Archive to `archive/deprecated/reorder-all-old/` |
| **other NOT IMPLEMENTED YET** | 2 | Placeholder, not implemented | Archive or delete |

**Total Archive Impact:** 20 cases removed from active suite

---

### 3. REDISTRIBUTE Operations (Orphaned/Generic)

| Section | Cases | Issue | Action |
|---------|-------|-------|--------|
| **Desktop** | 10 | Too generic, no feature context | Review each case, redistribute to appropriate feature suite (e.g., Cart, Catalog, Checkout) |
| **Mobile** | 12 | Too generic, no feature context | Review each case, redistribute to appropriate feature suite |
| **Dashboard** | 1 | Single orphaned case | Review: if valid, move to appropriate suite; if obsolete, archive |
| **Pages** | 1 | Too generic | Review: if valid, move to appropriate suite; if obsolete, archive |
| **Products** | 5 | Too generic | Redistribute to Suite 4 (Product Details) |
| **Validation** | 11 | No context - validation of what? | Review and redistribute to Cart (validation), Checkout (validation), etc. |
| **Filters** | 2 | Duplicate of "Filters (Desktop and Mobile)" | Merge with "Filters (Desktop and Mobile)" in Suite 3 |
| **Search** | 3 | Isolated cases, likely fit into broader search section | Merge into "Search" in Suite 3 |

**Total Redistribute Impact:** ~50 cases need review and reassignment

---

### 4. REVIEW Operations (Potential Issues)

| Section/Suite | Cases | Issue | Recommendation |
|--------------|-------|-------|----------------|
| **Login by token** | 6 | May be developer-level tests, not QA scope | Review with qa-backend-expert: if API unit tests, archive; if integration tests, keep |
| **Quantity validation** | 25 | "Quantity validation errors" (13) + "Quantity validation errors (new)" (12) = potential duplicates | Review for duplicate test coverage, merge if overlap |
| **Save for later** | 60 | Scattered across 5 sections, high case count | Review for duplicates, consolidate into 2-3 clear subsections |
| **Payment** | 95+ | Cases split between "Step 4 Payment" and individual payment methods (AuthorizeNet, Skyflow, etc.) | Review for duplication, ensure payment method tests are in both integration and isolated contexts |
| **Orders** | 80 | Seems low for full order management feature | Review: are we missing company orders, order status updates, order cancellations? |
| **Branch availability** | 9 | Unclear if belongs in BOPIS or Product Details | Review with qa-frontend-expert, assign to correct suite |
| **Localization** | 60 | Expected ~100+ cases for 13 languages | Review: are language-specific tests missing? Should we expand? |

---

## Migration Plan

### Phase 1: Analysis & Approval (Week 1)
- [ ] Review this proposal with qa-lead-orchestrator
- [ ] Get approval from QA team and stakeholders
- [ ] Finalize suite structure and naming

### Phase 2: Cleanup & Merge (Week 2)
- [ ] Archive deprecated test cases (20 cases)
- [ ] Merge duplicate sections (review ~300 cases, remove ~100-150 duplicates)
- [ ] Redistribute orphaned/generic cases (~50 cases)
- [ ] Review flagged sections (7 areas)

### Phase 3: Reorganization (Week 3)
- [ ] Create new suite structure in TestRail/test repository
- [ ] Move test cases to new suites/subsections
- [ ] Update test case IDs and references
- [ ] Update traceability matrices

### Phase 4: Documentation (Week 4)
- [ ] Update test plan documents to reference new suite structure
- [ ] Create suite execution guides (which suites to run for which releases)
- [ ] Train QA team on new structure
- [ ] Document suite ownership (which specialist owns which suite)

### Phase 5: Validation (Week 5)
- [ ] Execute smoke tests (Suite 1) to validate reorganization
- [ ] Execute one full suite (Suite 6 - Checkout) as pilot
- [ ] Gather feedback from QA team
- [ ] Make adjustments as needed

### Phase 6: Rollout (Week 6)
- [ ] Officially adopt new suite structure
- [ ] Deprecate old Frontend26-02.csv structure
- [ ] Update CI/CD pipelines to reference new suites
- [ ] Update regression test schedule

---

## Benefits of Reorganization

### 1. Targeted Regression Testing
**Before:** "Run Frontend26-02.csv" (1,874 cases, ~40 hours, all or nothing)

**After:**
- Daily: Suite 1 (Smoke Tests) - 50 cases, 1 hour
- Sprint: Suites 1, 6, 8 (Smoke + Checkout + Orders) - ~410 cases, 8 hours
- Release: Suites 1-13 (Full regression) - ~1,710 cases, 35 hours

### 2. Clear Ownership
Each suite assigned to specialist with relevant expertise:
- qa-frontend-expert: Suites 3, 4, 5, 7, 9, 11 (frontend-heavy)
- qa-backend-expert: Suites 2, 8, 10, 13 (backend/API-heavy)
- ui-ux-expert: Suite 12 (accessibility, browser compat)
- Shared ownership: Suite 6 (checkout requires both)

### 3. Reduced Duplication
- **Before:** ~200+ cases affected by duplication/poor organization
- **After:** ~100-150 duplicate cases removed, ~50 cases redistributed

### 4. Improved Maintainability
- 252 sections → 13 suites (95% reduction in top-level organization)
- Clear subsection hierarchy within each suite
- Consistent naming conventions
- Easy to add new test cases (clear feature home)

### 5. Faster Bug Triage
- Bug in checkout? Run Suite 6 (280 cases, 6 hours)
- Bug in BOPIS? Run Suite 7 (125 cases, 3 hours)
- Bug in authentication? Run Suite 2 (120 cases, 2.5 hours)

### 6. Better Test Metrics
- Coverage by feature (13 suites vs 252 sections)
- Pass rate by feature (identify weak areas)
- Defect density by feature (prioritize hardening)

---

## Success Metrics

### Key Performance Indicators (KPIs)

| Metric | Current (Frontend26-02.csv) | Target (Reorganized) |
|--------|---------------------------|---------------------|
| **Top-level sections** | 252 | 13 |
| **Duplicate test cases** | ~150 | 0 |
| **Deprecated test cases** | 20 | 0 (archived) |
| **Orphaned test cases** | ~50 | 0 (redistributed) |
| **Average test cases per section** | 7.4 | 130 |
| **Time to find test case** | 5-10 minutes | 1-2 minutes |
| **Time to execute targeted regression** | N/A (all or nothing) | 1-8 hours (suite-based) |
| **Suite ownership clarity** | 0% (no ownership) | 100% (all suites assigned) |

### Validation Criteria (Pass/Fail)

**Reorganization is successful if:**
- ✅ All 1,874 test cases accounted for (moved, archived, or merged)
- ✅ No test cases lost or missing
- ✅ Duplicate test coverage identified and removed
- ✅ All 13 suites have clear owner assigned
- ✅ QA team can execute any suite independently
- ✅ Test case discovery time reduced by 50%+
- ✅ Zero deprecated test cases in active suites

---

## Recommendations

### Immediate Actions (Week 1-2)
1. **Approve this proposal** - Get sign-off from qa-lead-orchestrator and QA team
2. **Archive deprecated cases** - Remove 20 deprecated cases immediately
3. **Merge critical duplicates** - Start with "Change Password", "Cart", "Product Page" (highest duplication)

### Short-term Actions (Week 3-6)
4. **Execute full reorganization** - Follow migration plan (Phases 1-6)
5. **Pilot new structure** - Execute Suite 6 (Checkout) as validation
6. **Train QA team** - Workshop on new suite structure and execution strategy

### Long-term Actions (Next Quarter)
7. **Quarterly review** - Review suite structure quarterly, adjust as features evolve
8. **Expand localization testing** - Suite 13 seems light, expand to 100+ cases for 13 languages
9. **Performance testing suite** - Consider separate suite for performance (currently scattered)
10. **API testing suite** - Consider separate backend API suite (currently mixed with UI)

---

## Appendix A: Section Mapping Reference

### Complete Mapping: Old Section → New Suite

| Old Section (252 total) | Cases | New Suite | New Subsection |
|------------------------|-------|-----------|----------------|
| Add Product to cart | 41 | Suite 5: Shopping Cart | Add to Cart |
| Add Product from Category (Desktop+Mobile) | 3 | Suite 5: Shopping Cart | Add to Cart |
| Add product from the Product page | 4 | Suite 5: Shopping Cart | Add to Cart |
| Can not add product to the cart | 4 | Suite 5: Shopping Cart | Add to Cart |
| Adding Configurable Product with Different options | 3 | Suite 5: Shopping Cart | Add to Cart |
| Addresses (personal) | 16 | Suite 2: Authentication | Profile Management |
| Anonymous user access to the store | 2 | Suite 2: Authentication | Login & Authentication |
| Attachment in quote | 12 | Suite 10: B2B Features | Quote Requests |
| AuthorizeNet | 16 | Suite 6: Checkout & Payment | Payment Processing |
| Azure Active Directory > Main logic | 6 | Suite 2: Authentication | Single Sign-On (SSO) |
| B2C variation layout | 41 | Suite 4: Product Details | Variations |
| Back-In-Stock-List | 11 | Suite 9: Lists & Wishlists | Back-in-Stock & Notifications |
| Barcode scanner | 10 | Suite 3: Catalog & Search | Search |
| Block user | 4 | Suite 10: B2B Features | Company Management |
| BOPIS Order Status | 14 | Suite 7: BOPIS | BOPIS Order Flow |
| Branch availability > Category page | 9 | Suite 4: Product Details (or Suite 7: BOPIS - TBD) | Product Availability & Pricing |
| Branch info page | 7 | Suite 4: Product Details (or Suite 7: BOPIS - TBD) | Product Availability & Pricing |
| Browser notifications | 6 | Suite 12: UI/UX | Notifications |
| Bulk order (Desktop+Mobile) | 11 | Suite 10: B2B Features | Bulk Order |
| Cart | 21 | Suite 5: Shopping Cart | Cart Display & Operations |
| Cart page | 13 | Suite 5: Shopping Cart | Cart Display & Operations |
| Cart page (Single page checkout) | 7 | Suite 6: Checkout & Payment | Single Page Checkout |
| Catalog | 2 | Suite 3: Catalog & Search | Catalog & Category Pages |
| Catalog drop-down (linked list categories) | 11 | Suite 3: Catalog & Search | Catalog Navigation |
| Catalog drop-down (main navigation) | 8 | Suite 3: Catalog & Search | Catalog Navigation |
| Catalog page | 6 | Suite 3: Catalog & Search | Catalog & Category Pages |
| Catalog page (Add to cart/Update cart) | 14 | Suite 3: Catalog & Search | Catalog & Category Pages |
| Category page | 6 | Suite 3: Catalog & Search | Catalog & Category Pages |
| Category selector | 5 | Suite 3: Catalog & Search | Catalog & Category Pages |
| Change Password | 8 | Suite 2: Authentication | Password Management |
| Change password | 5 | Suite 2: Authentication | Password Management |
| Checkbox 'Same as shipping address' | 3 | Suite 6: Checkout & Payment | Delivery Options & Addresses |
| Checkout defaults [deprecated] | 2 | **ARCHIVE** | **Deprecated** |
| Checkout from shopping list | 30 | Suite 9: Lists & Wishlists | Checkout from List |
| City Filter Search | 2 | Suite 7: BOPIS | Filters & Facets |
| Company > White Labeling from backend | 5 | Suite 10: B2B Features | White Labeling |
| Company address in checkout | 4 | Suite 6: Checkout & Payment | Delivery Options & Addresses |
| Company info | 18 | Suite 10: B2B Features | Company Management |
| Company Logo | 10 | Suite 10: B2B Features | Company Management |
| Company members | 16 | Suite 10: B2B Features | Company Management |
| Compare products (Desktop and mobile) | 11 | Suite 13: Localization | Product Comparison |
| Configurable product > File section | 13 | Suite 4: Product Details | Configurable Products |
| Configurable product > Product section | 8 | Suite 4: Product Details | Configurable Products |
| Configurable product > Text section | 15 | Suite 4: Product Details | Configurable Products |
| Corporate (Desktop+Mobile) | 2 | Suite 10: B2B Features | Company Management |
| Country Filter Search | 6 | Suite 7: BOPIS | Filters & Facets |
| Credit Card | 4 | Suite 6: Checkout & Payment | Payment Processing |
| Cross-Filter Interactions | 5 | Suite 7: BOPIS | Filters & Facets |
| Dashboard | 1 | **REDISTRIBUTE** | **Review & reassign** |
| Datatrance | 1 | Suite 6: Checkout & Payment | Payment Processing |
| Default variation layout | 14 | Suite 4: Product Details | Variations |
| Deleted product | 9 | Suite 4: Product Details | Deleted Products |
| Delivery option: Pickup | 10 | Suite 6: Checkout & Payment | Delivery Options & Addresses |
| Delivery option: Pickup (Google Maps = OFF) | 10 | Suite 6: Checkout & Payment | Delivery Options & Addresses |
| Delivery option: select address for checkout | 32 | Suite 6: Checkout & Payment | Delivery Options & Addresses |
| Delivery option: Shipping | 30 | Suite 6: Checkout & Payment | Delivery Options & Addresses |
| Desktop | 10 | **REDISTRIBUTE** | **Review & reassign to feature suites** |
| Digital product (Single page checkout) | 6 | Suite 6: Checkout & Payment | Single Page Checkout |
| Digital product in cart | 6 | Suite 5: Shopping Cart | Special Cart Scenarios |
| Digital products | 8 | Suite 4: Product Details | Product Block View |
| Displaying price including/excluding VAT | 14 | Suite 13: Localization | VAT & Pricing Display |
| Email verification | 6 | Suite 2: Authentication | Registration & Email Verification |
| Environment Setup | 4 | Suite 7: BOPIS | Environment & Index Management |
| Error pages | 4 | Suite 12: UI/UX | Error Pages |
| Extra/comment block (Desktop+Mobile) | 3 | Suite 6: Checkout & Payment | Single Page Checkout |
| Facets > Show qty of facets applied | 8 | Suite 3: Catalog & Search | Filters & Facets |
| Favorite address | 4 | Suite 6: Checkout & Payment | Delivery Options & Addresses |
| Filter | 8 | Suite 8: Orders | Order Filters & Search |
| Filters | 2 | Suite 3: Catalog & Search | Filters & Facets |
| Filters (Desktop and Mobile) | 18 | Suite 3: Catalog & Search | Filters & Facets |
| Filters block (Desktop+Mobile) | 9 | Suite 3: Catalog & Search | Filters & Facets |
| Footer | 7 | Suite 12: UI/UX | Footer |
| Footer links | 4 | Suite 12: UI/UX | Footer |
| Forgot password | 4 | Suite 2: Authentication | Password Management |
| Forgot password > validation | 4 | Suite 2: Authentication | Password Management |
| Gift | 4 | Suite 6: Checkout & Payment | Single Page Checkout |
| Gifts | 2 | Suite 6: Checkout & Payment | Single Page Checkout |
| Global search | 1 | Suite 3: Catalog & Search | Search |
| Google SSO > Main logic | 8 | Suite 2: Authentication | Single Sign-On (SSO) |
| Grouping items by vendor | 12 | Suite 5: Shopping Cart | Cart Functionality |
| Header | 5 | Suite 12: UI/UX | Header & Navigation |
| Header > For anonymous | 1 | Suite 12: UI/UX | Header & Navigation |
| Header > logged in user | 5 | Suite 12: UI/UX | Header & Navigation |
| Hints | 24 | Suite 9: Lists & Wishlists | Back-in-Stock & Notifications |
| Horizontal linked list menu | 9 | Suite 3: Catalog & Search | Catalog Navigation |
| Hotjar | 2 | Suite 11: Analytics | Hotjar |
| Index Management | 2 | Suite 7: BOPIS | Environment & Index Management |
| Invite members | 10 | Suite 10: B2B Features | Company Management |
| Keyboard Navigation | 6 | Suite 3: Catalog & Search | Catalog & Category Pages |
| Limits (deprecated) | 8 | **ARCHIVE** | **Deprecated** |
| Limits (new design) Category page + product page | 21 | Suite 5: Shopping Cart | Validation |
| List detail page (Add to cart/Update cart) | 14 | Suite 9: Lists & Wishlists | List Operations |
| List with products | 12 | Suite 9: Lists & Wishlists | List Creation & Management |
| Login | 11 | Suite 2: Authentication | Login & Authentication |
| Login by token | 6 | Suite 2: Authentication | Login & Authentication (or **ARCHIVE** - TBD) |
| Login on behalf | 5 | Suite 2: Authentication | Login & Authentication |
| Main functionality | 12 | Suite 5: Shopping Cart | Save for Later |
| Marketing for selected items | 6 | Suite 5: Shopping Cart | Special Cart Scenarios |
| Mega menu | 21 | Suite 3: Catalog & Search | Catalog Navigation |
| Merge carts | 19 | Suite 5: Shopping Cart | Cart Functionality |
| Min-max, pack size validation | 9 | Suite 5: Shopping Cart | Validation |
| Mobile | 12 | **REDISTRIBUTE** | **Review & reassign to feature suites** |
| Mobile sticky header | 8 | Suite 12: UI/UX | Header & Navigation |
| Multi Organization Support | 5 | Suite 10: B2B Features | Multi-Organization Support |
| Multi-organization support > Lists | 2 | Suite 9: Lists & Wishlists (cross-reference) | Back-in-Stock & Notifications |
| Multi-organizations > Search the org in the list | 16 | Suite 10: B2B Features | Multi-Organization Support |
| Multi-step checkout > Cart | 29 | Suite 6: Checkout & Payment | Multi-step Checkout |
| Multiselect in cart | 9 | Suite 5: Shopping Cart | Cart Display & Operations |
| My product | 12 | Suite 6: Checkout & Payment | Single Page Checkout |
| Notification about password expiration | 2 | Suite 2: Authentication | Password Management |
| Notifications > Bell and pop-up | 15 | Suite 12: UI/UX | Notifications |
| Notifications archive/history | 12 | Suite 12: UI/UX | Notifications |
| Order creation flow | 1 | Suite 6: Checkout & Payment | Order Creation |
| Order details page | 8 | Suite 8: Orders | Order Details |
| Order History | 2 | Suite 8: Orders | Order History & List |
| Order history | 2 | Suite 8: Orders | Order History & List |
| Order summary (Desktop+Mobile) | 5 | Suite 6: Checkout & Payment | Single Page Checkout |
| Orders (Desktop+Mobile) | 17 | Suite 8: Orders | Order History & List |
| other NOT IMPLEMENTED YET | 2 | **ARCHIVE** | **Not implemented** |
| Pages | 1 | **REDISTRIBUTE** | **Review & reassign** |
| Pagination | 4 | Suite 3: Catalog & Search | Sorting & Pagination |
| Payment details (Desktop+Mobile) | 12 | Suite 6: Checkout & Payment | Single Page Checkout |
| Payment form > checkout / payment page | 19 | Suite 6: Checkout & Payment | Payment Processing |
| Payment method is deactivated from Store | 6 | Suite 6: Checkout & Payment | Order Creation |
| Permissions | 3 | Suite 2: Authentication | Profile Management |
| Personal lists | 9 | Suite 9: Lists & Wishlists | List Creation & Management |
| Physical product > track inventory = false | 5 | Suite 4: Product Details | Product Block View |
| Pickup Points - Availability | 2 | Suite 7: BOPIS | Map & Location Selection |
| Pickup Points - Basic Filters | 6 | Suite 7: BOPIS | Filters & Facets |
| Pickup Points - Edge Cases | 5 | Suite 7: BOPIS | Edge Cases |
| Pickup Points - Multi-Filter Search | 6 | Suite 7: BOPIS | Filters & Facets |
| Pickup Points - Multiple Choice | 4 | Suite 7: BOPIS | Map & Location Selection |
| Pickup Points - Search | 11 | Suite 7: BOPIS | Pickup Location Search |
| Pickup Points - Selection | 4 | Suite 7: BOPIS | Map & Location Selection |
| Pickup Points - UI/UX | 3 | Suite 7: BOPIS | UI/UX & Accessibility |
| Print from lists after "Add all to cart" | 4 | Suite 9: Lists & Wishlists | Back-in-Stock & Notifications |
| Print from the Order | 4 | Suite 8: Orders | Order Actions |
| Private list details | 5 | Suite 9: Lists & Wishlists | List Creation & Management |
| Product availability in cart | 5 | Suite 5: Shopping Cart | Cart Functionality |
| Product block view | 8 | Suite 4: Product Details | Product Block View |
| Product page | 19 | Suite 4: Product Details | Product Detail Page (PDP) |
| Product page (Desktop+Mobile) | 19 | Suite 4: Product Details | Product Detail Page (PDP) |
| Product page actions (Desktop+Mobile) | 10 | Suite 4: Product Details | Product Detail Page (PDP) |
| Product/Variation page (Add to cart/Update cart) | 14 | Suite 4: Product Details (cross-ref Suite 5) | Product Detail Page (PDP) |
| Products | 5 | **REDISTRIBUTE** | **Move to Suite 4** |
| Profile | 10 | Suite 2: Authentication | Profile Management |
| Purchased Before | 6 | Suite 3: Catalog & Search | Filters & Facets |
| Qty input field | 12 | Suite 5: Shopping Cart | Update Quantities |
| Quantity validation errors | 13 | Suite 5: Shopping Cart | Validation |
| Quantity validation errors (new) | 12 | Suite 5: Shopping Cart | Validation (review for duplicates) |
| Quote history page | 6 | Suite 10: B2B Features | Quote Requests |
| Quote request (Desktop+ Mobile) | 9 | Suite 10: B2B Features | Quote Requests |
| Quote request page | 11 | Suite 10: B2B Features | Quote Requests |
| Quote requests (Desktop+Mobile) | 4 | Suite 10: B2B Features | Quote Requests |
| Quote review | 4 | Suite 10: B2B Features | Quote Requests |
| Recommend Products Related to this item | 3 | Suite 4: Product Details | Related & Recommended Products |
| Registration (Desktop+Mobile) | 5 | Suite 2: Authentication | Registration & Email Verification |
| Related products (Desktop+Mobile) | 12 | Suite 4: Product Details | Related & Recommended Products |
| Reorder all | 8 | Suite 8: Orders | Reorder |
| Reorder all (deprecated) | 8 | **ARCHIVE** | **Deprecated** |
| Routing | 6 | Suite 1: Smoke Tests | Critical Paths |
| Save Changes Pop-up | 7 | Suite 6: Checkout & Payment | Validation & Security |
| Save for later - Display All - Management in my account | 8 | Suite 5: Shopping Cart | Save for Later |
| Save for later > Multi-currency support | 1 | Suite 5: Shopping Cart | Save for Later |
| Saved Credit Cards | 3 | Suite 6: Checkout & Payment | Payment Processing |
| Saved for later block in cart | 7 | Suite 5: Shopping Cart | Save for Later |
| Saver for later > Unavailable products | 12 | Suite 5: Shopping Cart | Save for Later |
| Search | 3 | Suite 3: Catalog & Search | Search |
| Search > No results page | 8 | Suite 3: Catalog & Search | Search |
| Search by facets value (Desktop + Mobile) | 11 | Suite 3: Catalog & Search | Filters & Facets |
| Search drop-down | 8 | Suite 3: Catalog & Search | Search |
| Search Field UI/UX | 3 | Suite 7: BOPIS (or Suite 3) | Pickup Location Search |
| Search in Category by Keyword | 15 | Suite 3: Catalog & Search | Search |
| Select/Unselect | 5 | Suite 5: Shopping Cart | Cart Functionality |
| SEO | 5 | Suite 3: Catalog & Search | Catalog & Category Pages |
| Sharing options | 3 | Suite 9: Lists & Wishlists | List Sharing |
| Sharing options: Anyone (read-only) | 22 | Suite 9: Lists & Wishlists | List Sharing |
| Sharing options: Organization | 14 | Suite 9: Lists & Wishlists | List Sharing |
| Sharing options: Private | 7 | Suite 9: Lists & Wishlists | List Sharing |
| Shipping address selection | 7 | Suite 12: UI/UX | Header & Navigation |
| Sign in form (on the Main and Sign in pages) (Desktop+Mobile) | 7 | Suite 2: Authentication | Login & Authentication |
| Sign-in under Organization account | 7 | Suite 10: B2B Features | Multi-Organization Support |
| Single sign-in option (SSO) | 8 | Suite 2: Authentication | Single Sign-On (SSO) |
| Skyflow | 6 | Suite 6: Checkout & Payment | Payment Processing |
| Sorting (Desktop and Mobile) | 7 | Suite 3: Catalog & Search | Sorting & Pagination |
| Sorting facets | 3 | Suite 3: Catalog & Search | Sorting & Pagination |
| State/Province Filter Search | 2 | Suite 7: BOPIS | Filters & Facets |
| Step 1 Shipping | 41 | Suite 6: Checkout & Payment | Multi-step Checkout |
| Step 2 Billing | 14 | Suite 6: Checkout & Payment | Multi-step Checkout |
| Step 3 Order review | 11 | Suite 6: Checkout & Payment | Multi-step Checkout |
| Step 4 Payment (Dynamic step) | 95 | Suite 6: Checkout & Payment | Payment Processing |
| Step 5 Completed | 3 | Suite 6: Checkout & Payment | Multi-step Checkout |
| Store > White Labeling | 3 | Suite 10: B2B Features | White Labeling |
| Store default currency | 11 | Suite 13: Localization | Currency Management |
| Subtotal by Vendor. Order summary | 3 | Suite 6: Checkout & Payment | Single Page Checkout |
| 3D Secure | 2 | Suite 6: Checkout & Payment | Payment Processing |
| Unavailable product variation | 2 | Suite 4: Product Details | Product Block View |
| Unavailable products | 6 | Suite 5: Shopping Cart | Special Cart Scenarios |
| Update amount of the product (Desktop+Mobile) | 4 | Suite 5: Shopping Cart | Update Quantities |
| Update List | 11 | Suite 9: Lists & Wishlists | List Operations |
| User's default currency | 7 | Suite 13: Localization | Currency Management |
| Validation | 11 | **REDISTRIBUTE** | **Review & reassign to feature suites** |
| Validation > Sign in form (Desktop+Mobile) | 3 | Suite 2: Authentication | Validation |
| Validation (Desktop+Mobile) (Add from Category+ Add from Product page) | 3 | Suite 5: Shopping Cart | Validation |
| Validation informer | 10 | Suite 5: Shopping Cart | Validation |
| Variations cards | 3 | Suite 4: Product Details | Variations |
| VCST-4499 BOPIS Map Modal | 16 | Suite 7: BOPIS | Map & Location Selection |
| View | 3 | Suite 3: Catalog & Search | Catalog & Category Pages |
| White Labeling | 2 | Suite 10: B2B Features | White Labeling |
| Wish-list | 2 | Suite 9: Lists & Wishlists (or archived?) | Back-in-Stock & Notifications |
| **All GA4 event sections** | **43** | **Suite 11: Analytics** | **Various GA4 subsections** |
| **All BOPIS-related sections** | **~125** | **Suite 7: BOPIS** | **Various BOPIS subsections** |
| **All test case type sections (1-8)** | **~50** | **Suite 6: Checkout & Payment** | **Validation & Security** |

**Note:** This is a reference table for migration - not all 252 sections listed individually due to length, but pattern is clear.

---

## Appendix B: Execution Strategies by Release Type

### Daily Deployment (30 min)
**Goal:** Validate critical functionality is working

**Suites to Run:**
- Suite 1: Smoke Tests (50 cases, P0/P1 only)

**Estimated Time:** 30 minutes
**Execution:** Automated CI/CD pipeline

---

### Sprint Release (4 hours)
**Goal:** Validate sprint changes + critical paths

**Suites to Run:**
1. Suite 1: Smoke Tests (50 cases)
2. Suite 6: Checkout & Payment (P0/P1 only, ~60 cases)
3. Suite 5: Shopping Cart (P0/P1 only, ~40 cases)
4. Suite 8: Orders (P1 only, ~10 cases)
5. Targeted suite(s) based on sprint scope (e.g., if BOPIS changes, run Suite 7)

**Estimated Time:** 4 hours
**Execution:** Manual + automated (where available)

---

### Minor Release (12 hours)
**Goal:** Comprehensive regression, all critical + high priority

**Suites to Run:**
1. Suite 1: Smoke Tests (all)
2. All other suites (P0/P1 only)

**Estimated Time:** 12 hours
**Execution:** Parallel execution by QA team (3-4 specialists)

---

### Major Release (35 hours)
**Goal:** Full regression, all test cases

**Suites to Run:**
- All 13 suites (all priorities: P0, P1, P2, P3)

**Estimated Time:** 35 hours
**Execution:** Parallel execution by full QA team (5-6 specialists), 2-3 days

---

### Targeted Testing (Variable)
**Goal:** Test specific feature after bug fix or hotfix

**Approach:**
- Bug in authentication? → Run Suite 2 (2.5 hours)
- Bug in BOPIS? → Run Suite 7 (3 hours)
- Bug in checkout? → Run Suite 6 (6 hours)

**Estimated Time:** 1-8 hours (depending on suite)
**Execution:** Manual, assigned specialist

---

## Conclusion

This reorganization transforms a fragmented, difficult-to-maintain test suite structure (252 sections, 1,874 cases) into a logical, feature-based organization (13 suites, ~1,710 cases after cleanup). The benefits include:

- **95% reduction in top-level sections** (252 → 13)
- **~100-150 duplicate test cases removed**
- **20 deprecated test cases archived**
- **Clear ownership** for each suite
- **Targeted regression testing** capability
- **Improved maintainability** and test case discovery

**Next Steps:**
1. Review and approve this proposal
2. Begin Phase 1: Archive deprecated cases (Week 1)
3. Execute full migration plan (Weeks 2-6)
4. Pilot new structure with Suite 6 execution (Week 5)
5. Rollout to full QA team (Week 6)

**Timeline:** 6 weeks from approval to full rollout

**Effort:** ~80 hours (test-management-specialist) + ~20 hours (qa-lead-orchestrator review/approval) + ~10 hours (QA team training)

---

**Document Status:** DRAFT - Awaiting Approval
**Prepared By:** test-management-specialist
**Review Required:** qa-lead-orchestrator, QA Team
**Target Approval Date:** 2026-02-16
