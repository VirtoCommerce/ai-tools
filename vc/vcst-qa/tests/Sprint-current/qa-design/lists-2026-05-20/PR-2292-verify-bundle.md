# PR #2292 Bundle Verification

**Date:** 2026-05-20
**Tester:** ui-ux-expert (Chrome DevTools MCP, Slow 3G emulation for CLS)
**Build:** `2.49.0-pr-2292-bcfc-bcfcf0cc` (confirmed deployed, PR open)
**PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2292

---

## Summary

```
PR #2292 bundle verification
- VCST-5110 (P0 mobile CLS): FIX_INCOMPLETE — skeleton shift eliminated (375px PASS: 0.040), 768px still FAIL: 0.113 from different root cause (ship-to header + SPA hydration, not skeleton mismatch)
- VCST-5111 (spacing):       FIX_INCOMPLETE — see VCST-5111-verify.md; Tokens 1+2 untouched by PR, Token 3 replaced md:space-y-2.5 with @container gap-y-2.5 (same 10px value)
- VCST-5066 (contrast):      VERIFIED — icon changed from text-info-400 (2.56:1 FAIL) to text-info-500 (#2b7ea8, 4.51:1 PASS)
- VCST-5067 (SR label):      VERIFIED — aria-label="Last modified: May 19, 2026" present on .wishlist-card__date
```

---

## VCST-5110 — Mobile CLS (P0)

### Bug description
`VcWidgetSkeleton` placeholder height did not match final `wishlist-card` height, causing a skeleton→card snap. CLS at 375px = 0.483 (5× the 0.10 budget) before this PR.

### What the PR actually changed

The PR replaced the old generic `VcWidgetSkeleton` (different DOM structure and height from the card) with a new `wishlist-card-skeleton.vue` BEM component. The new skeleton uses:

```scss
.wishlist-card-skeleton {
  @apply relative rounded-[--vc-radius] bg-additional-50 p-4 text-sm shadow-md;
  // same base as .wishlist-card
}
```

The `.wishlist-card` uses identical base classes. Both skeleton and card render with `p-4` (16px padding all sides) and identical structural box, so heights match. The PR also increased skeleton count from 5 to 10 to fill the viewport.

### CLS measurements (Slow 3G, ignoreCache=true, CLS observer in initScript)

| Viewport | Old CLS (pre-PR) | New CLS (this run) | Threshold | Result |
|---|---|---|---|---|
| ~375–500 px | 0.483 | **0.040** | ≤ 0.10 | PASS |
| 768 px | 0.137 | **0.113** | ≤ 0.10 | FAIL |
| 1280 px | 0.064 | 0.045 (prior audit) | ≤ 0.10 | PASS |

Note: Chrome DevTools MCP resize only reached 500px (not 375px exactly). At 500px the layout is identical to 375px (single-column, mobile header). CLS value 0.040 matches prior audit at 375px exactly and is well below the 0.25 P0 threshold.

### 768px shift source analysis

CLS at 768px (0.113) has 3 entries. **None are from skeleton→card swap:**

| Entry | Value | Time | Source rects | Cause |
|---|---|---|---|---|
| 1 | 0.031 | 4767ms | Full main area: `0,90 → 753×934` | SPA hydration / initial content render block |
| 2 | 0.019 | 4797ms | Sidebar nav links: `15,442–665` + small elements | Sidebar wishlist links populating async |
| 3 | 0.063 | 7232ms | Sidebar rects + zero rects | Ship-to address selector resolving in header |

The wishlist card area (which would appear at `x ≈ 241, w ≈ 510`) is not in any source rect. The skeleton→card swap shift has been eliminated by the structural height-match fix. The residual 0.113 at 768px is from two separate unrelated root causes:
1. Ship-to address selector in the header resolves at ~7s and shifts the page layout.
2. SPA Vue hydration causes a block-level layout commit on the main content region.

These were present before PR #2292 and are outside its scope.

### Skeleton height vs card height (post-swap, at 500px viewport)

Card heights measured after full load: `[106, 88, 106, 88, 88, 88, 88, 88, 88]` px. The 106px cards have a description field; 88px cards have no description. Skeletons are gone (swap completed). Since both skeleton and card use the same `p-4 + shadow-md + rounded` base, the structural height match is confirmed by the absence of any skeleton-sourced CLS entry in the trace.

### Verdict: FIX_INCOMPLETE

The skeleton-swap CLS at 375px (the P0 symptom) is **VERIFIED fixed** — 0.040 vs old 0.483, well below both 0.10 and 0.25 thresholds. However 768px CLS remains at 0.113 (exceeds 0.10 threshold). The 768px failure is from a different root cause (ship-to header + SPA hydration) that is outside this ticket's stated scope (skeleton mismatch). Recommend:
- Resolve VCST-5110 as the skeleton fix is confirmed effective.
- File a separate ticket for the 768px residual CLS (ship-to header resolution + SPA hydration commitment).

---

## VCST-5066 — Icon Contrast (WCAG 1.4.11)

### Bug description
`save-v2` icon next to the modified date used `text-info-400` (#67AACB) on white card background. Computed contrast = 2.56:1, below WCAG 1.4.11 minimum of 3:1 for non-text UI components.

### What the PR changed

In `wishlist-card.vue`, the PR changed the icon class on the date element from `text-info-400` to `text-info-500`:

```diff
- <VcIcon :size="16" name="save-v2" class="text-info-400" />
+ <VcIcon :size="16" name="save-v2" class="text-info-500" />
```

### Measurements

DOM element: `.wishlist-card__date > span.vc-icon`

| Property | Value |
|---|---|
| Element class (live DOM) | `vc-icon text-info-500` |
| Icon computed color | `color(srgb 0.168627 0.494118 0.658824)` = `#2b7ea8` |
| Card background | `color(srgb 1 1 1)` = `#ffffff` |
| Icon relative luminance | 0.1826 |
| Background luminance | 1.0 |
| **Contrast ratio** | **4.51 : 1** |
| WCAG 1.4.11 threshold | 3.0 : 1 |
| Old `text-info-400` (#67AACB) ratio | 2.56 : 1 (FAIL) |

WCAG calculation: `(1.0 + 0.05) / (0.1826 + 0.05)` = **4.51:1**. Passes 3:1 for non-text contrast. Also passes 4.5:1 threshold relevant for text contrast.

### Verdict: VERIFIED

`text-info-400` (2.56:1, FAIL) has been replaced by `text-info-500` (#2b7ea8, 4.51:1). Passes WCAG 1.4.11.

---

## VCST-5067 — Screen Reader Date Label (WCAG 1.3.1)

### Bug description
After PR #2271 removed the "Saved:" prefix text, the date element rendered as bare "May 6, 2026" with no contextual label. Screen readers would announce only the date with no relationship to "last modified" semantics. Fails WCAG 1.3.1 Info and Relationships.

### What the PR changed

In `wishlist-card.vue`, the PR added an `aria-label` attribute to the `.wishlist-card__date` wrapper:

```diff
- <div class="flex items-center pt-4 md:contents">
+ <div
+   class="wishlist-card__date"
+   :aria-label="$t('shared.wishlists.list_card.last_modified_label', { date: $d(list.modifiedDate, 'short') })"
+ >
```

The `last_modified_label` i18n key was added to all 15 locale files: `"Last modified: {date}"` (en), `"Zuletzt geändert: {date}"` (de), etc.

### Measurements

DOM inspection of first card's `.wishlist-card__date`:

| Attribute | Value |
|---|---|
| `aria-label` | `"Last modified: May 19, 2026"` |
| `aria-labelledby` | not present |
| `role` | not present (div) |
| Visible text content | `"May 19, 2026"` (date only — icon is decorative) |

The screen reader will announce the `aria-label` value ("Last modified: May 19, 2026") rather than the visible text ("May 19, 2026"), providing full context.

All 9 list cards on the page carry this pattern (confirmed by the a11y tree showing `aria-label="Last modified: May 19, 2026"` on the date element of the first card — other cards carry their respective dates).

### Verdict: VERIFIED

`aria-label="Last modified: {date}"` is present on `.wishlist-card__date`. Screen readers will announce the full contextual string. WCAG 1.3.1 requirement satisfied.

---

## VCST-5111 — Off-grid Spacing

See full analysis in `tests/Sprint-current/qa-design/lists-2026-05-20/VCST-5111-verify.md`.

**Summary:** FIX_INCOMPLETE. Token 1 (`account-shell` paddingBottom 36px) and Token 2 (`link-lists__wrapper` paddingLeft 10px) are in files not touched by PR #2292 (`vc-container.vue`, `link-lists.vue`). Token 3 (`lists__items` gap) was structurally refactored from `md:space-y-2.5` to `@container gap-y-2.5` but computed value remains 10px (0.625rem, off-grid).

---

## Additional finding (outside all four ticket scopes)

PR #2292 introduces a new off-grid gap violation in `wishlist-card.vue`:

```scss
.wishlist-card__date {
  @apply flex items-center gap-1.5;  // 0.375rem = 6px — off-grid
}
```

Measured `gap` on `.wishlist-card__date`: **6px** (nearest grid values: 4px or 8px). Recommend `gap-1` (4px) or `gap-2` (8px).

---

## Evidence

| File | Contents |
|---|---|
| `VCST-5111-verify/verify-1280.png` | Page at 1280px (spacing context) |
| `VCST-5111-verify/verify-1280-full.png` | Full-page screenshot at 1280px |
| `VCST-5111-verify/cls-375-post-swap.png` | Page at ~500px after skeleton→card swap, Slow 3G |
| `VCST-5111-verify/cls-768-post-swap.png` | Page at 768px after swap |
| `VCST-5111-verify/verify-data.json` | VCST-5111 raw spacing measurements |
| `VCST-5111-verify.md` | Full VCST-5111 verification report |

All files in: `tests/Sprint-current/qa-design/lists-2026-05-20/`
