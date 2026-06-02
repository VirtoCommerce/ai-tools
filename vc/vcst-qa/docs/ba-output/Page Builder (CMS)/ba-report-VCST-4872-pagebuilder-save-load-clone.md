# BA Analysis Report — VCST-4872: Page Builder Save/Load/Clone
**Date:** 2026-04-14
**Scope:** Page Builder content save, load, and clone functionality
**JIRA:** [VCST-4872](https://virtocommerce.atlassian.net/browse/VCST-4872)
**PR:** [VirtoCommerce/vc-module-pagebuilder#116](https://github.com/VirtoCommerce/vc-module-pagebuilder/pull/116)
**Artifact:** `VirtoCommerce.PageBuilderModule_3.1003.0-pr-116-0696.zip`
**Status:** Testing | Assignee: Basil Kotov

---

## Executive Summary

PR #116 adds three new capabilities to the Page Builder module: **Save Content** (download page content as JSON file), **Load Content** (upload JSON file to create a new page), and **Clone** (duplicate a page with its content). The backend exposes one new endpoint (`POST /api/page-builder-pages/grouped/{targetGroupId}/content/{sourceGroupId}`) for server-side content copy. The frontend introduces streaming download/upload via custom fetch (bypassing NSwag client limitations) and toolbar actions in both the page detail blade and the draft list. This is a medium-risk change touching data integrity (content copy), authorization (new endpoint), and file I/O (upload/download streams).

---

## 1. Feature Breakdown

### 1.1 Save Content (Export)
| Aspect | Detail |
|--------|--------|
| **Actor** | Category Manager (admin user with Page Builder Update permission) |
| **Entry point** | Page detail blade toolbar → "Save content" button |
| **Behavior** | Streams page content via `GET /api/page-builder-pages/grouped/{groupId}/content?draft=true`, converts response to Blob, triggers browser file download as `{pageName}-content.json` |
| **Availability** | Only on existing pages (`!isNew`), not read-only |
| **UI element** | Toolbar button with `material-download` icon, label "Save content" |

### 1.2 Load Content (Import)
| Aspect | Detail |
|--------|--------|
| **Actor** | Category Manager |
| **Entry point** | Draft pages list toolbar → "Load content" button (Draft tab only) |
| **Behavior** | Opens hidden `<input type="file" accept=".json">`, user selects file → opens PageDetails blade with `importFile` option → on save (create), uploads content via `POST /api/page-builder-pages/grouped/{groupId}/content` with `Content-Type: text/plain; charset=utf-8` |
| **Availability** | Only in Draft status filter view |
| **UI element** | Toolbar button with `material-upload` icon, label "Load content" |
| **Flow** | File select → PageDetails blade opens (new page) → user fills name/permalink → Save → createGroup() → uploadPageContent() |

### 1.3 Clone Page
| Aspect | Detail |
|--------|--------|
| **Actor** | Category Manager |
| **Entry point** | Page detail blade toolbar → "Clone" button |
| **Behavior** | Creates new group with metadata copied client-side (`name + " (copy)"`, `permalink + "-copy"`, cultureName, storeId, visibility, userGroups, organizationId), then copies content server-side via `POST /api/page-builder-pages/grouped/{targetGroupId}/content/{sourceGroupId}` |
| **Availability** | Only on existing pages, not read-only |
| **UI element** | Toolbar button with `material-content_copy` icon, label "Clone" |
| **After clone** | Parent list reloads; cloned page blade opens automatically |

---

## 2. API Changes

### 2.1 New Endpoint

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/page-builder-pages/grouped/{targetGroupId}/content/{sourceGroupId}` | `PageBuilder:update` permission | Copy latest draft/published content from source group to target group's draft |

**Backend logic (PageBuilderPageController.CopyPageContent):**
1. Loads source and target groups by ID
2. Validates authorization on both groups via `PageBuilderAuthorizationRequirement`
3. Selects source page: filters by Draft or Published status, ordered by `ModifiedDate` descending, takes first
4. Finds or creates target draft page (creates new `PageBuilderPage` with Draft status if none exists)
5. Calls `groupedPageService.CopyPageContentAsync(sourcePageId, targetDraftId)`
6. Returns `204 No Content`

**Error responses:** `404` (source/target group not found, or no source page), `401` (unauthorized), `403` (forbidden)

### 2.2 Existing Endpoints Used

| Method | Path | Purpose in this feature |
|--------|------|------------------------|
| `GET` | `/api/page-builder-pages/grouped/{groupId}/content?draft=true` | Download content (Save) |
| `POST` | `/api/page-builder-pages/grouped/{groupId}/content` | Upload content (Load) |
| `POST` | `/api/page-builder-pages/grouped` | Create new group (Clone + Load) |

### 2.3 Minor Backend Changes
- `DeleteGroup`: exception logging improved (now includes `Exception ex` in catch blocks)
- `UpdateGroup`: `Pages.First()` changed to `Pages[0]` (minor refactor)

---

## 3. Frontend Architecture

### 3.1 New File: `usePageContentApi.ts`
Custom fetch-based API functions that bypass the NSwag-generated client (which discards response body for streaming endpoints):
- `getAuthHeaders()` — extracts auth token from API client instance via `(client as any).authToken`
- `downloadPageContent(groupId, pageName)` — GET + Blob → `<a>` download trick
- `uploadPageContent(groupId, file)` — POST with File as body, `Content-Type: text/plain`

### 3.2 Modified Composables
- **`usePageBuilderDetails`** — new `downloadContent()`, `clonePage()` methods; `saveGroup` now accepts `importFile` option (uploads after create)
- **`usePagesListToolbar`** — adds "Load content" button conditionally when status filter = Draft
- **`pagesList.vue`** — hidden file input + `openLoadFlow()` / `onFileSelected()` handlers; exposed via `defineExpose`

### 3.3 Modified Pages
- **`PageDetails.vue`** — "Save content" and "Clone" toolbar buttons added between "Open designer" and "Publish"

### 3.4 Localization
- `en.json`: Added keys `TOOLBAR.LOAD`, `TOOLBAR.DOWNLOAD_CONTENT`, `TOOLBAR.CLONE`

---

## 4. Data Flow Diagrams

### Save Content Flow
```
PageDetails.vue → downloadContent() → usePageContentApi.downloadPageContent()
  → GET /api/page-builder-pages/grouped/{id}/content?draft=true
  → Response blob → Create <a> element → Trigger download → Cleanup
```

### Load Content Flow
```
pagesList.vue → "Load content" click → openLoadFlow() → file input click
  → onFileSelected() → openBlade(PageDetails, { importFile: file })
  → PageDetails.vue → saveGroup() → createGroup() API call
  → uploadPageContent(newGroupId, file) → POST .../content
```

### Clone Page Flow
```
PageDetails.vue → "Clone" click → clonePage()
  → Copy metadata client-side (name + " (copy)", permalink + "-copy", etc.)
  → createGroup(clone) API call → new group created
  → copyPageContent(newId, sourceId) → POST .../content/{sourceGroupId}
  → Parent list reload → Open cloned page blade
```

---

## 5. Risk Assessment

| Risk | Severity | Description | Mitigation |
|------|----------|-------------|------------|
| **Content copy integrity** | High | Server-side `CopyPageContentAsync` must correctly copy all blocks, images, and references | Verify cloned page content matches source in designer |
| **Auth bypass on copy endpoint** | High | New endpoint checks auth on both source and target groups | Test with unauthorized user, cross-store copy |
| **Partial clone failure** | Medium | Clone creates group first, then copies content — if copy fails, empty page remains | PR handles this: state updated before upload so retry won't duplicate |
| **Upload file validation** | Medium | No visible file format/size validation on upload — malformed JSON could corrupt page | Test with invalid/empty/oversized files |
| **Auth token extraction** | Low | `(client as any).authToken` uses private API — fragile to framework updates | Monitor after vc-shell upgrades |
| **Permalink collision** | Medium | Clone appends "-copy" — could collide with existing page | Test duplicate clone scenarios |
| **Cross-store content copy** | Medium | No explicit store boundary check in CopyPageContent beyond group auth | Verify content stays within store boundary |
| **Load button visibility** | Low | "Load content" only appears in Draft tab — user might not find it | UX discoverability concern |

---

## 6. User Stories & Acceptance Criteria

### Epic: Page Builder Content Portability (VCST-4872)

---

#### US-1: Save Page Content to File

**As a** Category Manager,
**I want to** download a page's content as a JSON file,
**So that** I can export page designs for backup, sharing, or migration to another store.

**Acceptance Criteria (BDD):**

```gherkin
Scenario: Save content from existing draft page
  Given I am logged in as a user with PageBuilder Update permission
  And I open an existing page in the Page Builder detail blade
  When I click the "Save content" toolbar button
  Then a JSON file named "{page-name}-content.json" is downloaded
  And the file contains the page's current draft content

Scenario: Save content button disabled for new pages
  Given I am creating a new page (unsaved)
  Then the "Save content" button is disabled

Scenario: Save content button disabled for read-only users
  Given I am logged in as a user without PageBuilder Update permission
  And I open a page detail blade
  Then the "Save content" button is disabled
```

**Definition of Done:**
- [ ] "Save content" button visible in page detail toolbar with download icon
- [ ] Downloaded file is valid JSON containing page blocks/layout
- [ ] File name follows pattern `{page-name}-content.json`
- [ ] Button disabled when page is new (unsaved) or user lacks permission
- [ ] No console errors during download

---

#### US-2: Load Page Content from File

**As a** Category Manager,
**I want to** create a new page by uploading a previously saved content file,
**So that** I can reuse page templates across stores or restore backed-up designs.

**Acceptance Criteria (BDD):**

```gherkin
Scenario: Load content from valid JSON file
  Given I am on the Draft pages list
  And I click the "Load content" toolbar button
  And I select a valid page content JSON file
  When the PageDetails blade opens and I fill in name and permalink
  And I click Save
  Then a new page is created with the uploaded content
  And the page appears in the Draft list

Scenario: Load content button only visible on Draft tab
  Given I am viewing the Active (Published) pages list
  Then the "Load content" button is NOT visible in the toolbar

  Given I am viewing the Draft pages list
  Then the "Load content" button IS visible in the toolbar

Scenario: Load invalid file
  Given I select a non-JSON or malformed file
  When the system attempts to upload
  Then an appropriate error is displayed
  And no corrupt page is created

Scenario: Cancel file selection
  Given I click "Load content" and the file dialog opens
  When I cancel the dialog without selecting a file
  Then nothing happens and no blade opens
```

**Definition of Done:**
- [ ] "Load content" button visible only in Draft tab toolbar with upload icon
- [ ] File input accepts only `.json` files
- [ ] PageDetails blade opens after file selection with empty name/permalink
- [ ] Content uploaded after group creation (not before)
- [ ] Failed upload doesn't leave orphaned empty page (or page is cleanly recoverable)
- [ ] File input resets after selection (allows re-selecting same file)

---

#### US-3: Clone Page with Content

**As a** Category Manager,
**I want to** duplicate an existing page including all its content blocks,
**So that** I can create variations without rebuilding from scratch.

**Acceptance Criteria (BDD):**

```gherkin
Scenario: Clone a draft page
  Given I open an existing draft page in the detail blade
  When I click the "Clone" toolbar button
  Then a new page is created with name "{original} (copy)" and permalink "{original}-copy"
  And the clone has the same content blocks as the source
  And the clone appears in the Draft list
  And the cloned page's detail blade opens automatically

Scenario: Clone a published page
  Given I open an existing published page
  When I click "Clone"
  Then the clone is created in Draft status
  And the clone content matches the source's latest draft or published version

Scenario: Clone preserves metadata
  Given the source page has cultureName, visibility, userGroups, and organizationId set
  When I clone the page
  Then all metadata fields are copied to the clone

Scenario: Clone button disabled for new/read-only pages
  Given I am on a new unsaved page or I lack Update permission
  Then the "Clone" button is disabled

Scenario: Duplicate clone (clone of clone)
  Given I have already cloned a page (name ends with "(copy)")
  When I clone it again
  Then the new page is named "{name} (copy) (copy)"
  And the permalink is "{permalink}-copy-copy"
```

**Definition of Done:**
- [ ] "Clone" button visible in page detail toolbar with copy icon
- [ ] Cloned page metadata: name + " (copy)", permalink + "-copy", same culture/store/visibility/userGroups/org
- [ ] Content copied server-side via CopyPageContent endpoint
- [ ] Clone appears in Draft list immediately
- [ ] Page detail blade navigates to cloned page after creation
- [ ] Button disabled for new/unsaved pages and read-only users
- [ ] No console errors; loading indicator shown during clone

---

## 7. Test Scenarios (Recommended)

### Priority Matrix

| ID | Test Scenario | Priority | Type |
|----|---------------|----------|------|
| SC-01 | Save content — happy path (download JSON from draft page) | P0 | Functional |
| SC-02 | Load content — happy path (upload JSON, create page with content) | P0 | Functional |
| SC-03 | Clone page — happy path (clone draft with content) | P0 | Functional |
| SC-04 | Clone page — verify content matches source in designer | P0 | Data integrity |
| SC-05 | Save/Clone buttons disabled on new unsaved page | P1 | UI state |
| SC-06 | Load content button visible ONLY on Draft tab | P1 | UI state |
| SC-07 | Clone a published page → clone is Draft | P1 | Functional |
| SC-08 | Clone preserves all metadata fields | P1 | Data integrity |
| SC-09 | Load content with invalid/empty JSON file | P1 | Negative |
| SC-10 | Cancel file selection in Load flow → no side effects | P2 | Negative |
| SC-11 | Clone page with special characters in name/permalink | P2 | Edge case |
| SC-12 | Double-clone (clone of a clone) — name/permalink pattern | P2 | Edge case |
| SC-13 | Permalink collision on clone — page with "-copy" already exists | P2 | Edge case |
| SC-14 | Auth: user without Update permission cannot save/load/clone | P1 | Security |
| SC-15 | API: POST copy endpoint returns 404 for invalid group IDs | P2 | API |
| SC-16 | API: POST copy endpoint returns 403 for unauthorized user | P1 | Security |
| SC-17 | Cross-store clone attempt (source in Store A, target auth for Store B) | P2 | Security |
| SC-18 | Save content from page with complex blocks (carousel, product SKUs) | P1 | Data integrity |
| SC-19 | Load content → verify blocks render correctly in designer | P1 | Data integrity |
| SC-20 | Clone during concurrent edit — source modified while cloning | P3 | Race condition |

### Regression Scope
Existing CMS suites 059/060 should pass without changes. Specifically verify:
- CMS-001 (create page) — unchanged flow
- CMS-002 (edit page) — unchanged flow
- CMS-004 (open designer) — toolbar now has additional buttons, verify no layout break
- CMS-005 (archive page) — unchanged flow
- CMS-006 (publish draft) — unchanged flow

---

## 8. Coverage Gap

The existing test suites **059-cms-page-management.csv** and **060-cms-design-content.csv** have **zero coverage** for save/load/clone functionality. All 20 test scenarios above are net-new. Recommend adding these to suite 059 (page management) as section "Content Portability" (CMS-035 through CMS-054 range).

---

## 9. Open Questions

| # | Question | For |
|---|----------|-----|
| 1 | Is there file size validation on content upload? What happens with very large page content (e.g., 50+ blocks with embedded images)? | Dev (Basil Kotov) |
| 2 | Should the clone's permalink be checked for uniqueness before creation, or is a server-side 409 acceptable? | Product Owner |
| 3 | Will localized content (multi-language pages) be included in save/load, or only the current language? | Dev |
| 4 | Should "Load content" be available on Active/Archived tabs too, or is Draft-only intentional? | Product Owner |
| 5 | Is the `(client as any).authToken` pattern an approved workaround, or should the NSwag client be extended? | Dev |
| 6 | Should save/load support versioning or metadata headers in the JSON file (e.g., VC version, export date)? | Product Owner |
| 7 | Cross-store import: if content references store-specific assets (images, SKUs), what happens on import to a different store? | Dev |
