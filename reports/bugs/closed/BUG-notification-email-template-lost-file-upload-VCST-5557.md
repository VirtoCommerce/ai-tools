# Email notification template: the file-upload wiring was removed — was it ever a working capability?

## Status: CLOSED

**JIRA:** VCST-5609 — **Cancelled** 2026-07-29 (invalid / unverified premise). Linked to VCST-5557 via "Relates".

**Severity:** Low (was Medium) · **Found during:** `/qa-test VCST-5557` · **Markup removal is factual; the capability loss was never verified**

## Resolution
- **Outcome:** CLOSED — invalid finding, withdrawn by QA
- **JIRA:** VCST-5609 → Cancelled (2026-07-29), with the reasoning recorded as a comment on the ticket
- **Reason:** filed as a capability regression on a premise that was inferred from the PR diff and never observed. Follow-up analysis (below) indicates the removed `vc-uk-htmleditor` / `file-uploader` attribute pair was most likely **inert**, so there was probably no capability to lose.
- **No action taken on PR #202.** If anyone confirms the old uploader actually worked, **reopen** rather than re-file — the analysis is kept here.
- **Process lesson:** it was filed at CONFIRMED when only the *absence* of a control in the new build had been verified; the *existence* of the capability in the old build had not. A diff-only inference is a suspicion, not a defect.

> **DOWNGRADED then CANCELLED 2026-07-29.** The original framing ("Email templates lost the ability to upload or insert a file/image", *Introduced by PR #202*) asserted a regression that was never observed — see **Verification gap** below.

**Env:** vcst-qa @ Platform 3.1051.0, `VirtoCommerce.Notifications 3.1013.0-pr-202-0b9c`

## Summary

PR #202 replaced the Email template's `<textarea vc-uk-htmleditor … file-uploader="fileUploader">` (plus its hidden `<input id="fileUploader">`) with a plain `ui-codemirror` editor, deleting the upload wiring. The new editor has no upload affordance. It is **not established** that the old wiring provided a working one, so this is filed as a question to resolve, not a confirmed regression.

## Verification gap — why this is not CONFIRMED

1. **The loss was inferred from the diff, never observed.** Testing verified the *absence* of an upload control in the new build. The pre-PR build is not deployed anywhere, so nobody saw the old uploader work. Per this repo's own rule, a diff-only finding is a suspicion to confirm live — never a defect on its own.
2. **No `vcUkHtmleditor` directive is registered in any loaded bundle.** Scanning every `*[Hh]tmleditor` token in the deployed `/dist/vendor.js`, `/dist/app.js`, `/scripts/platformWebApp.pluginLoader.js` and the notification module's own `dist/app.js` yields only UIkit's bare `htmleditor` (vendor) and the attribute string in the compiled template (module) — **no `vcUkHtmleditor` registration anywhere**. If no directive consumed `vc-uk-htmleditor`, then nothing consumed its `file-uploader` binding either, and the attribute pair was inert. (UIkit auto-inits on `uk-htmleditor` / `data-uk-htmleditor`, not on a `vc-`-prefixed attribute.)
3. **The `fileUploader` hits in `vendor.js` are the generic `angular-file-upload` library** (`nvFileSelect`, the `FileUploader` factory) — library code, not evidence that the htmleditor consumed the attribute. I originally cited these as if they proved the wiring was live; they don't.
4. **"SMS kept its button" is not evidence of intent.** The pre-PR SMS branch carried the *identical* uploader markup — including a **duplicate `id="fileUploader"`** on the same page — bound to `blade.currentEntity.message`. An image uploader in an SMS body is nonsensical, so this reads as copy-paste, not a designed capability. PR #202 simply didn't touch the SMS branch. My original "the asymmetry is hard to defend" argument doesn't hold.

## What would settle it

- Open an **SMS** notification template on the current build and check whether a real UIkit editor toolbar with a working upload/image control renders (the SMS branch still has the old markup). If it does **not**, the wiring was inert and this ticket closes as *not a bug*. If it does, the Email removal is a genuine capability loss and this returns to Medium.
- Alternatively, run the pre-PR module build locally (`/qa-local-env`) and try to upload into an Email template.

## Steps to reproduce (what IS observable)

1. Admin → **Notifications** → any Email notification → Templates → open a template.
2. Look for an upload button, asset picker or drag-and-drop target in **Template (liquid)**, **Sample data (json)** and **Preview**, in the blade toolbar, and in full-screen mode.

**Observed:** no upload control anywhere in the Email editor. Authors must hand-write `<img src="…">` against an externally hosted URL — which is what the env's own predefined templates already do.

## Steps to reproduce

1. Admin → **Notifications** → any Email notification → Templates → open a template.
2. Look for an upload button, asset picker, or drag-and-drop target in **Template (liquid)**, **Sample data (json)** and **Preview**, in the blade toolbar, and in full-screen mode.
3. Compare with an **SMS** notification template.

**Expected:** a way to get an image/attachment into the template, as before.

The SMS branch, left on the old markup, is the comparison point — and the thing to re-inspect per **What would settle it** above:

![SMS template editor still on the old markup](../../tickets/Sprint26-15/VCST-5557/screenshots/L1-sms-template-old-layout.png)

*Jira: attached as `L1-sms-template-old-layout.png` (id 80155).*

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin-only surface |
| 2. Backend Admin | **OBSERVED — absence only** | no upload control across all tabs / toolbar / full-screen. Not a FAIL: no expected-behaviour baseline was established |
| 3. GraphQL xAPI | N/A | not exercised |
| 4. Platform REST API | N/A | asset API unchanged |

**Owning layer:** Layer 2 — Admin SPA (if it turns out to be a defect at all).

## Root Cause Analysis

The pre-PR Email branch of `notifications-edit-template.tpl.html` carried both halves of the upload wiring:

```html
<input id="fileUploader" type="file" multiple style="display: none;" uploader="fileUploader" nv-file-select />
<textarea … vc-uk-htmleditor ng-model="blade.currentEntity.body" file-uploader="fileUploader"></textarea>
```

PR #202 replaced that block with `<ui-codemirror ng-model="blade.currentEntity.body" ui-codemirror-opts="htmlEditorOptions">` and deleted the `<input id="fileUploader">` element. `FileUploader` is still injected into the controller — but that is **not** evidence of intent either way: the SMS branch still uses it, so the injection is legitimately still needed.

The SMS branch was left on the old `vc-uk-htmleditor` markup untouched. Whether that markup renders a working editor **or is inert** is the open question (see *Verification gap* #2) — and it decides whether this ticket is a defect or a no-op.

**Decision needed — but only after the premise is verified.** If the old wiring was live, HTML email authors still commonly reference externally hosted images, so removing an inline uploader may be an acceptable trade — it would just need stating in the ticket and release notes rather than happening silently. If the wiring was inert, there is nothing to decide and this closes as *not a bug*.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin SPA (module-embedded AngularJS)
- **Suggested repo:** `VirtoCommerce/vc-module-notification`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Notifications — template edit blade, Email body editor
- **RCA anchor:** `src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notifications-edit-template.tpl.html` — removed `<input id="fileUploader" … nv-file-select>` and the `file-uploader` attribute when swapping `vc-uk-htmleditor` → `ui-codemirror`; `FileUploader` still injected in `notifications-edit-template.js`
- **Routing confidence:** HIGH
