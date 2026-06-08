# BUG: Admin UI error toasts show raw localization keys (VCST-5061)

## Status: CLOSED — Cannot Reproduce / Already Fixed

**Env:** vcptcore-qa.govirto.com @ Platform `3.1033.0-pr-3039-35f3` · Admin SPA · Edge
**Reproduced by:** `/qa-bug VCST-5061` live repro (2026-06-08), user `qa-vcst4755-no-perms` (no catalog perms)

## Summary
VCST-5061 reported that the Admin UI error toast / error-details popup render the raw localization
key `platform.errors.generic-error` instead of its translated value. On the current build the bug
**does not reproduce** — every user-visible string is human-readable. Confirmed by both static code
analysis (`vc-platform@dev`) and a live reproduction of the ticket's exact STR.

## Steps to Reproduce (from ticket)
1. Log in to the Admin SPA as `qa-vcst4755-no-perms` / `Password1!` (only `platform:access`, no catalog perms).
2. Navigate to `/#!/workspace/catalog`.
3. Observe the top-right error toast and open its "View details" popup.

## Expected vs Actual (current build)
- **Expected (ticket):** toast text translated — at minimum `"Error"` (value of `platform.errors.generic-error`).
- **Actual (now):** toast = `404: Not found`; details popup title `Error details`, body `404: Not found`, button `OK`.
  **No dotted localization token appears anywhere.** → matches expected. Bug not present.

## Why it no longer reproduces (root cause / mechanism)
The denied catalog call `POST /api/catalog/catalogs/search` returns `302 → /Account/AccessDenied → 404`
with a **populated** `statusText: "Not found"`. The Admin SPA error path binds `{status}: {statusText}`,
so it renders the populated reason phrase directly — never the localization-key fallback.

Even on the empty-`statusText` paths, the current code already translates correctly. Only one code
reference to the key exists in the entire repo, and it is run through `$translate.instant`:

`vc-platform` → `src/VirtoCommerce.Platform.Web/wwwroot/js/app/navigation/blade/bladeNavigation.js`
(`platformWebApp.bladeNavigationService.getStatusText`):
```js
if (response.statusText === "") {
    var errorKey = 'platform.errors.' + response.status.toString();   // 'platform.errors.404'
    var result = $translate.instant(errorKey);                        // → "Not found"
    if (errorKey === result) {
        result = $translate.instant('platform.errors.generic-error'); // → "Error" (translated fallback)
    }
    return result;
}
```
This translate logic has been on `dev` since 2023 (commits `94842dbf`, `070af9e5`), predating the
2026-05-06 ticket. The localization keys all exist in `en.VirtoCommerce.Common.json`
(`errors.404` = "Not found", `errors.generic-error` = "Error", plus 400/401/403/500…).

**Conclusion:** the ticket reflected a stale/older deployed build on its env at filing time; the code
fix already exists. This is deploy/version drift, not a current code defect.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | Admin SPA bug, storefront not exercised |
| 2. Backend Admin (SPA) | PASS | toast/dialog show "404: Not found" — no raw key (live repro) |
| 3. GraphQL xAPI | N/A | not on this path |
| 4. Platform REST API | PASS (by-design) | denied calls 302→AccessDenied→404 w/ populated statusText |

**Owning layer:** none — no defect on current build.

## Fix Routing (→ /qa-fix)
- **Owning layer:** N/A — already fixed in `vc-platform` (`getStatusText` translates the key).
- **Suggested repo:** VirtoCommerce/vc-platform (reference only; no change needed)
- **repoKind:** platform
- **RCA anchor:** `bladeNavigation.js` → `getStatusService.getStatusText` (`$translate.instant('platform.errors.generic-error')`)
- **Routing confidence:** N/A — not auto-fixable (nothing to fix). Recommend closing the JIRA ticket as
  Cannot Reproduce / Fixed, or verifying/redeploying the env where it was originally seen.

## Evidence
- `test-results/edge/vcst5061-toast.png` — toast "404: Not found"
- `test-results/edge/vcst5061-details-dialog.png` — details popup, all human-readable
