# Testing Checklist — VCST-4872: Page Builder Save/Load/Clone

**Ticket:** VCST-4872 | **PR:** #116 (vc-module-pagebuilder)
**Artifact:** VirtoCommerce.PageBuilderModule_3.1003.0-pr-116-0696.zip (deployed to QA)
**Test Cases:** CMS-111 through CMS-122 in `regression/suites/Backend/cms/059-cms-page-management.csv`

## Acceptance Criteria Mapping

| AC | Test Cases | Description |
|----|-----------|-------------|
| AC-1: Save page content to file | CMS-111, CMS-112 | Download JSON from detail blade toolbar |
| AC-2: Load page content from file | CMS-113, CMS-114, CMS-115 | Upload JSON from Draft tab toolbar |
| AC-3: Clone page with content | CMS-116, CMS-117, CMS-118, CMS-119 | Duplicate page from detail blade |
| AC-4: API copy endpoint | CMS-120 | POST .../content/{sourceGroupId} |
| AC-5: Round-trip fidelity | CMS-122 | Export then import preserves content |
| AC-6: Error handling | CMS-121 | Invalid file handling |

## Critical Verification Points

### Save Content (CMS-111, CMS-112)
- [ ] "Save content" button visible in page detail toolbar with download icon
- [ ] Button disabled on new unsaved pages
- [ ] GET /api/page-builder-pages/grouped/{groupId}/content?draft=true returns 200
- [ ] Downloaded file is valid JSON with page content
- [ ] File name pattern: {page-name}-content.json
- [ ] No console errors during download

### Load Content (CMS-113, CMS-114, CMS-115)
- [ ] "Load content" button visible ONLY on Draft tab toolbar
- [ ] File input accepts only .json files
- [ ] After file selection, PageDetails blade opens for new page
- [ ] Fill name/permalink + Save creates page with uploaded content
- [ ] Content blocks render correctly in designer
- [ ] Cancel file selection has no side effects
- [ ] Network: POST /grouped (create) then POST /content (upload)

### Clone Page (CMS-116, CMS-117, CMS-118, CMS-119)
- [ ] "Clone" button visible in page detail toolbar with copy icon
- [ ] Button disabled on new unsaved pages
- [ ] Clone name: "{original} (copy)", permalink: "{original}-copy"
- [ ] Content copied server-side via POST .../content/{sourceGroupId}
- [ ] Clone appears in Draft list
- [ ] Clone blade opens automatically
- [ ] Metadata preserved: cultureName, storeId, visibility, userGroups, organizationId
- [ ] Double-clone produces "(copy) (copy)" / "-copy-copy"

### API Endpoint (CMS-120)
- [ ] POST /api/page-builder-pages/grouped/{targetGroupId}/content/{sourceGroupId} returns 204
- [ ] Target page content matches source after copy
- [ ] 401 without auth token
- [ ] 404 with invalid group IDs

### Data Integrity (CMS-122)
- [ ] Export PAGE-1 (7 blocks) then import produces identical block structure
- [ ] Block types, order, and content fields match source

### Negative Cases (CMS-121)
- [ ] Empty JSON file: graceful handling
- [ ] Malformed JSON: error shown, no corruption

## Regression Check
- [ ] CMS-001 (create page) still works — toolbar has new buttons but flow unchanged
- [ ] CMS-004 (open designer) — toolbar layout not broken by new buttons
- [ ] CMS-006 (publish) — flow unchanged
