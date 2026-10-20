# Root-Cause Worksheet — VCST-5903 / A3

### 1. Symptom
A whitespace-only `value` renders a blank, 0-height figure row instead of the dash; with `valueSuffix` the row shows the unit alone ("items"). A whitespace-only `errorText` hides every figure and shows the alert icon with an empty message; the live region reads "<label>: ".

### 2. Lowest failing layer
**Frontend — UI-kit component** (`vc-frontend`, `client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue`). No network request, no console error, no back-office value is involved (`evidence-index.md` §Artifacts).

### 3. Evidence → claim chain
1. `value " "` takes the has-value branch, not the dash branch. With-suffix renders "items" in the 38px figure row (`A3-05`), and the suffix `<span>` exists only inside `v-else` (`source/vc-stat-widget.vue:28-32`). On basic, the card shrinks by exactly 38px (156→118), not 44 (38 + 6px gap), so a 0-height `div.vc-stat-widget__value` is still mounted (`dom-boxes.txt`, `A3-03`).
2. That branch is chosen by `hasValue = props.value !== undefined && props.value !== ""` (`vc-stat-widget.vue:90`). `" "` is neither, so the guard returns true. A div whose only text is whitespace collapses to 0 height.
3. The error branch is `v-else-if="errorText"` (`:17`) and the status is `props.errorText ? t("ui_kit.stat_widget.error", …) : ""` (`:96`). Both are plain truthiness checks, and `" "` is truthy, so the error row and the status render with an empty message (`A3-07`, `dom-boxes.txt`). `""` stays falsy, so the card stays ready (`A3-06`).
4. The PR's own tests cover `""` and `"0"` and no whitespace input (`source/vc-stat-widget.test.ts:124-127`). The gap went out untested.

### 4. The "why" in one sentence
Both "is there content?" guards in `vc-stat-widget.vue` (`hasValue` at :90 and `errorText` truthiness at :17/:96) compare against the empty string without `trim()`, so whitespace-only strings count as content.

### 5. Alternatives ruled out
- **By design:** ruled out. The PR #2568 body says "No `value` in the ready state: the same dash, so a blank figure can't read as a value". The prop JSDoc (`:56`) says "Without it the card shows a dash". Row #2 is that blank figure, and row #5 is worse: a unit with no number.
- **Data drift / stale data:** ruled out. There is no data source. Values come straight from Storybook Controls, and the URL args confirm the exact input (`value:+`, `value:+++`, `errorText:+`).
- **Storybook control artefact:** ruled out. The control passes the string through unchanged (URL arg `+` = a single space). The rendered branch matches the source exactly for every input, including the `""` and `"0"` controls.
- **Wrong build:** ruled out. `vc-deploy-dev@vcst-qa` `storybook/image.json` = `…-3f8af63a`, the same commit as the source read.
- **Flaky:** ruled out. 4 of 4 attempts across 2 stories and 2 props, and it matches the earlier run on the same build.

### 6. Regression archaeology
Not applicable. This is a NEW component in open PR #2568, with no earlier good version. The guard has been unchanged through the review commits up to `3f8af63a` (latest commits on the path: `a6939edb`, `c7c8ab21`).

### 7. Confidence
**HIGH.** The live render, the DOM geometry and the source line agree on every input, and both controls (`""`, `"0"`) behave as the source predicts.

### 8. Fix Routing handoff
- **Owning layer:** storefront UI kit · **repoKind:** `frontend` · **repo:** `VirtoCommerce/vc-frontend`
- **File:line:** `client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:90` (`hasValue`), `:17` (`v-else-if="errorText"`), `:96` (`statusText`)
- **Fix shape (minimal):** `hasValue = computed(() => !!props.value?.trim())` and a `hasError = computed(() => !!props.errorText?.trim())` used at :17 and :96. Add vitest cases for `" "` on both props next to `test.ts:124`.
- **Note:** PR #2568 is still open. The cheapest route is a review change on that PR, not a separate fix PR.
- **Severity (per /qa-defect):** Minor / **P3**. Edge input on a new, not-yet-consumed UI-kit component. No data loss, no checkout impact. Visible as a misleading card (a blank or unit-only figure, or a phantom error) wherever a caller's formatter emits whitespace.
