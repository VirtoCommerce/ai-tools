---
name: angular-admin
description: "[Development] Fix and unit-test a Virto Commerce module's Admin SPA (Angular) UI that ships inside the module's own vc-module-* repo — component/service layout, idiomatic Angular, Jasmine/Karma red→green. Used by the fullstack-backend developer agent in /qa-fix when the owning layer is the module Admin UI (still single-repo)."
---

# /angular-admin — Fix a module's Admin SPA UI

Fix an Admin-UI bug that lives in a `vc-module-*` repo under `src/VirtoCommerce.<Name>.Web/Scripts/`.
Because the Admin UI ships **inside the module repo**, this is still a **single-repo** fix
(Gate 1 passes) and is owned by `fullstack-backend`.

## When to use
- The `/qa-bug` owning layer is **Layer 2 — Backend Admin (Admin SPA)** AND the responsible code is in
  the routed module's `Web/Scripts/`. (A storefront/`vc-frontend` Vue bug is out of `/qa-fix` backend
  scope — that's the CI frontend agent's lane.)

## Steps
1. **Locate** the blade / widget / controller / service / template under `Web/Scripts/` (`Grep`/`Glob`
   on blade ids, template text, controller names, settings keys). See `angular-patterns.md`.
2. **Install** per the repo (the Scripts area may build with the module or standalone — read its
   `package.json`).
3. **Reproduce (red):** add a **Jasmine/Karma** spec for the component/service logic; confirm it fails.
   Visual-only bugs → test the underlying computed/state and note the visual aspect needs human
   confirmation. See `jasmine-karma-patterns.md`.
4. **Fix (green):** smallest correct change; idiomatic Angular; match the repo's module/blade patterns.
5. **Gate:** the module's JS test command + the C# `dotnet build`/`dotnet test` if the change touches
   the module build. Hand the diff to `backend-reviewer` (Gate 4).

## Hard rules
- **Single repo** — all changes in the one `vc-module-*` (its `Web/Scripts/` and/or C#). Second repo → STOP.
- **Minimal diff**; **never modify existing tests** (only ADD); never touch secrets/lockfiles/CI config.
- Match the module's existing AngularJS/TypeScript blade conventions; don't restyle or restructure.
- Same gate ladder and **no-auto-merge** as the C# path — `.claude/rules/quality-gates.md`.

## References
- `angular-patterns.md` — VC Admin SPA blade/widget/service anatomy
- `jasmine-karma-patterns.md` — spec recipes for Admin UI logic
- `.claude/agents/knowledge/vc-module-architecture.md` §2 (Admin UI ships in the module repo)
