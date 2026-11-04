# Design report — VCST-6158 · visual lane 4v · vcst · 2026-11-03

Lane playwright-edge, fresh contexts (rep, then buyer). Build: SalesRep 3.1017.0-pr-30-1e10, theme 2.62.0-pr-2596-e749b47f. Theme as served (Coffee, light); the Red preset and dark mode were not run. Instruments: PROBE (spacing / overflow / touch / contrast / non-text contrast), axe-core 4.x (wcag2a/aa/21/22aa + best-practice), a real Tab walk, computed geometry. Screenshots: `screenshots/4v-*.png`.
No pre-change render exists in this repo. "Unchanged" below means "matches what PR #2596 declares", not a before/after diff.

## Axis verdicts
| Axis | Verdict |
|---|---|
| BL-UI invariants | PASS with one Low finding (V-1, skeleton height) |
| a11y (BL-A11Y-001..004, axe, keyboard) | PASS; 2 advisories (V-2, V-3). No axe violations on any of the four surfaces |
| vs. DESIGN | SKIPPED: the ticket names no Claude Design prototype, only a mockup PNG with the filters, badges and "Apply to cart" removed by the assignee comment |

## Target matrix (375 / 768 / 1024 / 1280 / 1536 / 1920 as noted)
| Target | Result |
|---|---|
| 1 Rep widget, compact card | Card container-query switch proven on the card width: viewport 1024 gives a 675 px card = 12-col grid; viewport 1280 gives 519 px = stacked; viewport 1920 gives 722 px = grid; 768 gives 435 = stacked. Threshold 672 px (containers.2xl). Compact card has no shadow class (`vc-widget--no-shadow`), shows description at every width, uses line present. No document scroll at any width. Long code NOT REACHED (below) |
| 2 Rep page, regular card + pager | 10 cards/page, pager 1-2-3. Description hidden below lg, uses line kept (as declared). Shadow on. Long code (46 chars) wraps inside its button, button 135x140 at 1280 and 314x80 at 375, `scrollWidth == clientWidth`, no document scroll |
| 3 Buyer `/account/coupons`, same host card | Regular layout as declared: 3-col grid at 375/768 (description box `display:none`, no uses line), 12-col from lg, code col-span-2 (description col-span-3, 4 at 2xl), description line-clamp-4 with ellipsis, shadow on, `overflow-wrap:anywhere` on the code. Long code wraps with no overflow at 375/768/1024/1280/1536. 16 cards, axe clean at 1280 and 1536 |
| 4 Cart sidebar "Discount & coupons" | Renders 5 preset coupons + custom code + "View all" at 1280 and 375, no overflow. Not touched by #2596 (it uses `coupon-card`, not `coupon-item`). Long code not shown (sidebar lists 5; applying it would write to the buyer cart) |

## Checklist rows
| Row | Verdict | Evidence |
|---|---|---|
| C-30 loading | PASS with V-1 | 5 skeleton cards (519x232) with the title visible; the `role=status` region is empty while loading, no `aria-busy`. Delayed the request by 9 s |
| C-30 error | PASS | "Couldn't load coupons" shown (illustration + text) and set in the existing `p[role=status][aria-live=polite]`. Request aborted in the lane. `4v-1-rep-widget-error-state-1280.png` |
| C-30 empty | PASS | "No coupons available" (tag icon), same live region updated. Response emptied in the lane. `4v-1-rep-widget-empty-state-1280.png` |
| C-32 keyboard | PASS | Tab order: customer link, "All promotion coupons", 5 copy buttons in DOM order, "Edit layout". Each shows `:focus-visible` 2 px solid rgb(59,130,246) (3.68:1 on white). Names: "<CODE> Click to copy", distinct per card, so BL-A11Y-002 holds. Copy buttons 280x60 at 375 (target-size PASS, BL-UI-006). Pager buttons 32x32 |
| C-33 | PASS (page) / NOT REACHED (widget long code) | Container-width switch proven above. Long code wraps on the PAGE at 375 and 1280. On the WIDGET the 46-char code is not among the 5 shown (it has no end date, so it sorts last); the max-rows setting gives no live preview and showing it needs "Save layout", which was forbidden. The widget's code button is 280-485 px wide, wider than the page's, so the same rule is expected to hold, but it was not observed |
| C-34 | PASS vs declared behaviour (no before-image) | Table above |
| C-35 | PASS | 375 and 1280, plus 768/1024/1536 |

## Findings
| ID | Sev | Invariant | Finding | Evidence |
|---|---|---|---|---|
| V-1 | Low | BL-UI-003 (skeleton to content swap) | Widget skeleton is 1297 px tall, loaded content 1253 px (Δ −44 px). Skeleton cards are a fixed 232 px, real cards 234/234/216/216/216 (they assume a 2-line description). PR text says the placeholder should match so the card "doesn't jump". Only the "Edit layout" button and footer move, since the widget is the last block | `4v-1-rep-widget-skeleton-1280.png` |
| V-2 | Advisory | WCAG 4.1.2 (axe incomplete `aria-prohibited-attr`) | `div.vc-widget__slot` carries `aria-labelledby` and no role, in the shared VcWidget. Needs manual review, not a violation. Not specific to this ticket | axe |
| V-3 | Advisory | WCAG 4.1.3 | While loading, nothing is announced (the status region stays empty, no `aria-busy`); the outcome (empty / error) is announced, and the visible message plus the sr-only status duplicate the text | DOM |
| V-4 | Advisory (needs a before-image) | BL-UI-004 / readability | At lg to xl widths the regular card's code column is 99-135 px, so normal 15-19 character codes break mid-word, e.g. "AGENTTE/STSRCAP/1" at 1024. The column width is not changed by #2596; `overflow-wrap:anywhere` and `break-words` give the same result in a fixed track, so this is probably unchanged. Not confirmed | `4v-3-buyer-coupons-1024.png` |

Incidental (out of scope, not filed): header notification badge "10" wraps to "1 / 0" at 375 (buyer and rep); breadcrumb and footer links are under 24 px at 375/768, with the site footer links 18 px high (pre-existing, WCAG 2.5.8 spacing exception unverified); axe `heading-order` (moderate) in the cart sidebar.

## Tool noise, not defects
- `spacingAudit` "off-grid" `-1px`, `-18px`, `-10px` margins: the grid set holds no negative values; the magnitudes are scale steps (sr-only 1 px, 4.5 = 18 px, 2.5 = 10 px).
- `nonTextContrast` 1.15:1 on `svg.vc-container__bg` (decorative page background, not on the coupon surface). `alignmentAudit` "misaligned" on the vertical card list: not a horizontal group, N/A.
- Image `ERR_NAME_NOT_RESOLVED` console errors (starmarket host) are unrelated stand data.

## Method notes and disclosures
- The measurement scripts (the vc-test snippets, plus axe-core copied from `.fix-workspace/vc-frontend-dev/node_modules`) were loaded as `<script>` tags from a temporary localhost server in the scratchpad; the server was stopped and the files deleted.
- For C-30 only, `browser_run_code_unsafe` was used with the hook's `@exploratory` marker to delay/abort/empty the `salesRepCoupons` response (observe only, routes cleared afterwards). All other steps were real-user actions.
- Rep layout NOT saved: "Edit layout", max rows typed 20, then "Cancel". The widget still showed 5 rows on every later load.
- A `data-4v` attribute was set on the cart coupons container as a selector hook (reload clears it).
- The 3x note "rep card at 375 is compact (no description)" does not match what this lane saw: the compact widget card shows its description at 375, and the page's regular card hides it. The 3x observation probably came from the page card.
- Not covered: Red preset, dark theme, screen-reader output, WCAG 2.4.11/2.5.7/3.2.6/3.3.7/3.3.8 (a clean axe says nothing about them), the copy action and clipboard (4a-FE), de-DE.
