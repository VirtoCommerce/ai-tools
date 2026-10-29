# [Medium] Legacy page blade silently trims leading/trailing whitespace from the permalink instead of rejecting it

**Env:** localhost (start-local) · Platform 3.1089.0 · PageBuilderModule 3.1036.0-pr-178-e4ff (PR VirtoCommerce/vc-module-pagebuilder#178) · Admin SPA, Firefox
**Provenance:** IN-SCOPE — introduced by PR #178 (new blade validator) · Parent: VCST-6443

## Summary
The VCST-6443 decision is "validate (reject), never normalize". The page-builder shell and the page-groups REST API reject a permalink with a leading or trailing space or tab. The legacy AngularJS page blade shows no error, keeps Create/Save enabled, and saves the permalink with the whitespace silently removed.

## Steps to reproduce
1. Admin → Content → B2B Store → Pages → Add → Design page.
2. Permalink: ` /agent-test-6443-inv-lead` (leading space). Fill the other required fields.
3. Observe: no format error, Create enabled. Click Create.
4. `GET /api/content/pages/B2B-store?relativeUrl=<file>.page-draft` → read `settings.permalink`.
5. Repeat with a trailing space and with a leading tab; repeat on an existing page with Save.

Control: `/agent-test 6443-inv-inner` (inner space) → error shown, Create disabled.

## Expected vs actual
- **Expected ({SPEC} VCST-6443 decision):** the format error is shown and Create/Save is blocked, as for an inner space and as in the shell and the API.
- **Actual:** no error, Create/Save enabled; the request body already carries the trimmed `/agent-test-6443-inv-lead` (stored bytes start `2f61…`, no `20`). A tab and a trailing space behave the same.

![Leading space: no error, Create enabled](../../screenshots/inv-242-01-new-leading-space-create-enabled.png)

## Root cause
`Scripts/blades/pages/edit-page.tpl.html`: the permalink `<input ng-model="blade.currentEntity.settings.permalink" ui-validate="{ permalinkFormat: 'isValidPermalink($value)' }">` has no `ng-trim="false"`. AngularJS trims the view value before `ui-validate` runs and before the model is set, so `isValidPermalink` never sees edge whitespace. The blade saves through the Content module (`POST api/content/pages/{store}`), which has no permalink rule (by design, per the PR body), so nothing else stops it.

**Fix:** add `ng-trim="false"` to the permalink input. Trim-then-validate would contradict the decision.

Refs: C1 REG-2026-10-22-1819 CMS-242 · ECL-7.2 · KB-A51E21B6
