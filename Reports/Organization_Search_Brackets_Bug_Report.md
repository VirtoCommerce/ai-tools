# Bug Report: Organization Search with Brackets Returns All Results

**Date:** January 12, 2026  
**Reporter:** QA Agent  
**Environment:** QA  
**URL:** https://vcst-qa-storefront.govirto.com  
**Browser:** Chrome with DevTools  
**Theme Version:** 2.39.0-pr-2135-96e3-96e324ed  

---

## Bug Summary

When searching for organizations using a search term containing **square brackets** (`[` or `]`), the API returns all organizations instead of filtering to only those matching the search term.

---

## Severity

**Medium** - The organization search doesn't properly handle special characters (brackets), returning incorrect results.

---

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com
2. Log in as a registered user with multiple organizations
3. Click on the Account menu in the header
4. Type `[e2e]` in the organization search field
5. Press Enter

---

## Expected Result

Only organizations containing `[e2e]` should appear:
- [Cypress]-Corporate-1 Kft. - Updated - Final
- [E2E Test] Contoso Ltd.
- [e2e] My company New

**Expected total: 3 organizations**

---

## Actual Result

ALL 30+ organizations appear in the list, including:
- ACME Store
- Aurora Market
- Bayfront Traders
- BMW-Group
- Coffee shop
- Desert Cove Market
- Harbor Supplies
- And many more...

**Actual total: 31 organizations (all of them)**

---

## Comparison with Working Search

| Search Term | Expected | Actual | Status |
|-------------|----------|--------|--------|
| `e2e` (no brackets) | 3 orgs with "e2e" | 3 orgs | ✅ WORKS |
| `[e2e]` (with brackets) | 3 orgs with "[e2e]" | 31 orgs (ALL) | ❌ BUG |
| `Bazaar` | 1 org (Sunrise Bazaar) | 1 org | ✅ WORKS |
| `Nintendo` | 1 org | 1 org | ✅ WORKS |

---

## Network Analysis

### Working Request (without brackets):
```json
{
  "operationName": "GetOrganizations",
  "variables": {
    "first": 30,
    "sort": "name:asc",
    "searchPhrase": "e2e"
  }
}
```
**Response:** `totalCount: 3` ✅

### Broken Request (with brackets):
```json
{
  "operationName": "GetOrganizations",
  "variables": {
    "first": 30,
    "sort": "name:asc",
    "searchPhrase": "[e2e]"
  }
}
```
**Response:** `totalCount: 31` (ALL organizations) ❌

---

## Root Cause Hypothesis

The square brackets `[` and `]` are special characters in search/query syntax (possibly Lucene or Elasticsearch). They may be interpreted as:
- Range queries: `[min TO max]`
- Character classes in regex
- Query syntax escape characters

The backend search engine likely fails to properly escape or handle these characters, causing the query to be treated as an empty search or wildcard.

---

## Workaround

Users should avoid using brackets in organization search. Search for the text without brackets (e.g., `e2e` instead of `[e2e]`).

---

## Screenshots

1. **Working search "e2e" (3 results):**
   ![e2e search](./Org_Search_e2e_Result.png)

2. **Broken search "[e2e]" (31 results - BUG):**
   ![brackets e2e search](./Org_Search_brackets_e2e_BUG.png)

---

## Recommendation

1. **Frontend Fix:** Escape special characters (`[`, `]`, `{`, `}`, etc.) before sending to API
2. **Backend Fix:** Properly handle/escape special characters in the search phrase
3. **Add validation:** Warn users if search contains special characters that may cause issues

---

## Related Issues

This bug may also affect:
- Product search with special characters
- User search with special characters
- Any other search functionality using the same backend search engine

---

## Additional Notes

- The search requires pressing Enter to trigger (no live filtering as you type)
- The current organization is always shown in the list regardless of search
- Regular text searches (first/last/middle of name) work correctly

