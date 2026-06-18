# Visual render harness — pre-PR browser proof for Admin SPA layout/CSS fixes

The Node scratch harness (`scratch-harness-patterns.md`) proves **logic**; it cannot render CSS, so it can't
prove a layout/CSS fix. The dev team has no browser, and a module's blade only renders inside a running
platform — which is why layout bugs used to be "trivial-skip, confirm after deploy" and produced commit
thrash (the PR #101 problem).

The **visual render harness** closes that gap **before the PR opens**. Module `.tpl.html` templates and the
platform CSS are *runtime-loaded static assets* (no build step), so we can render the affected blade against
the real `platform.css` in a headless browser and screenshot it — a runnable local Admin SPA scoped to the
one blade.

**Division of labor:** `fullstack-backend` (no browser) **scaffolds** the harness; `qa-backend-expert` (has
`playwright-edge` / Chrome DevTools MCP) **serves + screenshots + returns the verdict**. Like the Node
harness, nothing here is ever committed — only the screenshots/verdict go in the PR body.

---

## When to use

- The bug is **layout / CSS / visual** in a module blade (`*.tpl.html`): overlap, misalignment, wrong width,
  clipping, spacing, a control rendering in the wrong place, a missing/!wrong platform class.
- For pure **logic** bugs use the Node scratch harness instead. A bug with both (a CSS class toggled by a
  wrong condition) uses **both**: Node harness for the condition, render harness for the appearance.

---

## Files (all under `.fix-workspace/_scratch/VCST-XXXX/`, gitignored, never committed)

```
_scratch/VCST-XXXX/
  render.html        # bootstraps AngularJS + platform.css + the real blade template + stubbed $scope
  serve.txt          # the one-liner used to serve it (for the PR-body note)
  before.png after.png   # screenshots qa-backend-expert captures (referenced in PR body, not committed)
```

---

## `render.html` recipe

1. **Pull the real platform CSS.** Either the live QA stylesheet (`{BACK_URL}/css/platform.css`) or the
   compiled `platform.css` from the cloned `vc-platform` checkout. Reference it with a `<link>` so the render
   is pixel-faithful to production. **Gotcha — icon fonts / relative assets:** `platform.css` references its
   Font Awesome glyph font (and some background images) via **relative** URLs; when you link the CSS from a
   remote host but serve `render.html` from `localhost`, those assets resolve against *localhost* and 404, so
   `fa fa-*` icons render blank (verified on VCST-5276 — the clear-`×`/pencil were invisible until fixed). If
   the fix involves icons, also load the matching **Font Awesome from a CDN** (VC Admin uses FA4 `fa fa-*`
   names → `font-awesome/4.7.0/css/font-awesome.min.css`), or serve a local copy of the font next to the CSS.
2. **Load AngularJS** (the same major used by the SPA — 1.x; a CDN build is fine for the harness).
3. **Inline (or fetch) the real blade `.tpl.html`** from the module checkout into an `ng-template` /
   container so you render the **actual** markup you changed — never a hand-retyped copy.
4. **Stub `$scope.blade` + the data states** the template binds (reuse the stub knowledge from
   `scratch-harness-patterns.md`). Render the blade at the platform blade widths and at the states that
   matter (empty vs populated, the optional warning row shown vs hidden, etc.).

```html
<!doctype html>
<html ng-app="harness">
<head>
  <meta charset="utf-8">
  <!-- real platform stylesheet — keep the render faithful -->
  <link rel="stylesheet" href="https://<qa-host>/css/platform.css">
  <style>
    /* emulate the blade column so widths match production; NOT part of the fix */
    .blade { width: 520px; }            /* normal blade ≈ 520px; widen for __*-wide blades */
    .blade.__medium-wide { width: 700px; }
    body { margin: 0; background: #f3f3f3; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/angular.js/1.8.3/angular.min.js"></script>
</head>
<body>
  <!-- the real blade chrome so blade-static / blade-content size correctly -->
  <div class="blade __medium-wide" ng-controller="HarnessCtrl">
    <div ng-include="'blade.tpl.html'"></div>
  </div>

  <!-- the REAL template, pasted verbatim from the module checkout (the file under fix) -->
  <script type="text/ng-template" id="blade.tpl.html">
    <!-- … contents of src/VirtoCommerce.<Name>.Web/Scripts/blades/<blade>.tpl.html … -->
  </script>

  <script>
  angular.module('harness', [])
    // stub the directives the template uses so they don't blow up the render
    .directive('uiSelect', () => ({ transclude: true, template: '<div class="ui-select-stub" ng-transclude></div>' }))
    .controller('HarnessCtrl', function ($scope) {
      // stub ONLY what the template binds — mirror the real shapes
      $scope.blade = { isLoading: false, currentEntities: [/* … */] };
      $scope.filter = { keyword: '', criteriaChanged: () => {}, edit: () => {} };
      // toggle the state that triggers the bug (e.g. the optional warning row):
      $scope.blade.exportDataRequest = { restrictDataSelectivity: true };
    });
  </script>
</body>
</html>
```

> Keep harness-only CSS (the `.blade` width emulation) clearly separate — it imitates the platform blade
> column, it is **not** part of the fix and never lands in the diff.

---

## Serve + screenshot (qa-backend-expert)

`file://` often blocks `ng-include`/fetch, so serve the scratch dir over HTTP:

```bash
npx --yes http-server .fix-workspace/_scratch/VCST-XXXX -p 8099 -c-1
# → open http://127.0.0.1:8099/render.html in playwright-edge / Chrome DevTools MCP
```

1. **Red:** render with the blade at **HEAD** (pre-fix markup) → screenshot `before.png` — must show the
   reported defect (overlap / misalignment / clipping).
2. **Green:** render with the **fixed** markup → screenshot `after.png` — defect gone, layout matches the
   canonical sibling blade.
3. Capture both at the relevant blade width(s)/state(s). Return **PASS/FAIL + the two screenshots** to the
   `/qa-fix` orchestrator; the screenshots go into the PR body under a "Visual proof (render harness)" section.

If the bug **cannot** be reproduced in the harness (needs live data, cross-blade interaction, or a runtime
service), **escalate** to the heavy fallback below rather than skipping the proof.

> **CI mode (headless `ci/run-fix-cycle.ts`):** the fix agent has no browser MCP — it renders the same
> harness **via Bash** with the Playwright that ships in the CI image (`mcr.microsoft.com/playwright`): serve
> the scratch dir with `http-server`, then a small Node script (`chromium.launch()` → `page.goto` →
> `page.screenshot()`) captures the red/green PNGs. Same evidence in the (draft) PR body.

---

## Live in-browser verification (pre-PR) — when the fix changes document flow

The render harness is a *standalone* page. A stronger pre-PR proof — when available — is to verify the fix
on the **real, deployed admin** by applying the change as a transient DOM edit and re-measuring. This is
**authoritative only when the fix alters document flow** (e.g. moving a node into `blade-content`'s normal
flow, removing/adding a stacked element) so the browser genuinely relays out. For a **toolbar-height-only**
change that relies on ui-grid re-measuring its pinned top, a live DOM swap will NOT relayout — use the
harness Option 1 / reference path below instead (see §Limitation).

`qa-backend-expert` (has the browser) drives it; `fullstack-backend` does not. Steps:

1. **Navigate** to the real blade on QA (`{BACK_URL}`), reproduce the exact state that shows the bug
   (e.g. the data source with `restrictDataSelectivity=true`).
2. **Measure red** — read-only `getBoundingClientRect` on the failing elements; record `overlapPx > 0`.
   (This is the §4 measurement gate, run against the *real* app — the strongest possible red.)
3. **Apply the fix as a DOM edit** via the `@allow-eval` opt-in (`/* @allow-eval: <VCST-XXXX UI-FIX> */`
   — the only sanctioned use of `browser_evaluate` for mutation; it is NOT for test runs). Mirror the exact
   markup change from the diff (move/remove/add the real nodes — never a hand-retyped approximation).
4. **Force a relayout** so geometry settles: `angular.element(document.body).injector().get('$rootScope').$applyAsync()`
   + `window.dispatchEvent(new Event('resize'))` (+ `gridApi.core.handleWindowResize()` if you hold the api).
5. **Measure green** — re-run the same `getBoundingClientRect`; assert `overlapPx === 0` (e.g.
   `gridHeader.top >= searchRow.bottom`) and that moved nodes landed where the fix intends. Screenshot.
6. AngularJS re-compiles its template on the next `$digest` and will **revert** the manual DOM edit — that
   is expected (the edit is transient; only the committed `.tpl.html` change is permanent). Re-measure
   immediately after step 4, before any further digest.

> **Guard:** a live green is real ONLY if the relayout actually happened — verify the dependent element
> moved (e.g. the grid header's `top` increased), don't just trust the swap. If it didn't move, the fix is
> a pinned-top toolbar case → fall back to the harness (Option 1) or reference validation (Option 2).
> Verified on VCST-5276 (2026-06-18): moving the note into `blade-content` flow drove a real relayout
> (grid header 258→320px), overlap 65→0 — a stronger proof than the static harness.

Put the red/green screenshots + the two `overlapPx` numbers in the PR body alongside (or instead of) the
harness screenshots. This does **not** replace post-deploy **G6**, but it is the most faithful pre-PR proof
when the fix changes flow.

---

## Loop & gate

- Iterate **dev ↔ qa-backend-expert ≤ 2 times** locally (fix → re-render → re-screenshot) **before** opening
  the PR, and squash — so the public PR shows one clean structural commit, not the 5-commit thrash of PR #101.
- This satisfies the layout/CSS branch of **G2 (red)** and **G3/G4 (green, pre-PR)** in
  `.claude/rules/quality-gates.md`. Post-deploy **G6** remains the final real-user confirmation, but is no
  longer the first time anyone sees the layout.

---

## Limitation: ui-grid blades (toolbar-over-grid overlaps)

The harness renders the **toolbar's own** layout faithfully, but it can't prove that a **`ui-grid`** below the
toolbar repositions correctly. ui-grid anchors its header viewport to the top of `.blade-content` and only
re-measures the `.blade-static` toolbar height during an AngularJS layout pass
(`gridApi.core.handleWindowResize()` after a `$digest`). A detached/static render — or an in-browser DOM swap
of the toolbar markup on the live admin — does **not** trigger that recompute, so a genuine toolbar↔grid-header
overlap looks **unchanged** even when the fix is correct (verified on VCST-5276, 2026-06-17: the static green
render still showed the ~27 px overlap because the grid kept its old top offset).

> **Distinction (don't over-apply this limitation):** it bites only **toolbar-height** fixes that need
> ui-grid to re-measure its pinned top. A fix that changes **document flow** — e.g. moving the note **out**
> of the toolbar into `.blade-content` — *does* relayout on a live DOM swap (the grid is pushed down in
> normal flow), and is a valid live pre-PR proof. See §Live in-browser verification. VCST-5276's accepted
> fix was the flow kind: live swap drove a real relayout (grid header 258→320 px), overlap 65→0.

So when the bug is **toolbar/header overlap that depends on ui-grid re-measuring its pinned top** (a
toolbar-height change, not a flow change), you have two honest options — never report a static green as proof:

### Option 1 — Drive a real Angular relayout in the harness

Only works if the harness **bootstraps Angular + ui-grid** and renders the **real blade chrome** (`.blade-static`
then `.blade-content` in normal document flow) — *not* a static `setContent` and *not* an in-browser swap on the
live admin (there `.blade-content`'s `top` was already pinned by the platform's blade controller at load, so a
swap won't move it). Two things must recompute after the fix renders: the **blade layout** (so `.blade-content`
starts below the `.blade-static` at its reserved height — recall `.blade-static` is fixed-height, so a
multi-row toolbar must use `__expanded`/reserve height, see `admin-spa-ui-conventions.md` §2.1) and the **grid
viewport** (so ui-grid re-measures). Force both, then **measure** (don't just screenshot — assert
`searchrow.bottom <= gridHeader.top`, §4 of the conventions doc):

```js
// inside the Angular-bootstrapped harness page, after the fixed blade has compiled
const inj   = angular.element(document.body).injector();
const $root = inj.get('$rootScope');

// 1) the blade template binds a ui-grid; capture its gridApi when ui-grid emits it.
//    In the harness controller's setGridOptions stub, keep a ref:
//      $scope.gridOptions = { ..., onRegisterApi: api => (window.__harnessGridApi = api) };
$root.$applyAsync();                              // flush the digest so .blade-static gets its real height

// 2) let layout settle one frame, then make ui-grid re-measure the (now shorter) toolbar
requestAnimationFrame(() => {
  window.dispatchEvent(new Event('resize'));      // ui-grid-auto-resize listens for this
  const api = window.__harnessGridApi;
  if (api && api.core && api.core.handleWindowResize) api.core.handleWindowResize();
  $root.$applyAsync();
  // screenshot on the NEXT frame, after the grid has repositioned below the toolbar
  requestAnimationFrame(() => { window.__harnessReady = true; });
});
```

Then in the browser driver, wait for `window.__harnessReady === true` (or a fixed ~500 ms settle) before
`page.screenshot()`. If `onRegisterApi` isn't wired, the bare `window.dispatchEvent(new Event('resize'))` inside
an `$apply` is usually enough for `ui-grid-auto-resize` blades. Verify the green is real: the grid `<thead>` top
must now be **≥** the toolbar's bottom (no overlap) — assert the geometry, don't eyeball it.

### Option 2 — Validate the pattern by reference + route to deploy verification

If you can't bootstrap a faithful Angular+ui-grid relayout, prove the **toolbar-internal** layout in the harness,
then **validate the fix pattern by reference**: render or inspect a canonical sibling blade that already uses the
same `searchrow`+`ui-grid` pattern correctly and confirm it has **zero** toolbar↔header overlap in production
(`vc-module-pricing` `pricelist-list` / `assignment-list` — verified 0 px overlap / 20 px gap on live QA,
2026-06-17, vs the buggy export blade's ~27 px). Same pattern + same runtime ui-grid + no overlap ⇒ the fix
pattern is sound; label the PR **"needs deploy/visual verification"** so G6 closes it post-deploy. This is the
right call rather than a false green.

## Heavy fallback — full local platform run

When the render harness can't reproduce the bug, run the real Admin SPA: a local `vc-platform` (with the
module under fix referenced) serves the module's `Web/Scripts` live, so editing a `.tpl.html` and reloading
the manager page shows the change with no rebuild. This is heavier (DB + config + module set) and reserved
for the minority of bugs needing live data / cross-blade / runtime context — note in the PR body when it was
used.

## Hard rules

- The harness **never ships** — nothing under `_scratch/` is committed; the PR carries only screenshots +
  verdict. (Same discipline as the Node harness.)
- Paste the **real** template into `render.html` — never a retyped approximation.
- Harness-only CSS imitates the platform; the **fix** itself uses only platform classes
  (`admin-spa-ui-conventions.md`) — no inline `position`/fixed-px in the committed diff.
