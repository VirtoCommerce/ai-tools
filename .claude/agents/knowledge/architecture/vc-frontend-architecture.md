---
applicability: reference
applicability_rationale: "vc-frontend (Vue 3 / TS) storefront repo anatomy + vitest / @vue/test-utils / Storybook conventions. Universal across VC customers' storefront forks; repo list + routing are data (ci/config/fix-repos.json), not hardcoded here."
---

# Virto Commerce Storefront Architecture (vc-frontend) — for the auto-fix pipeline

> LAYER 2 knowledge for the `developers/` team (`fullstack-frontend`, `frontend-reviewer`) and the CI
> `ci/agents/fix-frontend-agent.md`. How the `vc-frontend` repo is laid out, how to find the failing
> code, how to write the red→green vitest test, and which commands prove the fix. **The repo list and
> routing are NOT here** — they are live data in `ci/config/fix-repos.json` + `ci/lib/repo-router.ts`.
> Read those; don't duplicate them. This is the Vue/TS twin of `vc-module-architecture.md`.

## 1. Repo kind & build/test profile (authoritative: `ci/lib/repo-router.ts`)

`REPO_PROFILES.frontend` in `ci/lib/repo-router.ts` is the single source for install/build/typecheck/
lint/test commands. Do not invent commands — read the profile for the routed repo's `kind`.

| Kind | Repo | Lang | Install | Build | Test (red→green gate) | Typecheck | Lint |
|------|------|------|---------|-------|-----------------------|-----------|------|
| `frontend` | `vc-frontend` | TS | `yarn install --frozen-lockfile \|\| npm ci \|\| npm install` | `yarn build \|\| npm run build` | `yarn test:unit \|\| npx vitest run` | `yarn typecheck \|\| npx vue-tsc --noEmit` | `yarn lint \|\| npm run lint` |

- **Default base branch is `dev`** (not `main`/`master`) — overridden by live `gh repo view` detection
  in `checkoutForFix`. The package name is `vc-theme-b2b-vue`.
- **Yarn 4 (Berry)** + Node `>=22.12 <23`. `yarn precheck` runs ahead of most scripts — let it.
- **There IS a real test harness** (vitest) — unlike the module Admin SPA, which has none. So there is
  **no scratch harness** for storefront bugs: write a normal `*.spec.ts` / `*.test.ts`.
- A NEW lint or `vue-tsc` error your fix introduces **fails CI** (ESLint runs error-level, SonarCloud
  gate is on). Fix the warning in your own code; never disable a rule or edit config to suppress it.

## 2. vc-frontend repo layout

Single package (not a multi-package monorepo); all app code lives under `client-app/`:

```
client-app/
  pages/            # route-level views (matched by router/)
  router/           # Vue Router config + route names
  modules/          # feature modules grouped by business domain, each w/ its own api/graphql/, components/, composables/
  shared/           # cross-module components, composables, services
  core/             # api/ (Apollo GraphQL client + generated types), http, utilities, constants
  ui-kit/           # the design system / "UI kit" — SHIPS IN-REPO (see §5)
    components/
      atoms/         #  e.g. badge/, button/, icon/  → vc-badge.vue + vc-badge.stories.ts + vc-badge.types.d.ts
      molecules/     #  e.g. input/, select/, dialog-*  (Vc* components)
      organisms/
    composables/     # use* (useComponentId, useDateField, …) + co-located *.test.ts
    locales/, icons/, types/, utilities/, constants/, enums/
  plugins/          # Vue plugins (incl. $cfg theme-context provider)
locales/            # storefront i18n message catalogs (vue-i18n)
config/             # settings_data.json etc. ($cfg.* source — see storefront-config-flags.md)
.storybook/         # Storybook 9 config (main.ts, preview.ts)
vitest.config.ts    # test env = jsdom, coverage = v8, excludes client-app/e2e/*
tsconfig*.json      # project refs: app / node / storybook / vitest; @/* → client-app/* alias
eslint.config.js    # ESLint 9 flat config (vue + ts + sonarjs + tailwind + vuejs-accessibility)
sonar-project.properties  # SonarCloud: VirtoCommerce_vc-theme-b2b-vue
```

- **Component files** are co-located: `vc-foo.vue` + `vc-foo.stories.ts` (+ `vc-foo.types.d.ts`).
  Components are globally registered (`client-app/ui-kit/index.ts`) and named `Vc<Name>`.
- **Tests** live next to their subject as `*.spec.ts` / `*.test.ts`. Composables already have unit
  tests (e.g. `client-app/ui-kit/composables/useDateField.test.ts` — read it for the house style).
  UI-kit components mostly have **stories, not unit specs** — adding a focused component `*.spec.ts` is
  in-scope and welcome for a fix.
- **The `@/` alias maps to `client-app/`** (see `tsconfig` `paths` + `vitest.config` `resolve.alias`).
  Imports look like `import { useDateField } from "@/ui-kit/composables"`.

## 3. Fix-tracing flow (find the seam)

Trace top-down, the storefront analogue of the module controller→service path:

```
route/page  →  component (.vue)  →  composable (use*)  →  store / provide-inject  →  GraphQL xAPI query  →  util
```

- Locate the seam with `Grep`/`Glob` on the RCA's **component name**, **`data-test-id`** (see
  `storefront-selectors.md`), **composable name**, **route name**, **i18n key**, or **GraphQL operation**.
- **Verify the real GraphQL field** before "fixing" a mapping — the storefront mirrors the backend's
  "wrong field silently no-ops" trap (a typo'd selection just returns `undefined`). Generated types live
  in `core/api/graphql/**/types.ts` (Sonar-excluded — do not edit generated files).

## 4. Writing the reproduction test (Gate 2 → Gate 3)

- **Component / UI logic:** `mount` / `shallowMount` from `@vue/test-utils` (or
  `@testing-library/vue`), asserting rendered output / emitted events / `data-test-id` state. Confirm
  **red** filtered: `npx vitest run -t VCST-XXXX` (or by file path). See `/vue-unit-test`
  `vitest-patterns.md`.
- **Composable / util (pure logic):** call the function directly; wrap reactive composables in
  `effectScope()` (as `useDateField.test.ts` does). Prefer this over a full mount when the bug is in
  logic, not template.
- **Global plugins** (vue-i18n, vue-router, Pinia, `$cfg`) must be **stubbed/provided** in the test
  (`vi.mock("vue-i18n", …)`, `global.plugins` / `global.stubs` / `global.provide`). A mount that throws
  "no i18n / injection not found" means the harness is under-provided, not a product bug.
- **Layout / CLS / pixel-level bugs cannot be unit-asserted.** Test the underlying logic (computed
  class/height/visibility) and note in the PR body that the visual aspect needs human/Storybook/deploy
  confirmation. (Storybook play-function interaction tests are an optional fallback — see the
  deferred `/storybook-test` skill; vc-frontend has no play functions today.)
- **Never modify or delete an existing test or story** to make it pass — only ADD (Gate 3). An existing
  test going red means the fix changed contracted behavior → STOP.

## 5. The UI kit is in-repo (single-repo) — the cross-repo boundary

The UI kit (`client-app/ui-kit/`) ships **inside vc-frontend**, so a UI-kit component bug is **still a
single-repo fix** (Gate 1 passes) and is owned by `fullstack-frontend` — the storefront analogue of the
module Admin SPA shipping in `Web/Scripts/`.

**The cross-repo STOP boundary** is a separately *published* npm package (e.g. an external
`@vc-shell/*` / `@virtocommerce/*` design-system package referenced in `package.json` `dependencies`):
its source is not in this checkout, so a root cause there is **cross-repo → STOP** (`ROOT_CAUSE: belongs
in <package>`; needs a human version-bump → publish → bump). This is the frontend equivalent of "root
cause in a NuGet dependency".

## 6. Traps (storefront-specific)

- **`$cfg.*` feature flags** (`storefront-config-flags.md`): a symptom that only appears when a flag is
  on/off is **configuration, not a code bug** → BAIL back to Gate 0. Confirm the binding is wrong, not
  the flag value, before fixing.
- **i18n**: distinguish a **missing key** (renders the key string) from a **wrong value** (renders the
  wrong translation) — different fixes (`locales/` catalog vs the lookup call).
- **GraphQL fields**: verify against the live schema / generated types; a wrong field name no-ops
  silently. Do not edit generated `types.ts`.
- **Reactivity**: a "value not updating" bug is usually a lost reactive reference (`computed` vs plain
  read, destructured prop, `.value` omitted) — not a data bug. See `/vue-fix` `vue-fix-patterns.md`.

## 7. Branch / PR / verification conventions (shared with CI)

- **Workspace:** `.fix-workspace/vc-frontend/` (gitignored). **One** repo per run.
- **Branch:** `claude/qa-autofix/VCST-XXXX` (from `checkoutForFix`). **Commit:** Conventional Commits +
  JIRA key, e.g. `fix(cart): clamp quantity input to valid range (VCST-1234)`, **authored as the human
  token-owner with Claude as `Co-Authored-By:`** (CLA — see `developers/shared-instructions.md`).
- **PR:** `gh pr create` (interactive `/qa-fix`: a normal PR for human review; CI `run-fix-cycle.ts`:
  `--draft`), title `VCST-XXXX: Fix <imperative>`, body = RCA + JIRA link + red→green test +
  verification checklist + "DO NOT MERGE until human review". Add a **"needs visual / E2E verification"**
  note when the bug has a visual aspect — re-confirmed via `/qa-regression frontend` + `/qa-verify-fix`.
  **Never** auto-merge.
- **Gates:** see `.claude/rules/quality-gates.md` (G0–G7). **Never** `merge_pull_request` / `gh pr merge`.

## Cross-references
- `storefront-selectors.md` — stable `data-test-id` / `.vc-*` selector map for finding components
- `storefront-config-flags.md` — `$cfg.*` flag inventory (rule out config-gating)
- `critical-ui-scope.md` — regression-enforced 7-components × 8-pages BL-UI matrix the fix must not break
- `business-logic.md` — BL-UI-* and storefront BL invariants the fix must preserve
- `vc-bug-catalog.md` — VC-UI-* historical storefront failure patterns; don't re-introduce one
