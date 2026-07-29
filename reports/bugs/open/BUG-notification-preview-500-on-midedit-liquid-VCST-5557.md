# Live preview returns HTTP 500 on in-progress Liquid, shown as a generic error toast that hides the blade's close button

## Status: CONFIRMED

**JIRA:** VCST-5610 (filed 2026-07-29, linked to VCST-5557 via "Relates")

**Severity:** Medium · **Found during:** `/qa-test VCST-5557` · **Trigger introduced by PR #202**

**Env:** vcst-qa @ Platform 3.1051.0, `VirtoCommerce.Notifications 3.1013.0-pr-202-0b9c`

## Summary

The new debounced live preview POSTs the template on every ~500 ms typing pause, so any half-typed Liquid expression reaches the render endpoint and returns **HTTP 500**. The response body is a well-formed template-parse report, but the UI surfaces it as a generic red "500: Internal server error" toast. While that toast is displayed the blade's own maximize and ✕ buttons are not reachable — so ordinary typing temporarily removes the editor's close control.

## Steps to reproduce

1. Admin → **Notifications** → an Email notification → Templates → open a template.
2. Open the **Preview** tab (so the live preview is active).
3. In **Template (liquid)**, start typing an expression and pause mid-way, e.g. type `{% assign x = ` and stop.
4. Wait ~0.5 s. Observe the toast and the network response.
5. While the toast is visible, try to click the blade's ✕ (close) or maximize button.

**Expected:** an inline, non-alarming hint that the template currently has a parse error (the preview simply cannot render yet). Blade chrome stays usable.

**Actual:**
- `POST /api/notifications/{type}/templates/{language}/rendercontent` → **500**, `x-response-time: 0.082`, body:
  `"This template has errors… <input>(31,18) : error : Error while parsing assign expression…"`
- UI shows a generic red **"500: Internal server error"** toast:

![Generic 500 toast while typing Liquid; blade close button occluded](../../tickets/Sprint26-15/VCST-5557/screenshots/16-BUG-500-toast-while-typing-liquid.png)

*Jira: attached as `16-BUG-500-toast-while-typing-liquid.png` (id 80156).*
- The blade's maximize and ✕ buttons are absent from the blade-chrome band while the toast shows — at the ✕'s coordinates the topmost element is the toast's "Dismiss" link. Dismissing the toast restores both.

Observed 3 times during the run.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin-only surface |
| 2. Backend Admin | **FAIL** | generic toast instead of an inline parse hint; blade chrome occluded |
| 3. GraphQL xAPI | N/A | REST endpoint, not xAPI |
| 4. Platform REST API | **FAIL** | a template parse error is a client-input problem returned as `500` rather than a 4xx |

**Owning layer:** Layer 4 for the status code, Layer 2 for the presentation. Both live in the same repo.

## Root Cause Analysis

Two independent contributors:

1. **The trigger is new.** `notifications-edit-template.js` watches the body/sample/layout/language and calls `schedulePreview()` → `updatePreview()` on a 500 ms debounce whenever the preview is visible. Before PR #202 previewing was an explicit user action, so a mid-edit template was never sent. The debounce works correctly (12 characters typed → 2 renders), so this is not a request-storm problem — a single in-progress edit is enough.
2. **The endpoint returns 500 for a user-input error.** The render controller treats a Scriban/Liquid parse failure as a server fault. `updatePreview()`'s error branch stores the whole `error` object in `blade.previewError` and the blade renders `blade.previewError.data.message || blade.previewError.statusText || 'Preview failed'`, while the platform's global HTTP interceptor independently raises the red 500 toast.

**Suggested fix:** return a 4xx (or a 200 with a structured `errors[]`) for a template parse failure so it is not a server error; and in the blade, suppress the global toast for the debounced preview call and render the parse message inline in the Preview pane instead. The occlusion of the blade chrome by the toast is platform toast behaviour, but the fix above avoids provoking it.

## Notes

- Verified independently in App Insights: 22/22 `POST Notifications/RenderingTemplate` in the test window were logged as `200 / success=True` with zero exceptions, while the browser observed these 3 × 500. The client-visible failures appear absent from telemetry — tracked separately, not part of this bug.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST (status code) + Layer 2 — Admin SPA (presentation)
- **Suggested repo:** `VirtoCommerce/vc-module-notification`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Notifications — `rendercontent` endpoint + template edit blade live preview
- **RCA anchor:** `src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notifications-edit-template.js` → `schedulePreview()` / `updatePreview()` error branch; server side: the `templates/{language}/rendercontent` action returning 500 on a Scriban parse error
- **Routing confidence:** MEDIUM (two-part fix: status code and presentation; a reviewer may prefer to split them)
