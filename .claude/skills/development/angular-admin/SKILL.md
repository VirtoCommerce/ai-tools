---
name: angular-admin
description: "[Development] Fix a Virto Commerce module's Admin SPA (AngularJS) UI that ships inside the module's own vc-module-* repo — blade/widget/service anatomy, idiomatic AngularJS 1.x, red→green proof via a throwaway Node scratch harness (module repos have NO JS test harness). Used by the fullstack-backend developer agent in /qa-fix when the owning layer is the module Admin UI (still single-repo)."
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

Gate 2 (red→green proof) is instead satisfied by a **scratch harness**: a throwaway Node script in
`.fix-workspace/_scratch/VCST-XXXX/` (gitignored, never committed, never in the PR diff) that loads
the real blade/service file with a stubbed `angular` global, drives the buggy seam, and asserts the
expected behavior. Red before the fix, green after — evidence (both runs' output) pasted into the PR
body. Recipe + verified stub: `scratch-harness-patterns.md`.

## When to use
- The `/qa-bug` owning layer is **Layer 2 — Backend Admin (Admin SPA)** AND the responsible code is in
  the routed module's `Web/Scripts/`. (A storefront/`vc-frontend` Vue bug is out of `/qa-fix` backend
  scope — that's the CI frontend agent's lane.)

## Steps
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
4. **Template-only changes** (binding typo, label, missing attribute) that have no assertable logic:
   use the trivial-skip clause instead — justify in the PR body and list the manual verification
   steps (which blade, which state, what to look for).
5. **Gate:** `dotnet build -c Debug -p:NuGetAudit=false` still green (Scripts are content files — the
   C# build embeds them; make sure nothing broke). Hand the diff to `backend-reviewer` (Gate 4) with
   the scratch-harness evidence in the summary.

## Hard rules
- **Single repo** — all changes in the one `vc-module-*` (its `Web/Scripts/` and/or C#). Second repo → STOP.
- **The scratch harness never ships.** Nothing under `_scratch/` is committed; the PR diff contains
  only the fix. No new build steps, no `package.json`, no framework/version changes in the repo.
- **Minimal diff**; never touch secrets/lockfiles/CI config.
- Match the module's existing AngularJS conventions; don't restyle, restructure, or "modernize".
- Visual-only aspects (layout, CSS) can't be proven by the harness — note in the PR body that they
  need human/Storybook confirmation.
- Same gate ladder and **no-auto-merge** as the C# path — `.claude/rules/quality-gates.md`.

## References
- `scratch-harness-patterns.md` — verified Node stub for `angular`, worked red→green example
- `angular-patterns.md` — VC Admin SPA blade/widget/service anatomy
- `.claude/agents/knowledge/vc-module-architecture.md` §2 (Admin UI ships in the module repo)
