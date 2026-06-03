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

## Fix guidance
- **Save-persists** bugs: trace controller `save()` → service → REST; verify the field/contract name
  (VC "wrong field silently no-ops" trap applies on the UI side too).
- **Disabled/missing control**: confirm it's not by-design (a disabled Save = validation working) —
  Gate 0 should have caught by-design; if it's a real binding bug, fix the binding.
- **Permission-gated UI**: keys come from the module's C# `*.Core` permissions — reuse, don't hardcode.
- Keep AngularJS idioms consistent with the file (controllerAs vs `$scope`, `$q`, `angular.module`).
- Don't introduce a new build step or framework version.
