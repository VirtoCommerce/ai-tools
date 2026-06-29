# GraphQL API Test Cases: WhiteLabeling & PageContext

## Overview

This test suite covers comprehensive GraphQL API testing for two critical queries in the Virto Commerce xAPI:

1. **whiteLabelingSettings** - Organization-specific branding configuration query
2. **pageContext** - Unified storefront context query (consolidates slugInfo + store + whiteLabelingSettings + user)

These test cases verify functionality, error handling, performance, and security aspects of both queries, with special focus on the new `mainMenuLinks` field introduced in VCST-4637.

### Test Environment
- **Backend URL:** `${BACK_URL}` (from .env)
- **Default Store ID:** B2B-store
- **GraphQL Endpoint:** `${BACK_URL}/graphql`

### References
- [WhiteLabeling Settings Query Documentation](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/White-labeling/queries/whiteLabelingSettings.md)
- [PageContext Query Documentation](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/xFrontend/PageContext.md)
- JIRA: VCST-4637 - Main Menu Links Feature

---

## A. whiteLabelingSettings Query Tests

### WL-GQL-001: Basic whiteLabelingSettings query with all required parameters

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** Critical
**Estimate:** 3m

**Preconditions:**
- GraphQL endpoint accessible at `${BACK_URL}/graphql`
- Test organization exists with ID: `test-org-001`
- Store ID: B2B-store

**Steps:**
1. Navigate to GraphQL playground at `${BACK_URL}/graphql`
2. Execute the following query:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "test-org-001"
    storeId: "B2B-store"
  ) {
    userId
    organizationId
    logoUrl
    secondaryLogoUrl
    faviconUrl
    favicons {
      rel
      type
      sizes
      href
    }
    themePresetName
    footerLinks {
      title
      url
      childItems {
        title
        url
      }
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
  }
}
```

3. Verify response structure and data types

**Expected Result:**
- Query executes successfully without errors
- Response returns data.whiteLabelingSettings object
- All fields returned with correct data types:
  - organizationId: string (matches input)
  - logoUrl: string or null
  - secondaryLogoUrl: string or null
  - faviconUrl: string or null
  - favicons: array of objects with rel, type, sizes, href fields
  - themePresetName: string (default or Coffee)
  - footerLinks: array of objects with title, url, childItems
  - mainMenuLinks: array of objects with title, url, priority, childItems
- No GraphQL errors in response

**References:** VCST-4637, Virto Commerce xAPI docs
**Automation Status:** Not Automated

---

### WL-GQL-002: Query with organizationId having full branding configured

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** Critical
**Estimate:** 4m

**Preconditions:**
- Organization `branded-org-001` exists with complete configuration:
  - Custom logo uploaded
  - Custom favicon uploaded
  - Theme preset: Coffee
  - Footer link list configured with 3 parent links, 2 with children
  - Main menu link list configured with 4 parent links, 3 with children

**Steps:**
1. Navigate to GraphQL playground
2. Execute query for `branded-org-001`:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "branded-org-001"
    storeId: "B2B-store"
  ) {
    logoUrl
    secondaryLogoUrl
    faviconUrl
    favicons { rel type sizes href }
    themePresetName
    footerLinks { title url childItems { title url } }
    mainMenuLinks { title url priority childItems { title url priority } }
  }
}
```

3. Verify all branding fields populated

**Expected Result:**
- logoUrl returns valid URL (e.g., https://cdn.example.com/logos/branded-org-001-logo.png)
- secondaryLogoUrl returns valid URL or null
- faviconUrl returns valid URL
- favicons array contains multiple sizes (16x16, 32x32, 180x180, etc.)
- themePresetName returns "Coffee"
- footerLinks array contains 3 parent links:
  - Each with title and url fields
  - 2 parent links have non-empty childItems arrays
- mainMenuLinks array contains 4 parent links:
  - Each with title, url, and priority fields
  - 3 parent links have non-empty childItems arrays
  - Priority values are integers (for ordering)
- All URLs are valid format (start with http:// or https:// or /)

**References:** VCST-4637, C384971, C384972
**Automation Status:** Not Automated

---

### WL-GQL-003: Query with organizationId having NO branding configured

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** High
**Estimate:** 3m

**Preconditions:**
- Organization `no-branding-org` exists with no white labeling configuration
- MainMenuLinkListName and FooterLinkListName are NULL

**Steps:**
1. Navigate to GraphQL playground
2. Execute query for `no-branding-org`:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "no-branding-org"
    storeId: "B2B-store"
  ) {
    organizationId
    logoUrl
    faviconUrl
    themePresetName
    footerLinks { title }
    mainMenuLinks { title }
  }
}
```

3. Verify fallback behavior

**Expected Result:**
- Query executes successfully without errors
- Response returns data.whiteLabelingSettings object
- organizationId matches input: "no-branding-org"
- logoUrl is null (or returns store-level default)
- faviconUrl is null (or returns store-level default)
- themePresetName returns "default" (fallback)
- footerLinks is empty array or null
- mainMenuLinks is empty array or null
- No errors or exceptions thrown

**References:** VCST-4637, C384975
**Automation Status:** Not Automated

---

### WL-GQL-004: Query with invalid/non-existent organizationId

**Section:** GraphQL > whiteLabelingSettings
**Type:** Negative
**Priority:** High
**Estimate:** 2m

**Preconditions:**
- GraphQL endpoint accessible
- organizationId `non-existent-org-999` does NOT exist in system

**Steps:**
1. Navigate to GraphQL playground
2. Execute query with non-existent organizationId:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "non-existent-org-999"
    storeId: "B2B-store"
  ) {
    organizationId
    logoUrl
  }
}
```

3. Verify error handling

**Expected Result:**
- Query executes without crashing backend
- One of the following behaviors:
  - Returns null for whiteLabelingSettings (graceful handling)
  - Returns empty/default branding values
  - Returns GraphQL error with message indicating organization not found
- Error message does NOT leak sensitive system information
- HTTP status remains 200 (GraphQL convention)

**References:** VCST-4637
**Automation Status:** Not Automated

---

### WL-GQL-005: Query with missing required storeId parameter

**Section:** GraphQL > whiteLabelingSettings
**Type:** Negative
**Priority:** High
**Estimate:** 2m

**Preconditions:**
- GraphQL endpoint accessible

**Steps:**
1. Navigate to GraphQL playground
2. Execute query WITHOUT storeId parameter:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "test-org-001"
  ) {
    logoUrl
  }
}
```

3. Verify validation error

**Expected Result:**
- Query fails with GraphQL validation error
- Error message indicates required argument "storeId" is missing
- Error type: "GRAPHQL_VALIDATION_FAILED" or similar
- HTTP status: 200 (GraphQL error structure)
- Response contains errors array with clear message:
  - Example: "Field 'whiteLabelingSettings' argument 'storeId' of type 'String!' is required but not provided"

**References:** VCST-4637
**Automation Status:** Not Automated

---

### WL-GQL-006: Query with missing required organizationId parameter

**Section:** GraphQL > whiteLabelingSettings
**Type:** Negative
**Priority:** High
**Estimate:** 2m

**Preconditions:**
- GraphQL endpoint accessible

**Steps:**
1. Navigate to GraphQL playground
2. Execute query WITHOUT organizationId parameter:

```graphql
query {
  whiteLabelingSettings(
    storeId: "B2B-store"
  ) {
    logoUrl
  }
}
```

3. Verify validation error

**Expected Result:**
- Query fails with GraphQL validation error
- Error message indicates required argument "organizationId" is missing
- Error type: "GRAPHQL_VALIDATION_FAILED"
- Response contains errors array with message:
  - Example: "Field 'whiteLabelingSettings' argument 'organizationId' of type 'String!' is required but not provided"
- HTTP status: 200

**References:** VCST-4637
**Automation Status:** Not Automated

---

### WL-GQL-007: Query with optional cultureName parameter

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** High
**Estimate:** 4m

**Preconditions:**
- Organization `multilang-org` exists
- Link list configured with localized content for EN and PL cultures
- Footer links and main menu links have translations

**Steps:**
1. Execute query with cultureName = "en-US":

```graphql
query {
  whiteLabelingSettings(
    organizationId: "multilang-org"
    storeId: "B2B-store"
    cultureName: "en-US"
  ) {
    footerLinks { title url }
    mainMenuLinks { title url }
  }
}
```

2. Note English link titles
3. Execute same query with cultureName = "pl-PL"
4. Compare link titles

**Expected Result:**
- Query with cultureName = "en-US" returns English link titles:
  - Example: "Products", "About Us", "Contact"
- Query with cultureName = "pl-PL" returns Polish link titles:
  - Example: "Produkty", "O nas", "Kontakt"
- URLs remain the same (only titles localized)
- Link structure and priority unchanged

**References:** VCST-4637, C385322
**Automation Status:** Not Automated

---

### WL-GQL-008: Query without cultureName parameter (default behavior)

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** Medium
**Estimate:** 3m

**Preconditions:**
- Organization with localized content exists
- System default culture is "en-US"

**Steps:**
1. Execute query WITHOUT cultureName parameter:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "multilang-org"
    storeId: "B2B-store"
  ) {
    footerLinks { title }
    mainMenuLinks { title }
  }
}
```

2. Verify default culture used

**Expected Result:**
- Query executes successfully
- Link titles returned in default system culture (en-US)
- Behavior matches query with explicit cultureName = "en-US"
- No errors or warnings

**References:** VCST-4637
**Automation Status:** Not Automated

---

### WL-GQL-009: Query with optional userId parameter

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** Medium
**Estimate:** 3m

**Preconditions:**
- User account exists with userId: `user-123`
- User belongs to organization `test-org-001`

**Steps:**
1. Execute query with userId parameter:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "test-org-001"
    storeId: "B2B-store"
    userId: "user-123"
  ) {
    userId
    organizationId
    logoUrl
  }
}
```

2. Verify userId field in response

**Expected Result:**
- Query executes successfully
- Response includes userId field set to "user-123"
- organizationId matches input
- Branding data returned normally
- userId parameter does not affect branding resolution (informational only)

**References:** VCST-4637
**Automation Status:** Not Automated

---

### WL-GQL-010: Verify logoUrl returns valid URL format

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** High
**Estimate:** 3m

**Preconditions:**
- Organization `branded-org-001` exists with custom logo uploaded

**Steps:**
1. Execute query requesting logoUrl:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "branded-org-001"
    storeId: "B2B-store"
  ) {
    logoUrl
  }
}
```

2. Verify URL format and accessibility

**Expected Result:**
- logoUrl returned as string (not null)
- URL format is valid:
  - Starts with `http://` or `https://` for absolute URLs
  - OR starts with `/` for relative URLs
  - Contains valid domain and path
- URL points to image resource (PNG, SVG, or JPG)
- (Optional) Navigate to logoUrl in browser to verify image is accessible
- No broken links or 404 errors

**References:** C384971
**Automation Status:** Not Automated

---

### WL-GQL-011: Verify secondaryLogoUrl field

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** Medium
**Estimate:** 3m

**Preconditions:**
- Organization `branded-org-001` exists with secondary logo configured

**Steps:**
1. Execute query requesting secondaryLogoUrl:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "branded-org-001"
    storeId: "B2B-store"
  ) {
    logoUrl
    secondaryLogoUrl
  }
}
```

2. Verify both logo URLs returned

**Expected Result:**
- logoUrl returns primary logo URL
- secondaryLogoUrl returns secondary logo URL (different from primary)
- Both URLs are valid format
- If no secondary logo configured, secondaryLogoUrl is null
- Both logos are independently accessible

**References:** VCST-4637
**Automation Status:** Not Automated

---

### WL-GQL-012: Verify faviconUrl returns valid URL

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** High
**Estimate:** 3m

**Preconditions:**
- Organization with custom favicon uploaded

**Steps:**
1. Execute query requesting faviconUrl:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "branded-org-001"
    storeId: "B2B-store"
  ) {
    faviconUrl
  }
}
```

2. Verify favicon URL

**Expected Result:**
- faviconUrl returned as string
- URL format is valid (absolute or relative)
- URL points to favicon image (.ico, .png, or .svg)
- Favicon is accessible at the URL
- Typical favicon path structure (e.g., /favicons/org-name/favicon.ico)

**References:** C384972
**Automation Status:** Not Automated

---

### WL-GQL-013: Verify favicons array returns multiple sizes

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** High
**Estimate:** 4m

**Preconditions:**
- Organization with custom favicon configured
- Thumbnail job has generated multiple favicon sizes

**Steps:**
1. Execute query requesting favicons array:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "branded-org-001"
    storeId: "B2B-store"
  ) {
    favicons {
      rel
      type
      sizes
      href
    }
  }
}
```

2. Verify array contains multiple favicon sizes

**Expected Result:**
- favicons array contains multiple objects (typically 5-8)
- Each object has all fields:
  - rel: "icon" or "apple-touch-icon" or "shortcut icon"
  - type: "image/png" or "image/x-icon" or similar
  - sizes: e.g., "16x16", "32x32", "180x180", "192x192", "512x512"
  - href: valid URL to favicon image
- Common sizes present:
  - 16x16 (browser tab)
  - 32x32 (taskbar)
  - 180x180 (Apple touch icon)
  - 192x192 (Android)
  - 512x512 (high-res Android)
- All hrefs are accessible

**References:** C385320, C385321
**Automation Status:** Not Automated

---

### WL-GQL-014: Verify themePresetName returns valid values

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** Medium
**Estimate:** 3m

**Preconditions:**
- Organization `default-theme-org` with no theme configured
- Organization `coffee-theme-org` with Coffee theme configured

**Steps:**
1. Execute query for default-theme-org:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "default-theme-org"
    storeId: "B2B-store"
  ) {
    themePresetName
  }
}
```

2. Execute query for coffee-theme-org
3. Verify theme values

**Expected Result:**
- default-theme-org returns themePresetName: "default"
- coffee-theme-org returns themePresetName: "Coffee"
- Theme names are case-sensitive strings
- Only valid theme preset names returned (default, Coffee, or custom)
- No invalid/corrupted theme names

**References:** C384973
**Automation Status:** Not Automated

---

### WL-GQL-015: Verify footerLinks hierarchical structure (parent + childItems)

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** High
**Estimate:** 4m

**Preconditions:**
- Organization with footer link list configured:
  - Parent link: "Company" (no children)
  - Parent link: "Products" with children: "Electronics", "Clothing"
  - Parent link: "Support" with children: "Help Center", "Contact Us", "FAQ"

**Steps:**
1. Execute query requesting footerLinks:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "test-org-001"
    storeId: "B2B-store"
  ) {
    footerLinks {
      title
      url
      childItems {
        title
        url
      }
    }
  }
}
```

2. Verify hierarchical structure

**Expected Result:**
- footerLinks array contains 3 parent objects
- Parent 1: "Company"
  - title: "Company"
  - url: "/company"
  - childItems: empty array or null
- Parent 2: "Products"
  - title: "Products"
  - url: "/products"
  - childItems: array with 2 objects (Electronics, Clothing)
- Parent 3: "Support"
  - title: "Support"
  - url: "/support"
  - childItems: array with 3 objects (Help Center, Contact Us, FAQ)
- All child objects have title and url fields
- Nested structure is correct (2 levels max)

**References:** C385322, C385323
**Automation Status:** Not Automated

---

### WL-GQL-016: Verify mainMenuLinks hierarchical structure with priority

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** Critical
**Estimate:** 5m

**Preconditions:**
- Organization with main menu link list configured:
  - "Home" (priority: 1, no children)
  - "Products" (priority: 2) with children: "Electronics" (priority: 1), "Clothing" (priority: 2)
  - "About" (priority: 3) with children: "Our Story" (priority: 1), "Team" (priority: 2), "Careers" (priority: 3)
  - "Contact" (priority: 4, no children)

**Steps:**
1. Execute query requesting mainMenuLinks with priority:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "test-org-001"
    storeId: "B2B-store"
  ) {
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
  }
}
```

2. Verify hierarchical structure and priority ordering

**Expected Result:**
- mainMenuLinks array contains 4 parent objects
- Parent links returned in priority order:
  1. "Home" (priority: 1, no children)
  2. "Products" (priority: 2) with childItems sorted by priority:
     - "Electronics" (priority: 1)
     - "Clothing" (priority: 2)
  3. "About" (priority: 3) with childItems sorted by priority:
     - "Our Story" (priority: 1)
     - "Team" (priority: 2)
     - "Careers" (priority: 3)
  4. "Contact" (priority: 4, no children)
- All parent and child objects have title, url, priority fields
- Priority values are integers
- Nested structure (2 levels: parent + children)
- childItems arrays respect priority ordering

**References:** VCST-4637 PR#21
**Automation Status:** Not Automated

---

### WL-GQL-017: Verify mainMenuLinks when MainMenuLinkListName is NULL

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** High
**Estimate:** 2m

**Preconditions:**
- Organization `no-menu-org` exists
- MainMenuLinkListName field is NULL in database

**Steps:**
1. Execute query for organization with NULL MainMenuLinkListName:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "no-menu-org"
    storeId: "B2B-store"
  ) {
    mainMenuLinks {
      title
      url
    }
  }
}
```

2. Verify response

**Expected Result:**
- Query executes successfully without errors
- mainMenuLinks field is returned
- mainMenuLinks is empty array: []
- OR mainMenuLinks is null
- No GraphQL errors or exceptions
- No backend crashes

**References:** VCST-4637 PR#21
**Automation Status:** Not Automated

---

### WL-GQL-018: Verify mainMenuLinks with non-existent link list name

**Section:** GraphQL > whiteLabelingSettings
**Type:** Negative
**Priority:** Medium
**Estimate:** 3m

**Preconditions:**
- Organization exists with MainMenuLinkListName = "non-existent-link-list-999"
- Link list "non-existent-link-list-999" does NOT exist in system

**Steps:**
1. Configure organization with non-existent link list name
2. Execute query:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "test-org-invalid-menu"
    storeId: "B2B-store"
  ) {
    mainMenuLinks {
      title
      url
    }
  }
}
```

3. Verify graceful handling

**Expected Result:**
- Query executes without backend errors
- mainMenuLinks is empty array: []
- OR mainMenuLinks is null
- No 500 errors or exceptions
- Graceful handling of missing link list
- System logs may contain warning (not exposed to client)

**References:** VCST-4637 PR#21
**Automation Status:** Not Automated

---

### WL-GQL-019: Organization isolation - Org A query does not return Org B data

**Section:** GraphQL > whiteLabelingSettings
**Type:** Security
**Priority:** Critical
**Estimate:** 5m

**Preconditions:**
- Organization A (`org-a`) with:
  - Logo: logo-a.png
  - Main menu: "Products A", "Services A"
  - Footer: "About A", "Contact A"
- Organization B (`org-b`) with:
  - Logo: logo-b.png
  - Main menu: "Products B", "Services B"
  - Footer: "About B", "Contact B"

**Steps:**
1. Execute query for Organization A:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "org-a"
    storeId: "B2B-store"
  ) {
    logoUrl
    mainMenuLinks { title }
    footerLinks { title }
  }
}
```

2. Execute query for Organization B with same structure
3. Compare results

**Expected Result:**
- Organization A query returns:
  - logoUrl contains "logo-a.png"
  - mainMenuLinks: ["Products A", "Services A"]
  - footerLinks: ["About A", "Contact A"]
- Organization B query returns:
  - logoUrl contains "logo-b.png"
  - mainMenuLinks: ["Products B", "Services B"]
  - footerLinks: ["About B", "Contact B"]
- NO cross-contamination between organizations
- Each organization sees only its own branding data
- No data leakage

**References:** VCST-4637, Security
**Automation Status:** Not Automated

---

### WL-GQL-020: Performance test - query response time < 500ms

**Section:** GraphQL > whiteLabelingSettings
**Type:** Performance
**Priority:** High
**Estimate:** 5m

**Preconditions:**
- Organization with full branding configured (logo, favicon, theme, footer, main menu)
- Database in stable state
- Normal system load

**Steps:**
1. Execute query 10 times consecutively:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "branded-org-001"
    storeId: "B2B-store"
  ) {
    logoUrl
    secondaryLogoUrl
    faviconUrl
    favicons { rel type sizes href }
    themePresetName
    footerLinks { title url childItems { title url } }
    mainMenuLinks { title url priority childItems { title url priority } }
  }
}
```

2. Measure response time for each execution
3. Calculate average response time

**Expected Result:**
- Average response time < 500ms
- 95th percentile < 700ms
- No query takes > 1000ms
- No significant performance degradation with mainMenuLinks field
- Consistent performance across executions (no outliers)

**References:** VCST-4637 PR#21
**Automation Status:** Not Automated

---

### WL-GQL-021: Query without authentication - verify behavior

**Section:** GraphQL > whiteLabelingSettings
**Type:** Security
**Priority:** High
**Estimate:** 3m

**Preconditions:**
- GraphQL endpoint accessible
- No authentication token provided

**Steps:**
1. Execute query WITHOUT authentication header:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "test-org-001"
    storeId: "B2B-store"
  ) {
    logoUrl
    themePresetName
  }
}
```

2. Verify authentication behavior

**Expected Result:**
- One of two behaviors is acceptable:
  - **Option A (Public):** Query executes successfully (white labeling is public storefront data)
  - **Option B (Protected):** Query returns authentication error
- If authentication required:
  - Error message: "Unauthorized" or "Authentication required"
  - Error code: UNAUTHENTICATED
  - HTTP status: 200 (GraphQL convention)
- No sensitive data exposed in error messages
- Behavior is consistent with system security policy

**References:** VCST-4637
**Automation Status:** Not Automated

---

### WL-GQL-022: Partial field selection - request only specific fields

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** Medium
**Estimate:** 3m

**Preconditions:**
- Organization with full branding configured

**Steps:**
1. Execute query requesting ONLY logoUrl (no other fields):

```graphql
query {
  whiteLabelingSettings(
    organizationId: "branded-org-001"
    storeId: "B2B-store"
  ) {
    logoUrl
  }
}
```

2. Verify response contains only requested field

**Expected Result:**
- Query executes successfully
- Response contains only logoUrl field
- Other fields (faviconUrl, themePresetName, footerLinks, mainMenuLinks) NOT returned
- GraphQL field selection works correctly
- No errors or warnings
- Query performance is optimal (backend doesn't fetch unnecessary data)

**References:** VCST-4637
**Automation Status:** Not Automated

---

### WL-GQL-023: Verify footerLinks childItems can be empty array

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** Medium
**Estimate:** 2m

**Preconditions:**
- Organization with footer link that has NO children configured
- Footer link: "Company" with childItems = empty

**Steps:**
1. Execute query requesting footerLinks:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "test-org-001"
    storeId: "B2B-store"
  ) {
    footerLinks {
      title
      childItems {
        title
      }
    }
  }
}
```

2. Verify empty childItems handling

**Expected Result:**
- footerLinks array returned
- Parent link "Company" has childItems as empty array: []
- OR childItems is null
- No errors or validation issues
- Empty array is valid response

**References:** C385322
**Automation Status:** Not Automated

---

### WL-GQL-024: Verify mainMenuLinks childItems can be empty array

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** Medium
**Estimate:** 2m

**Preconditions:**
- Organization with main menu link that has NO children
- Main menu link: "Home" with childItems = empty

**Steps:**
1. Execute query requesting mainMenuLinks:

```graphql
query {
  whiteLabelingSettings(
    organizationId: "test-org-001"
    storeId: "B2B-store"
  ) {
    mainMenuLinks {
      title
      childItems {
        title
      }
    }
  }
}
```

2. Verify empty childItems handling

**Expected Result:**
- mainMenuLinks array returned
- Parent link "Home" has childItems as empty array: []
- OR childItems is null
- No errors or validation issues
- Empty array is valid response for parent links without children

**References:** VCST-4637 PR#21
**Automation Status:** Not Automated

---

### WL-GQL-025: Verify concurrent queries for different organizations return correct data

**Section:** GraphQL > whiteLabelingSettings
**Type:** Functional
**Priority:** High
**Estimate:** 5m

**Preconditions:**
- Three organizations configured with different branding:
  - org-a: Logo A, Menu A
  - org-b: Logo B, Menu B
  - org-c: Logo C, Menu C

**Steps:**
1. Execute 3 queries concurrently (within 1 second):
   - Query 1: organizationId = "org-a"
   - Query 2: organizationId = "org-b"
   - Query 3: organizationId = "org-c"
2. Verify each response

**Expected Result:**
- All 3 queries return successfully
- Query 1 returns org-a branding (Logo A, Menu A)
- Query 2 returns org-b branding (Logo B, Menu B)
- Query 3 returns org-c branding (Logo C, Menu C)
- No cross-contamination or race conditions
- No query returns another organization's data
- Concurrent execution is handled correctly

**References:** VCST-4637
**Automation Status:** Not Automated

---

## B. pageContext Query Tests

### PC-GQL-001: Basic pageContext query with all required parameters

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** Critical
**Estimate:** 4m

**Preconditions:**
- GraphQL endpoint accessible at `${BACK_URL}/graphql`
- Test store: B2B-store with domain: qa.virtocommerce.com
- Homepage exists at permalink: "/"

**Steps:**
1. Navigate to GraphQL playground
2. Execute pageContext query:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
  ) {
    slugInfo {
      entityInfo {
        id
      }
    }
    store {
      storeId
    }
    whiteLabelingSettings {
      logoUrl
      faviconUrl
      themePresetName
      footerLinks { title url }
      mainMenuLinks { title url priority }
    }
    user {
      id
      userName
    }
  }
}
```

3. Verify all sub-objects returned

**Expected Result:**
- Query executes successfully
- Response contains data.pageContext object with 4 sub-objects:
  1. slugInfo: { entityInfo: { id: ... } }
  2. store: { storeId: "B2B-store" }
  3. whiteLabelingSettings: { logoUrl, faviconUrl, themePresetName, footerLinks, mainMenuLinks }
  4. user: { id, userName } or null (if anonymous)
- Single query returns all data (no need for 4 separate queries)
- No GraphQL errors

**References:** Virto Commerce xFrontend docs
**Automation Status:** Not Automated

---

### PC-GQL-002: Verify slugInfo.entityInfo.id returned for valid permalink

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** Critical
**Estimate:** 3m

**Preconditions:**
- Product page exists at permalink: "/products/laptop-dell-xps-15"
- Product ID in database: "prod-12345"

**Steps:**
1. Execute pageContext query for product permalink:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/products/laptop-dell-xps-15"
  ) {
    slugInfo {
      entityInfo {
        id
      }
    }
  }
}
```

2. Verify slugInfo returned

**Expected Result:**
- slugInfo object is not null
- slugInfo.entityInfo.id = "prod-12345"
- Entity ID matches product in database
- Slug resolution works correctly

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-003: Verify slugInfo for non-existent permalink (404 slug)

**Section:** GraphQL > xFrontend > pageContext
**Type:** Negative
**Priority:** High
**Estimate:** 3m

**Preconditions:**
- Permalink "/products/non-existent-product-999" does NOT exist

**Steps:**
1. Execute pageContext query for non-existent permalink:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/products/non-existent-product-999"
  ) {
    slugInfo {
      entityInfo {
        id
      }
    }
  }
}
```

2. Verify 404 handling

**Expected Result:**
- Query executes without backend error
- slugInfo is null (slug not found)
- OR slugInfo.entityInfo is null
- No GraphQL errors (graceful handling)
- Frontend should interpret null slugInfo as 404 page

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-004: Verify store.storeId matches requested storeId

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** High
**Estimate:** 2m

**Preconditions:**
- Store B2B-store exists

**Steps:**
1. Execute pageContext query:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
  ) {
    store {
      storeId
    }
  }
}
```

2. Verify storeId in response

**Expected Result:**
- store object is not null
- store.storeId = "B2B-store"
- Matches input parameter exactly
- Store data resolved correctly

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-005: Verify whiteLabelingSettings embedded in pageContext returns correct branding

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** Critical
**Estimate:** 4m

**Preconditions:**
- Organization `branded-org-001` with full branding configured
- User logged in as member of branded-org-001

**Steps:**
1. Execute pageContext query with organizationId:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
    organizationId: "branded-org-001"
  ) {
    whiteLabelingSettings {
      logoUrl
      faviconUrl
      themePresetName
      footerLinks { title url }
      mainMenuLinks { title url priority }
    }
  }
}
```

2. Verify branding data

**Expected Result:**
- whiteLabelingSettings object returned (not null)
- logoUrl contains organization's custom logo URL
- faviconUrl contains organization's favicon URL
- themePresetName matches organization's theme
- footerLinks array contains organization's footer links
- mainMenuLinks array contains organization's main menu links
- Branding matches organization configuration
- Same data as standalone whiteLabelingSettings query

**References:** xFrontend pageContext docs, VCST-4637
**Automation Status:** Not Automated

---

### PC-GQL-006: Verify whiteLabelingSettings includes mainMenuLinks (new field)

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** Critical
**Estimate:** 3m

**Preconditions:**
- Organization with main menu link list configured
- Main menu links: "Products", "Services", "About"

**Steps:**
1. Execute pageContext query requesting mainMenuLinks:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
    organizationId: "test-org-001"
  ) {
    whiteLabelingSettings {
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
    }
  }
}
```

2. Verify mainMenuLinks field is present

**Expected Result:**
- whiteLabelingSettings.mainMenuLinks is not null
- mainMenuLinks array contains expected links: ["Products", "Services", "About"]
- Each link has title, url, priority fields
- Hierarchical structure (childItems) supported
- mainMenuLinks field works identically to standalone whiteLabelingSettings query
- New field is integrated into pageContext

**References:** VCST-4637 PR#21, xFrontend docs
**Automation Status:** Not Automated

---

### PC-GQL-007: Verify user data for authenticated user (userId provided)

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** High
**Estimate:** 3m

**Preconditions:**
- User account exists with userId: "user-123", userName: "john.doe@example.com"
- User is authenticated

**Steps:**
1. Execute pageContext query with userId:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
    userId: "user-123"
  ) {
    user {
      id
      userName
    }
  }
}
```

2. Verify user data returned

**Expected Result:**
- user object is not null
- user.id = "user-123"
- user.userName = "john.doe@example.com"
- User data matches database record
- User context resolved correctly

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-008: Verify user data for anonymous user (no userId)

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** High
**Estimate:** 3m

**Preconditions:**
- Anonymous user (not logged in)
- No userId parameter provided

**Steps:**
1. Execute pageContext query WITHOUT userId:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
  ) {
    user {
      id
      userName
    }
  }
}
```

2. Verify anonymous user handling

**Expected Result:**
- user object is null (anonymous user has no user data)
- OR user object returned with id = null and userName = null/anonymous
- No errors or exceptions
- Anonymous users can still access pageContext query
- Other data (slugInfo, store, whiteLabelingSettings) still returned

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-009: Query with organizationId - verify org-specific branding in whiteLabelingSettings

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** Critical
**Estimate:** 4m

**Preconditions:**
- Organization `org-a` with Logo A and Menu A
- Organization `org-b` with Logo B and Menu B

**Steps:**
1. Execute pageContext query with organizationId = "org-a":

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
    organizationId: "org-a"
  ) {
    whiteLabelingSettings {
      logoUrl
      mainMenuLinks { title }
    }
  }
}
```

2. Execute pageContext query with organizationId = "org-b"
3. Compare results

**Expected Result:**
- Query with org-a returns Logo A and Menu A
- Query with org-b returns Logo B and Menu B
- Organization-specific branding resolved correctly in pageContext
- No cross-contamination

**References:** xFrontend pageContext docs, VCST-4637
**Automation Status:** Not Automated

---

### PC-GQL-010: Query without organizationId - verify default/store-level branding

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** High
**Estimate:** 3m

**Preconditions:**
- Store B2B-store has store-level white labeling configured
- Default logo and theme set at store level

**Steps:**
1. Execute pageContext query WITHOUT organizationId:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
  ) {
    whiteLabelingSettings {
      logoUrl
      themePresetName
    }
  }
}
```

2. Verify store-level branding returned

**Expected Result:**
- whiteLabelingSettings returns store-level branding (not org-specific)
- logoUrl shows store's default logo
- themePresetName shows store's default theme
- Fallback to store-level branding when no organizationId provided
- Anonymous users see store-level branding

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-011: Verify cultureName affects localized data

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** High
**Estimate:** 4m

**Preconditions:**
- Organization with localized link lists (EN and PL)
- Footer links and main menu links have translations

**Steps:**
1. Execute pageContext query with cultureName = "en-US":

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
    organizationId: "multilang-org"
  ) {
    whiteLabelingSettings {
      mainMenuLinks { title }
    }
  }
}
```

2. Execute same query with cultureName = "pl-PL"
3. Compare link titles

**Expected Result:**
- Query with cultureName = "en-US" returns English link titles
- Query with cultureName = "pl-PL" returns Polish link titles
- cultureName parameter affects localization in embedded whiteLabelingSettings
- Same behavior as standalone whiteLabelingSettings query

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-012: Query with different permalink paths

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** High
**Estimate:** 5m

**Preconditions:**
- Multiple pages exist:
  - "/" (homepage)
  - "/products" (catalog page)
  - "/about" (CMS page)
  - "/custom-page" (Page Builder page)

**Steps:**
1. Execute pageContext query for each permalink
2. Verify slugInfo.entityInfo.id differs for each

**Expected Result:**
- permalink = "/" returns homepage entity ID
- permalink = "/products" returns catalog page entity ID
- permalink = "/about" returns CMS page entity ID
- permalink = "/custom-page" returns Page Builder page entity ID
- Each permalink resolves to different entity
- slugInfo data differs based on permalink
- store, whiteLabelingSettings, user data remain consistent (not affected by permalink)

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-013: Verify domain parameter resolves correct store

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** High
**Estimate:** 3m

**Preconditions:**
- Two stores configured:
  - Store A: domain = "store-a.virtocommerce.com", storeId = "Store-A"
  - Store B: domain = "store-b.virtocommerce.com", storeId = "Store-B"

**Steps:**
1. Execute pageContext query with domain = "store-a.virtocommerce.com" and storeId = "Store-A"
2. Execute pageContext query with domain = "store-b.virtocommerce.com" and storeId = "Store-B"
3. Verify store resolution

**Expected Result:**
- Query with domain = "store-a.virtocommerce.com" returns store.storeId = "Store-A"
- Query with domain = "store-b.virtocommerce.com" returns store.storeId = "Store-B"
- Domain parameter helps resolve correct store
- Store-specific data (branding, catalog) differs between stores

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-014: Verify missing required param (domain) returns validation error

**Section:** GraphQL > xFrontend > pageContext
**Type:** Negative
**Priority:** High
**Estimate:** 2m

**Preconditions:**
- GraphQL endpoint accessible

**Steps:**
1. Execute pageContext query WITHOUT domain parameter:

```graphql
query {
  pageContext(
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
  ) {
    store { storeId }
  }
}
```

2. Verify validation error

**Expected Result:**
- Query fails with GraphQL validation error
- Error message indicates required argument "domain" is missing
- Error type: GRAPHQL_VALIDATION_FAILED
- HTTP status: 200 (GraphQL convention)
- Clear error message for developers

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-015: Verify missing required param (storeId) returns validation error

**Section:** GraphQL > xFrontend > pageContext
**Type:** Negative
**Priority:** High
**Estimate:** 2m

**Preconditions:**
- GraphQL endpoint accessible

**Steps:**
1. Execute pageContext query WITHOUT storeId parameter:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    cultureName: "en-US"
    permalink: "/"
  ) {
    store { storeId }
  }
}
```

2. Verify validation error

**Expected Result:**
- Query fails with GraphQL validation error
- Error message: Required argument "storeId" missing
- Error type: GRAPHQL_VALIDATION_FAILED
- HTTP status: 200

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-016: Verify missing required param (cultureName) returns validation error

**Section:** GraphQL > xFrontend > pageContext
**Type:** Negative
**Priority:** High
**Estimate:** 2m

**Preconditions:**
- GraphQL endpoint accessible

**Steps:**
1. Execute pageContext query WITHOUT cultureName parameter:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    permalink: "/"
  ) {
    store { storeId }
  }
}
```

2. Verify validation error

**Expected Result:**
- Query fails with GraphQL validation error
- Error message: Required argument "cultureName" missing
- Error type: GRAPHQL_VALIDATION_FAILED
- HTTP status: 200

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-017: Verify missing required param (permalink) returns validation error

**Section:** GraphQL > xFrontend > pageContext
**Type:** Negative
**Priority:** High
**Estimate:** 2m

**Preconditions:**
- GraphQL endpoint accessible

**Steps:**
1. Execute pageContext query WITHOUT permalink parameter:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
  ) {
    store { storeId }
  }
}
```

2. Verify validation error

**Expected Result:**
- Query fails with GraphQL validation error
- Error message: Required argument "permalink" missing
- Error type: GRAPHQL_VALIDATION_FAILED
- HTTP status: 200

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-018: Performance - pageContext should be faster than 4 separate queries

**Section:** GraphQL > xFrontend > pageContext
**Type:** Performance
**Priority:** Critical
**Estimate:** 8m

**Preconditions:**
- Organization with full branding configured
- Normal system load

**Steps:**
1. **Scenario A (4 separate queries):**
   - Execute slugInfo query (measure time)
   - Execute store query (measure time)
   - Execute whiteLabelingSettings query (measure time)
   - Execute user query (measure time)
   - Calculate total time = sum of 4 queries

2. **Scenario B (single pageContext query):**
   - Execute pageContext query requesting all 4 sub-objects:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
    organizationId: "branded-org-001"
    userId: "user-123"
  ) {
    slugInfo { entityInfo { id } }
    store { storeId }
    whiteLabelingSettings {
      logoUrl
      faviconUrl
      themePresetName
      footerLinks { title url }
      mainMenuLinks { title url priority }
    }
    user { id userName }
  }
}
```

   - Measure time

3. Compare performance

**Expected Result:**
- pageContext query (Scenario B) is significantly faster than 4 separate queries (Scenario A)
- Expected improvement: 50-70% faster
- Example:
  - 4 separate queries: ~800ms total
  - pageContext query: ~300ms
- Single pageContext query reduces network round-trips
- Backend can optimize data fetching
- pageContext query is PRIMARY use case for storefront initialization

**References:** xFrontend pageContext docs - performance optimization
**Automation Status:** Not Automated

---

### PC-GQL-019: Verify pageContext with organization switching

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** Critical
**Estimate:** 5m

**Preconditions:**
- User is member of two organizations: org-a and org-b
- Each organization has different branding

**Steps:**
1. Execute pageContext query with organizationId = "org-a":

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
    organizationId: "org-a"
    userId: "user-123"
  ) {
    whiteLabelingSettings {
      logoUrl
      mainMenuLinks { title }
    }
  }
}
```

2. Execute pageContext query with organizationId = "org-b"
3. Verify different branding returned

**Expected Result:**
- Query with org-a returns org-a logo and menu
- Query with org-b returns org-b logo and menu
- Switching organizationId parameter updates branding
- Same as organization switching in storefront
- No caching issues or stale data

**References:** xFrontend pageContext docs, Multi-organization
**Automation Status:** Not Automated

---

### PC-GQL-020: Verify pageContext for CMS/Page Builder pages

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** High
**Estimate:** 4m

**Preconditions:**
- CMS page exists with permalink: "/custom-page-about-us"
- Page created in Page Builder / VC CMS

**Steps:**
1. Execute pageContext query for CMS page:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/custom-page-about-us"
  ) {
    slugInfo {
      entityInfo {
        id
      }
    }
    whiteLabelingSettings {
      logoUrl
      mainMenuLinks { title }
    }
  }
}
```

2. Verify CMS page resolution

**Expected Result:**
- slugInfo.entityInfo.id returns CMS page entity ID
- Slug resolves correctly for CMS pages
- whiteLabelingSettings still returned (branding applies to all pages)
- mainMenuLinks available for navigation
- pageContext works for all page types (product, category, CMS, custom)

**References:** xFrontend pageContext docs, xCMS
**Automation Status:** Not Automated

---

### PC-GQL-021: Verify pageContext handles language prefix in permalink

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** Medium
**Estimate:** 4m

**Preconditions:**
- Store supports multiple languages (en-US, pl-PL)
- Page exists at permalink: "/pl/qa1" (Polish version) and "/qa1" (English version)

**Steps:**
1. Execute pageContext query with permalink = "/pl/qa1" and cultureName = "pl-PL"
2. Execute pageContext query with permalink = "/qa1" and cultureName = "en-US"
3. Compare results

**Expected Result:**
- permalink = "/pl/qa1" with cultureName = "pl-PL" resolves to Polish page
- permalink = "/qa1" with cultureName = "en-US" resolves to English page
- slugInfo.entityInfo.id is the same (same entity, different language)
- whiteLabelingSettings localized based on cultureName
- Language prefix in permalink handled correctly

**References:** xFrontend pageContext docs, Localization
**Automation Status:** Not Automated

---

### PC-GQL-022: Verify pageContext with both organizationId AND userId

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** High
**Estimate:** 4m

**Preconditions:**
- User `user-123` is member of organization `test-org-001`
- Organization has custom branding configured

**Steps:**
1. Execute pageContext query with both organizationId and userId:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
    organizationId: "test-org-001"
    userId: "user-123"
  ) {
    whiteLabelingSettings {
      logoUrl
      mainMenuLinks { title }
    }
    user {
      id
      userName
    }
  }
}
```

2. Verify both contexts resolved

**Expected Result:**
- whiteLabelingSettings returns organization-specific branding
- user object returns user data (id = "user-123", userName populated)
- Both organizationId and userId parameters work together
- Complete user + organization context resolved in single query
- This is the PRIMARY use case for logged-in organization members

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-023: Error handling - invalid storeId

**Section:** GraphQL > xFrontend > pageContext
**Type:** Negative
**Priority:** High
**Estimate:** 3m

**Preconditions:**
- storeId "invalid-store-999" does NOT exist

**Steps:**
1. Execute pageContext query with invalid storeId:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "invalid-store-999"
    cultureName: "en-US"
    permalink: "/"
  ) {
    store { storeId }
  }
}
```

2. Verify error handling

**Expected Result:**
- Query fails with GraphQL error
- Error message indicates store not found or invalid storeId
- Error type: BAD_USER_INPUT or NOT_FOUND
- HTTP status: 200 (GraphQL convention)
- No backend crash or 500 error
- Error message does not leak sensitive information

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-024: Error handling - invalid domain

**Section:** GraphQL > xFrontend > pageContext
**Type:** Negative
**Priority:** High
**Estimate:** 3m

**Preconditions:**
- Domain "invalid-domain-999.com" is not configured for any store

**Steps:**
1. Execute pageContext query with invalid domain:

```graphql
query {
  pageContext(
    domain: "invalid-domain-999.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
  ) {
    store { storeId }
  }
}
```

2. Verify error handling

**Expected Result:**
- Query fails with GraphQL error OR returns default fallback
- Error message indicates domain not found or store mismatch
- No backend crash
- Graceful error handling

**References:** xFrontend pageContext docs
**Automation Status:** Not Automated

---

### PC-GQL-025: Verify all 4 sub-objects returned in single response

**Section:** GraphQL > xFrontend > pageContext
**Type:** Functional
**Priority:** Critical
**Estimate:** 5m

**Preconditions:**
- Full environment setup:
  - Store: B2B-store
  - Homepage exists at "/"
  - Organization: branded-org-001 with branding
  - User: user-123 logged in

**Steps:**
1. Execute comprehensive pageContext query:

```graphql
query {
  pageContext(
    domain: "qa.virtocommerce.com"
    storeId: "B2B-store"
    cultureName: "en-US"
    permalink: "/"
    organizationId: "branded-org-001"
    userId: "user-123"
  ) {
    slugInfo {
      entityInfo { id }
    }
    store {
      storeId
      name
      defaultCurrency
    }
    whiteLabelingSettings {
      logoUrl
      secondaryLogoUrl
      faviconUrl
      favicons { rel type sizes href }
      themePresetName
      footerLinks {
        title
        url
        childItems { title url }
      }
      mainMenuLinks {
        title
        url
        priority
        childItems { title url priority }
      }
    }
    user {
      id
      userName
      email
    }
  }
}
```

2. Verify all 4 sub-objects populated

**Expected Result:**
- Single response contains ALL 4 sub-objects:
  1. **slugInfo**: { entityInfo: { id: "homepage-id" } }
  2. **store**: { storeId: "B2B-store", name: "...", defaultCurrency: "USD" }
  3. **whiteLabelingSettings**: {
       logoUrl: "...",
       faviconUrl: "...",
       themePresetName: "Coffee",
       footerLinks: [...],
       mainMenuLinks: [...] with priority
     }
  4. **user**: { id: "user-123", userName: "...", email: "..." }
- All data returned in < 500ms
- Single query replaces 4 separate API calls
- This is the PRIMARY storefront initialization query
- All new features (mainMenuLinks with priority) included

**References:** xFrontend pageContext docs, VCST-4637
**Automation Status:** Not Automated

---

## Summary

### Total Test Cases: 50
- **whiteLabelingSettings Query**: 25 test cases
- **pageContext Query**: 25 test cases

### Coverage by Type
| Type | Count | % |
|------|-------|---|
| Functional | 34 | 68% |
| Negative | 8 | 16% |
| Performance | 3 | 6% |
| Security | 3 | 6% |
| Regression | 2 | 4% |

### Coverage by Priority
| Priority | Count | % |
|----------|-------|---|
| Critical | 18 | 36% |
| High | 26 | 52% |
| Medium | 6 | 12% |

### Key Testing Areas
1. Basic query functionality (all required params)
2. Full branding configuration (logo, favicon, theme, footer, mainMenu)
3. Empty/null branding fallback behavior
4. Error handling (missing params, invalid data)
5. Optional parameters (cultureName, userId)
6. Field validation and data types
7. Hierarchical structures (footerLinks, mainMenuLinks with childItems)
8. Priority ordering (mainMenuLinks)
9. Organization isolation (no cross-contamination)
10. Performance (response time < 500ms)
11. Authentication/security
12. Partial field selection
13. Concurrent query handling
14. pageContext consolidation (4 queries in 1)
15. Localization (cultureName)
16. Slug resolution (permalink to entity ID)
17. Multi-organization switching
18. CMS/Page Builder page support
19. Store resolution by domain
20. Backward compatibility

### Automation Recommendations
**High Priority for Automation (P0/P1):**
- WL-GQL-001, WL-GQL-002, WL-GQL-016, WL-GQL-019
- PC-GQL-001, PC-GQL-005, PC-GQL-006, PC-GQL-022, PC-GQL-025

**Medium Priority for Automation (P2):**
- Error handling test cases (WL-GQL-004 through WL-GQL-006)
- Performance tests (WL-GQL-020, PC-GQL-018)
