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

1. **Pull the real platform CSS.** Either the live QA stylesheet (`{BACK_URL}` → the platform's
   `css/platform.css`) or the compiled `platform.css` from the cloned `vc-platform` checkout. Reference it
   with a `<link>` so the render is pixel-faithful to production.
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

## Loop & gate

- Iterate **dev ↔ qa-backend-expert ≤ 2 times** locally (fix → re-render → re-screenshot) **before** opening
  the PR, and squash — so the public PR shows one clean structural commit, not the 5-commit thrash of PR #101.
- This satisfies the layout/CSS branch of **G2 (red)** and **G3/G4 (green, pre-PR)** in
  `.claude/rules/quality-gates.md`. Post-deploy **G6** remains the final real-user confirmation, but is no
  longer the first time anyone sees the layout.

---

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
