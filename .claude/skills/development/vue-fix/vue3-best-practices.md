# Vue 3 / TypeScript best practices — within a minimal diff

For fixing `vc-frontend` (Vue 3.5 / TS 5.9 / Vite 7, `<script setup>`, Composition API). These guide the
*change*; they are **not** a license to refactor (that fails Gate 0 / Gate 4). **Match the file's
existing style** over imposing newer idioms.

## Reactivity
- `ref()` for primitives/single values; `reactive()` for objects you mutate in place (the repo mostly
  uses `ref`); `computed()` for derived state (never a one-time `const`).
- **Don't destructure a reactive source** (`props`, `store`, a `reactive()` object) — it severs
  reactivity. Use `props.foo`, `toRef(props, "foo")`, `toRefs()`, or `storeToRefs(store)`.
- Remember `.value` in `<script>` (templates auto-unwrap, script does not).
- `watch(src, cb, { immediate })` when you need the initial run; `watchEffect` only when deps are
  implicit and you want them tracked automatically. Effects created in `setup` auto-dispose; manual
  `effectScope` must be stopped.

## Components & contracts (the breaking-change boundary)
- Type props/emits with the generic forms: `defineProps<Props>()` + `withDefaults(…)`,
  `defineEmits<{ (e: "update:modelValue", v: number): void }>()`. A shared component's **prop / event /
  slot** shape is a public contract — **do not change it** to fix a bug (Gate 0 boundary); fix the
  internal logic instead.
- Keep `Vc*` component naming and the co-located `vc-foo.vue` / `vc-foo.types.d.ts` convention.
- Emit the **normalized** value from `update:modelValue` (clamp/coerce before emit).

## TypeScript
- Strict mode + `vue-tsc` — type it correctly; **never `@ts-ignore`/`@ts-expect-error`** to silence a
  fix. Avoid `any`; prefer precise types or the existing generated GraphQL types.
- Use the `@/` alias for imports (`@/ui-kit/...`, `@/core/...`) as the repo does.
- Don't edit generated files (`core/api/graphql/**/types.ts`) — fix the query, regenerate is a separate
  concern out of auto-fix scope.

## Async & data
- `async/await` with explicit error handling; never swallow an error silently (SonarCloud flags it).
- Gate UI on a `loading` ref; await mutations before reading their result.
- Apollo/`@vue/apollo-composable`: read `result`/`loading`/`error` refs; verify field names against the
  schema (a typo no-ops to `undefined`).

## Build hygiene (these fail CI if violated)
- **ESLint is error-level** (vue, ts, sonarjs, tailwind, vuejs-accessibility) — fix lint in your code;
  never disable a rule or touch `eslint.config.js`.
- **No dependency adds/upgrades**, no `yarn.lock` changes, no Prettier reflow of untouched lines.
- **a11y matters** — `vuejs-accessibility` rules are on; keep `alt`, labels, roles intact when editing
  templates.
- **SonarCloud quality gate** runs on the PR — no new bug/vuln/unreviewed hotspot, and new code must be
  covered by the added test so new-code coverage holds.

## Don't (breaking changes → STOP)
- No public GraphQL query/contract change; no shared-component prop/event/slot API change; no
  router-contract change; no global registration changes in `client-app/ui-kit/index.ts`.
- No restyle / "modernize" / restructure beyond the seam. Minimal diff wins.
