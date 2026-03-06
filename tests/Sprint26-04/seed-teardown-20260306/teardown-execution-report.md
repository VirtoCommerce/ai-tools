# TEST Data Teardown Execution Report

**Date:** 2026-03-06
**Environment:** https://vcst-qa.govirto.com (QA)
**Executed by:** qa-backend-expert agent
**Store:** B2B-store

---

## Summary

All `TEST-*` entities created by multiple seed runs on 2026-03-06 have been successfully deleted from the QA environment. A total of **21 entities** were cleaned up (11 catalogs + 10 price lists, plus 1 catalog and 1 price list deleted during endpoint probing).

| Entity Type | Count Found | Count Deleted | Status |
|-------------|-------------|---------------|--------|
| TEST Catalogs | 11 | 11 | CLEAN |
| TEST Price Lists | 11 | 11 | CLEAN |
| TEST Products | 0 | 0 | N/A (seed product creation had failed) |
| TEST Categories | 0 | 0 | N/A (only existed in first catalog, empty in rest) |
| TEST PL Assignments | 0 | 0 | N/A (seed assignment creation had returned 500) |
| TEST Inventory | 0 | 0 | N/A (no products to clear) |

**Final State:** VERIFIED -- zero TEST-* entities remain in catalogs, pricing, or search index.

---

## Entities Deleted

### Price Lists (11 deleted, all HTTP 204)

| ID | Name | HTTP Status |
|----|------|-------------|
| 09daf2e1-9223-4a3d-b328-08e8d6ed6aaa | TEST-PL-USD-20260306 | 204 (via Postman run 1) |
| 0c26d99d-ea90-464d-a2d7-f19ecd86a08b | TEST-PL-USD-20260306 | 204 |
| 6de8f634-6044-4e65-b893-5094c8e4d60f | TEST-PL-USD-20260306 | 204 |
| 999e4413-d75c-4abf-9a42-702c4898e12c | TEST-PL-USD-20260306 | 204 |
| a121f014-e52b-47e3-8441-82128f6c6a51 | TEST-PL-USD-20260306 | 204 |
| a84641ba-bf6a-4fd8-984b-861edd6f4e5d | TEST-PL-USD-20260306 | 204 |
| ab0dda2f-33f3-4cc7-a827-c48d9c8195cc | TEST-PL-USD-20260306 | 204 |
| b17e5ce0-06d6-46dc-b16c-ff14f6643217 | TEST-PL-USD-20260306 | 204 |
| bbb8ad40-27b9-449a-ba08-bfbfe59f8266 | TEST-PL-USD-20260306 | 204 |
| d7570182-afa3-4564-a085-59b7cbbd6d72 | TEST-PL-USD-20260306 | 204 |
| e3c0549b-9407-480a-ab50-b51b0840181d | TEST-PL-USD-20260306 | 204 |

### Catalogs (11 deleted, all HTTP 204)

| ID | Name | HTTP Status |
|----|------|-------------|
| 2d1ed758-87c1-46ca-98b2-0a8e9156ce53 | TEST-Catalog-20260306 | 204 (via endpoint probe) |
| 18f854c2-2c04-4191-a606-d434752656ea | TEST-Catalog-20260306 | 204 |
| 41f16076-aa3e-4fad-aa44-5bd1d760db11 | TEST-Catalog-20260306 | 204 |
| 48cca5aa-54cf-45c5-b82d-9a19e89f95f9 | TEST-Catalog-20260306 | 204 |
| 5d5c91f6-493a-4901-aeeb-f0238c6b93bf | TEST-Catalog-20260306 | 204 |
| 8cc2bfb7-d86f-4cd6-a32a-0b59b12594bf | TEST-Catalog-20260306 | 204 |
| 9a2b25a5-3f76-44af-9473-29063ff04a96 | TEST-Catalog-20260306 | 204 |
| 9d8b948b-78f1-4d14-b081-bccd76a346a3 | TEST-Catalog-20260306 | 204 |
| b009872f-85ed-42f2-b8ca-6e2c78a881f7 | TEST-Catalog-20260306 | 204 |
| d4360dc5-835e-4870-9a6c-9f7975751927 | TEST-Catalog-20260306 | 204 |
| ef3eb3a6-0ec9-4936-8855-5bd72647d8eb | TEST-Catalog-20260306 | 204 |

---

## Post-Cleanup Verification

Search reindex triggered: `POST /api/search/indexes/index` -- returned 200, job ID 1354922.

| Verification Check | Result |
|--------------------|--------|
| `POST /api/catalog/catalogs/search` keyword=TEST- | totalCount: 0 |
| `GET /api/pricing/pricelists?keyword=TEST-` | totalCount: 0 |
| `POST /api/catalog/search/products` keyword=TEST- | 0 TEST-prefixed products |
| Search reindex triggered | Job ID 1354922 accepted |

---

## API Endpoint Corrections Discovered

During this teardown, several endpoint discrepancies were identified vs. what the seed collection used. These are the **correct endpoints** for the current platform version:

| Operation | INCORRECT (returned 405) | CORRECT (works) |
|-----------|--------------------------|-----------------|
| Search price lists | `POST /api/pricing/pricelists/search` | `GET /api/pricing/pricelists?keyword=...&take=...` |
| Search categories | `POST /api/catalog/categories/search` | `POST /api/catalog/search/categories` (with `catalogIds` body) |
| Search PL assignments | `POST /api/pricing/assignments/search` | `GET /api/pricing/assignments?keyword=...&take=...` |
| Delete catalog | `DELETE /api/catalog/catalogs?ids=...` | `DELETE /api/catalog/catalogs/{id}` (path param) |
| Delete products | `DELETE /api/catalog/products?ids=...` | `POST /api/catalog/listentries/delete` (body: `{ids, objectType}`) |
| Delete categories | `DELETE /api/catalog/categories?ids=...` | `POST /api/catalog/listentries/delete` (body: `{ids, objectType}`) |
| Delete price list | `DELETE /api/pricing/pricelists?ids=...` | Works as-is (query param) |

These corrections should be applied to both the seed and teardown Postman collections for future use.

---

## Postman Artifacts

| Artifact | ID |
|----------|----|
| Teardown Collection | `15325423-47ac6c8e-e68a-4ae6-9a8f-6440c575d3bf` |
| Environment | `15325423-8e93ba3c-b5e9-49bc-8201-b5faccd21797` |
| Workspace | `8bd7a5b3-73e5-4414-a9c9-d59018b44079` (VirtoPlatform) |

**Note:** The Postman collection still contains the original (incorrect) endpoints for requests 04-06 and 16-17. These return 405 on the current platform version. The actual cleanup was performed via direct curl API calls using the corrected endpoints listed above. The collection should be updated with corrected endpoints before reuse.

---

## Observations

1. **Multiple seed runs created 11 duplicate catalogs and 11 duplicate price lists.** The seed collection lacks idempotency guards -- running it multiple times creates duplicates rather than updating existing entities.

2. **Seed product/category creation failed silently for most runs.** Only 1 of 11 catalogs had any categories or products inside it. The seed collection should add assertions to verify entity creation succeeded.

3. **Price list assignment creation returned 500 during seed.** Zero assignments were found during teardown, confirming the original seed failure.

4. **Platform uses mixed REST patterns.** Some modules use `POST /search` (catalog), others use `GET ?keyword=` (pricing). Delete methods also vary: path-based (`/catalogs/{id}`), query-based (`/pricelists?ids=`), and body-based (`/listentries/delete`). This inconsistency should be documented in the API reference.
