# The catalog's results count never wraps or truncates, so twice-as-long text scrolls the page sideways at 320 px — **P3**

## Status: CONFIRMED (live: layout-runner `LAYOUT-STR-001`, run P5B-STAND-LAYOUT-STR, vcst 2026-10-27)
**Found by:** agent, authoring the 048c stress matrix for VCST-6534 (visual regression, Phase 5b)
**Tracker:** not filed. Low; it shows only under the text-expansion stress, not with today's translations.
**Archetype:** `RENDER` · **Provenance:** PRE-EXISTING (storefront theme). **kb:** KB-06A3A50F (suspected defect).

**Env:** vcst (`{{FRONT_URL}}`) · theme `2.61.0-pr-2577` (footer) · Chromium 156 headless · guest.

## STR
1. Open `{{FRONT_URL}}/de/catalog` at a 320×700 viewport.
2. Double every visible text (`[STRESS:TEXT] x2 body`, the long-translation stress).
3. Measure `document.documentElement.scrollWidth`.

## Actual
- `scrollWidth` = **353** (de), **341** (pt), **375** (ru); the viewport is 320.
- The widest element is `sup.category__products-count` beside the "Katalog" H1, computed `white-space: nowrap`,
  no `text-overflow`, so it cannot wrap and widens the document.
- With today's translations it fits: de, pt, ru, el, fi and pl all measure exactly 320 without the stress. el, fi
  and pl also fit under it.

## Expected
The count wraps, truncates with an ellipsis or stays inside its container; the document never scrolls sideways at a
supported width `{BL}` (BL-UI-004 Content boundary).

## Why it matters
The label has no headroom: a longer translation of "results", a customer theme's longer copy or a larger count
format is enough to give every catalog page a horizontal scroll on the narrowest phones.

## Cases holding the expectation
`LAYOUT-STR-001` (suite 048c, Draft, FAILs on vcst today).

## Fix Routing
`VirtoCommerce/vc-frontend` · the category page header (the `category__products-count` element): drop `nowrap` or
let it shrink with an ellipsis.
