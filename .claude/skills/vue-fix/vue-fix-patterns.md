# Common VC storefront fix shapes (vc-frontend / Vue 3 / TS)

Minimal-diff fix patterns for the bug shapes that recur in the storefront. **Change one thing**, keep
the diff reviewable, match the file's existing `<script setup lang="ts">` style. Re-read
`vc-bug-catalog.md` (VC-UI-*) for domain-specific patterns before fixing.

| Shape | Symptom | Typical minimal fix |
|-------|---------|---------------------|
| **Lost reactivity** | A value doesn't update when its source changes | Read through the reactive source (`props.x`, `store.x`, `.value`) instead of a destructured/cached copy; wrap derived state in `computed()` not a one-time const |
| **Destructured prop** | Prop change not reflected | Don't destructure `props` in `setup` (breaks reactivity) — reference `props.foo`, or use `toRefs(props)` / `toRef(props, "foo")` |
| **Missing `.value`** | Comparing/rendering a `ref` object instead of its value | Add `.value` in script (templates auto-unwrap; script does not) |
| **`computed` vs method** | Stale derived value, or recompute thrash | Use `computed()` for derived state; a plain function re-runs every render |
| **`watch` timing / immediacy** | Effect misses the initial value or fires too late | `watch(src, cb, { immediate: true })`; use `watchEffect` only when deps are implicit; clean up async work on re-run |
| **Watcher leak** | Effect keeps firing after teardown | Let `watch`/`watchEffect` auto-dispose inside `setup`; for manual scopes stop the `effectScope`/returned stopper |
| **Prop default / validator** | Wrong fallback or accepts bad input | Set the default in `withDefaults(defineProps<…>(), { … })`; add a `required`/typed prop instead of a runtime guess |
| **v-model clamp / coercion** | Out-of-range or wrong-typed value emitted | Clamp/coerce in the `update:modelValue` handler before `emit`, not after; emit the normalized value |
| **Conditional render gate** | Element shown/hidden in the wrong state | Fix the `v-if`/`v-show` condition; check `v-if` (unmount) vs `v-show` (CSS) is the right one for the bug |
| **i18n key** | Renders the key string, or the wrong text | Missing key → add to `locales/` catalog; wrong value → fix the `t("…")` lookup or interpolation params |
| **`$cfg` flag misread** | Feature wrongly on/off | Fix the binding/inverted condition reading the flag — but first confirm the **flag value** isn't the real cause (config, not code → BAIL) |
| **GraphQL field mapping** | `undefined` where data expected | Correct the field name in the query/selection to match the live schema/generated types; never edit generated `types.ts` |
| **Store mutation / getter** | State not persisted or stale read | Mutate via the store action; read via the getter/`storeToRefs`, not a snapshot |
| **Async race / no settle** | Flash of wrong state, or click before ready | Await the promise; gate UI on a `loading` ref; debounce only if the existing code already does |

## Rules of thumb
- Change the **smallest unit** that fixes the seam — a handler, a computed, a condition, a query field.
- Prefer fixing **logic in `<script>`** over template hacks; prefer template fixes over new CSS.
- A "value not updating" bug is almost always **lost reactivity**, not bad data — check that first.
- Re-read `vc-bug-catalog.md` VC-UI-* for the domain; don't re-introduce a known pattern.
- After the fix, scan `git diff` for accidental churn (auto-import reorder, formatter, `yarn.lock`).
