# Format JSON / Format HTML error dialogs are hardcoded English in every locale

## Status: CONFIRMED

**JIRA:** VCST-5611 (filed 2026-07-29, linked to VCST-5557 via "Relates")

**Severity:** Medium (breaks a VCST-5557 acceptance criterion) · **Found during:** `/qa-test VCST-5557` · **Introduced by PR #202**

**Env:** vcst-qa @ Platform 3.1051.0, `VirtoCommerce.Notifications 3.1013.0-pr-202-0b9c`

## Summary

PR #202 ships 7 new localization keys across all 13 languages, but the two error dialogs it also introduces bypass i18n entirely — their title and message are English string literals. This breaks the ticket's AC "All UI strings are localized in every shipped language".

## Steps to reproduce

1. Switch the Admin UI language to **Russian**.
2. Admin → **Notifications** → an Email notification → Templates → open a template.
3. **Sample data (json)** tab → make the JSON invalid (e.g. delete a closing brace).
4. Click **Форматировать JSON**.

**Expected:** dialog title and message in Russian.

**Actual:** `JSON Error` / `Cannot format: Unexpected end of JSON input` — only the platform's own OK button is localized (`ОК`).

![English JSON Error dialog with the Admin UI in Russian](../../tickets/Sprint26-15/VCST-5557/screenshots/K1-russian-invalid-json-dialog.png)

*Jira: attached as `K1-russian-invalid-json-dialog.png` (id 80157).*

The **Format HTML** failure dialog has the same problem (`HTML Error` / `Cannot format: …`).

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin-only surface |
| 2. Backend Admin | **FAIL** | screenshot above |
| 3. GraphQL xAPI | N/A | client-side strings |
| 4. Platform REST API | N/A | client-side strings |

**Owning layer:** Layer 2 — Admin SPA.

## Root Cause Analysis

Both dialogs are raised with literal strings instead of `$translate` / a localization key:

```js
dialogService.showNotificationDialog({ id: 'jsonFormatError', title: 'JSON Error',  message: 'Cannot format: ' + e.message });
dialogService.showNotificationDialog({ id: 'htmlFormatError', title: 'HTML Error',  message: 'Cannot format: ' + e.message });
```

The controller already has a translation helper (`function t(key) { return $translate.instant('notifications.blades.notifications-edit-template.labels.' + key); }`) used for the button captions and the invalid-JSON badge — it simply is not used here. No corresponding key exists among the 7 added (`tab-template`, `tab-sample`, `fullscreen`, `exit-fullscreen`, `invalid-json`, `format-json`, `format-html`).

**Suggested fix:** add two keys (e.g. `format-json-error` / `format-html-error`, with a `{{ message }}` placeholder for the parser text) to all 13 `Localizations/*.VirtoCommerce.Notifications.json` files and route both dialogs through the existing `t()` helper.

## Notes

- The 7 keys that *were* added are genuinely translated — RU, DE and JA were verified in the diff and RU + DE confirmed live, with no raw keys leaking into the UI.
- The parser text itself (`Unexpected end of JSON input`) comes from the browser's `JSON.parse` and will stay English; that is acceptable, but the surrounding title and prefix should not be.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin SPA (module-embedded AngularJS)
- **Suggested repo:** `VirtoCommerce/vc-module-notification`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Notifications — template edit blade, format actions + Localizations
- **RCA anchor:** `src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notifications-edit-template.js` → `formatSampleJson()` and `formatHtml()` `catch` branches (`title: 'JSON Error'` / `'HTML Error'`, `message: 'Cannot format: '`); keys missing from `src/VirtoCommerce.NotificationsModule.Web/Localizations/*.VirtoCommerce.Notifications.json`
- **Routing confidence:** HIGH
