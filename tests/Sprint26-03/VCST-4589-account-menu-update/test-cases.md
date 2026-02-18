# Test Cases: VCST-4589 - Account Left Rail Menu Update

## Test Information

| Field | Value |
|-------|-------|
| **JIRA Ticket** | [VCST-4589](https://virtocommerce.atlassian.net/browse/VCST-4589) |
| **GitHub PR** | [#2179](https://github.com/VirtoCommerce/vc-frontend/pull/2179) |
| **Total Test Cases** | 44 |
| **Created By** | test-management-specialist |
| **Date** | 2026-02-18 |

---

## Menu Structure Baseline (BEFORE PR #2179)

### Desktop Account Menu - Flat Structure
```
account (root)
├── Dashboard (priority: 10)
├── Profile (priority: 20)
├── Change Password (priority: 30)
├── Addresses (priority: 40)
├── Orders (priority: 50)
├── Saved for Later (priority: 55)
├── Lists (priority: 60)
└── Saved Credit Cards (priority: 80)
```

**Total items:** 8 (flat, no grouping)

---

## Menu Structure Target (AFTER PR #2179)

### Desktop Account Menu - Grouped Structure
```
Purchasing (new group)
├── Dashboard (priority: 10)
├── Orders (priority: 20)
├── Lists (priority: 30)
└── Saved for Later (priority: 60)

Marketing (new group, empty placeholder)
└── (empty - reserved for VCST-4590)

User (new group)
├── Profile (priority: 10)
├── Addresses (priority: 20)
├── Change Password (priority: 30)
└── Saved Credit Cards (priority: 40)

Corporate (existing, unchanged)
├── Company Info
└── Company Members
```

**Total items:** 8 menu items organized into 3 groups + Corporate

---

## Section 1: Menu Structure (7 test cases)

---

### TC-VCST-4589-001: Verify "Purchasing" group exists and displays correctly

**Priority:** P0 (Critical)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment is accessible at `${FRONT_URL}` (from .env)
2. Test user logged in: `${USER_EMAIL}` / `${USER_PASSWORD}` (from .env)
3. User navigates to Account area

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `${FRONT_URL}` | Homepage loads successfully |
| 2 | Log in with test user credentials | User logged in, homepage displays |
| 3 | Click on Account icon/link in header | Account dashboard loads |
| 4 | Inspect left rail menu | Menu displays with visible sections |
| 5 | Locate "Purchasing" group in menu | "Purchasing" group header visible<br>- Group title: "Purchasing" or translated key `shared.account.navigation.purchasing_title`<br>- Group is collapsed or expanded (depending on design)<br>- Group icon present (if specified) |
| 6 | Verify "Purchasing" group position | "Purchasing" appears as first menu group (above User, Marketing, Corporate) |

**Expected Result:**
- "Purchasing" menu group exists
- Group displays with correct title
- Group positioned as first group in menu hierarchy

**Pass/Fail Criteria:**
- **PASS:** "Purchasing" group displays with correct title and positioning
- **FAIL:** Group missing, title incorrect, or positioned incorrectly

**Test Data:**
- None required

---

### TC-VCST-4589-002: Verify "Purchasing" group contains correct menu items

**Priority:** P0 (Critical)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. "Purchasing" group visible in left rail menu

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Expand "Purchasing" group (if collapsed) | Group expands to show child items |
| 2 | Count menu items in "Purchasing" group | Exactly 4 menu items displayed |
| 3 | Verify item 1: Dashboard | Item label: "Dashboard" or `shared.account.navigation.links.dashboard`<br>Icon: dashboard-2<br>Priority: 10 (first in list) |
| 4 | Verify item 2: Orders | Item label: "Orders" or `shared.account.navigation.links.orders`<br>Icon: clipboard-list<br>Priority: 20 (second in list) |
| 5 | Verify item 3: Lists | Item label: "Lists" or `shared.account.navigation.links.lists`<br>Icon: list-v2<br>Priority: 30 (third in list) |
| 6 | Verify item 4: Saved for Later | Item label: "Saved for Later" or `shared.layout.header.mobile.account_menu.saved_for_later`<br>Icon: bookmark-solid<br>Priority: 60 (fourth in list) |
| 7 | Verify menu item ordering | Items appear in order: Dashboard → Orders → Lists → Saved for Later |

**Expected Result:**
- "Purchasing" group contains exactly 4 items
- Items: Dashboard, Orders, Lists, Saved for Later
- Items display in correct order based on priority
- Each item has correct icon and label

**Pass/Fail Criteria:**
- **PASS:** All 4 items present with correct labels, icons, and order
- **FAIL:** Missing items, incorrect labels, wrong icons, or incorrect order

**Test Data:**
- None required

---

### TC-VCST-4589-003: Verify "User" group exists and contains correct menu items

**Priority:** P0 (Critical)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Left rail menu visible

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Locate "User" group in left rail menu | "User" group header visible<br>- Group title: "User" or `shared.account.navigation.user_title`<br>- Group positioned after "Purchasing" and "Marketing" |
| 2 | Expand "User" group (if collapsed) | Group expands to show child items |
| 3 | Count menu items in "User" group | Exactly 4 menu items displayed |
| 4 | Verify item 1: Profile | Item label: "Profile" or `shared.account.navigation.links.profile`<br>Icon: profile<br>Priority: 10 (first in list) |
| 5 | Verify item 2: Addresses | Item label: "Addresses" or `shared.account.navigation.links.addresses`<br>Icon: source-environment<br>Priority: 20 (second in list) |
| 6 | Verify item 3: Change Password | Item label: "Change Password" or `shared.account.navigation.links.change_password`<br>Icon: pass<br>Priority: 30 (third in list) |
| 7 | Verify item 4: Saved Credit Cards | Item label: "Saved Credit Cards" or `shared.account.navigation.links.saved_credit_cards`<br>Icon: credit-card<br>Priority: 40 (fourth in list) |
| 8 | Verify menu item ordering | Items appear in order: Profile → Addresses → Change Password → Saved Credit Cards |

**Expected Result:**
- "User" group exists with correct title
- Group contains exactly 4 items
- Items: Profile, Addresses, Change Password, Saved Credit Cards
- Items display in correct order based on priority
- Each item has correct icon and label

**Pass/Fail Criteria:**
- **PASS:** All 4 items present with correct labels, icons, and order
- **FAIL:** Group missing, items missing, incorrect labels, wrong icons, or incorrect order

**Test Data:**
- None required

---

### TC-VCST-4589-004: Verify "Marketing" group exists as empty placeholder

**Priority:** P1 (High)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Left rail menu visible

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Locate "Marketing" group in left rail menu | "Marketing" group header visible<br>- Group title: "Marketing" or `shared.account.navigation.marketing_title`<br>- Group positioned between "Purchasing" and "User" groups |
| 2 | Check "Marketing" group children array | Group has empty children array `[]`<br>OR group displays "No items" or similar message |
| 3 | Verify "Marketing" group is collapsible/non-interactive | Group cannot be expanded (no items)<br>OR group shows empty state |

**Expected Result:**
- "Marketing" group exists as placeholder
- Group title displays correctly
- Group has no child menu items (empty)
- Group positioned between "Purchasing" and "User"

**Pass/Fail Criteria:**
- **PASS:** "Marketing" group exists as empty placeholder with correct positioning
- **FAIL:** Group missing, contains items, or positioned incorrectly

**Notes:**
- This group is a placeholder for future coupons/promotions feature (VCST-4590)
- Empty state is expected in this release

**Test Data:**
- None required

---

### TC-VCST-4589-005: Verify "Corporate" group remains unchanged

**Priority:** P1 (High)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Left rail menu visible
4. Test user belongs to an organization (for Corporate menu to be visible)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Locate "Corporate" group in left rail menu | "Corporate" group header visible<br>- Group title: "Corporate" or `shared.layout.header.mobile.corporate`<br>- Group positioned after "User" group |
| 2 | Expand "Corporate" group (if collapsed) | Group expands to show child items |
| 3 | Count menu items in "Corporate" group | Exactly 2 menu items displayed |
| 4 | Verify item 1: Company Info | Item label: "Company Info" or `shared.layout.header.mobile.corporate_menu.company_info`<br>Icon: case |
| 5 | Verify item 2: Company Members | Item label: "Company Members" or `shared.layout.header.mobile.corporate_menu.company_members`<br>Icon: user-group |
| 6 | Compare with baseline | Corporate group structure unchanged from previous menu.json |

**Expected Result:**
- "Corporate" group exists with original structure
- Contains 2 items: Company Info, Company Members
- Icons and labels unchanged
- No regressions introduced

**Pass/Fail Criteria:**
- **PASS:** Corporate group displays exactly as before, no changes
- **FAIL:** Corporate group modified, items missing, or icons/labels changed

**Test Data:**
- Test user must belong to an organization

---

### TC-VCST-4589-006: Verify menu item count and distribution across groups

**Priority:** P1 (High)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. All menu groups visible in left rail

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Count total menu items in "Purchasing" group | 4 items |
| 2 | Count total menu items in "Marketing" group | 0 items (empty) |
| 3 | Count total menu items in "User" group | 4 items |
| 4 | Count total menu items in "Corporate" group | 2 items |
| 5 | Calculate total menu items (excluding Corporate) | 8 items (4 Purchasing + 0 Marketing + 4 User) |
| 6 | Compare with baseline | Baseline: 8 flat items<br>New structure: 8 items in grouped structure<br>**All original menu items preserved** |
| 7 | Verify no menu items were removed | Compare against baseline list:<br>✓ Dashboard<br>✓ Profile<br>✓ Change Password<br>✓ Addresses<br>✓ Orders<br>✓ Saved for Later<br>✓ Lists<br>✓ Saved Credit Cards |

**Expected Result:**
- Total menu items: 8 (same as baseline)
- Distribution: Purchasing (4) + Marketing (0) + User (4) = 8
- No menu items removed or added (only reorganized)
- All original items present in new grouped structure

**Pass/Fail Criteria:**
- **PASS:** 8 total items, correctly distributed, no items lost
- **FAIL:** Item count mismatch, missing items, or unexpected additions

**Test Data:**
- Baseline menu items list (8 items)

---

### TC-VCST-4589-007: Verify menu group hierarchy and nesting

**Priority:** P2 (Medium)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Left rail menu visible

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect menu DOM structure | Menu rendered as nested list or structured hierarchy |
| 2 | Verify "Purchasing" group nesting | "Purchasing" is a parent group<br>Contains 4 child items (Dashboard, Orders, Lists, Saved for Later) |
| 3 | Verify "Marketing" group nesting | "Marketing" is a parent group<br>Contains 0 child items (empty) |
| 4 | Verify "User" group nesting | "User" is a parent group<br>Contains 4 child items (Profile, Addresses, Change Password, Saved Credit Cards) |
| 5 | Verify "Corporate" group nesting | "Corporate" is a parent group<br>Contains 2 child items (Company Info, Company Members) |
| 6 | Verify no deeply nested groups | All menu items are direct children of groups (no sub-sub-groups) |
| 7 | Verify group indentation/visual hierarchy | Child items visually indented or nested under parent groups |

**Expected Result:**
- Menu uses proper parent-child hierarchy
- Groups are parent nodes
- Menu items are child nodes (no deeper nesting)
- Visual hierarchy clear (indentation, spacing)

**Pass/Fail Criteria:**
- **PASS:** Correct hierarchy, proper nesting, clear visual structure
- **FAIL:** Incorrect nesting, flattened structure, or confusing hierarchy

**Test Data:**
- None required

---

## Section 2: Navigation Functionality (14 test cases)

---

### TC-VCST-4589-008: Navigate to Dashboard from Purchasing group

**Priority:** P0 (Critical)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. "Purchasing" group expanded (if collapsible)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on "Dashboard" menu item in "Purchasing" group | Dashboard page loads<br>URL: `${FRONT_URL}/account` or `${FRONT_URL}/dashboard` |
| 2 | Verify page content | Dashboard page displays:<br>- Account overview widgets<br>- Recent orders summary<br>- Quick action buttons<br>- No errors in console |
| 3 | Verify menu state | "Dashboard" menu item highlighted/active<br>Active state styling applied |
| 4 | Verify breadcrumb (if present) | Breadcrumb shows: Home → Account → Dashboard |

**Expected Result:**
- Dashboard page loads successfully
- Correct URL route
- Menu item highlighted as active
- Page content renders without errors

**Pass/Fail Criteria:**
- **PASS:** Dashboard loads, correct URL, menu item active
- **FAIL:** Page doesn't load, wrong URL, or navigation fails

**Test Data:**
- Test user with account access

---

### TC-VCST-4589-009: Navigate to Orders from Purchasing group

**Priority:** P0 (Critical)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. "Purchasing" group expanded

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on "Orders" menu item in "Purchasing" group | Orders page loads<br>URL: `${FRONT_URL}/account/orders` |
| 2 | Verify page content | Orders page displays:<br>- Order history table/list<br>- Order search/filter options<br>- Past orders (if any)<br>- No errors in console |
| 3 | Verify menu state | "Orders" menu item highlighted/active<br>Active state styling applied |
| 4 | Verify breadcrumb (if present) | Breadcrumb shows: Home → Account → Orders |

**Expected Result:**
- Orders page loads successfully
- Correct URL route
- Menu item highlighted as active
- Order list displays (empty or populated)

**Pass/Fail Criteria:**
- **PASS:** Orders page loads, correct URL, menu item active
- **FAIL:** Page doesn't load, wrong URL, or navigation fails

**Test Data:**
- Test user with order history (optional, can be empty)

---

### TC-VCST-4589-010: Navigate to Lists from Purchasing group

**Priority:** P0 (Critical)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. "Purchasing" group expanded

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on "Lists" menu item in "Purchasing" group | Lists page loads<br>URL: `${FRONT_URL}/account/lists` or `${FRONT_URL}/lists` |
| 2 | Verify page content | Lists page displays:<br>- User's saved lists<br>- Create new list button<br>- List management options<br>- No errors in console |
| 3 | Verify menu state | "Lists" menu item highlighted/active<br>Active state styling applied |
| 4 | Verify breadcrumb (if present) | Breadcrumb shows: Home → Account → Lists |

**Expected Result:**
- Lists page loads successfully
- Correct URL route
- Menu item highlighted as active
- Lists display (empty or populated)

**Pass/Fail Criteria:**
- **PASS:** Lists page loads, correct URL, menu item active
- **FAIL:** Page doesn't load, wrong URL, or navigation fails

**Test Data:**
- Test user with saved lists (optional, can be empty)

---

### TC-VCST-4589-011: Navigate to Saved for Later from Purchasing group

**Priority:** P0 (Critical)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. "Purchasing" group expanded

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on "Saved for Later" menu item in "Purchasing" group | Saved for Later page loads<br>URL: `${FRONT_URL}/account/saved-for-later` |
| 2 | Verify page content | Saved for Later page displays:<br>- Saved product items<br>- Move to cart options<br>- Remove item options<br>- No errors in console |
| 3 | Verify menu state | "Saved for Later" menu item highlighted/active<br>Active state styling applied |
| 4 | Verify breadcrumb (if present) | Breadcrumb shows: Home → Account → Saved for Later |

**Expected Result:**
- Saved for Later page loads successfully
- Correct URL route
- Menu item highlighted as active
- Saved items display (empty or populated)

**Pass/Fail Criteria:**
- **PASS:** Saved for Later page loads, correct URL, menu item active
- **FAIL:** Page doesn't load, wrong URL, or navigation fails

**Test Data:**
- Test user with saved items (optional, can be empty)

---

### TC-VCST-4589-012: Navigate to Profile from User group

**Priority:** P0 (Critical)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. "User" group expanded

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on "Profile" menu item in "User" group | Profile page loads<br>URL: `${FRONT_URL}/account/profile` |
| 2 | Verify page content | Profile page displays:<br>- User information form<br>- First name, Last name, Email fields<br>- Edit profile button<br>- No errors in console |
| 3 | Verify menu state | "Profile" menu item highlighted/active<br>Active state styling applied |
| 4 | Verify breadcrumb (if present) | Breadcrumb shows: Home → Account → Profile |

**Expected Result:**
- Profile page loads successfully
- User information displays correctly
- Menu item highlighted as active

**Pass/Fail Criteria:**
- **PASS:** Profile page loads, correct URL, menu item active
- **FAIL:** Page doesn't load, wrong URL, or navigation fails

**Test Data:**
- Test user profile data

---

### TC-VCST-4589-013: Navigate to Addresses from User group

**Priority:** P0 (Critical)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. "User" group expanded

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on "Addresses" menu item in "User" group | Addresses page loads<br>URL: `${FRONT_URL}/account/addresses` |
| 2 | Verify page content | Addresses page displays:<br>- Saved addresses list<br>- Add new address button<br>- Edit/delete address options<br>- No errors in console |
| 3 | Verify menu state | "Addresses" menu item highlighted/active<br>Active state styling applied |
| 4 | Verify breadcrumb (if present) | Breadcrumb shows: Home → Account → Addresses |

**Expected Result:**
- Addresses page loads successfully
- Saved addresses display (empty or populated)
- Menu item highlighted as active

**Pass/Fail Criteria:**
- **PASS:** Addresses page loads, correct URL, menu item active
- **FAIL:** Page doesn't load, wrong URL, or navigation fails

**Test Data:**
- Test user with saved addresses (optional, can be empty)

---

### TC-VCST-4589-014: Navigate to Change Password from User group

**Priority:** P0 (Critical)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. "User" group expanded

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on "Change Password" menu item in "User" group | Change Password page loads<br>URL: `${FRONT_URL}/account/change-password` |
| 2 | Verify page content | Change Password page displays:<br>- Current password field<br>- New password field<br>- Confirm password field<br>- Submit button<br>- No errors in console |
| 3 | Verify menu state | "Change Password" menu item highlighted/active<br>Active state styling applied |
| 4 | Verify breadcrumb (if present) | Breadcrumb shows: Home → Account → Change Password |

**Expected Result:**
- Change Password page loads successfully
- Password change form displays correctly
- Menu item highlighted as active

**Pass/Fail Criteria:**
- **PASS:** Change Password page loads, correct URL, menu item active
- **FAIL:** Page doesn't load, wrong URL, or navigation fails

**Test Data:**
- Test user with password change permissions

---

### TC-VCST-4589-015: Navigate to Saved Credit Cards from User group

**Priority:** P0 (Critical)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. "User" group expanded

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on "Saved Credit Cards" menu item in "User" group | Saved Credit Cards page loads<br>URL: `${FRONT_URL}/account/saved-credit-cards` |
| 2 | Verify page content | Saved Credit Cards page displays:<br>- Saved payment methods list<br>- Add new card button<br>- Card management options<br>- No errors in console |
| 3 | Verify menu state | "Saved Credit Cards" menu item highlighted/active<br>Active state styling applied |
| 4 | Verify breadcrumb (if present) | Breadcrumb shows: Home → Account → Saved Credit Cards |

**Expected Result:**
- Saved Credit Cards page loads successfully
- Payment methods display (empty or populated)
- Menu item highlighted as active

**Pass/Fail Criteria:**
- **PASS:** Saved Credit Cards page loads, correct URL, menu item active
- **FAIL:** Page doesn't load, wrong URL, or navigation fails

**Test Data:**
- Test user with saved payment methods (optional, can be empty)

---

### TC-VCST-4589-016: Navigate to Company Info from Corporate group

**Priority:** P1 (High)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Test user belongs to an organization
4. "Corporate" group expanded

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on "Company Info" menu item in "Corporate" group | Company Info page loads<br>URL: `${FRONT_URL}/company` or `${FRONT_URL}/account/company-info` |
| 2 | Verify page content | Company Info page displays:<br>- Organization details<br>- Company name, address, contact info<br>- Edit options (if permitted)<br>- No errors in console |
| 3 | Verify menu state | "Company Info" menu item highlighted/active<br>Active state styling applied |
| 4 | Verify breadcrumb (if present) | Breadcrumb shows: Home → Account → Company Info |

**Expected Result:**
- Company Info page loads successfully
- Organization details display correctly
- Menu item highlighted as active

**Pass/Fail Criteria:**
- **PASS:** Company Info page loads, correct URL, menu item active
- **FAIL:** Page doesn't load, wrong URL, or navigation fails

**Test Data:**
- Test user with organization membership

---

### TC-VCST-4589-017: Navigate to Company Members from Corporate group

**Priority:** P1 (High)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Test user belongs to an organization
4. "Corporate" group expanded

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on "Company Members" menu item in "Corporate" group | Company Members page loads<br>URL: `${FRONT_URL}/company/members` or `${FRONT_URL}/account/company-members` |
| 2 | Verify page content | Company Members page displays:<br>- Organization members list<br>- Member roles and permissions<br>- Invite/manage options (if permitted)<br>- No errors in console |
| 3 | Verify menu state | "Company Members" menu item highlighted/active<br>Active state styling applied |
| 4 | Verify breadcrumb (if present) | Breadcrumb shows: Home → Account → Company Members |

**Expected Result:**
- Company Members page loads successfully
- Members list displays correctly
- Menu item highlighted as active

**Pass/Fail Criteria:**
- **PASS:** Company Members page loads, correct URL, menu item active
- **FAIL:** Page doesn't load, wrong URL, or navigation fails

**Test Data:**
- Test user with organization membership

---

### TC-VCST-4589-018: Verify active menu item state persists across page navigation

**Priority:** P1 (High)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Dashboard" menu item | Dashboard loads, "Dashboard" item highlighted/active |
| 2 | Click "Orders" menu item | Orders page loads, "Orders" item highlighted/active, "Dashboard" no longer active |
| 3 | Click "Profile" menu item | Profile page loads, "Profile" item highlighted/active, "Orders" no longer active |
| 4 | Click "Addresses" menu item | Addresses page loads, "Addresses" item highlighted/active, "Profile" no longer active |
| 5 | Refresh page on Addresses | Page reloads, "Addresses" item remains highlighted/active |
| 6 | Navigate back to Dashboard | Dashboard loads, "Dashboard" item highlighted/active again |

**Expected Result:**
- Only one menu item active at a time
- Active state updates correctly on navigation
- Active state persists after page refresh
- No multiple items highlighted simultaneously

**Pass/Fail Criteria:**
- **PASS:** Active state updates correctly, only one item active, persists after refresh
- **FAIL:** Multiple items active, state doesn't update, or lost after refresh

**Test Data:**
- None required

---

### TC-VCST-4589-019: Verify menu item clickability and hover states

**Priority:** P2 (Medium)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Hover over "Dashboard" menu item | Hover state styling applied:<br>- Background color change<br>- Text color change (optional)<br>- Cursor changes to pointer |
| 2 | Hover over each menu item in "Purchasing" group | All items show hover state |
| 3 | Hover over each menu item in "User" group | All items show hover state |
| 4 | Hover over each menu item in "Corporate" group | All items show hover state |
| 5 | Click each hovered item | Item navigates to correct page |
| 6 | Verify disabled states (if any) | Disabled items (if any) do not have hover state or pointer cursor |

**Expected Result:**
- All menu items have visible hover state
- Hover state provides visual feedback
- Cursor changes to pointer on hover
- Disabled items (if any) not interactive

**Pass/Fail Criteria:**
- **PASS:** Hover states work correctly for all items
- **FAIL:** Missing hover states, incorrect cursor, or non-functional hovers

**Test Data:**
- None required

---

### TC-VCST-4589-020: Test group expand/collapse functionality (if applicable)

**Priority:** P2 (Medium)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Menu groups have expand/collapse functionality (verify in design)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify initial state of "Purchasing" group | Group is expanded by default (or collapsed, as per design) |
| 2 | Click "Purchasing" group header | Group toggles (expands if collapsed, collapses if expanded)<br>Child items show/hide accordingly |
| 3 | Verify expand/collapse icon | Icon rotates or changes (e.g., chevron down → chevron up) |
| 4 | Click "User" group header | Group toggles independently<br>"Purchasing" state remains unchanged |
| 5 | Collapse all groups | All groups collapsed, no menu items visible |
| 6 | Expand all groups | All groups expanded, all menu items visible |
| 7 | Refresh page | Group states persist (if saved to localStorage/session) or reset to default |

**Expected Result:**
- Groups can be expanded/collapsed independently
- Expand/collapse icons update correctly
- Child items show/hide smoothly
- State persistence matches design intent

**Pass/Fail Criteria:**
- **PASS:** Expand/collapse works for all groups, icons update, smooth transitions
- **FAIL:** Groups don't toggle, icons don't update, or functionality broken

**Notes:**
- If design specifies always-expanded groups, mark this test as N/A

**Test Data:**
- None required

---

### TC-VCST-4589-021: Verify deep linking to account pages

**Priority:** P2 (Medium)
**Type:** Functional
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate directly to `${FRONT_URL}/account/orders` | Orders page loads<br>"Orders" menu item highlighted in "Purchasing" group |
| 2 | Navigate directly to `${FRONT_URL}/account/profile` | Profile page loads<br>"Profile" menu item highlighted in "User" group |
| 3 | Navigate directly to `${FRONT_URL}/account/addresses` | Addresses page loads<br>"Addresses" menu item highlighted in "User" group |
| 4 | Navigate directly to `${FRONT_URL}/account/saved-credit-cards` | Saved Credit Cards page loads<br>"Saved Credit Cards" menu item highlighted in "User" group |
| 5 | Navigate directly to `${FRONT_URL}/account/lists` | Lists page loads<br>"Lists" menu item highlighted in "Purchasing" group |
| 6 | Verify menu consistency | Menu structure displays correctly<br>Correct group highlighted<br>Correct menu item highlighted |

**Expected Result:**
- Deep links to account pages work correctly
- Correct menu item highlighted based on URL
- Menu structure consistent across all pages

**Pass/Fail Criteria:**
- **PASS:** All deep links work, correct menu items highlighted
- **FAIL:** Deep links fail, menu items not highlighted, or incorrect highlighting

**Test Data:**
- Direct URLs to account pages

---

## Section 3: Visual Design (9 test cases)

---

### TC-VCST-4589-022: Verify menu icons match Figma design

**Priority:** P1 (High)
**Type:** Visual
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Figma design accessible: https://www.figma.com/design/ryT9jc1XQ2MxZOD9FLycJc/%F0%9F%94%B6--STOREFRONT-DRAFT-%E2%80%A2-3?node-id=2538-230213&p=f&t=sEQr6Opn4CBuHGGF-0

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Figma design at specified node ID | Design mockup displays account menu |
| 2 | Compare "Dashboard" icon | Icon matches Figma: dashboard-2<br>Icon size, color, style match |
| 3 | Compare "Orders" icon | Icon matches Figma: clipboard-list<br>Icon size, color, style match |
| 4 | Compare "Lists" icon | Icon matches Figma: list-v2<br>Icon size, color, style match |
| 5 | Compare "Saved for Later" icon | Icon matches Figma: bookmark-solid<br>Icon size, color, style match |
| 6 | Compare "Profile" icon | Icon matches Figma: profile<br>Icon size, color, style match |
| 7 | Compare "Addresses" icon | Icon matches Figma: source-environment<br>Icon size, color, style match |
| 8 | Compare "Change Password" icon | Icon matches Figma: pass<br>Icon size, color, style match |
| 9 | Compare "Saved Credit Cards" icon | Icon matches Figma: credit-card<br>Icon size, color, style match |
| 10 | Take screenshots of all icons | Capture for documentation |

**Expected Result:**
- All menu item icons match Figma design
- Icons consistent in size, color, and style
- Icons render clearly without distortion

**Pass/Fail Criteria:**
- **PASS:** All icons match Figma exactly
- **FAIL:** Any icon mismatched, incorrect size/color, or missing

**Test Data:**
- Figma design reference

**Attachments:**
- Screenshots of implemented icons vs Figma

---

### TC-VCST-4589-023: Verify menu typography and text styling

**Priority:** P1 (High)
**Type:** Visual
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Figma design accessible

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Figma design | Design mockup displays account menu |
| 2 | Compare group header typography | Font family, size, weight, color match Figma<br>Example: "Purchasing", "User", "Marketing" headers |
| 3 | Compare menu item typography | Font family, size, weight, color match Figma<br>Example: "Dashboard", "Profile", "Orders" text |
| 4 | Verify text case | Text case matches Figma (Title Case, Sentence case, or UPPERCASE) |
| 5 | Verify text alignment | Text aligned as per Figma (left, center, or right) |
| 6 | Check line height and letter spacing | Spacing matches Figma specifications |
| 7 | Verify text color contrast | Text readable against background (WCAG AA: 4.5:1 for normal text) |

**Expected Result:**
- Group headers and menu items use correct typography
- Font sizes, weights, and colors match Figma
- Text case and alignment correct
- Good readability and contrast

**Pass/Fail Criteria:**
- **PASS:** Typography matches Figma exactly, good contrast
- **FAIL:** Font mismatches, incorrect sizing, poor contrast

**Test Data:**
- Figma design reference

**Attachments:**
- Screenshots comparing typography

---

### TC-VCST-4589-024: Verify menu spacing and layout

**Priority:** P1 (High)
**Type:** Visual
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Figma design accessible

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Figma design | Design mockup displays account menu |
| 2 | Measure spacing between group headers | Spacing matches Figma (e.g., 24px, 32px) |
| 3 | Measure spacing between menu items | Spacing matches Figma (e.g., 8px, 12px) |
| 4 | Measure padding around menu items | Padding (top, right, bottom, left) matches Figma |
| 5 | Measure indentation of child items | Child items indented correctly (e.g., 16px, 24px) |
| 6 | Verify overall menu width | Menu width matches Figma or responsive design spec |
| 7 | Check alignment of icons and text | Icons and text aligned horizontally as per Figma |

**Expected Result:**
- Spacing between elements matches Figma
- Padding consistent across menu items
- Child items indented correctly
- Icons and text properly aligned

**Pass/Fail Criteria:**
- **PASS:** Spacing and layout match Figma within 2-4px tolerance
- **FAIL:** Significant spacing mismatches, misalignment, or incorrect indentation

**Test Data:**
- Figma design reference
- Browser DevTools for measuring

**Attachments:**
- Screenshots with measurement annotations

---

### TC-VCST-4589-025: Verify menu color scheme and theme

**Priority:** P1 (High)
**Type:** Visual
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Figma design accessible
4. Test on default theme (if multiple themes available)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Figma design | Design mockup displays account menu with color specifications |
| 2 | Compare menu background color | Background color matches Figma (hex code or design token) |
| 3 | Compare group header text color | Text color matches Figma |
| 4 | Compare menu item text color (normal state) | Text color matches Figma |
| 5 | Compare menu item text color (hover state) | Hover text color matches Figma |
| 6 | Compare menu item text color (active state) | Active text color matches Figma |
| 7 | Compare menu item background color (active state) | Active background color matches Figma |
| 8 | Compare icon colors | Icon colors match text colors or Figma spec |
| 9 | Check color consistency | Colors consistent across all menu items and groups |

**Expected Result:**
- All colors match Figma specifications
- Color consistency across menu
- Sufficient contrast for readability

**Pass/Fail Criteria:**
- **PASS:** All colors match Figma exactly
- **FAIL:** Color mismatches, inconsistencies, or poor contrast

**Test Data:**
- Figma design reference with color specs

**Attachments:**
- Screenshots with color comparisons

---

### TC-VCST-4589-026: Verify hover state styling

**Priority:** P2 (Medium)
**Type:** Visual
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Figma design accessible with hover state specs

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Hover over "Dashboard" menu item | Hover state applied:<br>- Background color changes<br>- Text color changes (if specified)<br>- Transition smooth (200-300ms) |
| 2 | Compare with Figma hover state | Hover styling matches Figma exactly |
| 3 | Hover over group header (if interactive) | Hover state applied (if clickable/expandable) |
| 4 | Verify hover state for all menu items | Consistent hover styling across all items |
| 5 | Check hover transition timing | Smooth transition, not jarring |
| 6 | Verify hover state doesn't affect layout | No layout shift on hover |

**Expected Result:**
- Hover states match Figma design
- Consistent hover styling across menu
- Smooth transitions
- No layout shift on hover

**Pass/Fail Criteria:**
- **PASS:** Hover states match Figma, smooth transitions, no layout issues
- **FAIL:** Hover states incorrect, missing, or causing layout shift

**Test Data:**
- Figma design reference with hover states

---

### TC-VCST-4589-027: Verify active/selected state styling

**Priority:** P1 (High)
**Type:** Visual
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Figma design accessible with active state specs

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to "Dashboard" | "Dashboard" menu item shows active state:<br>- Background color (e.g., highlight color)<br>- Text color (e.g., primary color)<br>- Border or indicator (if specified) |
| 2 | Compare with Figma active state | Active styling matches Figma exactly |
| 3 | Navigate to "Orders" | "Orders" shows active state, "Dashboard" returns to normal |
| 4 | Verify active state for all pages | Active state displays correctly for each menu item's page |
| 5 | Check active state visibility | Active state clearly distinguishable from normal and hover states |
| 6 | Verify only one item active at a time | No multiple items showing active state |

**Expected Result:**
- Active state matches Figma design
- Active state clearly visible and distinguishable
- Only one item active at a time
- Active state updates correctly on navigation

**Pass/Fail Criteria:**
- **PASS:** Active states match Figma, clear visibility, correct behavior
- **FAIL:** Active states incorrect, unclear, or multiple items active

**Test Data:**
- Figma design reference with active state

**Attachments:**
- Screenshots of active states

---

### TC-VCST-4589-028: Verify menu dividers and separators (if applicable)

**Priority:** P2 (Medium)
**Type:** Visual
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Figma design accessible

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Figma design | Check if design includes dividers between groups |
| 2 | Inspect menu groups in implementation | Verify dividers/separators match Figma:<br>- Between "Purchasing" and "Marketing" groups<br>- Between "Marketing" and "User" groups<br>- Between "User" and "Corporate" groups |
| 3 | Check divider styling | Divider color, thickness, length match Figma |
| 4 | Verify divider spacing | Spacing above/below dividers matches Figma |

**Expected Result:**
- Dividers present as specified in Figma
- Divider styling (color, thickness) matches
- Spacing around dividers correct

**Pass/Fail Criteria:**
- **PASS:** Dividers match Figma or correctly omitted if not in design
- **FAIL:** Dividers missing when specified, or styling incorrect

**Notes:**
- If Figma design has no dividers, verify implementation also has none

**Test Data:**
- Figma design reference

---

### TC-VCST-4589-029: Verify menu responsive behavior (if applicable)

**Priority:** P2 (Medium)
**Type:** Visual
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View menu at desktop viewport (1920x1080) | Menu displays as left rail sidebar<br>All groups and items visible |
| 2 | Resize browser to tablet viewport (768px width) | Menu adjusts gracefully:<br>- Remains visible OR collapses to hamburger<br>- Layout adapts as per design |
| 3 | Resize browser to mobile viewport (375px width) | Menu behavior:<br>- Collapses to mobile menu OR<br>- Remains as left rail with adjusted width<br>(As per design spec) |
| 4 | Verify text truncation or wrapping | Long menu item labels truncate with ellipsis or wrap correctly |
| 5 | Test menu usability at smaller viewports | Menu remains functional and usable |

**Expected Result:**
- Menu responsive across viewport sizes
- Layout adapts gracefully
- Functionality maintained on smaller screens

**Pass/Fail Criteria:**
- **PASS:** Menu responsive, adapts correctly, remains usable
- **FAIL:** Menu breaks, layout issues, or unusable on smaller screens

**Notes:**
- This test case checks responsive window resizing on desktop
- Dedicated mobile menu testing covered in Section 6 (TC-039 through TC-044)

**Test Data:**
- Browser window resizing

---

### TC-VCST-4589-030: Verify menu z-index and layering

**Priority:** P3 (Low)
**Type:** Visual
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scroll page content (if page has scroll) | Menu remains fixed or scrolls appropriately<br>Menu doesn't overlap incorrectly |
| 2 | Open a modal or overlay (if applicable on account pages) | Modal displays above menu<br>Menu doesn't overlap modal |
| 3 | Verify menu doesn't obscure page content | Menu positioned correctly, page content readable |
| 4 | Check z-index values in DevTools | Menu has appropriate z-index value |

**Expected Result:**
- Menu positioned correctly relative to page content
- Modals/overlays display above menu
- No z-index conflicts causing visual issues

**Pass/Fail Criteria:**
- **PASS:** Correct layering, no z-index conflicts
- **FAIL:** Menu overlaps content incorrectly, or modals appear behind menu

**Test Data:**
- None required

---

## Section 4: Accessibility (5 test cases)

---

### TC-VCST-4589-031: Verify keyboard navigation through menu

**Priority:** P0 (Critical)
**Type:** Accessibility
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Mouse disconnected or not used for this test

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Press Tab key repeatedly | Focus moves through menu items in logical order:<br>1. First group header or first menu item<br>2. Next menu item<br>3. Continue through all items<br>4. Last menu item |
| 2 | Verify focus indicator visibility | Focus indicator clearly visible on focused item<br>Outline or border around focused element |
| 3 | Press Enter on focused menu item | Menu item navigates to corresponding page |
| 4 | Test Shift+Tab (reverse navigation) | Focus moves backward through menu items in reverse order |
| 5 | Test Arrow keys (if supported) | Up/Down arrow keys move focus between menu items within a group |
| 6 | Verify focus trap (if menu is modal/overlay) | Focus doesn't escape menu when in keyboard navigation mode |

**Expected Result:**
- All menu items reachable via keyboard
- Logical tab order (top to bottom, left to right)
- Visible focus indicator on all items
- Enter key activates menu items
- Arrow keys work for menu navigation (if applicable)

**Pass/Fail Criteria:**
- **PASS:** Full keyboard navigation, clear focus, logical order
- **FAIL:** Items unreachable, missing focus indicators, or illogical tab order

**Test Data:**
- Keyboard only (no mouse)

---

### TC-VCST-4589-032: Verify screen reader compatibility

**Priority:** P1 (High)
**Type:** Accessibility
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Screen reader installed and active (NVDA on Windows, JAWS, or VoiceOver on macOS)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Activate screen reader | Screen reader announces page title and account area |
| 2 | Navigate to left rail menu | Screen reader announces menu role or navigation landmark |
| 3 | Navigate through "Purchasing" group | Screen reader announces:<br>- Group name: "Purchasing"<br>- Menu item: "Dashboard"<br>- Menu item: "Orders"<br>- etc. |
| 4 | Navigate through "User" group | Screen reader announces:<br>- Group name: "User"<br>- Menu items: "Profile", "Addresses", etc. |
| 5 | Verify active item announcement | Active menu item announced with state (e.g., "Dashboard, current page") |
| 6 | Verify icon descriptions | Icons have alt text or ARIA labels (if icons convey meaning) |
| 7 | Test group expand/collapse (if applicable) | Screen reader announces expanded/collapsed state |

**Expected Result:**
- Screen reader announces all menu elements correctly
- Group names announced
- Menu items announced with clear labels
- Active state announced
- Icons have appropriate labels (if meaningful)

**Pass/Fail Criteria:**
- **PASS:** All elements announced correctly, clear navigation, states communicated
- **FAIL:** Missing announcements, incorrect labels, or states not communicated

**Test Data:**
- Screen reader software (NVDA, JAWS, VoiceOver)

---

### TC-VCST-4589-033: Verify ARIA attributes and semantic HTML

**Priority:** P1 (High)
**Type:** Accessibility
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Browser DevTools available

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect menu HTML structure | Menu uses semantic HTML:<br>- `<nav>` for navigation<br>- `<ul>` / `<li>` for menu lists<br>- `<a>` or `<button>` for menu items |
| 2 | Check ARIA roles | Appropriate ARIA roles:<br>- `role="navigation"` on nav container<br>- `role="menu"` or `role="menubar"` (if applicable)<br>- `role="menuitem"` on menu items (if applicable) |
| 3 | Check ARIA labels | ARIA labels present:<br>- `aria-label` or `aria-labelledby` on navigation<br>- `aria-current="page"` on active menu item |
| 4 | Check ARIA expanded (if groups are collapsible) | `aria-expanded="true"` or `"false"` on group headers |
| 5 | Check ARIA hidden (if applicable) | Hidden elements have `aria-hidden="true"` |
| 6 | Verify no ARIA misuse | ARIA attributes used correctly, not overused |
| 7 | Run accessibility validator | Use axe DevTools or WAVE to check ARIA compliance |

**Expected Result:**
- Semantic HTML used appropriately
- ARIA roles correct and not redundant
- ARIA labels present where needed
- ARIA states (expanded, current) set correctly
- No ARIA errors in validator

**Pass/Fail Criteria:**
- **PASS:** Semantic HTML, correct ARIA usage, passes validator
- **FAIL:** Non-semantic markup, ARIA errors, or validator failures

**Test Data:**
- Browser DevTools
- axe DevTools or WAVE extension

---

### TC-VCST-4589-034: Verify color contrast compliance (WCAG 2.1 AA)

**Priority:** P1 (High)
**Type:** Accessibility
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Color contrast checker tool available (e.g., WebAIM Contrast Checker, browser extensions)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check group header text contrast | Text color vs background color:<br>Contrast ratio ≥ 4.5:1 for normal text (WCAG AA)<br>Contrast ratio ≥ 3:1 for large text (18pt+) |
| 2 | Check menu item text contrast (normal state) | Text color vs background color:<br>Contrast ratio ≥ 4.5:1 (WCAG AA) |
| 3 | Check menu item text contrast (hover state) | Hover text color vs hover background color:<br>Contrast ratio ≥ 4.5:1 |
| 4 | Check menu item text contrast (active state) | Active text color vs active background color:<br>Contrast ratio ≥ 4.5:1 |
| 5 | Check icon contrast (if icons are monochrome) | Icon color vs background color:<br>Contrast ratio ≥ 3:1 for UI components (WCAG AA) |
| 6 | Run automated contrast checker | Use axe DevTools or WAVE to check all elements<br>No contrast failures reported |

**Expected Result:**
- All text meets WCAG 2.1 AA contrast requirements (4.5:1)
- Icons meet contrast requirements (3:1)
- No contrast violations in automated checker

**Pass/Fail Criteria:**
- **PASS:** All contrast ratios meet or exceed WCAG 2.1 AA
- **FAIL:** Any contrast ratios below WCAG 2.1 AA thresholds

**Test Data:**
- Color contrast checker tool
- WCAG 2.1 AA thresholds (4.5:1 for normal text, 3:1 for large text/UI)

**Attachments:**
- Screenshots with contrast ratios annotated

---

### TC-VCST-4589-035: Verify focus indicator visibility and styling

**Priority:** P1 (High)
**Type:** Accessibility
**Assigned To:** ui-ux-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in and on Account page
3. Keyboard available for navigation

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Press Tab to focus first menu item | Focus indicator visible:<br>- Outline around menu item<br>- Color contrasts with background<br>- Thickness at least 2px |
| 2 | Tab through all menu items | Focus indicator appears on each item<br>Clearly visible on all states (normal, hover, active) |
| 3 | Check focus indicator contrast | Focus outline color vs background:<br>Contrast ratio ≥ 3:1 (WCAG 2.1 AA for UI components) |
| 4 | Verify focus not obscured | Focus indicator not clipped or hidden by other elements |
| 5 | Check focus indicator customization | Focus indicator styled per design (not default browser outline)<br>OR default browser outline is acceptable and clear |
| 6 | Verify focus indicator on group headers (if interactive) | Group headers show focus indicator when focused |

**Expected Result:**
- Focus indicator clearly visible on all menu items
- Focus indicator meets contrast requirements (3:1)
- Focus indicator not obscured or clipped
- Consistent focus styling across menu

**Pass/Fail Criteria:**
- **PASS:** Focus indicator visible, meets contrast, not obscured
- **FAIL:** Focus indicator missing, unclear, or below contrast threshold

**Test Data:**
- Keyboard navigation
- Contrast checker tool

---

## Section 5: Cross-Browser Compatibility (3 test cases)

---

### TC-VCST-4589-036: Verify menu functionality and appearance on Chrome

**Priority:** P0 (Critical)
**Type:** Cross-Browser
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Google Chrome browser (latest version) installed
3. Test user credentials available

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Chrome browser | Browser launches successfully |
| 2 | Navigate to `${FRONT_URL}` | Homepage loads |
| 3 | Log in with test user | User logged in |
| 4 | Navigate to Account area | Account dashboard loads with left rail menu |
| 5 | Verify menu structure | All groups display: Purchasing, Marketing, User, Corporate<br>All menu items visible |
| 6 | Test navigation on Chrome | Click each menu item:<br>- All pages load correctly<br>- No console errors<br>- Active states work |
| 7 | Verify visual appearance | Menu matches design:<br>- Icons render correctly<br>- Typography correct<br>- Spacing correct<br>- Colors correct |
| 8 | Test hover and active states | Hover and active states display correctly |
| 9 | Test keyboard navigation | Tab navigation works correctly |
| 10 | Take screenshots | Capture menu appearance on Chrome |

**Expected Result:**
- Full menu functionality on Chrome
- All visual elements render correctly
- No browser-specific bugs
- Consistent with design specifications

**Pass/Fail Criteria:**
- **PASS:** All functionality works, visual appearance correct, no errors
- **FAIL:** Any functionality broken, visual issues, or console errors

**Test Data:**
- Chrome latest version
- Test user credentials

**Attachments:**
- Screenshots of menu on Chrome

---

### TC-VCST-4589-037: Verify menu functionality and appearance on Firefox

**Priority:** P1 (High)
**Type:** Cross-Browser
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Mozilla Firefox browser (latest version) installed
3. Test user credentials available

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Firefox browser | Browser launches successfully |
| 2 | Navigate to `${FRONT_URL}` | Homepage loads |
| 3 | Log in with test user | User logged in |
| 4 | Navigate to Account area | Account dashboard loads with left rail menu |
| 5 | Verify menu structure | All groups display: Purchasing, Marketing, User, Corporate<br>All menu items visible |
| 6 | Test navigation on Firefox | Click each menu item:<br>- All pages load correctly<br>- No console errors<br>- Active states work |
| 7 | Verify visual appearance | Menu matches design:<br>- Icons render correctly<br>- Typography correct<br>- Spacing correct<br>- Colors correct |
| 8 | Test hover and active states | Hover and active states display correctly |
| 9 | Test keyboard navigation | Tab navigation works correctly |
| 10 | Compare with Chrome | Verify consistent behavior and appearance |
| 11 | Take screenshots | Capture menu appearance on Firefox |

**Expected Result:**
- Full menu functionality on Firefox
- Visual appearance consistent with Chrome and design
- No Firefox-specific bugs

**Pass/Fail Criteria:**
- **PASS:** All functionality works, visual appearance correct, consistent with Chrome
- **FAIL:** Any functionality broken, visual differences, or console errors

**Test Data:**
- Firefox latest version
- Test user credentials

**Attachments:**
- Screenshots of menu on Firefox
- Comparison with Chrome screenshots

---

### TC-VCST-4589-038: Verify menu functionality and appearance on Edge

**Priority:** P1 (High)
**Type:** Cross-Browser
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Microsoft Edge browser (latest version) installed
3. Test user credentials available

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Edge browser | Browser launches successfully |
| 2 | Navigate to `${FRONT_URL}` | Homepage loads |
| 3 | Log in with test user | User logged in |
| 4 | Navigate to Account area | Account dashboard loads with left rail menu |
| 5 | Verify menu structure | All groups display: Purchasing, Marketing, User, Corporate<br>All menu items visible |
| 6 | Test navigation on Edge | Click each menu item:<br>- All pages load correctly<br>- No console errors<br>- Active states work |
| 7 | Verify visual appearance | Menu matches design:<br>- Icons render correctly<br>- Typography correct<br>- Spacing correct<br>- Colors correct |
| 8 | Test hover and active states | Hover and active states display correctly |
| 9 | Test keyboard navigation | Tab navigation works correctly |
| 10 | Compare with Chrome and Firefox | Verify consistent behavior and appearance |
| 11 | Take screenshots | Capture menu appearance on Edge |

**Expected Result:**
- Full menu functionality on Edge
- Visual appearance consistent with Chrome, Firefox, and design
- No Edge-specific bugs

**Pass/Fail Criteria:**
- **PASS:** All functionality works, visual appearance correct, consistent with other browsers
- **FAIL:** Any functionality broken, visual differences, or console errors

**Test Data:**
- Edge latest version
- Test user credentials

**Attachments:**
- Screenshots of menu on Edge
- Comparison with Chrome and Firefox screenshots

---

## Section 6: Mobile Menu (6 test cases)

---

### TC-VCST-4589-039: Verify mobile menu trigger and visibility

**Priority:** P0 (Critical)
**Type:** Functional / Mobile
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible at `${FRONT_URL}`
2. Test user logged in
3. Browser viewport set to mobile (375px width) or actual mobile device

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set viewport to 375px width (iPhone) | Page renders in mobile layout |
| 2 | Navigate to Account area | Account page loads in mobile layout |
| 3 | Locate the account menu trigger | Hamburger icon, "Menu" button, or similar mobile menu trigger is visible |
| 4 | Tap/click the menu trigger | Account menu opens (slide-out panel, dropdown, or full-screen overlay) |
| 5 | Verify all menu groups visible | Purchasing, User, Corporate groups displayed (Marketing hidden if empty) |
| 6 | Close the mobile menu | Menu closes, page content visible again |

**Expected Result:**
- Mobile menu trigger clearly visible and accessible
- Menu opens/closes smoothly with animation
- All menu groups and items accessible in mobile view
- Menu does not obscure critical page elements when closed

**Pass/Fail Criteria:**
- **PASS:** Menu trigger visible, opens/closes correctly, all items accessible
- **FAIL:** Menu trigger missing, menu doesn't open, items missing, or broken layout

---

### TC-VCST-4589-040: Verify mobile menu structure matches desktop groups

**Priority:** P0 (Critical)
**Type:** Functional / Mobile
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in
3. Mobile viewport (375px) or mobile device
4. Mobile account menu opened

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open mobile account menu | Menu displays |
| 2 | Verify "Purchasing" group items | Contains: Dashboard, Orders, Lists, Saved for Later (same as desktop) |
| 3 | Verify "User" group items | Contains: Profile, Addresses, Change Password, Saved Credit Cards (same as desktop) |
| 4 | Verify "Corporate" group items | Contains: Company Info, Company Members (same as desktop) |
| 5 | Verify menu item count | Total 8 menu items + Corporate (same as desktop) |
| 6 | Verify item ordering within groups | Same priority ordering as desktop menu |

**Expected Result:**
- Mobile menu structure mirrors desktop grouped structure
- Same items, same groups, same ordering
- No items missing or duplicated compared to desktop

**Pass/Fail Criteria:**
- **PASS:** Mobile menu matches desktop structure exactly
- **FAIL:** Missing groups, missing items, or different ordering

---

### TC-VCST-4589-041: Verify mobile menu navigation routes

**Priority:** P0 (Critical)
**Type:** Functional / Mobile
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in
3. Mobile viewport (375px)
4. Mobile account menu opened

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tap "Dashboard" in mobile menu | Dashboard page loads, menu closes (or stays), correct URL |
| 2 | Re-open menu, tap "Orders" | Orders page loads, correct URL, no console errors |
| 3 | Re-open menu, tap "Lists" | Lists page loads, correct URL |
| 4 | Re-open menu, tap "Saved for Later" | Saved for Later page loads, correct URL |
| 5 | Re-open menu, tap "Profile" | Profile page loads, correct URL |
| 6 | Re-open menu, tap "Addresses" | Addresses page loads, correct URL |
| 7 | Re-open menu, tap "Change Password" | Change Password page loads, correct URL |
| 8 | Re-open menu, tap "Saved Credit Cards" | Saved Credit Cards page loads, correct URL |
| 9 | Verify no console errors after all navigations | Console clean, no JavaScript errors |

**Expected Result:**
- All 8 menu items navigate to correct pages on mobile
- Pages load correctly in mobile layout
- Menu behavior after navigation is consistent (auto-close or stay open per design)
- No console errors

**Pass/Fail Criteria:**
- **PASS:** All navigation routes work on mobile, pages load correctly
- **FAIL:** Any route fails, page doesn't load, or console errors

---

### TC-VCST-4589-042: Verify mobile menu touch interactions

**Priority:** P1 (High)
**Type:** Functional / Mobile
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in
3. Mobile viewport (375px) or actual touch device
4. Mobile account menu opened

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tap a menu item | Item responds to tap with visual feedback (highlight/ripple) |
| 2 | Verify touch target size | All menu items have minimum 44x44px touch target (WCAG) |
| 3 | Test swipe to close (if applicable) | Swipe gesture closes the menu (if slide-out panel) |
| 4 | Test tap outside menu to close | Tapping outside the menu area closes it |
| 5 | Test scroll within menu (if items overflow) | Menu scrolls smoothly if content exceeds viewport height |
| 6 | Verify no accidental taps | Sufficient spacing between items prevents accidental navigation |

**Expected Result:**
- Touch targets meet 44x44px minimum
- Tap feedback visible
- Menu dismissal gestures work (tap outside, swipe)
- Scrolling works if menu content overflows
- No accidental taps due to tight spacing

**Pass/Fail Criteria:**
- **PASS:** Touch targets adequate, gestures work, smooth scrolling
- **FAIL:** Touch targets too small, gestures broken, or accidental taps

---

### TC-VCST-4589-043: Verify mobile menu across viewports (iPhone, Android)

**Priority:** P1 (High)
**Type:** Cross-Browser / Mobile
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Test at 375px width (iPhone SE/Mini) | Menu displays correctly, no overflow, all items accessible |
| 2 | Test at 390px width (iPhone 14/15/16) | Menu displays correctly |
| 3 | Test at 428px width (iPhone 14/15/16 Pro Max) | Menu displays correctly |
| 4 | Test at 360px width (Android small) | Menu displays correctly |
| 5 | Test at 412px width (Android Pixel/Samsung) | Menu displays correctly |
| 6 | Test at 768px width (iPad / tablet portrait) | Menu transitions between mobile and desktop layout correctly |
| 7 | Verify landscape orientation (667px height at 375px width) | Menu adapts to landscape, scrollable if needed |

**Expected Result:**
- Mobile menu renders correctly across all common mobile viewports
- No horizontal overflow or cut-off content
- Text readable without zooming
- Layout adapts properly at tablet breakpoint

**Pass/Fail Criteria:**
- **PASS:** Menu renders correctly at all viewports, no layout breaks
- **FAIL:** Layout broken, content cut off, or unusable at any viewport

---

### TC-VCST-4589-044: Verify mobile menu active state and current page indicator

**Priority:** P1 (High)
**Type:** Functional / Mobile
**Assigned To:** qa-frontend-expert

**Preconditions:**
1. QA environment accessible
2. Test user logged in
3. Mobile viewport (375px)

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Orders page on mobile | Orders page loads |
| 2 | Open mobile menu | "Orders" item shows active/selected state (highlight, bold, icon) |
| 3 | Navigate to Profile page | Profile page loads |
| 4 | Open mobile menu | "Profile" item shows active state, "Orders" no longer active |
| 5 | Deep link to `${FRONT_URL}/account/addresses` on mobile | Addresses page loads |
| 6 | Open mobile menu | "Addresses" item shows active state |

**Expected Result:**
- Active menu item clearly indicated in mobile menu
- Only one item active at a time
- Active state updates correctly after navigation
- Deep links also trigger correct active state

**Pass/Fail Criteria:**
- **PASS:** Active state works correctly on mobile, matches current page
- **FAIL:** No active indicator, multiple active items, or incorrect state

---

## Test Execution Summary

| Section | Test Cases | P0 | P1 | P2 | P3 |
|---------|------------|----|----|----|----|
| **1. Menu Structure** | 7 | 3 | 3 | 1 | 0 |
| **2. Navigation Functionality** | 14 | 8 | 4 | 2 | 0 |
| **3. Visual Design** | 9 | 0 | 5 | 3 | 1 |
| **4. Accessibility** | 5 | 1 | 4 | 0 | 0 |
| **5. Cross-Browser** | 3 | 1 | 2 | 0 | 0 |
| **6. Mobile Menu** | 6 | 3 | 3 | 0 | 0 |
| **TOTAL** | **44** | **16** | **21** | **6** | **1** |

---

## Test Coverage Matrix

| Acceptance Criterion | Test Cases | Coverage |
|----------------------|------------|----------|
| **AC1: Menu displays organized view with clear categorization** | TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007 | ✅ 100% |
| **AC2: Users can easily identify and navigate to account sections** | TC-008 through TC-021, TC-031, TC-032, TC-039 through TC-044 | ✅ 100% |
| **AC3: Coupons and promotions excluded (moved to VCST-4590)** | TC-004 (verifies Marketing group empty) | ✅ 100% |

**Overall Test Coverage: 100%**

---

## Test Execution Notes

### Environment Setup
- Ensure PR artifact deployed: https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-2.42.0-pr-2179-9d33-9d3334d1.zip
- Use `.env` variables for environment URLs and credentials
- Test user must have account access and organization membership (for Corporate group testing)

### Execution Order
1. **Menu Structure** (TC-001 to TC-007) - Verify structure first
2. **Navigation Functionality** (TC-008 to TC-021) - Verify all routes work
3. **Visual Design** (TC-022 to TC-030) - Verify Figma compliance
4. **Accessibility** (TC-031 to TC-035) - Verify WCAG compliance
5. **Cross-Browser** (TC-036 to TC-038) - Verify consistency

### Bug Reporting
- Any deviations from expected results should be documented as bugs
- Reference test case ID in bug reports
- Attach screenshots and HAR files for evidence
- Tag bugs with VCST-4589 for traceability

### Sign-off Criteria
- All P0 test cases must PASS
- All P1 test cases must PASS or have approved workarounds
- P2/P3 failures can be accepted as known issues (non-blocking)
- Accessibility must pass WCAG 2.1 AA
- Visual design approved by ui-ux-expert

---

**Document Status:** Ready for execution
**Created:** 2026-02-18
**Last Updated:** 2026-02-18
**Version:** 1.0
