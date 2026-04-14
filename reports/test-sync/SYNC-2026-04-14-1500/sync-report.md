# Test Sync Report — SYNC-2026-04-14-1500

## Summary
- **Source:** PR #116 (VirtoCommerce/vc-module-pagebuilder) — VCST-4872
- **Date:** 2026-04-14
- **Changed modules:** CMS / Page Builder
- **Changed layers:** Backend (C# controller), Frontend (Vue/TS composables)
- **Affected suites:** 059 (CMS Page Management)
- **Artifact:** `VirtoCommerce.PageBuilderModule_3.1003.0-pr-116-0696.zip`

## Change Inventory

| Module | Layer | Files Changed | Breaking | New Features |
|--------|-------|--------------|----------|-------------|
| PageBuilder | Backend | 1 (PageBuilderPageController.cs) | None | `POST .../content/{sourceGroupId}` copy endpoint |
| PageBuilder | Frontend | 7 (Vue components, composables, locales, API client) | None | Save content, Load content, Clone page |

**New API endpoint:** `POST /api/page-builder-pages/grouped/{targetGroupId}/content/{sourceGroupId}`
- Copies latest draft/published content from source to target draft
- Requires `PageBuilder:update` permission
- Returns 204 No Content on success

**New UI actions:**
- "Save content" button in page detail toolbar (downloads JSON file)
- "Load content" button in Draft tab list toolbar (uploads JSON to create page)
- "Clone" button in page detail toolbar (duplicates page with content)

## Impact Matrix

| Suite | Total Cases | Stale | Broken | Incomplete | New Needed | Valid |
|-------|------------|-------|--------|------------|------------|-------|
| 059 | 21 (before) | 0 | 0 | 0 | 12 | 21 |
| 060 | 42 | 0 | 0 | 0 | 0 | 42 |

**Assessment:** PR #116 is purely additive — no existing test steps or assertions reference modified areas. All 63 existing cases remain VALID. The new save/load/clone features had zero coverage.

## Cases Updated

*None — all existing cases remain valid.*

## Cases Deprecated

*None.*

## New Cases Generated

| Case ID | Suite | Title | Section | Priority |
|---------|-------|-------|---------|----------|
| CMS-111 | 059 | Save content — download page content as JSON file | Content Portability | Critical |
| CMS-112 | 059 | Save content — button disabled for new unsaved page | Content Portability | High |
| CMS-113 | 059 | Load content — upload JSON file to create page from template | Content Portability | Critical |
| CMS-114 | 059 | Load content — button visible only on Draft tab | Content Portability | High |
| CMS-115 | 059 | Load content — cancel file selection has no side effects | Content Portability | Medium |
| CMS-116 | 059 | Clone page — duplicate draft page with content | Content Portability | Critical |
| CMS-117 | 059 | Clone page — preserves metadata fields | Content Portability | High |
| CMS-118 | 059 | Clone page — button disabled for new unsaved page | Content Portability | High |
| CMS-119 | 059 | Clone of a clone — name and permalink pattern | Content Portability | Medium |
| CMS-120 | 059 | API — Copy page content endpoint | Content Portability | High |
| CMS-121 | 059 | Load content — invalid file handling | Content Portability | High |
| CMS-122 | 059 | Save and Load round-trip — exported content imports correctly | Content Portability | Critical |

**Totals:** 12 new cases (4 Critical, 5 High, 2 Medium, 1 Low — actually 4 Crit + 5 High + 2 Med + 0 Low = 11 — recounted: 4 Critical + 5 High + 2 Medium = 11... let me recount)

Priority breakdown: **4 Critical** (CMS-111, 113, 116, 122), **5 High** (CMS-112, 114, 117, 118, 120, 121 — that's 6), **2 Medium** (CMS-115, 119).

Corrected: **4 Critical, 6 High, 2 Medium = 12 total.**

## Files Modified

| File | Change |
|------|--------|
| `regression/suites/Backend/cms/059-cms-page-management.csv` | +12 test cases (CMS-111 through CMS-122) |
| `config/test-suites.json` | testCount 21→33, estimatedMinutes 15→25 for suite 059 |
| `test-data/cms/pagebuilder-pages.md` | Added Content Portability test data section |

## Quality Gate

| Check | Status |
|-------|--------|
| All STALE cases updated | PASS (0 stale) |
| All BROKEN cases addressed | PASS (0 broken) |
| New behavior has coverage | PASS (12 new cases cover save/load/clone) |
| No ID conflicts | PASS (CMS-111 to CMS-122, no overlaps) |
| CSV structure valid | PASS (15-column enriched format) |
| testCount updated in manifest | PASS (21→33) |

## Recommended Next Steps

- [ ] Review updated cases: `git diff regression/suites/Backend/cms/059-cms-page-management.csv`
- [ ] Deploy artifact `VirtoCommerce.PageBuilderModule_3.1003.0-pr-116-0696.zip` to QA environment
- [ ] Run `/qa-test VCST-4872` to execute the 12 new cases against live environment
- [ ] Run `/qa-regression 059` to verify full CMS page management suite (33 cases)
- [ ] Verify existing cases CMS-001 through CMS-004 (toolbar changes) still pass
