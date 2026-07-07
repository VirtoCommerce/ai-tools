# vitest patterns — red→green repro for vc-frontend storefront bugs

Verified against the live `vc-frontend` stack: **vitest 3.x + @vue/test-utils 2.4 +
@testing-library/vue 8 + jsdom**, `@/` → `client-app/` alias, Vue 3.5 `<script setup>`. Use only what
the repo already references — **never add a test dependency**. Read a real neighboring spec
(`client-app/ui-kit/composables/useDateField.test.ts`) for the house style before writing.

## Test stack (read, don't assume)
- `vitest.config.ts`: `test.environment = "jsdom"`, `coverage.provider = "v8"`, excludes
  `client-app/e2e/*`. The `@/` alias is in `resolve.alias` (mirrors `tsconfig` `paths`).
- Globals: this repo imports `describe`/`test`/`expect`/`vi` from `"vitest"` explicitly (it does not
  rely on `globals: true`) — match that.
- DOM matchers: `@testing-library/jest-dom` is available.

## 1. Composable / util test (pure logic — prefer this)

Reactive composables must run inside an `effectScope` so their `watch`/`computed` register, exactly as
`useDateField.test.ts` does:

```ts
import { describe, expect, test } from "vitest";
import { effectScope, ref } from "vue";
import { useQuantityValidationSchema } from "@/ui-kit/composables";

function setup(opts: { min?: number; max?: number }) {
  const scope = effectScope();
  let api!: ReturnType<typeof useQuantityValidationSchema>;
  scope.run(() => {
    api = useQuantityValidationSchema({
      minQuantity: ref(opts.min),
      maxQuantity: ref(opts.max),
    });
  });
  return { api, stop: () => scope.stop() };
}

describe("useQuantityValidationSchema — clamps to max (VCST-1234)", () => {
  test("rejects a quantity above maxQuantity", () => {
    const { api } = setup({ min: 1, max: 5 });
    expect(api.quantitySchema.value.isValidSync(6)).toBe(false); // fails on old code, passes after fix
  });
});
```

## 2. Component test (UI logic, events, conditional render)

```ts
import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import VcQuantityInput from "@/ui-kit/components/molecules/quantity-input/vc-quantity-input.vue";

describe("VcQuantityInput — clamps to max (VCST-1234)", () => {
  test("emits the clamped value, not the raw input", async () => {
    const wrapper = mount(VcQuantityInput, { props: { modelValue: 1, max: 5 } });
    await wrapper.get('[data-test-id="quantity-input"]').setValue(99);
    // assert on the LAST emitted update:modelValue
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted?.at(-1)).toEqual([5]); // red before fix
  });
});
```

- Query by **`data-test-id`** (stable — see `storefront-selectors.md`), not by CSS/Tailwind classes.
- Use `get()` (throws if missing) for elements you expect; `find()` for optional ones.
- `shallowMount` when you only care about this component's own logic and want child components stubbed.

## 3. Stubbing the global plugins (the usual mount blockers)

A storefront component often needs i18n, router, Pinia, or the `$cfg` theme context. Provide just what
the seam touches:

```ts
import { vi } from "vitest";

// vue-i18n — the verified pattern (mirrors useDateField.test.ts)
vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
    locale: { value: "en-US" },
  }),
}));

// component mount with global plugins/stubs/provides
const wrapper = mount(SomeComponent, {
  props: { /* … */ },
  global: {
    plugins: [/* createTestingPinia() if @pinia/testing is present; createRouter(...) if needed */],
    stubs: { RouterLink: true, VcIcon: true },       // stub heavy/irrelevant children
    provide: { /* inject keys the component reads, e.g. the $cfg/theme-context token */ },
    mocks: { $cfg: { /* only the flags under test */ } },
  },
});
```

- **`$cfg.*` flags:** provide only the flags the test exercises. If the symptom depends on a flag value,
  that's **config, not a code bug** → BAIL back to Gate 0 (see `storefront-config-flags.md`).
- **vue-router:** prefer a real `createRouter({ history: createMemoryHistory(), routes: [] })` over a
  full mock when the component only needs `<RouterLink>` / `useRoute`.
- **Pinia:** `createTestingPinia()` only if `@pinia/testing` is already a dep; otherwise stub the store
  composable with `vi.mock`.

## 4. Async settling

```ts
import { nextTick } from "vue";
import { flushPromises } from "@vue/test-utils";

await wrapper.get('[data-test-id="apply-button"]').trigger("click");
await flushPromises();   // resolve pending promises (GraphQL/fetch)
await nextTick();        // let reactive DOM update
expect(wrapper.get('[data-test-id="total"]').text()).toContain("…");
```

## 5. GraphQL / Apollo-backed components

The storefront uses `@apollo/client` + `@vue/apollo-composable`. For a component that runs a query,
mock the composable rather than spinning a real client:

```ts
vi.mock("@vue/apollo-composable", () => ({
  useQuery: () => ({ result: ref({ /* shaped response */ }), loading: ref(false), error: ref(null) }),
  useMutation: () => ({ mutate: vi.fn().mockResolvedValue({ data: { /* … */ } }), loading: ref(false) }),
}));
```

Verify the **real field names** against the generated types (`core/api/graphql/**/types.ts` — read,
never edit) before asserting; a typo'd selection silently yields `undefined`.

## Anti-patterns
- ❌ Asserting on Tailwind/utility classes or scoped-CSS hashes — brittle. Use `data-test-id` / emitted
  events / rendered text.
- ❌ Editing an existing spec/story to make the new case pass — ADD only (Gate 3).
- ❌ Adding `@vue/test-utils`/`@testing-library/*`/`@pinia/testing` if not already in `package.json`.
- ❌ `await new Promise(setTimeout…)` to "wait" — use `flushPromises()` + `nextTick()`.
- ❌ A green-on-first-run test — you never saw red, so it doesn't prove the bug.
