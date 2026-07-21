---
name: vc-shell-fix
description: "[Development] Fix a Virto Commerce module's embedded Vue 3 \"shell\" sub-app (@vc-shell/framework, e.g. vc-module-pagebuilder's src/VirtoCommerce.PageBuilderModule.Web/Apps/page-builder-shell/) declared in ci/config/fix-repos.json moduleFrontendSubApps. State/logic bugs (composable/store/service function) are proven red→green with the sub-app's OWN real `tsx --test` runner + plain Vue reactivity (ref/computed/watch/effectScope) — no stubbing needed, unlike angular-admin's scratch harness, because `vue` is a real importable package. Mounted-component/template/DOM bugs (rendering, event binding, slot/prop output, CSS/layout) need an EPHEMERAL, never-committed vitest+@vue/test-utils+jsdom harness reusing the sub-app's own vite.config.ts — stripped from the diff before the PR. Used by the fullstack-frontend developer agent in /qa-fix when the RCA anchor falls under a declared module sub-app path (still single-repo)."
---

# /vc-shell-fix — Fix a module-embedded Vue 3 shell sub-app

Fix a bug in a `vc-module-*` repo's embedded Vue 3 "shell" sub-app (`@vc-shell/framework`), declared in
`ci/config/fix-repos.json` `moduleFrontendSubApps` and matched by `ci/lib/repo-router.ts`
`resolveOwningSubApp()`. Because the sub-app ships **inside the module repo**, this is still a
**single-repo** fix (Gate 1 passes) — but it's owned by `fullstack-frontend`, not `fullstack-backend`,
since the sub-app is a genuinely different stack from the module's own C#/AngularJS Admin UI.

## Reality check (read this first)

The sub-app is a **real** Vue 3 + Vite + vee-validate app with its own `package.json`/`vite.config.ts`/
`tsconfig.json` — NOT hand-rolled like the legacy AngularJS Admin SPA (`/angular-admin`). Its **only**
shipped test tooling is Node's built-in `tsx --test` over `tests/**/*.test.ts` — no `@vue/test-utils`, no
jsdom, no Storybook.

Because Vue 3's reactivity primitives (`ref`/`computed`/`watch`/`effectScope`) run **standalone in plain
Node** — no DOM needed — a bug whose root cause is **state/reactivity logic** (a composable, a store, a
service function) is provable with the sub-app's REAL `tsx --test` runner, **zero new tooling**. This is
the common case, not the exception — contrast with `/angular-admin`, where even a pure logic bug needs a
stub, because `angular` (the AngularJS global) isn't a real importable package the way `vue` is.

Only a **mounted-component / template / DOM** bug (rendering, event binding, slot/prop output,
CSS/layout) genuinely needs SFC compilation + jsdom, which the sub-app doesn't ship — that's the one case
needing new (ephemeral, never-committed) tooling.

## When to use

`/qa-fix` Gate 1 routed a `module`-kind repo, AND `resolveOwningSubApp()` matched the RCA anchor to a
sub-app declared in `moduleFrontendSubApps` (e.g. `vc-module-pagebuilder`'s `src/VirtoCommerce.PageBuilderModule.Web/Apps/page-builder-shell/`).
Working directory for install/build/test/typecheck/lint = `<checkout>/<subApp.path>`; repo-level git ops
(`git diff`/`add`/`commit`/`push`) still happen at the **repo root** — one commit, one repo.

## Two fix paths

1. **State/logic bug** (composable, store, service function — e.g. a stale reactive flag not resetting
   after an action) → **Path 1**, below. Try this first.
2. **Mounted-component/template/DOM bug** (rendering, event binding, slot/prop output, CSS/layout) →
   **Path 2**, below — the ephemeral harness.
3. A bug needing live wiring (real router/store/backend API responses) that **neither** path can
   faithfully reproduce → this is **not** a tooling gap to solve here. It's the ordinary Gate-6 "needs
   deploy verification" path every module fix already uses (`.claude/rules/quality-gates.md` G6,
   `qa-backend-expert` post-deploy regression) — say so in the PR body, don't invent a new harness.

### Path 1 — state/logic, the real runner (preferred — try this first)

1. Read `tests/**/*.test.ts` for the house style (Node's built-in `test`/`assert` from `node:test`,
   plain imports — no test framework config to discover).
2. Locate the seam: the composable (`use*`)/store/service function that owns the bug's state. `Grep`/
   `Glob` on the symptom (a flag name, an event handler, a store action).
3. Write a **NEW** `*.test.ts` next to an existing one: import the real module, wrap reactive state in
   `effectScope()` where needed (same technique as `vue-unit-test`'s `vitest-patterns.md` composable
   recipe — different runner, same idea), assert the **expected** behavior.
4. Confirm **RED**: `npx tsx --test tests/<new>.test.ts`. If it passes on current code, the RCA is wrong
   — re-investigate, don't proceed.
5. Fix the smallest correct change to product code; re-run until **GREEN**. Existing tests untouched.
6. Gate: `vue-tsc --noEmit` + lint (sub-app's own commands) + the full `npx tsx --test tests/**/*.test.ts`.

### Path 2 — mounted-component/DOM, the ephemeral harness

1. **Confirm Path 1 genuinely can't reach the bug** — the symptom is in template/render output, not
   state (if you're not sure, try Path 1 first; it's cheaper and leaves no cleanup).
2. **Scratch-install, never touching the sub-app's own `package.json`/lockfile:**
   ```
   npm install --no-save --no-package-lock vitest @vue/test-utils jsdom @vitejs/plugin-vue
   ```
   Run from the sub-app directory. Verify BEFORE and AFTER: `git diff package.json package-lock.json`
   must be **empty** both times (`--no-save` keeps `package.json` untouched).
3. Write an ephemeral `vitest.scratch.config.ts` in the sub-app dir (never staged) that imports the
   sub-app's **real** `vite.config.ts` via `mergeConfig`, setting `test.environment: "jsdom"` — see
   `vc-shell-scratch-harness-patterns.md` for the exact snippet.
4. Write the repro as a normal `@vue/test-utils` mount test in a scratch location
   (`.fix-workspace/_scratch/VCST-XXXX/repro.spec.ts` — outside the sub-app tree), importing the REAL
   component from the checkout.
5. Run: `npx vitest run --config <path-to-scratch-config> .fix-workspace/_scratch/VCST-XXXX/repro.spec.ts`.
   Confirm **RED** on current code → fix product code → confirm **GREEN**.
6. **Before the PR:** `git status`/`git diff` in the sub-app directory must show **nothing** from steps
   2–4 — no `package.json`, no lockfile, no scratch config, no `node_modules` (gitignored anyway). Only
   the product-code fix ships. Paste both runs' output in the PR body as evidence (mirrors
   `/angular-admin`'s scratch-harness discipline exactly).

## Hard rules

- **Single repo, single sub-app path.** Touching `Web/Scripts/` (legacy AngularJS Admin UI), the Angular
  21 designer, or the .NET solution in the same run → STOP. Stay within the declared sub-app path.
- **The ephemeral harness (Path 2) never ships.** No devDependency, lockfile, or scratch-config diff —
  verify with `git status`/`git diff` before opening the PR.
- **Only ADD tests** (Path 1) — never edit or delete an existing `tests/*.test.ts`. An existing test
  going red after the fix = contract conflict → STOP.
- **Never add a real dependency** to the sub-app's `package.json` just to compile a test.
- Match the sub-app's existing Composition API / `<script setup>` / vee-validate conventions — don't
  restyle or "modernize".
- Same gate ladder + no-auto-merge as every other developer path — `.claude/rules/quality-gates.md`.
- If the correct fix is unclear or risky → `FIX_STATUS: FAILED`, don't push speculative changes.

## References

- `vc-shell-scratch-harness-patterns.md` — Path-2 mechanics in full (scratch install, `mergeConfig`
  snippet, worked red→green mount-test example, pre-PR strip checklist)
- `skills/vue-unit-test/vitest-patterns.md` — mount/composable recipes (shared technique with vc-frontend)
- `skills/vue-fix/vue3-best-practices.md` — Vue 3/TS idioms within a minimal diff
- `knowledge/architecture/vc-module-architecture.md` §2a — embedded frontend sub-apps in a module repo
- `.claude/rules/quality-gates.md` — G1 (routing), G2 (red), G3 (green), G4 (scratch-harness leakage check)
