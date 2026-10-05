# VCST-6086 — Fix verification (Phase B, GREEN)

**Verdict: PASS.** The fix is live and removes the defect. All 7 rejected saves (4 POST, 3 PUT) logged **zero** `reading 'join'` TypeErrors. View details showed the server message every time. The API contract is unchanged, and nothing was persisted.

| | |
|---|---|
| Env | vcst-qa `https://vcst-qa.govirto.com`, Admin SPA header `3.1074.0-pr-3125-c3b8` |
| Modules | VirtoCommerce.Loyalty `3.1009.0-pr-18-4411` (blade's own error callback still present) |
| Browser | playwright-edge (msedge 154), 1920x1080, admin / Administrator |
| Date | 2026-09-29 13:29–13:42 UTC |
| Baseline (RED) | `reports/bugs/open/low/BUG-Admin-SPA-setError-TypeError-join-on-list-error-body-VCST-6086.md` (5/5 TypeError on 3.1073.0-pr-3121) |

**Bundle check (after a Ctrl+Shift+R hard reload):** the platform bundle `/dist/app.js?v=9aDNCP23PPNSZOy4W8osXT1s5I16wvT1BRVaZrN17LY` is loaded. `setError.toString()` contains the inlined `getErrorBody` (`angular.isArray(e)` → map `angular.isString(e)?e:e&&e.errorMessage` → `join("<br>")`; `angular.isArray(e.errors)` guard). Both `errorMessage` and `isArray` are present.

## Checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | POST STR 3/3 | **PASS** | 3/3 (+1 re-capture run): no TypeError; header and View details show "Mission reward amount cannot be negative" |
| 2 | PUT STR 3/3 | **PASS** | 3/3 on Draft `rgweg` (reward set to -1 only): no TypeError, same message in header and dialog |
| 3 | Shape matrix via the real service | **PASS** | 13/13 shapes: expected `errorBody`, no throw (table below) |
| 4 | Old `{errors:[…]}` / `{message}` shapes via a real blade | **PASS (via 3d/3e)** | No safe non-persisting blade path to these shapes was found; covered by matrix rows d1, d2, e |
| 5 | Unrelated blades | **PASS** | Catalog, Orders, Stores, Security › Users (1,367) all loaded; the console error count did not change |
| 6 | Session console | **PASS** | No errors attributable to the fix (see Console) |
| 7 | REST contract | **PASS** | POST and PUT `/api/loyalty-missions` → `400` with a bare FluentValidation array (quoted below) |
| 8 | White Labeling, class width | **BLOCKED** | No user-editable field triggers a rejection (reason below) |
| 9 | Always-on detection | **PASS** | Nothing new to file (see Incidental) |

## STR tally
- **POST 3/3 PASS.** Fresh "New loyalty mission" blade each run (`AGENT-TEST-VCST6086-POST-1..3`, plus a 4th for the screenshot). Store B2B-store, condition Any User Group, goal = 1 order, FixedAmountReward = -1.
- **PUT 3/3 PASS.** Draft `rgweg` reopened fresh each run: switched away, answered **No** to "Save changes?", reopened. Only the reward was changed to -1.
- **Nothing persisted.** Search `AGENT-TEST-VCST6086` → `{"totalCount":0}` (after run 3 and again after run 4); the list stays at 69. `rgweg` after 3 PUTs: reward `0.0`, modifiedDate `2026-09-25T16:24:01.350517Z` (unchanged).

## Shape matrix — `setError({status,statusText,data}, {})`, live deployed service

| id | `data` | `blade.error` | `blade.errorBody` | threw |
|---|---|---|---|---|
| a | `[{propertyName:'X',errorMessage:'msg1'},{errorMessage:'msg2'}]` | 400: Bad Request | `msg1<br>msg2` | no |
| b | `['s1','s2']` | 400: Bad Request | `s1<br>s2` | no |
| c1 | `[]` | 400: Bad Request | `400: Bad Request` (fallback) | no |
| c2 | `[{propertyName:'X'}]` | 400: Bad Request | `400: Bad Request` (fallback) | no |
| c3 | `[null]` | 400: Bad Request | `400: Bad Request` (fallback) | no |
| d1 | `{message:'m'}` | 400: Bad Request | `m` | no |
| d2 | `{exceptionMessage:'e',message:'m'}` | 400: Bad Request | `e` | no |
| e | `{errors:['a','b']}` | 400: Bad Request | `a<br>b` | no |
| f | `{title:'Bad Request',status:400}` | 400: Bad Request | `400: Bad Request` (fallback) | no |
| g | `{errors:{Name:['required']}}` | 400: Bad Request | `400: Bad Request` (fallback) | no |
| h | *(no data)*, status 500 | 500: Internal Server Error | `500: Internal Server Error` | no |
| i1 | `setError(undefined, b)` | cleared (undefined) | `""` | no |
| i2 | `setError(null, b)` | cleared (undefined) | `""` | no |

`isLoading` was `false` after every call. For i1/i2 the blade was pre-seeded with an error, which was cleared (existing behaviour). This is a code-level probe on scratch blade objects: it sent no request and touched no UI control. The UI verdict rests on items 1–2.

## REST 400 body (POST #13 and PUT #27, identical)
```json
[{"propertyName":"DynamicExpression","errorMessage":"Mission reward amount cannot be negative","attemptedValue":null,"customState":null,"severity":"Error","errorCode":null,"formattedMessagePlaceholderValues":null}]
```

## Console (whole session; `console-session.log`)
- **0** × `TypeError … reading 'join'`, and **0** Angular exceptions.
- 7 × `Failed to load resource: 400 @ /api/loyalty-missions`. This is the browser's native network line, one per rejected save, and is expected.
- 1 × 401 `GET api/platform/settings/VirtoCommerce.Platform.UI.WidgetColorMarkers` + `Possibly unhandled rejection`. It fired on the login page before sign-in. Pre-existing and already filed (VCST-5622, `reports/bugs/open/low/BUG-admin-spa-unhandled-401-promise-rejections-VCST-5622.md`); unrelated to this fix.
- Log noise: `WARNING: Tried to load AngularJS more than once` (CustomerExportImport bundle), plus Chromium autocomplete hints on the login page.

## Item 8 — White Labeling: BLOCKED
`WhiteLabelingController` Create/Update return `BadRequest(validationResult.Errors)`. However, `WhiteLabelingSettingValidator` rejects only structural conditions that the widget code sets, never a form field:
- store and organization both set, or both unset;
- the owner store or organization changed;
- a duplicate store or organization.

No admin input can trigger these, so any successful save would change real WL settings. That is outside the brief. The response shape is identical to the loyalty list (a bare FluentValidation array), which matrix row **a** covers.

## Incidental (verify-before-claim; nothing filed)
- **Unverified observation (not a bug claim).** In `POST /api/loyalty-missions/search`, `rgweg`'s `dynamicExpression.availableChildren` was empty before its blade was opened (#9). After the `GET /api/loyalty-missions/{id}` calls (#54) it came back populated, with the same `modifiedDate`. This suggests GET-by-id enriches a cached instance in place. It affects only UI metadata. Worth a look by the loyalty owner; not triaged here.

## Evidence
- `screenshots/post-blade-error-header.png`: blade header "Mission reward amount cannot be negative".
- `screenshots/post-view-details-dialog.png`: Error details dialog showing the message (not empty).
- `screenshots/regression-security-users-blade.png`: unrelated blade loads.
- `console-session.log`, `network-api.log` (in this folder).
- HAR: `test-results/edge/har/VCST-6086-verify-2026-09-29.har` (gitignored; 251 entries, 13:29–13:42 UTC; includes all 7 rejected saves).
- The run-1 POST/PUT screenshots and the Catalog/Orders/Stores screenshots were deleted from this folder mid-run by something outside this session; it was not the root-only sweep hook. The dialog text for every run is recorded from DOM snapshots. The POST dialog was re-captured with run 4 (an extra rejected save, not persisted). The PUT dialog screenshot was not re-captured; its text is in the DOM snapshot of PUT runs 1–3.

## KB (queued locally, not pushed)
- `dispute KB-E84AAF1D`: the TypeError noted in its earlier dispute is gone on platform `3.1074.0-pr-3125`.
- `capture KB-7276AA88`: setError body-shape behaviour on builds that include PR 3125.

## Teardown
- No entities were created: every POST was rejected, which the search confirms.
- `rgweg` is unchanged; each dirty blade was discarded via "Save changes? → No".
- No config was changed. The browser is closed.
