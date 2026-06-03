---
applicability: reference
applicability_rationale: "VC module repo anatomy + .NET 10 / xUnit / Angular conventions. Universal across VC customers' vc-module-* repos; repo list + routing are data (ci/config/fix-repos.json), not hardcoded here."
---

# Virto Commerce Module Architecture — for the auto-fix pipeline

> LAYER 2 knowledge for the `developers/` team (`fullstack-backend`, `backend-reviewer`) and the CI
> `ci/agents/fix-*` agents. How a `vc-module-*` repo is laid out, how to find the failing code, how to
> write the red→green test, and which commands prove the fix. **The repo list and module→repo routing
> are NOT here** — they are live data in `ci/config/fix-repos.json` + `ci/lib/repo-router.ts` +
> `ci/lib/module-registry.ts`. Read those; don't duplicate them.

## 1. Repo kinds & build/test profiles (authoritative: `ci/lib/repo-router.ts`)

`REPO_PROFILES` in `ci/lib/repo-router.ts` is the single source for install/build/typecheck/lint/test
commands. Do not invent commands — read the profile for the routed repo's `kind`.

| Kind | Repos | Lang | Install | Build | Test (red→green gate) |
|------|-------|------|---------|-------|-----------------------|
| `module` | `vc-module-*`, `vc-module-x-*` | C# | `dotnet restore` | `dotnet build -c Debug` | `dotnet test --nologo` |
| `platform` | `vc-platform` | C# | `dotnet restore` | `dotnet build -c Debug` | `dotnet test --nologo` |
| `frontend` | `vc-frontend` | TS | `yarn install --frozen-lockfile \|\| npm ci` | `yarn build` | `yarn test:unit \|\| npx vitest run` (+ `vue-tsc --noEmit`, lint) |

Default base branch is `dev` (overridden by live `gh repo view` detection in `checkoutForFix`).

## 2. VC module repo layout (C# backend)

A `vc-module-<name>` repo is layered — fixes trace top-down, the same path `/qa-investigate` §8A uses:

```
src/
  VirtoCommerce.<Name>.Core/    # domain models, abstractions, events, settings keys, permissions
  VirtoCommerce.<Name>.Data/    # EF repositories, migrations, services impl
  VirtoCommerce.<Name>.Web/     # controllers (REST), GraphQL types/resolvers, module.cs, Scripts/ (Admin SPA UI)
tests/
  VirtoCommerce.<Name>.Tests/   # xUnit + Moq
module.manifest                 # id, version, Dependencies[] (resolve as NuGet — see §5)
```

- **Admin SPA UI** ships inside the same repo under `Web/Scripts/` (AngularJS/TypeScript) — so a
  module's admin-UI bug is **still single-repo** and in scope for `fullstack-backend`.
- **Fix-tracing flow:** controller → service → domain → repository → events. Locate the seam with
  `Grep`/`Glob` on the RCA's type/method/endpoint/GraphQL-field/settings-key names.
- **VC field-name traps:** verify the actual contract before "fixing" a mapping — VC has many
  "wrong field name silently no-ops" cases (e.g. `sections` vs `configurationSections`; coupons are a
  separate entity, not inline). Cross-check against `vc-bug-catalog.md`.

## 3. .NET 10 best practices (apply, don't over-apply)

- Nullable reference types on; prefer `required` members / primary constructors where the file already
  uses them; async-all-the-way (no `.Result`/`.Wait()`); constructor DI via the module's `module.cs`.
- **Match the repo's existing style** (read `Directory.Build.props`, `.editorconfig`, neighboring
  files) over imposing newer idioms. The fix is **minimal-diff** — best practices guide the *change*,
  they are not a license to refactor (that would fail Gate 0 / Gate 4).

## 4. Writing the reproduction test (Gate 2 → Gate 3)

- **C# (module/platform):** add a NEW `[Fact]`/`[Theory]` in `VirtoCommerce.<Name>.Tests` (Moq for
  collaborators) asserting the expected behavior; confirm **red** with `dotnet test`. If the module has
  no test project, BAIL-back (`FIX_STATUS: FAILED`, reason: no test harness) rather than scaffolding a
  risky one.
- **Module Admin UI (Angular/Jasmine):** add a Jasmine/Karma spec under `Web/Scripts/` for the
  component/service logic; pure-logic seams preferred. Visual-only bugs: test the underlying
  computed/state and note the visual aspect needs human/Storybook confirmation.
- **vc-frontend (Vue/vitest):** `*.spec.ts` with `@vue/test-utils` for components, pure functions for
  composables.
- **Never modify or delete an existing test** to make it pass — only ADD (Gate 3). An existing test
  going red means the fix changed contracted behavior → STOP.

## 5. Dependency boundary (cross-module = BAIL)

A module's `module.manifest` `Dependencies[]` resolve as **published NuGet packages** — you cannot edit
them from this checkout. If the root cause is in a dependency (symptom in `XCart`, bug in `Catalog`
Core), **do not patch around it** — report cross-module and STOP (needs human version-bump → publish →
bump dependents). The live dependency/impact graph is read from the Platform API via
`ci/lib/module-registry.ts` (`GET /api/platform/modules`, `getdependents`).

## 6. Branch / PR / verification conventions (shared with CI)

- **Workspace:** `.fix-workspace/<repo>/` (gitignored). **One** repo per run.
- **Branch:** `claude/qa-autofix/VCST-XXXX` (from `checkoutForFix`). **Commit:** Conventional Commits +
  JIRA key, e.g. `fix(pricing): apply coupon to post-tier amount (VCST-1234)`.
- **PR:** `gh pr create` (interactive `/qa-fix`: a normal PR for human review; CI `run-fix-cycle.ts`:
  `--draft`), title `fix(<scope>): <imperative> (VCST-XXXX)`, body = RCA + JIRA link + red→green test +
  verification checklist + "DO NOT MERGE until human review" (see the CI fix agents' PR-body template).
  Backend PRs add the **"needs deploy verification"** note — the live symptom is re-confirmed post-merge
  via the regression pipeline + `/qa-verify-fix`. **Never** auto-merge.
- **Gates:** see `.claude/rules/quality-gates.md` (G0–G7). **Never** `merge_pull_request` / `gh pr merge`.
