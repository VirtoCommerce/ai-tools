# Scratch-harness patterns — red→green proof for Admin SPA fixes

No `vc-module-*` repo has a JS test harness (no package.json / Karma / specs under `Web/Scripts/`),
so Gate 2 evidence comes from a **throwaway Node script** that loads the real AngularJS file with a
stubbed `angular` global. It lives in `.fix-workspace/_scratch/VCST-XXXX/` and is **never committed**
— the PR carries only its output (red run + green run) in the body.

This recipe was verified against a real blade controller (vc-module-inventory
`fulfillment-center-detail.js`, dev branch).

## Why it works

VC Admin SPA files are plain scripts with two globals: `angular` (they call
`angular.module('…').controller/factory(…)` and utility fns like `angular.copy`) and sometimes
`AppDependencies` (module.js only). Provide both, `require()` the file, and the DI registration
lands in your hands — the last element of the DI array is the factory function, callable with
stubbed collaborators.

## The harness (`repro.cjs` — extension matters: the workspace inherits `"type": "module"`)

```js
// .fix-workspace/_scratch/VCST-XXXX/repro.cjs   — run: node repro.cjs
const assert = require('node:assert');
const util = require('node:util');

// --- angular stub: capture registrations, provide the utility fns blade code calls ---
const registrations = {};
const chain = {};
for (const m of ['controller','factory','service','directive','filter','component','config','run','constant','value'])
  chain[m] = (name, def) => { if (def !== undefined) registrations[name] = def; return chain; };
global.angular = {
  module: () => chain,
  copy: (o) => (o === undefined ? o : JSON.parse(JSON.stringify(o))),
  extend: Object.assign, merge: Object.assign,
  forEach: (c, fn) => (Array.isArray(c) ? c.forEach(fn) : Object.entries(c || {}).forEach(([k, v]) => fn(v, k))),
  equals: (a, b) => util.isDeepStrictEqual(a, b),
  isDefined: (v) => v !== undefined, isUndefined: (v) => v === undefined,
  isObject: (v) => v !== null && typeof v === 'object', isArray: Array.isArray,
  isString: (v) => typeof v === 'string', isFunction: (v) => typeof v === 'function',
  isNumber: (v) => typeof v === 'number',
  toJson: JSON.stringify, fromJson: JSON.parse, noop: () => {}, identity: (v) => v,
};
global.AppDependencies = [];   // only module.js pushes to it; harmless otherwise

// --- load the REAL file from the checkout (absolute path) ---
require('<abs path>/.fix-workspace/<repo>/src/VirtoCommerce.<Name>.Web/Scripts/blades/<file>.js');

// --- get the controller factory: DI array, last element is the function ---
const def = registrations['virtoCommerce.<name>Module.<x>Controller'];
assert.ok(def, 'controller registered');
const ctor = def[def.length - 1];

// --- stub ONLY the collaborators the seam touches, instantiate, drive, assert ---
let fetched = null;
const $scope = { blade: { currentEntityId: 'FC-1', currentEntity: null }, $watch: () => {} };
const api = { get: (params, ok) => { fetched = params.id; ok({ id: 'FC-1', name: 'Main DC' }); } };
ctor($scope, /*dialogService*/ {}, /*bladeNavigationService*/ { setError: () => {} }, api,
     /*metaFormsService*/ { getMetaFields: () => [] }, /*FileUploader*/ function () {});

$scope.blade.refresh();
// Assert the EXPECTED (post-fix) behavior — this must FAIL before the fix:
assert.strictEqual(fetched, 'FC-1', 'refresh() loads the blade entity by id');
assert.strictEqual($scope.blade.isLoading, false, 'loading flag cleared after fetch');
console.log('GREEN — VCST-XXXX repro passes');
```

Red = non-zero exit with the AssertionError; green = exit 0. Save both transcripts for the PR body:

```
### Red→green evidence (scratch harness, not committed)
$ node repro.cjs          # before fix
AssertionError: loading flag cleared after fetch   ← red
$ node repro.cjs          # after fix
GREEN — VCST-XXXX repro passes
```

## Gotchas (each one cost a real debugging round)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `require is not defined in ES module scope` | `.js` under the testing repo's `"type": "module"` | name the harness `*.cjs` |
| `angular.copy is not a function` | blade calls an angular utility your stub lacks | add it to the stub (the block above covers the common set) |
| `Cannot read properties of undefined` during `require` | controller body runs code at load time (e.g. `blade.refresh()` at the bottom) | stub enough collaborators for construction to complete, then drive the seam explicitly |
| registration key not found | controller names are fully qualified (`virtoCommerce.inventoryModule.fulfillmentCenterDetailController`) | grep the file for the exact `.controller('…'` string |
| `moduleName is not defined` | some files reference the `moduleName` var defined in `module.js` (platform concatenates scripts) | `global.moduleName = 'virtoCommerce.<name>Module'` before the require |

## What to test where

| Bug shape | Harness target |
|-----------|---------------|
| save not persisting / wrong payload | controller `save()` path — stub the `$resource` service, assert the params it receives |
| wrong computed value / count / badge | the controller/factory function that computes it |
| API service wrong endpoint/field | the `resources/*.js` factory — stub `$resource` itself and capture its args |
| template binding / label / disabled attr | **not harnessable** — trivial-skip with manual verification steps in the PR body |

Prefer logic over DOM. If the bug truly lives in a `.tpl.html` binding, the harness can still verify
the controller exposes the right state; the binding itself is the trivial-skip part.
