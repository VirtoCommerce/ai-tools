# VCST-6145 — Fix verification · [Missions] Redesign polish: 7 small UI and accessibility fixes

**Verdict: VERIFIED WITH NOTES** — all 7 items + the PR's extra "Targets met" fix GREEN 3/3 on the fixed build, all RED on the pre-fix control, same data.
**Date:** 2026-10-13 · **Fix:** vc-frontend PR #2548 (OPEN, not merged), head `6fff28ab`

## Build / environment
| | Fixed (GREEN) | Pre-fix control (RED) |
|---|---|---|
| Storefront | `http://localhost` (frontend-only local container, `/qa-local-env`) | vcst-qa storefront |
| Theme | `2.60.0-pr-2548-6fff-6fff28ab` (footer + `X-VC-Local-Theme: fe-fad95afb73dc`) | `2.60.0-pr-2511-81f1-81f18d01` (no PR #2548) |
| Backend / data | vcst-qa (`/graphql`, `/connect/token` proxied) | vcst-qa |
| Lane | playwright-chrome (Chromium) | playwright-firefox; item 5 re-measured on playwright-edge (Chromium) |

Account `@td(LOY_PERSONAL_NOORG)`, store B2B-store, 31 missions (12/12/7), one Completed ("Target number of orders"). Read-only: nothing added to cart.

## Before → after
| # | Item | RED (pre-fix) | GREEN (fixed) | Runs |
|---|---|---|---|---|
| 1 | Completed check icon | `.mission-card__done` no `aria-hidden`; svg exposed as unnamed `img` | `aria-hidden="true"`; card a11y tree has no `img` node, "Mission completed" text kept | 3/3 |
| 2 | Points chip | card warning-tonal `rgb(255,241,204)/rgb(140,79,0)`; ORDER + SKU modals primary-soft `rgb(251,234,210)/rgb(107,65,40)` | warning-tonal, identical on card, ORDER modal, SKU modal; SKU footer star `text-warning` | 3/3 |
| 3 | Banner crop | `object-fit: cover`, 54.8 % of a 2048×768 artwork visible at 1280 ("chase 5 specific…") | `contain` + blurred backdrop (`blur(16px)`, opacity .6); artwork drawn whole 299×112 at 1280, 231×87 at 768; text readable; failed load → backdrop removed, fallback only | 3/3 |
| 4 | SKU estimate hint | sibling after the summary, 14.75 of 29.6 px visible at the fold (5 targets, qty 150, 1920×1080) | `p.sku-mission-modal__summary-hint` inside the summary under "Cart subtotal", 933–947 vs fold 972 — fully visible; 0 `VcAlert` | 3/3 |
| 5 | Grid loading / CLS (1920×1080, full reload, Chromium) | 0 skeletons, grid 0 px until data; CLS **0.097 / 0.140 / 0.126** | 12 `.mission-card-skeleton` → 12 cards (~600 ms); CLS **0.012 / 0.012 / 0.012**; pagination 12 skeletons each page, CLS 0 | 3/3 |
| 6 | SKU footer order < sm (WCAG 2.4.3) | DOM Close→Add to cart, visual Add to cart on top (`order: 9999` on Close); Tab bottom→top | Close on top (y 702), Add to cart below (y 753), `order: 0`; Tab follows visual order | 3/3 |
| 7 | Completed overlay | `success-400` (#5bae7e) @ 75 % | `success-600` (#3b7754) @ 55 % (alpha on background, opacity 1) | 3/3 |
| 8 | "Targets met" turns green (PR extra) — PerSkuAll mission, both targets raised to 1 in the modal | "2 / 2" `text-success-600` class present but computed rgb(38,38,38) (overridden) | row gets `__summary-row--met`, value rgb(49,97,68) = `success-700` #316144; "1 / 2" stays neutral rgb(38,38,38) | 3/3 (edge) |

Item 7's remaining design deltas (banner 208 vs 210 px, shadow spread, 0.025em tracking) are kept on nearest tokens by the dev's documented decision — not failures.

## Regression (fixed build)
| Check | Result |
|---|---|
| Pagination 1→2→3 (12/12/7, active marker) | PASS |
| "Open mission" opens the right modal (OrderCount → order modal, PerSku → SKU modal) | PASS |
| Close / Esc close the modal; focus returns to the card's "Open mission" | PASS (3× each) |
| Console — no app errors (only the 2 `ERR_FAILED` caused by the deliberate banner abort) | PASS |
| Network — no 4xx/5xx on `/graphql`, `/connect/token` | PASS |
| 375 px missions page — no horizontal overflow (scrollWidth = clientWidth) | PASS |
| Card without a banner — fallback `contain`, aspect kept, no backdrop | PASS |

## Notes (advisory, not filed)
1. **No-banner placeholder is not "smaller":** the fallback icon is drawn at 208×208 (full banner height) and runs under the chips; the PR text says "whole and smaller". Design call.
2. **Skeleton row ~24 px shorter than a real card row** (grid 1630 vs 1726 px); below the fold at 1080, so CLS unaffected — could count on a taller viewport.
3. **Invalid quantity still counts a target as met:** qty 150 over stock 99 (error shown, Add to cart disabled) keeps target 1 green, "Targets met 1 / 5". Likely pre-existing; out of this ticket's scope.
4. **Verified on a local build of the open PR**, not on a deployed QA environment. Re-check after merge + deploy is a smoke, not a re-verification.

## Evidence
Page: `evidence.html` (local, screenshots embedded) · Screenshots: `screenshots/red-*.png`, `screenshots/green-*.png` · HAR: lane config output.
