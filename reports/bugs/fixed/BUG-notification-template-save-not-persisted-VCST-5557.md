# Toolbar "Save" on a drilled-down notification template does not persist, and the grid then shows a false "Modified: today"

## Status: CONFIRMED

**JIRA:** VCST-5607 (filed 2026-07-29, linked to VCST-5557 via "Relates")

**Severity:** High · **Found during:** `/qa-test VCST-5557` · **Pre-existing behaviour, made materially more dangerous by PR #202**

**Env:** vcst-qa @ Platform 3.1051.0, `VirtoCommerce.Notifications 3.1013.0-pr-202-0b9c`

## Summary

Pressing **Save** in the template blade's toolbar closes the blade and refreshes the grid's `Modified` column to today, but issues no write request — the edit is only staged in the parent blade's in-memory entity. The admin gets a success-shaped signal for a change that was never saved. The edit is lost unless the user separately presses Save on the parent "…: Details" blade.

## Steps to reproduce

1. Admin → **Notifications** → Notification list → *Notification on created order*.
2. Templates grid → open the **`en-US`** template.
3. Append text to **Subject**.
4. Click the toolbar **Save** (disk icon).
5. Observe the Templates grid, then re-read the template from the API.

**Expected:** the change is written to the server.

**Actual:**
- No `PUT /api/notifications/{type}` is issued (verified in the network log).
- `GET /api/notifications/OrderCreateEmailNotification` still returns the **old** subject and `modifiedDate 2026-06-23`.
- The Templates grid nevertheless shows **Modified: today** for that row — a false confirmation.
- The edit persists only if the user *also* presses **Save** on the parent "…: Details" blade; pressing **Undo** there discards it.

Reproduced identically on an SMS notification template. **Deep-linked** blades are unaffected — they take a different path and `PUT` immediately (204).

![Grid shows Modified today while the API still returns the old subject](../../tickets/Sprint26-15/VCST-5557/screenshots/BUG-H3-save-not-persisted-drilldown.png)

*Jira: attached as `BUG-H3-save-not-persisted-drilldown.png` (id 80164).*

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin-only surface |
| 2. Backend Admin | **FAIL** | `screenshots/BUG-H3-save-not-persisted-drilldown.png` + network log (no PUT) |
| 3. GraphQL xAPI | N/A | not exercised |
| 4. Platform REST API | PASS | `PUT /api/notifications/{type}` works correctly when actually called (deep-link path → 204) |

**Owning layer:** Layer 2 — Admin SPA (the blade never calls the working API).

## Root Cause Analysis

`saveTemplate()` in `notifications-edit-template.js` only mutates `blade.notification.templates` in memory and then calls `refreshParentBlade()` / `$scope.bladeClose()`. Persistence is delegated to the parent `notification-details` blade's own Save. The grid's `Modified` column is re-rendered from the in-memory entity by `notification-details.js:61-64` (`modifiedDateAsString = $filter('date')(template.modifiedDate, …)`), which is why it displays today's date for an unsaved change.

**Provenance.** The removed bottom **OK** button called the same `saveChanges()`, so the two-step staging model predates PR #202. What PR #202 changed is the *framing*:

1. The control is now labelled **Save** with a `fa fa-save` icon in the blade toolbar. In the VC Admin SPA a toolbar Save universally means "persist now".
2. The same button now behaves **differently depending on how the blade was opened** — the new deep-link path added by this PR calls `persistNotification()` → `PUT` → 204, while the drill-down path still only stages.

So the defect is pre-existing but its likelihood of causing real data loss went up. Fix options: have the drill-down path persist too (as the deep-link path does), or relabel the toolbar command so it does not read as a durable save.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin SPA (module-embedded AngularJS)
- **Suggested repo:** `VirtoCommerce/vc-module-notification`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Notifications — template edit blade save path
- **RCA anchor:** `src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notifications-edit-template.js` → `saveTemplate()` / `$scope.saveChanges()` (stages only; `persistNotification()` exists but is gated on `blade.isDeepLink`); grid date from `blades/notification-details.js:61-64`
- **Routing confidence:** HIGH
