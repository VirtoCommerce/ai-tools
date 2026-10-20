# Evidence index — VCST-6398 V9 (/compare 390px, tbody scroller keyboard access)

**Env:** TEST_ENV=vcst (vcst_qa), ENV_RISK=test, storefront `{{FRONT_URL}}` · **Build:** footer `Ver. 3.1.0-pr-11-d67b-d67b0e0a` (= vc-frontend-next PR #11 head d67b0e0a) · **Browser:** playwright-firefox, Firefox 151, 390x844, guest · **Run:** 2026-10-20 15:48–15:52 UTC
**Data:** live-discovered via `/search?q=laptop` — 3 products of category Computers & Laptops (AGENT-TEST Gaming Laptop + two AGENT-TEST-SEED Dell Latitude 5540). Compare list cleared (Clear all → OK; "0 of 5 added") at the end.

| # | Artifact | Path | Note |
|---|---|---|---|
| 1 | Initial state 390 light | `screenshots/V9-01-compare-390-initial-light.png` | 3rd column clipped (table 448px in a 364px scroller) |
| 1 | Tbody focused by Tab | `screenshots/V9-02-firefox-tab15-tbody-focused.png` | Firefox default focus outline around the tbody |
| 1 | After ArrowLeft/Right | `screenshots/V9-03-firefox-tbody-arrow-scrolled.png` | body + header scrolled together |
| 2 | AX snapshots per Tab | `screenshots/v9-tab12..15.yml`, `v9-arrowleft.yml`, `v9-arrowright.yml` | `[active]` marks focus; `[box=x,…]` shows column x |
| 2 | DOM attributes (read-only) | inline below | tbody: tabindex attr null, tabIndex −1, role null, overflow-x auto, display block, clientWidth 364 / scrollWidth 448, 11 focusable descendants all hidden (0 rendered); thead: tabindex −1 |
| 3 | Network list | `network/requests.txt` | no 4xx/5xx; storefront-only, no failing request |
| 4–5, 10 | Failing request / trace id / App Insights | n/a | no server-side layer involved (pure markup/CSS) |
| 6 | Console (warnings+) | `console/console.txt` | 0 errors; 3 benign warnings (GA cookie, preload) |
| 7 | HAR | `results/VCST-6398/har/V9-compare-390-firefox.har` | whole Firefox session |
| 12 | Versions | footer above; PR #11 open, base `dev` | |
| 13 | Source | `source/pr11-compare-table.patch` + `root-cause.md` §3 | |

## Keyboard walk (real user, Tab from the page heading)
| Tab | Focus | Column 1 x (header / body) |
|---|---|---|
| 1–5 | Clear all, category tab, All, Differences, Clear category | 125 / 125 |
| 6–11 | col 1 + col 2: Remove, product link, Add to cart | 125 / 125 |
| 12 | col 3 Remove from compare | **41 / 41** — header scrolled 84px, body followed (scroll sync) |
| 13–14 | col 3 link, Add to cart | 41 / 41 |
| 15 | **tbody rowgroup itself** (`activeElement === tbody`) | 41 / 41 |
| ArrowLeft ×2 | tbody | 63 / 63 |
| ArrowRight ×1 | tbody | 73 / 73 |

Result: in Firefox a keyboard user can both reach and scroll the product columns. Dark mode not re-walked: the markup and attributes do not depend on the theme mode.
