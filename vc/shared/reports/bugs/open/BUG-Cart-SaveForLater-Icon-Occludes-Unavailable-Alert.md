# BUG-Cart-SFL-001: Save-for-later bookmark icon visually occludes "product no longer available" alert on /cart line item

## Status: CONFIRMED

## Severity: High
**Reasoning:** The occluded alert is the only user-visible signal that an item in the cart cannot be purchased. The danger SVG icon (the most salient visual cue) is fully hidden behind the bookmark button. Mobile users scanning a cart at 375 px will likely not see the warning and proceed to "Place Order", receiving a server-side rejection with no in-page explanation. Borderline P0 because it affects a revenue-critical path; held at High because the alert text body remains partially visible.

## Category: UI Layout / Accessibility (mobile-first)

## BL / WCAG Reference
- **PROPOSED-BL-UI-007** — No critical-alert occlusion (draft at `tests/Sprint-current/proposed-invariants/PROPOSED-BL-UI-007-no-critical-alert-occlusion.md` — awaits promotion to `business-logic.md` Domain 15)
- Closest existing invariant: BL-UI-004 (Content boundary) — but the defect mechanism is sibling-rect overlap with `overflow:visible`, not `overflow:hidden` clipping, so a new invariant is the right fit.
- Related WCAG: 1.3.3 (Sensory Characteristics) — error indication should not rely on a single visual cue alone, especially when that cue is occluded.

## Environment

| Field | Value |
|-------|-------|
| URL | https://vcst-qa-storefront.govirto.com/cart |
| Build (theme) | `vc-theme-b2b-vue-2.49.0-pr-2292-f131-f131d346` (PR #2292 deployed; head SHA `f131d346`) |
| Platform | 3.1026.0 |
| Browser | Chrome DevTools MCP (chromium); emulated mobile (`375x900x2,mobile,touch`) |
| Locale / Theme | en-US / Coffee (default) |
| Account | `USER_EMAIL` from `.env` (personal account, cart includes ≥ 1 disabled / unavailable product such as Capri-Sun or SHOT) |
| Date | 2026-05-18 |

## Summary

At the 375 px viewport on `/cart`, the **save-for-later bookmark button** (`[data-test-id="save-for-later-button"]`) on a line item for a disabled / unavailable product is rendered overlapping the red `.vc-alert--danger` "**The product is no longer available for purchase**" banner. The bookmark sits inside `.vc-line-item__img-container` (below the product image), and the container overflows downward into the sibling `.vc-line-item__after` zone where the alert is rendered — covering 32 × 16 px of the alert, including the alert's danger SVG icon.

Root cause is **same-flex-column sibling overlap from `overflow:visible`**, not z-index ordering. Both elements live in the same `.vc-line-item` flex column; `.vc-line-item__main` has `height: 80px` which counts the 64 px product image only and leaves no room for the 40 px-tall `.cart-item-actions` block below it. The result: 24 px of the actions block overflow into `__after`, and the bookmark button (32 × 32 px) ends up directly on top of the alert's icon.

This was caught only by a follow-up visual review during F-CART-006 — the initial `/qa-design` invariant snippets (CLS, spacing, overflow, touch-targets) all measured a numeric metric without flagging this overlap. The methodology gap is now closed by the new `occlusionAuditSnippet` shipped in `scripts/lib/measure-layout.ts`.

## Reproduction Results

### Bounding rects + computed positioning (Chrome DevTools MCP, 375 × 900)

| Element | Selector | top | left | right | bottom | w × h |
|---------|----------|----:|-----:|------:|-------:|------:|
| Alert | `.vc-alert--outline-dark--danger` (descendant of `.vc-line-item__after > .flex.flex-col.gap-1`) | 332 | 36 | 339 | 362 | 303 × 30 |
| Bookmark | `[data-test-id="save-for-later-button"]` (descendant of `.vc-line-item__main > .vc-line-item__img-container > .vc-line-item__img-actions > .cart-item-actions`) | 316 | 36 | 68 | 348 | 32 × 32 |

**Overlap zone:** `left:36–68, top:332–348` — exactly 32 × 16 px. The overlap zone contains the alert's `.vc-alert__icon` (danger SVG), which is the most visually salient part of the warning.

### Computed style

| Property | Alert | Bookmark |
|----------|-------|----------|
| `position` | `static` | `relative` |
| `z-index` | `auto` | `auto` |
| `display` | `flex` | `inline-block` |
| `overflow` | `visible` | (inherited) |
| Container `.cart-item-actions` | — | `position: static, display: block, z-index: auto, overflow: visible` |

**No z-index manipulation involved.** The overlap is pure normal-flow positioning — `__img-actions` (40 px tall) renders below the 64 px product image, and the parent `__main` reserves only 80 px height (64 image + 16 padding ≈ 80, no room for the 40 px actions block). The remaining 24 px of `__img-actions` physically extends into `__after`.

### DOM hierarchy

```
.vc-line-item.vc-line-item--deleted  (flex-column, position:relative, height:144px)
├── .vc-line-item__main  (flex-row, height:80px, bottom:324)
│   └── .vc-line-item__img-container  (height:64px image area)
│       └── .vc-line-item__img-actions  (position:static, overflow:visible, height:40px, top:308, bottom:348)
│           └── .cart-item-actions
│               └── [data-test-id="save-for-later-button"]  ← BOOKMARK (top:316, bottom:348)
└── .vc-line-item__after  (display:block, top:332)
    └── .flex.flex-col.gap-1
        └── .vc-alert.vc-alert--outline-dark--danger  ← ALERT (top:332, bottom:362)
```

The bookmark and the alert are descendants of two different sibling branches of `.vc-line-item`. Because `.vc-line-item__img-actions` has `overflow: visible` and `__main` does not reserve height for it, the actions block visually invades `__after`.

### Programmatic detection

```js
// Run via Chrome DevTools MCP `evaluate_script`:
import { occlusionAuditSnippet } from './scripts/lib/measure-layout.ts';
const result = await browser_evaluate(occlusionAuditSnippet());
// result.overlaps = [
//   {
//     alertTag: '.vc-alert.vc-alert--outline-dark--danger',
//     alertText: 'The product is no longer available for purchase',
//     occluderTag: 'button[data-test-id=save-for-later-button]',
//     occluderRole: null,
//     overlapWidth: 32, overlapHeight: 16, overlapArea: 512,
//     severe: false  // 512 / (303 × 30) = 5.6% — below the 25% severe threshold
//   }
// ]
```

## Steps to Reproduce

1. Open Chromium (Playwright MCP or Chrome DevTools MCP), emulate mobile viewport `375 × 900` with `deviceScaleFactor: 2`, `mobile: true`, `touch: true`. Locale `en-US`. Theme Coffee.
2. Sign in to `${FRONT_URL}` as `USER_EMAIL` from `.env` (uses default test account with disabled item in cart). Alternatively: any account whose `/cart` contains at least one product whose inventory status is `Disabled` or whose `availability !== "InStock"` — Capri-Sun and SHOT in the QA seed both qualify.
3. Navigate to `${FRONT_URL}/cart`.
4. Locate the first line item belonging to a disabled product. The red banner "The product is no longer available for purchase" renders within `.vc-line-item__after`.
5. Visually inspect the leftmost end of the banner. **Result:** the danger triangle / cross icon is hidden behind the save-for-later bookmark button.
6. Confirm programmatically:
   ```js
   const alert = document.querySelector('.vc-line-item .vc-alert--danger');
   const icon  = document.querySelector('.vc-line-item [data-test-id="save-for-later-button"]');
   const a = alert.getBoundingClientRect();
   const b = icon.getBoundingClientRect();
   const overlaps = a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
   const overlapArea = (Math.min(a.right, b.right) - Math.max(a.left, b.left))
                     * (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
   console.log({ overlaps, overlapArea });
   // Expected: { overlaps: true, overlapArea: ~512 }
   ```

## Expected Behavior

The save-for-later bookmark button and the "product no longer available" alert MUST NOT visually overlap. The alert — including its leading danger icon — should be fully visible at every viewport so the user understands why the item cannot be ordered.

## Actual Behavior

At 375 px, the bookmark button (32 × 32 px) overlaps the leftmost 32 × 16 px of the alert rect — covering the danger SVG icon and 32 px of the alert's leading edge. The alert text body remains visible to the right of the bookmark, but the visual hierarchy is broken and the warning is easy to miss.

## Impact

- **User impact:** Mobile users scanning their cart will see only the alert text (partially visible). The missing danger icon removes the strongest visual indicator that an action is required. Users may attempt to "Place Order" and only then discover that an item is unavailable — friction in the revenue path.
- **Accessibility:** Users with cognitive or visual processing differences rely on the redundant icon-plus-text pattern; covering the icon weakens that redundancy.
- **Trust:** A cart that looks like it has unread information on it but cannot be tapped to dismiss erodes confidence.

## Root Cause

`.vc-line-item__main` has `height: 80px` calibrated for `image (64 px) + 16 px padding`. The `.vc-line-item__img-actions` block (40 px tall, contains the save-for-later button) is positioned below the product image inside `__img-container`. With `overflow: visible` propagating through the ancestor chain, the actions block extends 24 px past the bottom of `__main` and into the `__after` zone where alerts render. No z-index is set on either element — this is normal-flow paint order, not stacking-context manipulation.

## Suggested Fix

**Preferred** — move `[data-test-id="save-for-later-button"]` out of `.vc-line-item__img-container` and into the `.vc-line-item__main` controls row, adjacent to the remove `×` button. This eliminates the overflowing `__img-actions` subtree entirely and keeps all per-line controls in a single horizontal row aligned with the rest of the layout.

**Alternative** — set `min-height: 104px` (or equivalent token) on `.vc-line-item__main` so the flex column reserves space for `image (64) + img-actions (40) = 104 px`. This pushes `__after` clear of the actions block.

**Reject** — raising the alert's `z-index` above the bookmark's. This patches paint order but leaves the layout collision intact; any future element inserted between them in the stacking context would reintroduce the bug. The collision must be fixed at the layout level, not the paint level.

## Evidence

- `tests/Sprint-current/qa-design/cart-mobile-2026-05-18/storefront/375/BL-UI-OCCLUSION-375px-save-for-later-covers-alert-FAIL.png` (204 KB) — overlap visible, danger icon fully occluded
- `tests/Sprint-current/qa-design/cart-mobile-2026-05-18/storefront/375/BL-UI-OCCLUSION-375px-enabled-line-baseline.png` (171 KB) — enabled line for comparison; bookmark sits cleanly below the image with no alert collision
- Full `/qa-design` report: `tests/Sprint-current/qa-design/cart-mobile-2026-05-18/report.md`

## Affected Surfaces

- `/cart` at 375 px viewport — confirmed
- `/cart` at 768 px viewport — likely affected (sibling-overflow layout doesn't change at the tablet breakpoint); verification recommended
- `/cart` at 1280 px — sibling overflow likely resolved because the cart switches to a wider grid layout where the actions block has horizontal room; verification recommended

Same defect mechanism is plausible on any other page that renders `.vc-line-item` with `vc-alert--danger` siblings — e.g., the future "Saved for later" detail view if it adopts the same component structure. The fix at the `.vc-line-item` component level will close all surfaces simultaneously.

## Methodology note — why the original /qa-design audit missed this

This bug was not caught by the BL-UI-001..006 snippet sweep on the same build. The snippets measure CLS, spacing-grid compliance, overflow:hidden clipping, alignment, and touch-target size. None of them check for **rect intersection between sibling elements** — the defect produces zero numeric anomaly on the existing measurements.

The methodology gap is now closed by:
- `scripts/lib/measure-layout.ts` → new `occlusionAuditSnippet()` + `classifyOcclusion()` (shipped 2026-05-18)
- `PROPOSED-BL-UI-007` invariant draft at `tests/Sprint-current/proposed-invariants/`
- `.claude/skills/testing/qa-design/SKILL.md` — new State-Stress Pass + Visual-Review Screenshot Pass methodology sections

Future `/qa-design` runs on pages that can render `.vc-alert--danger` (cart, account, checkout) will now auto-detect this defect class.

## Related

- **F-CART-006** (this finding, originally documented under the broader cart audit) — `tests/Sprint-current/qa-design/cart-mobile-2026-05-18/report.md` Finding 6
- **F-CART-001..005** (same /qa-design run, separate defects on /cart) — same report; CLS P0, off-grid spacing, title overflow, touch-target undersizing, touch-target gaps
- **VCST-5110** (different page, similar defect family: skeleton-to-content snap on /account/lists) — different mechanism but same theme: layout reservation is the underlying gap
- **BUG-Cart-SFL-002** — `BUG-Cart-SaveForLater-Overflows-Card-Unchecked-Unavailable.md` — same root mechanism (`__img-actions` not reserved by `__main`), different state (unchecked + deleted). When the row is unchecked, the alert is no longer rendered, `__after` collapses, the card shrinks to 90 px, and the same overflowing actions block now escapes the card bottom by 27 px instead of overlapping the alert. The "Preferred fix" in this report (move the bookmark into `__main`'s controls row) closes both reports.
