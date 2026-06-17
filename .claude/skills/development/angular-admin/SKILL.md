---
name: angular-admin
description: "[Development] Fix a Virto Commerce module's Admin SPA (AngularJS) UI that ships inside the module's own vc-module-* repo — blade/widget/service anatomy + idiomatic AngularJS 1.x. Two proof paths, because module repos have NO JS test harness and there is NO Storybook: logic bugs (save/payload, computed value, wrong endpoint) are proven red→green with a throwaway Node scratch harness; layout/CSS/visual bugs (overlap, misalignment, wrong width, clipping) are fixed by mirroring the platform's canonical UI classes (catalog bundled in this skill) and proven in a browser BEFORE the PR via a visual render harness — never inline position/fixed-px. Used by the fullstack-backend developer agent in /qa-fix when the owning layer is the module Admin UI (still single-repo)."
---

# /angular-admin — Fix a module's Admin SPA UI

Fix an Admin-UI bug that lives in a `vc-module-*` repo under `src/VirtoCommerce.<Name>.Web/Scripts/`.
Because the Admin UI ships **inside the module repo**, this is still a **single-repo** fix
(Gate 1 passes) and is owned by `fullstack-backend`.

## Reality check (read this first)

The Scripts area is **hand-written AngularJS 1.x served as static assets** — no bundler, no
`package.json`, no Karma, no spec files, **in any `vc-module-*` repo** (org-wide survey, 2026-06).
There is no in-repo JS test command to run, and you must NOT scaffold one (no `package.json`,
`karma.conf.js`, or spec files committed to the module — that's framework churn, an instant G4 fail).

So Gate 2 (red→green proof) is satisfied by a throwaway harness outside the repo — and **which harness
depends on the bug** (see *Two fix paths* below):
- **Logic** bugs → a **Node scratch harness**: a script in `.fix-workspace/_scratch/VCST-XXXX/`
  (gitignored, never committed, never in the PR diff) that loads the real blade/service file with a stubbed
  `angular` global, drives the buggy seam, and asserts the expected behavior. Red before, green after —
  both runs' output pasted into the PR body. Recipe + verified stub: `scratch-harness-patterns.md`.
- **Layout/CSS** bugs → a **visual render harness** (the Node harness can't render CSS): renders the real
  blade against the real `platform.css` in a browser, red→green screenshots before the PR. See the
  Layout/CSS path below + `visual-render-harness.md`.

Either way the harness is throwaway — only its evidence (output / screenshots) ships, in the PR body.

## When to use
- The `/qa-bug` owning layer is **Layer 2 — Backend Admin (Admin SPA)** AND the responsible code is in
  the routed module's `Web/Scripts/`. (A storefront/`vc-frontend` Vue bug is out of `/qa-fix` backend
  scope — that's the CI frontend agent's lane.)

## Two fix paths
- **Logic bug** (save/payload, computed value, wrong endpoint, binding condition) → the **Node scratch
  harness** path (Steps 1–5 below): red→green proof in `scratch-harness-patterns.md`.
- **Layout / CSS / visual bug** (overlap, misalignment, wrong width, clipping, spacing, control in the
  wrong place) → the **Layout/CSS path** below. A bug with both uses both harnesses.

### Layout/CSS path
1. **Read `admin-spa-ui-conventions.md`** (in this skill) — the platform's canonical class vocabulary +
   per-element snippets + reference blades. There is NO Storybook; that catalog + real blades are the
   style guide.
2. **Mirror a canonical sibling blade** — `Grep` `*.tpl.html` for the element's class (`searchrow`,
   `ui-select`, `table-wrapper`, `vc-checkbox`, …), prefer the same module, else `vc-module-pricing`. Copy
   its structure. **Never** add inline `position:absolute|fixed`, fixed-px `width/height/left/top`, or
   `ng-style` height hacks. Recipes: `css-layout-patterns.md`.
3. **Prove it before the PR** — build the **visual render harness** (`visual-render-harness.md`): a throwaway
   `render.html` loading the real blade `.tpl.html` against the real `platform.css`; `qa-backend-expert`
   serves + screenshots **HEAD (red) vs fixed (green)**. Iterate dev↔QA ≤2× and squash. Screenshots go in the
   PR body. (If the bug needs live data / cross-blade context the harness can't stub, escalate to the full
   local-platform fallback documented in `visual-render-harness.md` — don't skip the proof.)
4. **Gate** (build + Gate 4) as in the logic path below, then hand off with the render-harness screenshots.

## Steps (logic-bug path)
1. **Locate** the blade / widget / controller / service / template under `Web/Scripts/` (`Grep`/`Glob`
   on blade ids, template text, controller names, settings keys). See `angular-patterns.md` for the
   anatomy (module.js registration → blades/ → widgets/ → resources/).
2. **Reproduce (red) in the scratch harness.** Write
   `.fix-workspace/_scratch/VCST-XXXX/repro.cjs` (the `.cjs` extension is required — the workspace
   sits under a `"type": "module"` package.json) following `scratch-harness-patterns.md`: stub
   `angular`, `require` the real file from the checkout, instantiate the controller/factory with
   stubbed collaborators, assert the EXPECTED behavior. `node repro.cjs` must **fail** on current
   code. If it passes, the RCA is wrong → re-investigate.
3. **Fix (green):** smallest correct change to the blade/service/template; idiomatic AngularJS,
   matching the file's existing conventions (controllerAs vs `$scope`, `$q`, DI-array style).
   `node repro.cjs` now exits 0. Capture both outputs for the PR body.
4. **Non-visual template-only changes** (binding typo, label, missing attribute) with no assertable logic
   AND no layout impact: use the trivial-skip clause — justify in the PR body. (Anything that changes
   *appearance* goes the Layout/CSS path above and must be proven with the render harness, not skipped.)
5. **Gate:** `dotnet build -c Debug -p:NuGetAudit=false` still green (Scripts are content files — the
   C# build embeds them; make sure nothing broke). Hand the diff to `backend-reviewer` (Gate 4) with
   the scratch-harness evidence in the summary.

## Hard rules
- **Single repo** — all changes in the one `vc-module-*` (its `Web/Scripts/` and/or C#). Second repo → STOP.
- **The scratch harness never ships.** Nothing under `_scratch/` is committed; the PR diff contains
  only the fix. No new build steps, no `package.json`, no framework/version changes in the repo.
- **Minimal diff**; never touch secrets/lockfiles/CI config.
- Match the module's existing AngularJS conventions; don't restyle, restructure, or "modernize".
- **Layout/CSS fixes use only platform classes** (`admin-spa-ui-conventions.md`) — never inline
  `position:absolute|fixed`, fixed-px sizing, or `ng-style` height hacks — and are **proven before the PR**
  with the visual render harness (`visual-render-harness.md`), not deferred to post-deploy.
- Same gate ladder and **no-auto-merge** as the C# path — `.claude/rules/quality-gates.md`.

## References
- `admin-spa-ui-conventions.md` — canonical platform UI class catalog (blades, search, filters, dropdowns,
  inputs, buttons, grids, checkboxes, dialogs, lists) + discovery recipe — **read before any layout/CSS fix**
- `css-layout-patterns.md` — before/after layout fix recipes
- `visual-render-harness.md` — pre-PR browser proof for layout/CSS fixes
- `scratch-harness-patterns.md` — verified Node stub for `angular`, worked red→green example (logic bugs)
- `angular-patterns.md` — VC Admin SPA blade/widget/service anatomy
- `.claude/agents/knowledge/vc-module-architecture.md` §2 (Admin UI ships in the module repo)
