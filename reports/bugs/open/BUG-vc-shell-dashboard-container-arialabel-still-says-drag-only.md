# [vc-shell] Dashboard container still announces "Drag widgets to rearrange" — the wrapper's stale default overrides the corrected label `[Low / S3, SC 2.5.7 adjacent]`

## Status: CONFIRMED

**Severity:** Low (a11y wording — the keyboard route exists and per-widget labels do teach it)
**Env:** Vendor Portal `https://vcmp-dev.govirto.com/apps/vendor-portal/` (deployed build `22260`) · `@vc-shell/framework` @ `main` · Edge/Chromium
**Found:** 2026-08-26, while verifying `BUG-vc-shell-dashboard-drag-only-no-keyboard-alternative` (now fixed)

## Summary

[vc-shell#272](https://github.com/VirtoCommerce/vc-shell/pull/272) added full keyboard widget rearrangement and states in its own body: *"Both aria-labels were misleading — 'Drag to reorder' / 'Drag widgets to rearrange' now describe the keyboard route."* Only one of the two was updated. The dashboard **container** still announces the drag-only instruction, which is the precise wording that PR set out to eliminate — it tells screen-reader users to do the one thing they cannot.

## Root cause — a wrapper default shadowing the fix

Two components, two defaults, and the stale one always wins:

`framework/shell/dashboard/draggable-dashboard/GridstackDashboard.vue` — **corrected**:
```js
ariaLabel: "Dashboard widgets. Drag a widget, or focus one and press Enter to rearrange with the arrow keys.",
```

`framework/shell/dashboard/draggable-dashboard/DraggableDashboard.vue` — **stale**, and it is the public wrapper:
```vue
<GridstackDashboard ref="dashboardRef" :show-drag-handles="showDragHandles"
                    :resizable="resizable" :aria-label="ariaLabel" />
```
```js
withDefaults(defineProps<Props>(), {
  showDragHandles: false, resizable: false,
  ariaLabel: "Dashboard widgets. Drag widgets to rearrange.",   // <-- never updated
});
```

Because `withDefaults` always materialises `ariaLabel`, the prop is **never** `undefined` at the child, so `GridstackDashboard`'s corrected default is **unreachable** through this path. Any consumer using `DraggableDashboard` — which is what the Vendor Portal uses — gets the old string.

## Evidence — live, deployed

Read from the running app (`.grid-stack`):
```json
{ "role": "list",
  "ariaLabel": "Dashboard widgets. Drag widgets to rearrange.",
  "tabIndex": -1 }
```
Per-widget labels on the same page are correct, which is what makes the container the odd one out:
```
"Last products, widget 1 of 5. Press Enter to pick up and rearrange with the arrow keys."
```

## Expected vs actual

- **Expected:** the container's default matches the child's corrected wording, so the first thing announced on entering the dashboard describes the keyboard route.
- **Actual:** it names dragging only.

## Why it is Low, not a reopen

The keyboard functionality is present and works; a user who reaches a widget is told `Press Enter to pick up`. The container label is the *first* thing announced, so it sets a wrong initial expectation, but it does not block the task.

## Suggested fix

Delete `ariaLabel`'s default from `DraggableDashboard.vue` and let it pass through as `undefined` so the child's default applies (single source of truth), or copy the corrected string. Prefer the former — two defaults for one label is what caused this.

Worth a general check: any other prop `DraggableDashboard` re-declares a default for is shadowing the child the same way.

## Refs
- Introduced-by/missed-in: [vc-shell#272](https://github.com/VirtoCommerce/vc-shell/pull/272) (VCST-5600)
- Split out of: `reports/bugs/fixed/BUG-vc-shell-dashboard-drag-only-no-keyboard-alternative.md`
