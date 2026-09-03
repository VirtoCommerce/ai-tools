# Editing a predefined notification template no longer warns that it will replace the shipped default

## Status: CONFIRMED

**JIRA:** VCST-5606 (filed 2026-07-29, **re-scoped 2026-07-29**, linked to VCST-5557 via "Relates")

**Severity:** Medium · **Found during:** `/qa-test VCST-5557` · **Introduced by PR #202**

**Env:** vcst-qa @ Platform 3.1051.0, `VirtoCommerce.Notifications 3.1013.0-pr-202-0b9c`

> **Re-scoped.** This report originally read *"Predefined ("read-only") notification templates are fully editable and can be overwritten"* (High, pre-existing). That premise was refuted — predefined templates are editable **by design**. See *Why the original framing was wrong* below. The real defect, in the same place and caused by this PR, is the missing warning.

## Summary

Editing a predefined notification template replaces the shipped default on Save. The module has always warned the user before that happens, via an in-blade note. PR #202 **commented the note out**, so a user now overwrites a shipped default with no on-screen indication. The localized strings still ship in all 13 locales and are now orphaned, so no localization check would catch the removal.

## Steps to reproduce

1. Admin → **Notifications** → open *Invoice* (`InvoiceEmailNotification`).
2. Open the **Templates** widget. Find the row badged **Predefined Edited** (green *Predefined* + red *Edited*).
3. Open that row.
4. Look above the Language / Layout / Subject row, where the note renders on `dev`.

**Expected:** the note is visible — *"This template has a predefined source. Once you save your notification, this version will replace the predefined one. You can restore the original template using the appropriate button"* — matching the documented behaviour: *"…it will be replaced with your modified version, but the system will warn you."*

**Actual:** no note is rendered. Nothing indicates the shipped default is about to be replaced. Save proceeds silently.

The blade open in exactly that state (`isPredefined && isEdited`), with no note above the header row:

![Predefined Edited row open, no warning note rendered](../../tickets/Sprint26-15/VCST-5557/screenshots/RV-F3a-drilldown-predefined-editable-save-enabled.png)

## Root Cause Analysis

The paragraph is commented out in the rewritten blade template:

| Branch | File:line | State |
|--------|-----------|-------|
| `dev` (pre-PR) | `Scripts/blades/notifications-edit-template.tpl.html:7` | renders `<p ng-if="blade.currentEntity.isPredefined && blade.currentEntity.isEdited" class="text __note">…note-caption…note-text…</p>` |
| `feat/VCST-5557` (PR #202) | same file `:5` | identical element wrapped in `<!-- … -->` |

Strings untouched, still shipped in every locale, now unreferenced by rendered markup:

- `notifications.blades.notifications-edit-template.labels.note-caption`
- `notifications.blades.notifications-edit-template.labels.note-text`

### The removed note was live, not inert

Worth stating explicitly, because a superficially similar finding in this same run (VCST-5609, removed file-upload wiring) was withdrawn precisely for being inert. Here the guarded state is reachable:

- **`IsEdited` is not a backend property.** `NotificationTemplate.cs` declares only `IsReadonly` and `IsPredefined`. `isEdited` is synthesized client-side.
- `notification-templates-list.js:22-29` — per language group: `var hasPredefinedTemplates = _.any(languageCodeTemplates, t => t.isPredefined); … if (!element.isPredefined) { element.isPredefined = true; element.isEdited = true; }`. A persisted **override** row (API: `isPredefined: false`) is therefore *displayed* as `isPredefined: true, isEdited: true`.
- `notification-templates-list.tpl.html:34-36` — that pair is the **Predefined Edited** dual badge.
- `notifications-edit-template.js:455-461` recomputes the same on blade open.

So `isPredefined && isEdited` is satisfied by the Predefined-Edited list row — the row a user actually edits — and the note rendered there pre-PR. (It does **not** render on the id-less `?type=` deep link: with no override, `isEdited` is false. That path is not the repro.)

## Why the original framing was wrong

Predefined templates are meant to be editable; editing one produces a saved override, and **Restore** reverts it. Three axes agree:

| Axis | Evidence |
|------|----------|
| Docs | [PlatformUserGuide → Notification Templates](https://docs.virtocommerce.org/platform/user-guide/notifications/notification-templates): *"The **predefined** label means that this notification template is supplied out of the box. If you make changes to it and then save it, it will be replaced with your modified version, but the system will warn you… The defaults can be restored any time by clicking **Restore** in the toolbar."* |
| Source | `notifications-edit-template.js` `saveChanges()`: `if (!!element.isEdited && !!element.isPredefined) { element.isPredefined = false; }`, commented *"Need to set IsPredefined to false in order to save the template to the database"*. Same file: the **Restore** toolbar command, shown when `isPredefined && isEdited`. Identical logic in `notification-details.js`. |
| Live | Editable, Save enables — the original observation was accurate; only its interpretation was wrong. |

The misread came from this story's own scope text, which calls AC 6 *"Preview / Send test email are enabled for **read-only (predefined)** templates"*. "Read-only" there means "has a shipped default", not "edits are blocked".

## Secondary observation — `IsReadonly` is dead code (separate, Low)

`NotificationTemplate.IsReadonly` is declared but never assigned anywhere in the module (repo-wide: the model declaration, the two blade files that read it, and the save filter). It is a **different** concept from `IsPredefined` — it excludes a template from the save payload (`_.filter(templates, { isReadonly: false })`), i.e. "never persist this one". Its consumers are therefore inert: `setOption('readOnly', …)`, the `!isReadonly` term in `canRender()`, the Format JSON/HTML guards. Code hygiene, not the cause of this defect. Split out if it warrants a ticket.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin-only surface |
| 2. Backend Admin | **FAIL** | `tpl.html:5` commented out (cf. `dev`:7); screenshot above shows the state with no note |
| 3. GraphQL xAPI | N/A | not exercised |
| 4. Platform REST API | PASS | no API involvement — `isEdited` is client-synthesized |

**Owning layer:** Layer 2 — Admin SPA, module-hosted.

## Notes

- **Nothing was saved during testing.** A post-test `GET /api/notifications/InvoiceEmailNotification` confirmed both templates byte-length identical to baseline (`null` → 9574/45/17071; `4f990025` → 5449/64/0).
- Regression coverage is being added to `regression/suites/Backend/notifications/057-notifications-templates.csv` so the note cannot silently disappear again.

## Fix

Un-comment the note and position it so the new tabbed layout still shows it — it must survive the header-row/tab restructure, not simply be restored to its old position.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin SPA (module-hosted)
- **Suggested repo:** `VirtoCommerce/vc-module-notification`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Notifications — notification template editing blade
- **RCA anchor:** `src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notifications-edit-template.tpl.html:5` (commented-out `<p class="text __note">`; cf. `dev`:7)
- **Routing confidence:** HIGH

## Related

- **VCST-5557** — the story this PR implements; the correction is recorded in its comment thread.
- **VCST-5609** — withdrawn for an inert-markup premise; the *Removed note was live* section above is what distinguishes this finding from it.
