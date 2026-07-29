# A single Ctrl+Z on a freshly opened notification template wipes the entire template body

## Status: CONFIRMED

**JIRA:** VCST-5604 (filed 2026-07-29, linked to VCST-5557 via "Relates")

**Severity:** High · **Found during:** `/qa-test VCST-5557` · **Introduced by PR #202**

**Env:** vcst-qa @ Platform 3.1051.0, `VirtoCommerce.Notifications 3.1013.0-pr-202-0b9c`

## Summary

The new CodeMirror template editor records the initial content load as an undoable step, so the very first Ctrl+Z on a just-opened template — with no edits made — empties the whole body. With Save now in the blade toolbar, one stray undo plus one click destroys a 50 KB email template.

## Steps to reproduce

1. Admin → **Notifications** → *Abandoned cart* (`AbandonedCartEmailNotification`) → Templates → open the `default` template.
2. Make **no** edits. Click once inside the **Template (liquid)** editor.
3. Press **Ctrl+Z** once.

**Expected:** nothing happens — there is no user edit to undo.

**Actual:** the editor empties. Measured 51,379 → **0** characters, 385 → **1** line. `Ctrl+Y` restores the content.

Reproduced on `AbandonedCartEmailNotification/default`; also observed on `InvoiceEmailNotification/default`.

## Evidence

![Template body emptied by a single Ctrl+Z on a freshly opened blade](../../tickets/Sprint26-15/VCST-5557/screenshots/11-BUG-single-ctrl-z-wipes-whole-template.png)

On a fresh blade the editor reports `historySize = { undo: 1, redo: 0 }` — an undo entry exists before the user touches anything.

*Jira: attached as `11-BUG-single-ctrl-z-wipes-whole-template.png` (id 80152).*

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin-only surface |
| 2. Backend Admin | **FAIL** | measured `historySize` + character counts above |
| 3. GraphQL xAPI | N/A | client-side editor state only |
| 4. Platform REST API | PASS | server content intact (nothing saved) |

**Owning layer:** Layer 2 — Admin SPA.

## Root Cause Analysis

`notifications-edit-template.js` binds the body to CodeMirror via `ui-codemirror` + `ng-model` (`<ui-codemirror ng-model="blade.currentEntity.body" ui-codemirror-opts="htmlEditorOptions">`). The directive pushes the initial value through `setValue()`, which CodeMirror records in its undo history. The controller's `onLoad` handler sets `readOnly`, injects the format button and wires hints, but **never calls `clearHistory()`**:

```js
onLoad: function (_editor) {
    templateEditor = _editor;
    _editor.setOption('readOnly', …);
    injectHtmlFormatButton(_editor);
    wireHints(_editor);
    $timeout(function () { _editor.refresh(); });
}
```

**Suggested fix:** call `_editor.clearHistory()` after the initial content is applied (in `onLoad`, and again whenever the blade swaps templates/languages), so the loaded document is the history baseline. The same applies to the Sample data editor.

**Why this is PR-introduced:** the pre-PR editor was a `vc-uk-htmleditor` textarea with no CodeMirror undo stack, so this failure mode did not exist before.

## Aggravating factors

- **Save is now in the toolbar**, directly above the editor — an accidental undo followed by Save is a two-click data loss.
- After `Ctrl+Z` → `Ctrl+Y` restores byte-identical content, the blade still reports itself modified and prompts to save (not reproducible from a plain open — see the minor-findings report).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin SPA (module-embedded AngularJS)
- **Suggested repo:** `VirtoCommerce/vc-module-notification`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Notifications — template edit blade, CodeMirror editor init
- **RCA anchor:** `src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notifications-edit-template.js` → `$scope.htmlEditorOptions.onLoad` (no `clearHistory()` after initial `setValue`); same for `$scope.jsonEditorOptions.onLoad`
- **Routing confidence:** HIGH
