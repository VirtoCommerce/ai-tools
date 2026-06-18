# VC Admin SPA (Angular) anatomy — for module-UI fixes

The Admin SPA UI for a module ships inside its repo at `src/VirtoCommerce.<Name>.Web/Scripts/`. Match
the module's existing patterns; these are orientation notes, not a rewrite mandate.

## Layout (typical module Scripts/)
```
Web/Scripts/
  module.js                # Angular module registration, routes, menu, widgets, blades
  blades/                  # blade controllers + .tpl.html templates (master/detail UI)
  widgets/                 # widgets embedded in other modules' blades
  services/                # $resource/API clients + helpers
  resources/               # i18n + static
```

## Common seams & bug shapes
| Area | Where | Typical bug |
|------|-------|-------------|
| Blade controller | `blades/*.js` | wrong binding, missing `$scope` refresh, save not persisting |
| Template | `blades/*.tpl.html` | wrong/missing binding, disabled control, label/i18n |
| Widget | `widgets/*.js` | count/badge wrong, click target wrong |
| API service | `services/*.js` | wrong endpoint/field, missing param |
| Registration | `module.js` | blade/route/menu/permission key not wired |

No `package.json`, bundler, or test harness exists anywhere under `Scripts/` — these are static
assets the platform serves directly. Red→green proof happens in a scratch harness outside the repo
(`scratch-harness-patterns.md`), never by scaffolding tooling into the module.

## Fix guidance
- **Save-persists** bugs: trace controller `save()` → service → REST; verify the field/contract name
  (VC "wrong field silently no-ops" trap applies on the UI side too).
- **Disabled/missing control**: confirm it's not by-design (a disabled Save = validation working) —
  Gate 0 should have caught by-design; if it's a real binding bug, fix the binding.
- **Permission-gated UI**: keys come from the module's C# `*.Core` permissions — reuse, don't hardcode.
- Keep AngularJS idioms consistent with the file (controllerAs vs `$scope`, `$q`, `angular.module`).
- Don't introduce a new build step or framework version.

## Layout & CSS (template/visual bugs)
The Admin SPA has **no Storybook/component gallery** — the platform stylesheet is the only style guide.
For any `*.tpl.html` layout/CSS bug (overlap, misalignment, wrong width, clipping, spacing, a control in
the wrong place):
- **Read `admin-spa-ui-conventions.md` (this skill) first** — the canonical class vocabulary
  (`blade-static`/`blade-content`/`inner-block`, `searchrow` + `column-half`/`column-third`,
  `form-input.__*`, `btn`/`__cancel`/`__other`, `filter-edit`, `va-filter-panel`, `ui-grid`/`table-wrapper`,
  `vc-checkbox`, `list`/`__info`), per-element snippets, and reference blades.
- **Mirror a canonical sibling blade** — `Grep` `*.tpl.html` for the element's class (`searchrow`,
  `ui-select`, `table-wrapper`, …), prefer one in the same module, else `vc-module-pricing`.
- **Never** add inline `position:absolute|fixed`, fixed-px `width/height/left/top`, or
  `ng-style="{'height':'…px'}"` — that was the [PR #101](https://github.com/VirtoCommerce/vc-module-export/pull/101)
  bug. See `css-layout-patterns.md` for before/after recipes.
- **Prove it before the PR** with `visual-render-harness.md` (render the real blade against the real
  `platform.css`; `qa-backend-expert` screenshots red→green) — not "trivial-skip, confirm after deploy".
