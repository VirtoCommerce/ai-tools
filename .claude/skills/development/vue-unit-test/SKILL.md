---
name: vue-unit-test
description: "[Development] Reproduce a Virto Commerce vc-frontend storefront bug as a failing vitest test (red), then prove the fix turns it green — without modifying existing tests or stories. Used by the fullstack-frontend developer agent in the /qa-fix pipeline (Gate 2/G3)."
---

# /vue-unit-test — Reproduce a bug as a failing vitest test

Encode a confirmed storefront bug (STR + root cause) as a **new** vitest test that fails on current
code, so the fix has an objective red→green proof. This is **Gate 2** of the auto-fix ladder
(`.claude/rules/quality-gates.md`).

## When to use
- A storefront bug in `vc-frontend` has been routed and the source is checked out in
  `.fix-workspace/vc-frontend/` (via `ci/lib/repo-router.ts` `checkoutForFix`, base `dev`).
- Before writing any production-code fix — the test comes first.

## Steps

1. **Read the test config + an existing spec FIRST** — they decide the house style:
   `vitest.config.ts` (env `jsdom`, `resolve.alias` for `@/`→`client-app/`) and a real neighboring
   test (e.g. `client-app/ui-kit/composables/useDateField.test.ts`). Read `package.json` for the real
   test command (`test:unit` = `yarn precheck && vitest`). Match the existing import style (`@/…`
   alias), `describe`/`test` layout, and mocking approach.
2. **Locate the seam.** From the RCA, `Grep`/`Glob` the responsible component (`.vue`), composable
   (`use*`), store, util, or GraphQL operation — search on the component name, `data-test-id`
   (`storefront-selectors.md`), route name, or i18n key. See
   `.claude/agents/knowledge/vc-frontend-architecture.md` §3. Verify the actual GraphQL field names —
   the storefront has "wrong field name silently returns undefined" traps.
3. **Install once** — `yarn install --frozen-lockfile || npm ci` (per `REPO_PROFILES.frontend`).
4. **Decide the test level:**
   - **Pure logic** (composable / util / computed): call it directly; wrap a reactive composable in
     `effectScope()`. Fastest, most stable — prefer it when the bug is in logic, not template.
   - **UI logic** (rendering, events, conditional display): `mount` / `shallowMount` from
     `@vue/test-utils` (or `@testing-library/vue`), asserting on `data-test-id` / emitted events.
   See `vitest-patterns.md` for both recipes + how to stub i18n / router / Pinia / `$cfg` / GraphQL.
5. **Write a NEW test** asserting the **expected** behavior. Name it after the behavior + ticket so it
   filters cleanly (e.g. `describe("VcQuantityInput — clamps to max (VCST-1234)", …)`). Add it next to
   its subject as `*.spec.ts` / `*.test.ts`.
6. **Confirm RED** — scoped and filtered so the loop stays fast:
   ```
   npx vitest run -t VCST-1234            # by test-name substring
   npx vitest run path/to/the.spec.ts     # or by file
   ```
   The new test must fail on current code. **If it passes, the STR/RCA is wrong → re-investigate, do
   not proceed.**
7. Hand off to `/vue-fix` to make it green.

## Failure modes (don't flounder)

| Symptom | Cause | Action |
|---------|-------|--------|
| `Cannot find module '@/…'` / unresolved import | `@/` alias not picked up | read `vitest.config.ts` `resolve.alias` + `tsconfig` `paths`; import via `@/…` as existing specs do |
| Mount throws "Need to install vue-i18n" / "injection not found" | component needs a global plugin (i18n / router / Pinia / `$cfg`) | stub/provide it in `global.plugins` / `global.provide` / `vi.mock` — see `vitest-patterns.md` |
| New test passes immediately (never red) | STR/RCA doesn't match the code path | re-investigate the seam; a "red" you never saw is not a repro |
| Async assertion flaky / sees stale value | reactivity/promise not flushed | `await nextTick()` / `await flushPromises()` before asserting |
| Lint/type error on the new test file | ESLint error-level + strict TS | fix it in the test; never disable a rule |

## Hard rules
- **Only ADD tests/stories.** Never edit or delete an existing test or `*.stories.ts` to reproduce or
  to pass (Gate 3). An existing test that breaks after the fix = contract conflict → STOP.
- **Never add a dependency** just to compile a test — use what the repo already references.
- **Trivial-skip:** a one-line template/binding/typo with no assertable behavioral branch may skip the
  dedicated repro test — note "trivial — manual verification: <blade/page, state, what to look for>" in
  the PR body (Gate 2 via skip).
- **Visual / CLS bugs** can't be unit-asserted — test the underlying logic (computed class / height /
  visibility) and note the visual aspect needs human/Storybook/deploy verification.

## References
- `vitest-patterns.md` — mount/composable recipes + stubbing i18n/router/Pinia/`$cfg`/GraphQL for VC storefront
- `.claude/agents/knowledge/vc-frontend-architecture.md` — repo layout, seams, build/test profile
- `.claude/agents/knowledge/storefront-selectors.md` — `data-test-id` map to find the component
- `.claude/rules/quality-gates.md` — G2 (red), G3 (green + existing tests untouched)
- Build/test commands: `REPO_PROFILES.frontend` in `ci/lib/repo-router.ts`
