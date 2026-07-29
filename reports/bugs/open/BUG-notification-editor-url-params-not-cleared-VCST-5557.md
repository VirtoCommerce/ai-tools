# Closing the notification template blade leaves `type`/`templateId` in the URL until the next digest, so a refresh reopens the closed blade

## Status: CONFIRMED

**JIRA:** VCST-5613 (filed 2026-07-29, linked to VCST-5557 via "Relates")

**Severity:** Low-Medium · **Found during:** `/qa-test VCST-5557` · **Introduced by PR #202**

**Env:** vcst-qa @ Platform 3.1051.0, `VirtoCommerce.Notifications 3.1013.0-pr-202-0b9c`

## Summary

The blade's `$destroy` handler clears the deep-link query params, but the `$location` writes are never flushed to the address bar because they happen outside an AngularJS digest. The URL keeps pointing at a blade the user has closed for as long as nothing else triggers a digest — measured at over 30 seconds — so a refresh in that window silently reopens it. Affects **both** entry paths, not just deep links.

## Steps to reproduce

**Path A — drill-down (the common case):**
1. Admin → **Notifications** → *Invoice* → Templates → open a template. `updateDeepLink()` writes `type` + `templateId` into the URL.
2. Close the blade with **✕**.
3. Poll `location.href` without clicking anything else.

**Path B — deep link:**
1. Cold-load `https://vcst-qa.govirto.com/#!/workspace/notifications?type=InvoiceEmailNotification&templateId=4f990025-7d12-4a20-9e90-f1f00df01083` in a fresh tab. The editor blade opens directly.
2. Close with **✕**, then poll the URL.

**Expected:** both params are removed as soon as the blade closes (which is what `$destroy` intends).

**Actual — params persist.** Drill-down path, polled in the foreground at t = 0, 254, 1012, 2022, 3022, 5024, 8039, 12060, 20129 and **30202 ms** — all 10 samples still read:

```
#!/workspace/notifications?type=InvoiceEmailNotification&templateId=4f990025-7d12-4a20-9e90-f1f00df01083
```

The blade itself was gone throughout (`editorRendered: false`). The **very next real-user click** (✕ on the parent blade) cleared them instantly:

```
#!/workspace/notifications
```

Deep-link path: identical immediately after ✕ and at +3 s; cleared only later, once the tab was backgrounded and something else ran a digest.

**Consequence:** pressing F5 inside that window re-opens the blade the user just closed — confirmed, since a cold load of the retained URL opens the editor directly.

![Blade closed but type/templateId still in the URL](../../tickets/Sprint26-15/VCST-5557/screenshots/J4-close-deeplink-url-not-cleared.png)

*Jira: attached as `J4-close-deeplink-url-not-cleared.png` (id 80159).*

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin-only surface |
| 2. Backend Admin | **FAIL** | the 10 URL samples above |
| 3. GraphQL xAPI | N/A | client-side routing only |
| 4. Platform REST API | N/A | client-side routing only |

**Owning layer:** Layer 2 — Admin SPA.

## Root Cause Analysis

The cleanup exists and does run — it just never reaches the address bar:

```js
$scope.$on('$destroy', function () {
    ...
    $location.search('type', null);
    $location.search('templateId', null);
});
```

`$location` mutations are only flushed to the browser URL during `$digest`. Blade teardown destroys the scope outside a digest cycle, so both writes sit pending until some unrelated event triggers one — hence the exact-30-second persistence and the instant clear on the next click.

**Suggested fix:** wrap the clears so they land inside a digest — `$rootScope.$applyAsync(...)` or `$timeout(..., 0)` — or move them into `bladeClose`. The same file already uses this pattern for the same class of problem in the Esc handler:

```js
$scope.$applyAsync(function () { applyFullscreen(false); });
```

**Why PR-introduced:** `updateDeepLink()`, the `type`/`templateId` params, and the `$destroy` cleanup were all added by this PR (`reloadOnSearch: false` route change in `Scripts/notifications.js`). Before it, the blade wrote nothing to the query string.

## Notes

- Originally reported as deep-link-only. Re-verification showed it affects the **drill-down path too** — in fact that is the more common exposure, since every ordinary template open now writes the params.
- There is no back/blade-collapse close path to compare: clicking the parent "Template list" blade header does **not** close the child blade, so ✕ is the only close control.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin SPA (module-embedded AngularJS)
- **Suggested repo:** `VirtoCommerce/vc-module-notification`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Notifications — template edit blade deep-link/query-string sync
- **RCA anchor:** `src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notifications-edit-template.js` → `$scope.$on('$destroy', …)` calling `$location.search('type', null)` / `$location.search('templateId', null)` outside a digest; params written by `updateDeepLink()`; route in `src/VirtoCommerce.NotificationsModule.Web/Scripts/notifications.js` (`reloadOnSearch: false`)
- **Routing confidence:** HIGH
