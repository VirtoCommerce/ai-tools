## Root-Cause Worksheet — C34 (VCST-5880 triage, out of scope)

### 1. Symptom
On /compare, a keyboard user who activates Pin or Unpin on any row except the first loses focus to `<body>`.

### 2. Lowest failing layer
Storefront Vue component; no network involved, since the pin is local state (`useCompareTableRowPins`, "Purely local UI state (not persisted)").
→ repoKind `frontend` → repo **`VirtoCommerce/vc-frontend`**, file `client-app/shared/compare/components/compare-table.vue`. Confidence: **HIGH**.

### 3. Evidence → claim chain
| # | Claim | Evidence |
|---|---|---|
| 1 | Rows render in pinned-first order, keyed by row key | `compare-table.vue` (fix/VCST-5880 @ee98adbd) L193-194 `v-for="(row, index) in visibleRows" :key="row.key"`; L421-427 `const visibleRows = computed(() => { … return [...pinnedRows.value, ...rest]; })`. Same on `dev` @f60ab8d6 L195-196 / L413-419 |
| 2 | A pin only flips a Set, and the reorder follows from it | L252 `@click="togglePin(row.key)"`; `client-app/shared/compare/composables/useCompareTableRowPins.ts` `togglePin` replaces `pinnedRowKeys` with a new Set; `pinnedRows` / `unpinnedRows` recompute |
| 3 | The reorder moves the focused `<tr>` in the DOM | For `[A,B,C,D] → [D,A,B,C]`, Vue's keyed diff keeps the longest increasing run (A,B,C) and re-inserts only D, which is the row holding focus. Re-inserting a focused subtree blurs it, so focus falls back to `<body>`. Live: the moved row is first in `topRows` after every pin and back in place after every unpin (`evidence-index.md` table) |
| 4 | When nothing moves, focus survives (discriminating control) | Pinning "Price per unit", which is already first, leaves the order unchanged, so no DOM move happens and focus stays on the button on both builds |
| 5 | Nothing restores focus after a pin | Restore exists only for the compact header swap (L388-406 `watch(isCompact, …)`: capture `document.activeElement`, `await nextTick()`, keep it if still connected, else `headerRowRef.focus()`) and for Remove (L408-413 `onRemoveProduct` → `await nextTick(); headerRowRef.value?.focus()`). `togglePin` is bound straight to `@click` with no such step. Present on both `dev` and `fix/VCST-5880` |
| 6 | The PR does not touch it | `compare-table.vue` diff `dev`↔`fix/VCST-5880` changes only the table/thead/th structure, `aria-*`, `useId` and the scroll-sync ref. Pin, `visibleRows` and `togglePin` are unchanged. BASELINE 2.60.0-pr-2511 reproduces 6/6 |

### 4. The "why"
Pinning re-sorts the keyed row list, so Vue physically moves the focused row's `<tr>` to the top (or back down). Moving a focused node blurs it, and unlike Remove and the compact swap, `togglePin` has no `nextTick` focus restore.

### 5. Alternatives ruled out
| Alternative | How ruled out |
|---|---|
| By design (focus intentionally released) | The component restores focus deliberately for the two sibling cases (row 5; code comment L388-390 "Left alone, focus falls through to <body>, stranding keyboard users"), so focus loss is treated as a defect in this file |
| Test-harness artifact (click on label) | Focus was confirmed on the Pin button before Enter in every attempt, and Enter is a real keyboard press. The control row, driven the same way, keeps focus |
| Flaky / timing | 12/12 across 2 builds; activeElement is BODY both immediately and at +500 ms, so this is not a transient re-render |
| Data drift | Fixture rows render as expected; behaviour depends only on row position, so it is independent of data |

### 6. Regression archaeology
Not a "used to work" symptom. It exists since pinning shipped, and is identical on `dev` and the PR. Skipped.

### Fix direction (not a decision)
Give each pin button a stable `data-row-key`. Change the handler to `async function onTogglePin(key) { togglePin(key); await nextTick(); <query the pin button for key>?.focus(); }`, mirroring `onRemoveProduct`. A vitest can assert `document.activeElement` after a pin on a non-first row.

### Severity on evidence: **Medium**
This fails WCAG 2.4.3 (Level A) on a primary compare interaction, on every pin and unpin of any row except the first. Two things soften it: Chromium keeps the Tab start point near the old slot, and the defect is compare-only.
