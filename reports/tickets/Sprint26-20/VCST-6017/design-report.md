# VCST-6017 — Visual lane (4v): design-system + a11y — vc-frontend PR #2543

Build under test: theme `2.60.0-pr-2543-0127-01276486` on `https://vcst-qa-storefront.govirto.com`. Auth: GUEST. Browser: Chrome DevTools MCP.
Viewports: 1920 (real window) and 390 (`emulate 390x844x2,mobile,touch`). Active theme primary-500 = `#f99e24` (preset name not exposed; not Red).
Evidence: `screenshots/4v-*.png` (12 files). Scripts: axe-core 4.10.2 (`wcag2a/aa`, `21a/aa`, `22a/aa`), live rect/computed-style measurement, `PerformanceObserver('layout-shift')`, real Tab/Enter.

## vs. DESIGN
`SKIPPED (the ticket carries no Prototype/design link)`. Never a pass.

## Verdict table (layout = design-system axis, a11y = WCAG/axe + keyboard)

| Target | VP | design-system (BL-UI) | a11y (BL-A11Y / WCAG) |
|---|---|---|---|
| 1 lists page | 1920 | FAIL (BL-UI-001) CLS 0.638; PR-touched metrics PASS | FAIL (BL-A11Y-001/002) carousel arrows; axe 0 violations; keyboard PASS |
| 1 lists page | 390 | FAIL (BL-UI-006, literal) title links 16px high; PR-touched metrics PASS; CLS not measured | PASS (axe 0 violations, keyboard layout identical to 1920) |
| 2 home Daily Deals | 1920 | FAIL (BL-UI-001) CLS 0.491, not from products-block; layout PASS | FAIL (BL-A11Y-002) axe `image-alt` critical x6 outside the PR; keyboard PASS |
| 2 home Daily Deals | 390 | PASS layout; BL-UI-006 literal as target 1; CLS not measured | FAIL (BL-A11Y-002) same 6 `image-alt` nodes |
| 3 related anchor | 1920 | FAIL (PROPOSED-BL-UI-007) carousel prev arrow covers first title; CLS 0.087 PASS | FAIL (BL-A11Y-001/002) carousel arrows; axe 0 violations; keyboard PASS |
| 3 related anchor | 390 | PASS layout (2-col grid); BL-UI-006 literal on title (16px) | PASS (axe 0 violations; keyboard PASS incl. row 2, not covered by sticky bar) |
| 4 variations, default view | 1920 | FAIL (BL-UI-001) CLS 0.132 (footer); rows PASS | FAIL (BL-A11Y-003) 2 contrast nodes 2.11:1; keyboard PASS |
| 4 variations, table view | 1920 | PASS layout (50 rows, cols 674/70/128/164) | FAIL (BL-A11Y-002 / WCAG 4.1.2) expand button has no name (axe `button-name` critical) + contrast as above; keyboard PASS |
| 4 variations, default | 390 | PASS (50 rows all 159 px) | FAIL (BL-A11Y-003) same 2 contrast nodes; keyboard PASS |
| 4 variations, table view | 390 | SKIPPED (table/List toggle is not offered below md) | SKIPPED (same) |

KNOWN_DIVERGENCE: none. `incomplete` (manual verification, not failures): `color-contrast` over images (3-4 nodes per page); `aria-prohibited-attr` on `div.vc-widget__slot[aria-labelledby]` (VcWidget).

## PR-focus checks (a)(b) — what the PR actually changed
- (a) No layout regression found. 4-col grid at 1920 (278 px cards, 24 px gap), 2-col at 500, 1-col at 390; carousel slide pitch/width identical across titled and untitled carousels (272 px); per-row card heights equal on every grid (BL-UI-005); title clamp stays 2 lines with `scrollHeight > clientHeight` only where the clamp ellipsis applies; favorites grid 4 cols / 319 px; variations table row heights 62/63 (sub-pixel), default rows 98/99. Zero horizontal overflow outside the emulation artifact below.
- (b) Product links are keyboard-reachable with a visible ring on all four targets: title `a.vc-product-title__text`, `data-vc-track=product-link` on its wrapper, ring `2px solid rgb(27,120,155)`, offset 2 px (about 5:1 on white), `:focus-visible` true. Enter navigated correctly from the lists block (Eyebolt PDP), the related carousel (Birra Moretti PDP) and a variations-table row. Carousel cards expose Prev, Next, Compare, then the title (4 Tab stops, as built).
- `hasImageCarousel` logic: cards with an image carousel (Daily Deals, 3 dots) carry no image-link role; cards without one do. The image `<a class="contents">` is not in the tab order and not in the a11y tree on any card (Tab skipped it, Shift+Tab from Compare landed on breadcrumb Home). Keyboard users lose nothing (the title link has the same target), but a mouse-only click path is what the new `product-link` role on the image would track. Advisory, pre-existing markup.
- Advisory: an untitled `products-carousel` renders `data-list-name=""` (empty attribute, no label for the list).

## Findings (not filed; severity as reported)

**F1 — CLS over threshold on every page that has late CMS/product blocks (BL-UI-001).** Initial-render CLS (buffered observer, 1920): lists 0.638 (P0 band, >= 0.25), home 0.491 (P0 band), variations 0.132 (FAIL), related 0.087 (PASS). Shifting nodes: FOOTER (0.244 / 0.293 / 0.117), `demo-product-list-block` 0.229 and `products-carousel` 0.116 on lists, `features-block` 0.293 + 0.179 on home, `vc-line-items` 0.013 on variations. The two largest sources on home (`features-block`) and on lists (`demo-product-list-block`) are not touched by the PR; the touched wrappers are attribute-only. Attribution: PRE-EXISTING-presumed, pre-PR repro INCONCLUSIVE (see below). CLS at 390 not measured.

**F2 — VcCarousel arrows are bare `<div>`s (BL-A11Y-001, BL-A11Y-002; WCAG 2.1.1, 4.1.2).** `div.vc-carousel__btn--prev/--next` have no `role`, `tabindex` or `aria-label` (lists titled carousel, related carousel at >= lg). axe does not flag this. Mouse/touch-only control. Severity High. Whether slides stay reachable by Tab (all slide links are in the DOM) not exercised past slide 1. VcCarousel is not in the PR diff.

**F3 — Carousel prev arrow covers the first card (PROPOSED-BL-UI-007).** Related carousel 1920: prev arrow `div` (259,381,56x56) overlaps the first title (291,425) by 24 x 12 px; the first letter reads "Sirra" instead of "Birra" (`4v-related-1920-title-focus-pr.png`); the focus ring's left edge sits under the arrow. 2.4.11 AA still met (not entirely hidden). Lists titled carousel: overlap 3 x 32 px. Medium.

**F4 — Primary orange fails contrast (BL-A11Y-003; WCAG 1.4.3).** `Filters` (outline-primary) `#f99e24` on `#ffffff` and `View cart` (white on `#f99e24`) both 2.11:1 at 16 px. Serious. Verify against the preset name: if this is Coffee it is a gated-theme failure.

**F5 — Expand icon button has no accessible name (BL-A11Y-002; WCAG 4.1.2).** Variations widget, table view, `button.vc-button--icon` (lucide `expand`, 38 x 38) in `.vc-widget__prepend-append`. axe `button-name` critical. The `variations.vue` hunk of the PR does not touch this button.

**F6 — Home hero slider / benefits images lack `alt` (BL-A11Y-002; WCAG 1.1.1).** axe `image-alt` critical x6 (`.vc-slider__image-wrap`, `.mb-9.h-24.mx-auto`). Not product-list markup.

**F7 — Product title link is 16 px high at 390 (BL-UI-006, literal 24 px floor).** 160 x 16 (related) / 300 x 16 (lists, home). WCAG 2.5.8 itself holds: the 24 px circle centred on each link touches no other target (measured), so AA is met. `VcProductTitle` CSS is not in the PR diff. Low / advisory.

## Attribution — does it reproduce on the pre-PR build?
`https://vcptcore-qa-storefront.govirto.com` (Ver. `2.60.0-pr-2485-f6cd-f6cd22b2`, no `data-vc-track`) redirects a guest on every route (`/`, `/catalog`, `/agent-test-ga4-product-lists`) to `/sign-in?returnUrl=…`. With a guest-only brief there is no equivalent page to measure.

| Finding | Pre-PR repro | Basis |
|---|---|---|
| F1 – F7 | INCONCLUSIVE (pre-PR stand is auth-gated for guests) | None of the failing elements, rules or CSS are in the PR hunks (`pr-2543.diff`: attributes, `v-track-item`, `data-vc-track`, removed `@link-click` and analytics watchers). No finding is attributable to the change; IN-SCOPE = none found. To close the question, rerun F1 and F4-F6 on vcptcore from a signed-in lane. |

## Method notes / limits
- `resize_page` cannot go below a 500 px window (it reported `innerWidth 500` at "390"); all 390 data uses `emulate`. Under emulation `100vw` = 500, so the header measures 500 wide and `scrollWidth` = 500 (headers `skip-to-links`, `ship-to-selector`); that is a harness artifact, not overflow (verified: `clientWidth` 390, no un-clipped element past 390 other than that header).
- Pre-PR comparison, Coffee + Red preset sweep and 768 were out of scope or unreachable; one preset (the deployed one) audited. Screen-reader output not verified.
- Variations table view: the 2 contrast nodes and F5 were checked at 1920 only; the Stock sort button was toggled once by an Enter keypress during the Tab walk (no persistent state).
