# In full-screen, invalid sample JSON leaves the preview blank instead of showing the "Invalid JSON" message

## Status: CONFIRMED

**JIRA:** VCST-5612 (filed 2026-07-29, linked to VCST-5557 via "Relates")

**Severity:** Low-Medium · **Found during:** `/qa-test VCST-5557` · **Introduced by PR #202**

**Env:** vcst-qa @ Platform 3.1051.0, `VirtoCommerce.Notifications 3.1013.0-pr-202-0b9c`

## Summary

The tabbed Preview correctly shows a localized "Invalid JSON" message when the sample data cannot be parsed. In full-screen mode the same state renders a completely blank right-hand pane, because the full-screen stylesheet hides the very element that carries the message.

## Steps to reproduce

1. Admin → **Notifications** → an Email notification → Templates → open a template.
2. **Sample data (json)** tab → paste valid JSON, then break it (delete a closing brace).
3. Switch to the **Preview** tab → the localized "Invalid JSON" / "Недопустимый JSON" message is shown. ✅
4. Now click the **expand** icon to enter full-screen, with the JSON still invalid.

**Expected:** the right-hand preview pane shows the same "Invalid JSON" message.

**Actual:** the right-hand pane is completely blank — no message, no stale render, no hint why.

![Full-screen right pane blank on invalid sample JSON](../../tickets/Sprint26-15/VCST-5557/screenshots/K1-russian-fullscreen.png)

*Jira: attached as `K1-russian-fullscreen.png` (id 80158).*

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin-only surface |
| 2. Backend Admin | **FAIL** | screenshot above |
| 3. GraphQL xAPI | N/A | no request is made (client-side guard short-circuits) |
| 4. Platform REST API | N/A | as above |

**Owning layer:** Layer 2 — Admin SPA (CSS).

## Root Cause Analysis

The message is rendered inside a `table-descr` element:

```html
<div class="nt-preview-error" ng-if="blade.previewError">
    <div class="table-descr __error" ng-if="blade.previewError.invalidJson">
        {{ 'notifications.blades.notifications-edit-template.labels.invalid-json' | translate }}
    </div>
```

and the full-screen rule in `Content/css/styles.css` hides every `table-descr` inside the overlay:

```css
.notification-edit-template .nt-editor.__fullscreen .table-descr {
    display: none;
}
```

That rule was presumably meant to suppress the *field help* descriptions in full-screen, but `.table-descr` is also the class used for the invalid-JSON error, so the error is collateral. The `ng-if` evaluates correctly and the DOM node exists — it is simply `display: none`.

**Suggested fix:** scope the full-screen suppression to the header descriptions (e.g. `.nt-header-row .table-descr`), or exclude the error variant (`.table-descr:not(.__error)`), or give the error its own class instead of reusing `table-descr`.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin SPA (module CSS)
- **Suggested repo:** `VirtoCommerce/vc-module-notification`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Notifications — template edit blade full-screen styles
- **RCA anchor:** `src/VirtoCommerce.NotificationsModule.Web/Content/css/styles.css` → `.notification-edit-template .nt-editor.__fullscreen .table-descr { display: none; }` vs. `notifications-edit-template.tpl.html` → `<div class="table-descr __error" ng-if="blade.previewError.invalidJson">`
- **Routing confidence:** HIGH
