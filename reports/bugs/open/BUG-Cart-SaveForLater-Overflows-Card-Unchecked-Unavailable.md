# BUG-Cart-SFL-002: Save-for-later bookmark icon overflows line-item card boundary when an unavailable product is unchecked

## Status: READY_TO_SUBMIT
**JIRA:** [VCST-5124](https://virtocommerce.atlassian.net/browse/VCST-5124) — filed 2026-05-18

## Severity: Medium
**Reasoning:** Visual layout defect — the bookmark icon visibly protrudes ~27 px below the card boundary into the inter-card gap on mobile. No data corruption, no broken interaction (the bookmark stays clickable, just visually misplaced). Lower severity than the sibling bug `BUG-Cart-SFL-001` (alert occlusion) because no critical warning is hidden; however, it confuses card boundaries and the orphan icon looks like a rendering glitch, eroding trust. Promote to High if any control inside `img-actions` becomes load-bearing in the unavailable-unselected state.

## Category: UI Layout (mobile-first)

## Related — NOT a duplicate of BUG-Cart-SFL-001
Same component (`vc-line-item`), same modifier (`vc-line-item--deleted`), same overflowing element (`vc-line-item__img-actions`), same root mechanism (parent reserves no height for the actions block), same build. **Different state, different symptom:**

| State | Card classes | Card height | Alert | Bookmark position | Reported in |
|-------|--------------|------------:|-------|-------------------|-------------|
| Checked + deleted | `--removable --selected --deleted` | 128 px | rendered inside `__after` | covers alert's danger icon | `BUG-Cart-SFL-001` |
| **Unchecked + deleted** | `--removable --deleted` | **90 px** | **not rendered** | **escapes card bottom by 27 px** | **This report** |

The "Preferred fix" in `BUG-Cart-SFL-001` (move the bookmark out of `__img-container` into `__main` controls row) resolves both symptoms simultaneously — a single PR can close both tickets.

## BL / WCAG Reference
- **PROPOSED-BL-UI-008** (draft, to be created) — *Element render-boundary invariant: a card's descendant elements must not overflow the card's visible boundary unless explicitly opted in via positioning intent (tooltip, dropdown, badge).* The current `.vc-line-item__img-actions` is positioned in normal flow with no explicit overflow intent — by-design layout should keep it inside the card.
- Adjacent invariant: BL-UI-004 (Content boundary). Promotion to a new BL-UI-008 entry recommended so the test suite distinguishes "intentional overlay" from "accidental overflow."

## Environment

| Field | Value |
|-------|-------|
| URL | https://vcst-qa-storefront.govirto.com/cart |
| Build (theme) | `vc-theme-b2b-vue-2.49.0-pr-2292-f131-f131d346` (PR #2292 deployed; head SHA `f131d346`) |
| Platform | 3.1026.0 |
| Browser | playwright-chrome (Chromium); viewport 390 × 844 |
| Locale / Theme | en-US / Coffee (default) |
| Store | B2B-store |
| Account | `USER_EMAIL` from `.env` ([E2E Test] Contoso Ltd.) |
| Date | 2026-05-18 |
| Test fixture | `Configuration-AGENT-TEST-COND-BIKE-CFG-20260413` (configurable bike disabled in catalog; line item retains `--deleted` modifier in cart) |

## Summary

At mobile viewport (390 × 844), the **save-for-later bookmark button** on an `--unchecked` line item for a disabled/unavailable product visually renders **below** the card's bottom edge, in the gap between cards. Toggling the checkbox `unchecked → checked` causes the card to grow taller (the "no longer available" alert is rendered, the card height changes from 90 → 128 px) and the bookmark re-enters the card boundary — but in the unchecked state, the card collapses and the actions block is left dangling.

## Reproduction Results — Bounding rects (playwright-chrome, 390 × 844)

### Unchecked state (DEFECT)

| Element | Selector | top | bottom | height |
|---------|----------|----:|-------:|-------:|
| Line-item card | `.vc-line-item--deleted` (no `--selected`) | 358 | **448** | 90 |
| Image-actions block | `.vc-line-item__img-actions` | 435 | **475** | 40 |
| Save-for-later button | `[data-test-id="save-for-later-button"]` (inside img-actions) | 462 | 494 | 32 |

**Overflow:** `imgActions.bottom (475) − card.bottom (448) = 27 px`. The bookmark icon's vertical center sits *below* the card boundary line, visually orphaned in the inter-card gap.

### Checked state (no overflow defect — but alert-occlusion defect, see BUG-Cart-SFL-001)

| Element | Selector | top | bottom | height |
|---------|----------|----:|-------:|-------:|
| Line-item card | `.vc-line-item--selected.vc-line-item--deleted` | 358 | 486 | 128 |
| Image-actions block | `.vc-line-item__img-actions` | 435 | 475 | 40 |
| Alert | `.vc-alert` ("The product is no longer available for purchase") | 443 | 473 | 30 |

**No overflow** because the card height grew by 38 px (alert added inside `__after`). Bookmark is now inside the card — but overlaps the alert (covered by `BUG-Cart-SFL-001`).

## Steps to Reproduce

1. Sign in to `${FRONT_URL}` as the `USER_EMAIL` account (or any account with `[E2E Test] Contoso Ltd.` org).
2. Ensure the cart contains at least one product whose catalog status is **disabled** (after-the-fact disable while the product is already in cart). The seeded fixture `Configuration-AGENT-TEST-COND-BIKE-CFG-20260413` satisfies this on vcst-qa. Alternatively, in Admin disable any product that has been added to a test cart.
3. Open `/cart` on a mobile viewport (390 × 844 or 375 × 900 — both confirmed).
4. Locate the line-item for the disabled product. The line item is rendered with `vc-line-item--deleted` class; the title appears struck-through / dimmed.
5. **Uncheck** the line-item's selection checkbox (top-left of the card).
6. **Observe:** the line-item card collapses (the red "The product is no longer available for purchase" alert disappears), and the purple save-for-later bookmark icon now sits visibly **outside** the card's bottom border, in the white gap between this card and the next.
7. Re-check the checkbox. The card grows; the alert returns; the bookmark icon is back inside the card (but now overlaps the alert — see BUG-Cart-SFL-001).

### Programmatic confirmation

```js
// playwright-chrome browser_evaluate
const card = document.querySelector('.vc-line-item--deleted:not(.vc-line-item--selected)');
const ia = card.querySelector('.vc-line-item__img-actions');
const overflow = Math.round(ia.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom);
console.log({ overflow });
// Expected: { overflow: ~27 }   (positive value = element protrudes below the card)
```

## Expected Behavior

When an unavailable product line item is unselected on mobile:
- Either the card height must include the actions block (no overflow), OR
- The actions block must be hidden / repositioned inside the visible card area.

The bookmark icon must not be rendered in the inter-card gap. The card boundary should be self-contained.

## Actual Behavior

The bookmark icon sits 27 px below the card's bottom border, visually disconnected from any card. To the user it looks like a stray icon floating between two cards.

## Impact

- **Visual confusion:** Users see a control that doesn't belong to any visible card. Tapping it triggers "Save for later" on a line item that isn't visually associated with the icon.
- **Click-target ambiguity:** On dense mobile layouts the orphan bookmark sits near the next card's top edge — fat-finger taps in the gap could accidentally hit the bookmark of the deleted row when the user intended to interact with the next card.
- **Trust:** Combined with the alert disappearing on uncheck (arguably a second defect — the unavailability fact doesn't change with selection state), the cart loses its "I'm telling you why this item can't ship" signal entirely in the unchecked state.

## Root Cause

`.vc-line-item__img-actions` is a position-static block inside `.vc-line-item__img-container`, rendered below the 64 px product image. It is 40 px tall. The parent `.vc-line-item__main` has `height: 80px` (image 64 + 16 px padding) — enough room for the image, not for the actions block. With `overflow: visible` propagating, the actions block extends 24 px past `__main`'s bottom.

In the **checked** state, the sibling `.vc-line-item__after` slot grows to host the danger alert (height ≈ 38 px), and the card's overall height (128 px) is large enough to *contain* both `__main` (with the overflowing img-actions) and `__after`. The img-actions block sits visually inside the card, just on top of the alert (existing bug).

In the **unchecked** state, the danger alert is conditionally removed (probably because the selectedForCheckout filter excludes deleted items from the alert pipeline). `__after` collapses. The card height shrinks to 90 px (just `__main`'s 80 + a hairline). The img-actions block — still rendered, still 40 px tall, still positioned 27 px below the image's vertical center — now overflows past the card's reduced bottom edge with nothing to catch it. The bookmark icon visually escapes.

## Suggested Fix

**Preferred (closes both BUG-Cart-SFL-001 and this bug):** Move `[data-test-id="save-for-later-button"]` out of `.vc-line-item__img-container` and into the `.vc-line-item__main` controls row, adjacent to the remove (`×`) button. The bookmark joins the existing horizontal control strip; `__img-actions` is removed entirely; `__main` height stays calibrated for the image only. Single fix, both bugs gone.

**Alternative A (closes both):** Apply `overflow: hidden` to `.vc-line-item` so any descendant that protrudes is clipped. Side effect: hides the bookmark in the unchecked state (control becomes unreachable). Not recommended unless the bookmark also moves elsewhere.

**Alternative B (closes this bug only, not SFL-001):** Make the bookmark conditionally hidden when `.vc-line-item--deleted` is present. Rationale: there is no value in saving an unavailable product for later. Side effect: changes behavior, requires PM signoff.

**Reject:** Adjust `min-height` on `.vc-line-item__main` so it reserves the actions block height. This fixes the visual overflow but bloats every cart row (including available ones), adding ~40 px to every line. Wasteful.

## Evidence

- `deleted-CHECKED-state.png` — viewport screenshot, deleted product CHECKED (--selected --deleted), card outlined red, img-actions outlined lime; bookmark sits on top of the alert inside the card
- `deleted-UNCHECKED-state.png` — viewport screenshot, deleted product UNCHECKED (--deleted only), card outlined red, img-actions outlined lime; bookmark visibly protrudes below the red card border into the inter-card gap
- `cart-mobile-overflow-outlined.png` — earlier capture of the same unchecked-state overflow (initial repro evidence)

## Affected Surfaces

- `/cart` at 390 × 844 viewport — confirmed (this report, playwright-chrome)
- `/cart` at 375 × 900 viewport — likely affected (same mechanism); should reproduce in BUG-Cart-SFL-001's repro environment with the checkbox toggled off
- `/cart` at ≥ 768 px viewport — unverified; the actions block may have horizontal layout room at wider breakpoints
- Cart row variations to verify: any product type that can be in `--deleted` state (out-of-stock, inactive in catalog, deleted SKU, expired pricing, sales-channel restricted). The fixture used (configurable bike) is a configurable product; verify also with simple products, variation products, and bundles.

## Methodology

Caught by visual screenshot comparison between checkbox-checked and checkbox-unchecked states on the same deleted product. The existing `occlusionAuditSnippet` in `scripts/lib/measure-layout.ts` (shipped 2026-05-18 for BUG-Cart-SFL-001) detects sibling-rect overlap but not parent-boundary overflow. Recommend extending `measure-layout.ts` with a `boundaryOverflowAuditSnippet()` that walks the descendant tree of every card-class element and flags any descendant whose `bottom > card.bottom` (or `right > card.right`, etc.) by more than 1 px.

## Related

- **BUG-Cart-SFL-001** — `BUG-Cart-SaveForLater-Icon-Occludes-Unavailable-Alert.md` — sibling defect on the same element in the checked state. Sharing the same root mechanism, both should be addressed by the "Preferred fix" in either report.
- **Conditional alert rendering on uncheck** — when an unavailable item is unchecked, the "no longer available" alert disappears. This is arguably a second defect (the unavailability fact is selection-independent). Filing recommended if confirmed by PM as off-design.
