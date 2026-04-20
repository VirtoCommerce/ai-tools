# Bug — Page Builder: 4 success toasts missing from PR #126 on Published-page and Pages-list flows

## Status: OPEN

## Summary

PR #126 (VCST-4951) added five success toast notifications to Page Builder. Four of them do not fire on the currently deployed PR HEAD build (`3.1005.0-pr-126-0215`). The underlying operations all succeed (HTTP 2xx, state/counters update correctly) — only the user-facing notification is missing.

## Environment

| Field | Value |
|---|---|
| Platform | 3.1019.0 |
| Module | VirtoCommerce.PageBuilderModule `3.1005.0-pr-126-0215` (PR HEAD, commit `021539fc`) |
| SPA bundle | `index77678.js` / `vc-shell-framework77678.js` (fresh, cache-busted) |
| Admin URL | https://vcst-qa.govirto.com |
| Browser | Edge (via Playwright MCP) |
| Date observed | 2026-04-20 |

## Scope

| Flow | Toast expected | Toast observed | Result |
|---|---|---|---|
| Archive from **Draft** | "Page archived successfully" | Yes | WORKS |
| Publish (Draft → Active) | "Page published successfully" | Yes | WORKS |
| Archive from **Published** | "Page archived successfully" | **No** | **FAIL** |
| Unpublish | "Page unpublished successfully" | **No** | **FAIL** |
| Save (PageDetails toolbar) | "Page saved successfully" | **No** | **FAIL** |
| Load content (file upload) | "Content loaded successfully" | **No** | **FAIL** |

## Steps to Reproduce

### Flow 1 — Archive from Published
1. Admin SPA → Store module → B2B-store → Page Builder → Active tab
2. Open any Published page
3. Click Archive in the blade toolbar → confirm the dialog
4. **Expected:** Green toast "Page archived successfully" appears
5. **Actual:** Backend succeeds (page moves Active→Archived; counters −1/+1; `POST /api/page-builder-pages/grouped/archive` returns 2xx), but no toast

### Flow 2 — Unpublish
1. Admin SPA → Store module → B2B-store → Page Builder → Active tab
2. Open any Published page
3. Click Unpublish in the blade toolbar
4. **Expected:** Green toast "Page unpublished successfully"
5. **Actual:** Status badge changes Published→Draft, toolbar toggles Unpublish→Publish, page moves Active→Draft — no toast

### Flow 3 — Save (PageDetails toolbar)
1. Admin SPA → Store module → B2B-store → Page Builder → Draft tab
2. Open any draft page
3. Edit the Name field (or any content block) so `isModified=true`
4. Click Save in the blade toolbar
5. **Expected:** Green toast "Page saved successfully"
6. **Actual:** `PUT /api/page-builder-pages/grouped` returns 200; "Has unsaved changes" indicator clears; Save button becomes disabled — no toast

### Flow 4 — Load content from file
1. Admin SPA → Store module → B2B-store → Page Builder → Draft tab
2. Click Load content toolbar button
3. Select a valid JSON content export file (`.json`)
4. **Expected:** Green toast "Content loaded successfully" after file parses, before PageDetails blade opens
5. **Actual:** File dialog opens, file parses, New-page blade opens — no toast at any point

## Expected vs Actual

| Aspect | Expected (per PR #126 source) | Actual (deployed `-0215`) |
|---|---|---|
| notification.success invoked | All 5 toolbar handlers call `notification.success(t("PAGE_BUILDER.PAGES.ALERTS.*_SUCCESS"))` | Only 2 of 5 handlers produce visible toasts |
| Backend behavior | All operations succeed | Confirmed — backend works in all cases |
| User feedback | Consistent green toast after every action | Inconsistent — user sees no feedback on 4 out of 6 operations (including the 2 already-broken baseline operations) |

## Root Cause Hypothesis

PR #126 adds `notification.success(...)` lines to:
- `components/pagesList.vue::onFileSelected` (LOAD_CONTENT_SUCCESS)
- `pages/PageDetails.vue` toolbar: Save (SAVE_SUCCESS), Archive (DELETE_SUCCESS), Publish (PUBLISH_SUCCESS), Unpublish (UNPUBLISH_SUCCESS)

The 2 working toasts (Archive-from-Draft, Publish-from-Draft) are both fired from the same `PageDetails.vue` toolbar — meaning the `notification.success` import is reachable and i18n keys resolve correctly for *some* branches. The failures cluster on:
- Code paths that opened a Published page (both Archive-from-Published and Unpublish)
- Code paths where a `close:blade` / `parent:call` emit happens immediately after the success call
- The Pages-list file-upload handler (`pagesList.vue`) which is a separate module

Likely candidates (for dev investigation):
1. **Order of operations**: `notification.success()` call may happen after `emit("close:blade")` which tears down the notification container in the PageDetails scope — toast dispatched into a destroyed scope.
2. **Different `notification` import**: `pagesList.vue` imports from `@vc-shell/framework` — confirm that symbol resolves to the same provider used by the working handlers.
3. **i18n key missing at runtime for these 4 keys** — but our source-grep of the deployed bundle found the English strings, so unlikely.

Suggested first fix to try:
- Move `notification.success(...)` calls to BEFORE `emit("close:blade")` / `emit("parent:call")` in `PageDetails.vue` for Archive and Unpublish handlers.
- For Save: currently only one-liner; verify `handleSave()` doesn't throw/reject silently before the next line runs.
- For `pagesList.vue::onFileSelected`: verify `openBlade({...})` doesn't preempt the toast render.

## Evidence

- `reports/regression/VCST-4951-targeted-2026-04-20/regression-report.md` — full run report
- `reports/regression/VCST-4951-targeted-2026-04-20/results.json` — machine-readable results
- Screenshots:
  - `CMS-007-fail.png` — Archive from Published
  - `CMS-113-fail.png` — Load content
  - `CMS-127-fail.png` — Save
  - `CMS-128-fail.png` — Unpublish
- Test data: `cms-113-content.json` (valid JSON export used for Load content)
- Bundle & source: All 5 i18n keys (`LOAD_CONTENT_SUCCESS`, `SAVE_SUCCESS`, `DELETE_SUCCESS`, `PUBLISH_SUCCESS`, `UNPUBLISH_SUCCESS`) and their English strings are present in the deployed bundle `index77678.js` — so the code shipped, it just doesn't fire at runtime.

## Why VCST-4951 was marked Tested despite this

VCST-4951 verification ran against an earlier build (`-bd83` → bundle `24934.js`) at 12:15 local. A single Save-toast live observation passed; bundle source-grep found all 5 strings. That combined evidence led to a VERIFIED verdict. At 12:43 the deploy repo was updated to the newer `-0215` build (PR HEAD commit). The targeted regression on `-0215` (bundle `77678.js`) then exposed these 4 failures — which were not detected earlier.

VCST-4951 scope that remains fixed and verified (Tested is appropriate for those):
- Archive-from-Draft toast (DELETE_SUCCESS works on Draft pages)
- Publish-from-Draft toast (PUBLISH_SUCCESS works Draft→Active)
- Backend change: `GetPageContent` serves Archived pages (CMS-129 PASS)
- Clone toast (pre-existing, still works — CLONE_SUCCESS)
- Save content to file toast (pre-existing, still works — DOWNLOAD_SUCCESS)

## Severity / Priority

**Low** — UX polish, no functional impact (all underlying operations succeed; state updates correctly).

## Related

- Parent/preceding: **VCST-4951** (5 toasts added, 1 backend change)
- PR: VirtoCommerce/vc-module-pagebuilder#126 (commit `021539fc…`, artifact `-0215.zip`)
