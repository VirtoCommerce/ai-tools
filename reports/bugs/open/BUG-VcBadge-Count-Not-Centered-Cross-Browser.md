# BUG: VcBadge count number not vertically centered (cross-browser)

**Date:** 2026-03-23
**Severity:** Minor (UI/Visual)
**Priority:** P2
**Component:** vc-frontend / UI Kit / Atoms / VcBadge
**Affected Browsers:** Firefox, Edge, Chrome (all browsers)
**Environment:** QA (vcst-qa-storefront.govirto.com) — v2.44.0-alpha.2262

---

## Summary

The count number inside `vc-badge` components (Notifications badge, Cart badge in the header) is not explicitly vertically centered. The `.vc-badge` flex container uses `align-middle` (Tailwind for `vertical-align: middle`) instead of `items-center` (Tailwind for `align-items: center`). While the current rendering appears approximately centered due to coincidental line-height/height math, this is fragile and incorrect — `vertical-align` is an inline-level property that has no effect on flex item alignment.

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com/
2. Log in with any account that has items in cart or notifications
3. Observe the header badges (Notifications count, Cart count)
4. Inspect the badge element with DevTools

## Expected Behavior

The count number should be explicitly centered within the badge circle using proper flexbox alignment (`align-items: center; justify-content: center`).

## Actual Behavior

The `.vc-badge` container uses `display: inline-flex` with `vertical-align: middle` instead of `align-items: center`. The child `.vc-badge__content` has `align-self: center` (`self-center`) but this does not work reliably without the parent having proper flex alignment set.

### Computed styles (all browsers identical):

| Property | `.vc-badge` (parent) | `.vc-badge__content` (child) |
|----------|---------------------|----------------------------|
| display | `inline-flex` | `block` |
| align-items | **`normal`** (default) | — |
| height | `18px` (sm size) | `14.4px` |
| line-height | `14.4px` | `14.4px` |
| font-size | — | `12px` |

**Vertical offset from badge top to content top:** ~1.8px
**Bottom gap (badge bottom to content bottom):** ~1.8px
**Total unaccounted gap:** 3.6px (18px - 14.4px)

The centering currently "works" by accident because the line-height math happens to distribute the gap evenly. If the font, font-size, or badge height changes, the alignment will break.

## Root Cause

**File:** `client-app/ui-kit/components/atoms/badge/vc-badge.vue` (in `VirtoCommerce/vc-frontend` repo)
**Line ~96-99:** Main badge class definition

### Current (incorrect):
```scss
.vc-badge {
  @apply flex-none inline-flex align-middle min-h-[--size] min-w-[--size] ...
}
```

- `align-middle` = `vertical-align: middle` — an **inline-level** property, NOT a flexbox property
- Has no effect on flex item vertical alignment

### Child element (correct but insufficient):
```scss
&__content {
  @apply grow text-center self-center [word-break:break-word];
}
```

- `self-center` = `align-self: center` — should work, but `align-items: normal` on parent resolves to `stretch` in flex context, and `align-self: center` behavior depends on the cross-axis size being properly established

## Recommended Fix

Replace `align-middle` with `items-center justify-center` in the `.vc-badge` class:

```scss
.vc-badge {
  @apply flex-none inline-flex items-center justify-center min-h-[--size] min-w-[--size] ...
}
```

This ensures:
- `items-center` → `align-items: center` (vertical centering in flex row)
- `justify-center` → `justify-content: center` (horizontal centering)
- Robust centering regardless of font metrics or size variant changes

## Affected Badge Variants

All size variants are affected (the `align-middle` is on the base `.vc-badge` class):

| Size | Badge Height | Content Height | Current Gap |
|------|-------------|---------------|-------------|
| xs | 16px | — | — |
| sm | 18px | 14.4px | 3.6px |
| md | 22px | 16.8px | 5.2px |
| lg | 26px | 20px | 6px |

## Evidence

### Firefox (close-up)
![Firefox badges](../../firefox-badges-closeup2.png)

### Edge (close-up)
![Edge badges](../../edge-badges-closeup2.png)

### Chrome (close-up)
![Chrome badges](../../chrome-badges-closeup.png)

### Storybook
Badge component in Storybook (`https://vcst-qa-storybook.govirto.com`) confirms identical CSS behavior — `align-items: normal` on `.vc-badge` wrapper across all variants.

## Impact

- **Visual:** Count numbers in header badges (Notifications, Cart) appear slightly misaligned
- **Fragility:** Current centering depends on exact font metrics — any font change, size adjustment, or content change could break the alignment
- **Cross-browser:** Consistent across all tested browsers (Firefox, Edge, Chrome)
- **Scope:** Affects all badge instances site-wide (header badges, product badges, currency badges, "Purchased before" badges, QA environment indicator)

## Related

- Component: `VirtoCommerce/vc-frontend` → `client-app/ui-kit/components/atoms/badge/vc-badge.vue`
- Dark theme override: `client-app/assets/styles/dark/atoms/vc-badge.scss`
- Storybook: VcBadge story (Atoms section)
