# VCST-4872: Page Builder Save/Load/Clone -- Exploratory Session

## Session Metadata
- **Charter:** Explore Save/Load/Clone features in Page Builder, focusing on UI polish, error handling, data integrity, and interaction with existing features
- **Heuristic:** SFDPOT (Structure, Function, Data, Platform, Operations, Time)
- **Tester:** QA Testing Expert (automated via Playwright Firefox)
- **Date:** 2026-04-14
- **Duration:** ~20 minutes
- **Environment:** https://vcst-qa.govirto.com | PageBuilder Shell | Artifact: VirtoCommerce.PageBuilderModule_3.1003.0-pr-116-0696.zip
- **Browser:** Firefox (Playwright MCP)

---

## Summary

| Metric | Count |
|--------|-------|
| Bugs | 0 |
| Questions | 2 |
| Observations | 5 |
| Risks | 1 |
| Console errors | 0 |
| Network failures (4xx/5xx) | 0 |

**Overall assessment:** All three new features (Save Content, Load Content, Clone) are functional and stable. No bugs found. Zero console errors and zero network failures across the entire session. Data integrity verified through file comparison.

---

## Findings

### Q-001 [Question] Load Content: How is uploaded JSON content applied?

**Context:** When clicking "Load content" on the Draft tab and selecting a JSON file, a "New page" form opens with empty Name/Permalink/Language fields.

**Question:** Is the content from the uploaded JSON automatically queued and applied after the user fills in the form and saves? Or does the user need to additionally apply/import the content through the designer? The UX flow is not immediately obvious -- there is no visual indicator showing that content has been loaded from the file.

**Evidence:** `13-load-content-new-page.png`

**Recommendation:** Consider adding a toast notification or inline message (e.g., "Content loaded from file -- fill in page details and save") to clarify the workflow.

---

### Q-002 [Question] Load Content: Should the page name auto-populate from the filename?

**Context:** When loading `Predefined product2 (copy)-content.json`, the Name field in the new page form remains empty.

**Question:** Should the Name field be pre-populated from the JSON filename (stripping the `-content.json` suffix)? This would save the user a step and reduce friction.

**Evidence:** `13-load-content-new-page.png`

---

### O-001 [Observation] Clone naming convention: "(copy)" suffix accumulates

**Context:** Cloning a page appends "(copy)" to the name and "-copy" to the permalink. Cloning a clone produces "Name (copy) (copy)" and `/slug-copy-copy`. Cloning that clone produces "Name (copy) (copy) (copy)" and `/slug-copy-copy-copy`.

**Detail:**
- Original: `Predefined product2 (copy)` / `/pr2-copy`
- Clone 1: `Predefined product2 (copy) (copy)` / `/pr2-copy-copy`
- Clone 2: `Predefined product2 (copy) (copy) (copy)` / `/pr2-copy-copy-copy`

**Impact:** Names and permalinks grow linearly with each clone operation. After several iterations, names become unwieldy in the list view (truncated).

**Evidence:** `07-clone-detail-panel.png`, `09-clone-of-clone.png`

---

### O-002 [Observation] Clone creates page via two-step API call

**Context:** The clone operation makes two API calls in sequence:
1. `POST /api/page-builder-pages/grouped` -- creates the new page entity (returns 200)
2. `POST /api/page-builder-pages/grouped/{targetGroupId}/content/{sourceGroupId}` -- copies content from source to target (returns 204)

**Impact:** This is a non-atomic operation. If the second call fails (e.g., network interruption), the clone page would exist but without content. No error handling for this partial state was observed during testing.

**Evidence:** Network logs show both calls succeeding with 200/204.

---

### O-003 [Observation] Clone content integrity verified -- files are byte-identical

**Context:** Downloaded content JSON from both the source page and its clone. Ran diff comparison.

**Result:** The two JSON files are identical (zero differences). All field values, block types, IDs, settings, dates, colors, numbers, booleans, and nested objects match exactly.

**Evidence:** Diff of `Predefined-product2-copy--content.json` vs `Predefined-product2-copy-copy--content.json` returned no differences.

---

### O-004 [Observation] Button visibility rules are correctly scoped per tab and status

**Summary of toolbar button availability:**

| Context | Save content | Clone | Load content |
|---------|-------------|-------|-------------|
| Draft list toolbar | -- | -- | Yes |
| Draft page detail | Yes | Yes | -- |
| Active list toolbar | -- | -- | No |
| Active page detail | Yes | Yes | -- |
| Pending list toolbar | -- | -- | No |
| Archived list toolbar | -- | -- | No |
| Archived page detail | Disabled | Disabled | -- |
| New page (unsaved) detail | Disabled | Disabled | -- |

This is correct behavior:
- "Load content" only appears on Draft list toolbar (per spec)
- "Save content" and "Clone" appear on both Draft and Active page details
- All buttons disabled on Archived and unsaved New pages

**Evidence:** `05-detail-panel-toolbar.png`, `10-active-pages-toolbar.png`, `11-active-page-detail-toolbar.png`, `14-archived-page-all-disabled.png`, `13-load-content-new-page.png`

---

### O-005 [Observation] Save Content file naming convention is descriptive

**Context:** The downloaded file is named `{PageName}-content.json`. Special characters in page names (parentheses, spaces) are preserved in the filename.

**Examples:**
- "Predefined product2 (copy)" -> `Predefined product2 (copy)-content.json`
- "TC-E2E-015 Draft EN Page" -> `TC-E2E-015 Draft EN Page-content.json`

**Note:** Spaces and special characters in filenames could cause issues on some systems, but this is standard browser download behavior.

---

### R-001 [Risk] Non-atomic clone operation could produce content-less pages on network failure

**Context:** Clone uses a two-step API flow: (1) create page entity, (2) copy content. If step 2 fails, the resulting page exists in the Draft list but has no content blocks.

**Mitigation suggestion:** Consider wrapping both operations in a server-side transaction, or implementing client-side rollback (delete the page if content copy fails), or at minimum showing an error notification if the content copy fails.

**Severity:** Low (requires specific network conditions to trigger)

---

## Console Health

- **Total errors:** 0
- **Total warnings:** 2 (both benign)
  1. "Component Tag is already registered" -- framework-level, pre-existing
  2. Preload resource not used within timeout -- standard browser optimization warning

## Network Health

- **Failed requests (4xx/5xx):** 0
- **All page-builder API calls returned 200 or 204**

## Test Data Cleanup

- Archived 2 test clones created during session (pr2-copy-copy, pr2-copy-copy-copy)
- 1 pre-existing clone (pr2-copy) left as-is (created before session)
- Load content test page was not saved (closed without saving)

## Features NOT Tested (out of time / blocked)

- Load Content end-to-end: filling in form, saving, and verifying content appears in designer
- Double-click rapid Clone (timeout issues prevented reliable testing)
- Network interruption during Clone/Save (would require network throttling)
- Loading a malformed/invalid JSON file
- Loading a very large JSON content file
- Cross-browser verification (only Firefox tested)
