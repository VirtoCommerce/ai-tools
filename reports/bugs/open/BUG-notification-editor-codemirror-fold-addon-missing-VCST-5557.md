# Ctrl+Q code folding throws a TypeError in both notification editors, and the fold gutter is dead

## Status: CONFIRMED

**JIRA:** VCST-5608 (filed 2026-07-29, linked to VCST-5557 via "Relates")

**Severity:** Medium · **Found during:** `/qa-test VCST-5557` · **Introduced by PR #202**

**Env:** vcst-qa @ Platform 3.1051.0, `VirtoCommerce.Notifications 3.1013.0-pr-202-0b9c`

## Summary

Both new CodeMirror editors are configured with `foldGutter: true` and a `Ctrl-Q` fold key binding, but the CodeMirror fold addons are not loaded. Pressing Ctrl+Q throws a JS TypeError and folds nothing, and the enabled fold gutter renders as a permanently empty column. Code folding is listed in the VCST-5557 scope as part of the new JSON editor.

## Steps to reproduce

1. Admin → **Notifications** → any Email notification → Templates → open a template.
2. Go to the **Sample data (json)** tab.
3. Put the caret on a line containing `{`.
4. Press **Ctrl+Q**. Open the browser console.
5. Repeat on the **Template (liquid)** tab.

**Expected:** the block folds (the ticket's scope lists "code folding").

**Actual:** nothing folds and the console throws:

```
TypeError: t.foldCode is not a function
    at Ctrl-Q (…/modules/$(VirtoCommerce.Notifications)/dist/app.js:1:19302)
```

The Template editor throws the same at offset `:1:21204`. The fold gutter column is rendered but always empty:

![Sample data editor showing the enabled but permanently empty fold gutter](../../tickets/Sprint26-15/VCST-5557/screenshots/D3-invalid-json-indicator.png)

*Jira: attached as `D3-invalid-json-indicator.png` (id 80154).*

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin-only surface |
| 2. Backend Admin | **FAIL** | console TypeError above (`screenshots/D3-invalid-json-indicator.png` shows the dead gutter) |
| 3. GraphQL xAPI | N/A | client-side only |
| 4. Platform REST API | N/A | client-side only |

**Owning layer:** Layer 2 — Admin SPA (module bundle).

## Root Cause Analysis

`notifications-edit-template.js` enables folding on both editors:

```js
extraKeys: { 'Ctrl-Q': function (cm) { cm.foldCode(cm.getCursor()); }, … },
foldGutter: true,
gutters: [CM_GUTTER_LINES, CM_GUTTER_FOLD],
```

`cm.foldCode` is provided by CodeMirror's `addon/fold/foldcode.js`, and the gutter markers by `addon/fold/foldgutter.js`. Neither is in the platform's `vendor.js` bundle, and the module's webpack build bundles only its own `Scripts/**` — so nothing supplies them at runtime. The runtime `TypeError` is direct proof the addon is absent.

## The platform has the same defect — routing revised

**This is inherited from the platform's own JSON-editor pattern, not invented by PR #202.** The deployed platform bundle `/dist/app.js` contains the identical configuration in **two** places:

```js
// platform /dist/app.js — occurrence 1 (a JSON editor, with its own hardcoded "JSON Error" dialog)
editorOptions = { lineWrapping:!0, lineNumbers:!0, mode:{name:"javascript",json:!0},
  extraKeys:{ "Ctrl-Q": function(e){ e.foldCode(e.getCursor()) }, "Ctrl-Alt-F": … },
  foldGutter:!0, gutters:["CodeMirror-linenumbers","CodeMirror-foldgutter"], … }

// occurrence 2 — the Html/Json dynamic-property editor, same Ctrl-Q + foldGutter
```

`grep` counts on the deployed bundles: `foldCode` / `foldGutter` = **2 each in `/dist/app.js`, 0 in `/dist/vendor.js`**. So the platform *configures* folding in two of its own editors while the addon that implements it is bundled nowhere — meaning **the platform's own two editors have the same broken `Ctrl-Q`**. The ticket's scope line ("Replaced the textarea with the **platform** CodeMirror JSON editor") is literally accurate: the module author copied the platform's pattern faithfully, including its latent bug.

**Why this changes the routing.** CodeMirror addons patch the **global** `CodeMirror.prototype`, so `foldcode.js` loaded *anywhere* makes `foldCode` available to *every* editor instance in the page. Therefore:

- Fixing it in the **platform** (`vc-platform` — add the addon to the admin `vendor` bundle) repairs the platform's two editors **and** the notification module's two editors, with **no module change at all**.
- Fixing it only in the **module** leaves the platform's own editors broken and duplicates the addon in every module that copies the pattern.

**Suggested fix (preferred):** import the fold addons into the platform admin bundle — `codemirror/addon/fold/foldcode` + `foldgutter`, plus `brace-fold` (JSON) and `xml-fold` (HTML), and `foldgutter.css`. **Fallback**, if the platform won't take it: the module drops `foldGutter`, the `CM_GUTTER_FOLD` gutter and the `Ctrl-Q` binding, and folding comes out of the VCST-5557 scope.

> **Related, same origin:** the platform's occurrence 1 also carries `title:"JSON Error", message:"Cannot format: "+e.message` — byte-for-byte the hardcoded-English dialog filed as VCST-5611. That i18n defect is inherited from the same copied pattern, so it may also belong in `vc-platform`.

## Fix Routing (→ /qa-fix)

- **Owning layer:** platform admin bundle (primary) — Layer 2 Admin SPA in the module (fallback only)
- **Suggested repo:** **`VirtoCommerce/vc-platform`** (add the CodeMirror fold addons to the admin bundle) — *not* `vc-module-notification`, which merely inherits the pattern
- **repoKind:** platform
- **Ownership hint:** platform
- **Component / module:** Platform admin CodeMirror bundle; consumers include Platform Settings / dynamic-property editors and `vc-module-notification`'s template editor
- **RCA anchor:** platform config sites visible in the deployed `/dist/app.js` (`extraKeys["Ctrl-Q"] → e.foldCode`, `foldGutter:!0`) with no `addon/fold/*` in `/dist/vendor.js`; module consumer at `src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notifications-edit-template.js` → `$scope.jsonEditorOptions` / `$scope.htmlEditorOptions`
- **Routing confidence:** **MEDIUM** — the *diagnosis* is solid (global prototype patching, verified bundle counts), but which repo the team wants to own the addon is a judgement call. `/qa-fix` should confirm rather than assume, and note this is cross-repo-adjacent (platform fix, module symptom), which may itself be a Gate-1 STOP.
