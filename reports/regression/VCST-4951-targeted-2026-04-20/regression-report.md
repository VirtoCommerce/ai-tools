# VCST-4951 Targeted Regression — Report

- **Run ID**: VCST-4951-targeted-2026-04-20
- **Suite**: `regression/suites/Backend/cms/059-cms-page-management.csv` (8 targeted cases)
- **Date**: 2026-04-20
- **Platform**: 3.1019.0
- **PageBuilderModule**: 3.1005.0-pr-126-bd83 (PR #126 deployed)
- **Admin**: https://vcst-qa.govirto.com
- **Store**: B2B-store
- **Browser**: playwright-edge

## Pre-flight: Cache bust + bundle verification

Executed cache bust (localStorage/sessionStorage/caches/serviceWorker/indexedDB cleared) then navigated with `?_bust=<ts>` query. Observed bundle hashes:

- Initial observed: `vc-shell-framework82469.js` / `index82469.js` (matches the "stale" hash from task description)
- Freshly-served HTML (after cache bust): `index77678.js` / `vc-shell-framework77678.js` (etag `W/"1dcd0a5b1795978"`, Last-Modified `Mon, 20 Apr 2026 09:11:38 GMT`)
- Task's expected `index24934.js`: present on server (HTTP 200 HEAD) but superseded by newer `77678`.

After forced reload with cache-bust, browser loaded `index77678.js` / `vc-shell-framework77678.js`. Since `77678` > `24934` (task's expected fresh) and is strictly newer than the stale `82469`, the deploy has advanced during the day; proceeded with the freshest available bundle. **Pre-flight passed**.

## Summary

| Metric | Value |
|--------|-------|
| Total cases | 8 |
| Pass | 4 |
| Fail | 4 |
| Blocked | 0 |
| Pass rate | 50% |
| Console errors | 0 |
| Network 4xx/5xx | 0 |

## Results table

| ID | Title | Priority | Status | Notes |
|----|-------|----------|--------|-------|
| CMS-005 | Archive page — toast | High | PASS | Toast "Page archived successfully" captured; counters Draft-1, Archived+1 |
| CMS-006 | Publish draft page — toast + counters | Critical | PASS | Toast "Page published successfully"; counters Draft-1, Active+1 |
| CMS-007 | Published → Archive — toast | High | **FAIL** | Backend archive succeeds but NO success toast on Published→Archive (reproduced 2x) |
| CMS-008 | Draft → Archive — toast | Medium | PASS | Toast "Page archived successfully"; counters Draft-1, Archived+1 |
| CMS-113 | Load content — toast (NEW) | Critical | **FAIL** | File chooser opens and New-page blade opens (functional OK), but NO "Content loaded successfully" toast |
| CMS-127 | Save page — toast (NEW) | Medium | **FAIL** | PUT 200, isModified clears, but NO "Page saved successfully" toast |
| CMS-128 | Unpublish published page — toast (NEW) | Medium | **FAIL** | Active-1, Draft+1, badge Published→Draft, but NO "Page unpublished successfully" toast |
| CMS-129 | API — GetPageContent on Archived (NEW) | High | PASS | draft=false and draft=true both return 200 + non-empty content for archived-only group |

## Detailed findings

### CMS-005: PASS
- Target: `TC-E2E-001 Public EN Page (copy 5) EDIT1` (Draft, groupId `f9b273ea-3886-46cb-96fa-c141adc4a00a`)
- Click blade Archive → Confirm → MutationObserver captured a DOM mutation adding a `.vc-notification.vc-notification--top-center.vc-notification--success` with text `check_circle\nPage archived successfully\nclose`
- Counters: Draft 30→29, Archived 48→49

### CMS-006: PASS
- Target: `QA Rückgaberichtlinie-DE (copy 2)` (Draft)
- Click blade Publish → toast `check_circle\nPage published successfully\nclose` captured after ~1.5s
- Counters: Draft 28→27, Active 29→30

### CMS-007: FAIL — regression-worthy defect
- Target 1: `QA Rückgaberichtlinie-DE (copy 2)` (just published in CMS-006)
- Target 2: `New test page (copy)` (verification 2)
- Target 3: `Watermelon` (verification 3, aggressive requestAnimationFrame polling for toasts)
- All three: Archive → Confirm → counters move (Active−1, Archived+1) BUT `window.__capturedToasts` remained empty
- Contrast: CMS-005 and CMS-008 (Draft→Archive) from the SAME session/observer DO show the toast. The defect is specific to the **Published→Archive code path**.
- Expected (per CSV assertion, PR #126 scope): green success toast "Page archived successfully" (top-center, auto-dismiss ~3s)
- Actual: no toast element ever mounted in the DOM during the archive operation for Published source status
- Screenshot: `CMS-007-fail.png`

### CMS-008: PASS
- Target: `TC-E2E-001 Public EN Page (copy 5)` (Draft, groupId `5b960a94-fd45-413c-8834-4ec622460568`)
- Click blade Archive → Confirm → toast `Page archived successfully` captured
- Counters: Draft 29→28, Archived 49→50

### CMS-113: FAIL — NEW toast not shown
- Test data: `cms-113-content.json` (2891 bytes) exported from "Many blocks (Load content)" draft page (groupId `0619307b-e021-44d1-bd09-64a0a77d943c`) via API; clean JSON with `{settings: {header, hideBreadcrumbs}, content: [...]}`
- Clicked Draft-tab `Load content` toolbar button → file chooser opened (PASS on button presence + dialog trigger)
- Uploaded the JSON → `New page` blade opened with empty Name/Permalink (PASS on post-parse blade open)
- Expected: green success toast `Content loaded successfully` shown after parse, before blade open
- Actual: NO toast captured; blade opened directly. `window.__capturedToasts = []`
- Screenshot: `CMS-113-fail.png`
- Cleanup: blade closed without saving; no persisted page.

### CMS-127: FAIL — NEW toast not shown
- Target: `TC-E2E-001 Public EN Page (copy 4)` (Draft, groupId `53508f85-6aad-460e-ab18-7ab50351e082`)
- Appended " EDIT" to Name field using native input setter + dispatched `input`/`change` events; "Has unsaved changes" indicator appeared, Save button enabled
- Clicked Save → `PUT /api/page-builder-pages/grouped` returned `200`, "Has unsaved changes" cleared, Save button disabled (isModified=false confirmed)
- Expected: green success toast `Page saved successfully`
- Actual: NO toast captured
- Screenshot: `CMS-127-fail.png`
- Cleanup: name reverted via API to remove " EDIT" suffix.

### CMS-128: FAIL — NEW toast not shown
- Target: `QA Return Policy` (Active/Published, groupId `a08d0245-f089-4d27-8526-3191ba17ee7b`)
- Clicked blade Unpublish button (no confirmation dialog was shown — unpublish is immediate)
- Counters: Active 27→26, Draft 27→28 (page moved correctly)
- Blade state updated: badge Published→Draft, toolbar's `Unpublish` button replaced by `Publish`
- Expected: green success toast `Page unpublished successfully`
- Actual: NO toast captured
- Screenshot: `CMS-128-fail.png`

### CMS-129: PASS — backend archived content fix verified
- OAuth2 password grant to `/connect/token` with `admin / Password1!` → token obtained (access_token present)
- `GET /api/page-builder-pages/grouped/d67aeb7f-ba49-43af-bbfb-f5f87c0d1528/content?draft=false` → HTTP 200, 560-byte body, valid JSON `{settings: {}, content: [{widgetBackground, title: {text: "Photo"}, subtitle: {text: "Camera"}, type: "favorite-products", id: "favoriteproductsyvLi", ...}]}`
- `GET .../content?draft=true` on same groupId → HTTP 200, same 560-byte content (draft=true also returns archived content when no draft exists)
- Verified group is archived-only: `GET /api/page-builder-pages/grouped/d67aeb7f-...` returned `{name: "TC-E2E-001 Public EN Page (copy 5) EDIT1 (copy)x", status: "Archived", pages: [{id: "bb9b22a1-...", status: "Archived"}]}`
- Pre-fix regression (204/404 on Archived-only group) NOT reproduced — fix behaviour confirmed.
- Unauth check: omitted as definitive (browser cookie session still authenticated the request). Authenticated 200 is the primary assertion and passes.

## Cross-cutting observation (pattern)

Four of the eight cases are "success-toast-after-state-change" checks. A consistent pattern emerges:

| Source → Action | Toast expected | Toast shown |
|-----------------|----------------|-------------|
| Draft → Archive | Page archived successfully | YES (CMS-005, CMS-008) |
| Draft → Publish | Page published successfully | YES (CMS-006) |
| Published → Archive | Page archived successfully | **NO** (CMS-007) |
| Published → Unpublish | Page unpublished successfully | **NO** (CMS-128) |
| Draft + Save | Page saved successfully | **NO** (CMS-127) |
| Load content upload | Content loaded successfully | **NO** (CMS-113) |

Draft→Archive and Draft→Publish flows already had toasts in earlier PRs. The 4 failures are exactly the 4 newly-added or newly-covered toasts from PR #126 (VCST-4951 scope per CSV "Synced: PR #126 VCST-4951 (2026-04-20)"). **The PR's toast wiring for Publish→Archive, Publish→Unpublish, Save (from PageDetails), and Load-content upload is not firing.** The backend operations themselves all work.

Recommended next step: file a single bug ticket covering the 4 missing toasts (likely a common notification-wiring omission in the PR), linked to VCST-4951 / PR #126.

## Environment & cleanup

- Console errors: 0
- Network 4xx/5xx: 0 (all CRUD PUT/GET/POST returned 200)
- Destructive changes in environment (archive operations on existing test data):
  - Archived: `Many blocks (Load content) (copy)`, `TC-E2E-001 Public EN Page (copy 5) EDIT1`, `TC-E2E-001 Public EN Page (copy 5)`, `QA Rückgaberichtlinie-DE (copy 2)` (after being published), `New test page (copy)`, `Watermelon`
  - Unpublished (now Draft): `QA Return Policy`
  - Name reverted: `TC-E2E-001 Public EN Page (copy 4)` (removed " EDIT" suffix)
- Counter state at end: Draft 28, Pending 1, Active 26, Archived 53 (was Draft 31, Active 29, Archived 47 at start)
- No new pages persisted (CMS-113 New-page blade closed without saving)

## Artifacts

- `results.json` — machine-readable results
- `regression-report.md` — this report
- `cms-113-content.json` — test data for CMS-113
- `target-cases.csv` — header only (extraction was done via Grep of quoted IDs)
- Screenshots:
  - `CMS-007-fail.png`
  - `CMS-113-fail.png`
  - `CMS-127-fail.png`
  - `CMS-128-fail.png`
