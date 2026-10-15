# Testing checklist — VCST-5817 `[Search] Search input travels 115px horizontally when the category-scope indicator changes`

- **Path:** FULL · `feature-test` · Story (bug-shaped) · shape class: not `ui-kit` (fail-closed) · Test Model: `reports/ba/test-models/VCST-5817-2026-10-09.md` (+ Round 1, 3x amendments)
- **Build:** local storefront `{{FRONT_URL}}` = `http://localhost`, theme `2.60.0-pr-2522-6f90-6f902c9e` (vc-frontend#2522 head `6f902c9e`), API proxied to vcst-qa; store B2B-store; anonymous
- **Data:** `data_surface: false` — live-discovered categories (anonymous catalog): breadcrumb pairs with divergent label widths — *Laser Monochrome → Laser Printers* (old longer), *Lg → Televisions* (old < 5rem), *UX/UI Design courses → Courses and audio books* (long); a product card, `/cart`, home logo. `/category/<id>` V4 = **FIXTURE-GAP** (footer GUIDs not in B2B-store)
- **Method (all geometry rows):** observers installed BEFORE each real click — MutationObserver on `.search-bar .vc-input__decorator` + `PerformanceObserver('layout-shift')`, recording input left/top, slot children (chip/loader, width, label, aria), nav/divider left, placeholder. Screenshots alone are not evidence (VCST-5276)
- **Discovery:** `reports/exploratory/SBTM-VCST-5817-2026-10-09.md` (3x observations are discovery, not verdict evidence — re-executed below)
- **Regression:** C1 = new SRCH Draft rows + 2a REPAIR/RE-BASE ids (SRCH-011/012/013 candidates) · Feature Release Gate: `not-assessed` (no C2 on /qa-test)

Legend: Track `4a` = qa-frontend-expert (playwright-chrome) · `4v` = ui-ux-expert (Chrome DevTools) · Verdict filled at 5-report.

## A. Done-when (ticket Expected + Suggested fix, decomposed at 1d)

| # | Condition | How | Track | Verdict |
|---|---|---|---|---|
| A1 | **AC-3** The scope slot never collapses to 0 px between the breadcrumb click and the new chip (V1, all three pairs) | min slot width from the timeline | 4a | PASS — min slot 126.25 / 80 / 167.95 px (P1/P2/P3); journey + history ≥ 94.89 px; never 0 |
| A2 | **AC-1 (loader phase)** Search input `left` and `top` Δ = 0 for the whole chip → loader phase | timeline, per pair | 4a | PASS — input Δleft = Δtop = 0 for the whole loader phase (~1.2–1.3 s) on every pair, journey, Back, Forward, rapid |
| A3 | **AC-1 (swap) / limit a** Input Δ at loader → new chip = 0 {BL-UI-003}. PR declares a residual = label-width difference; record the Δ per pair + the layout-shift value. A non-zero Δ is a **finding** routed to a PO tolerance decision — never re-based to the measured value | timeline, per pair | 4a | **FAIL** vs BL-UI-003 — Δ at loader→chip −28.74 / +30.04 / +16.00 px, journey ±31.36; long label (128-char live category) at 1920 **−354.97 px** (layout-shift 0.11659, INPUT source); at 1024 the bar edge +11.4 px and header icons −15.5 px. PR-declared limit (a) — routed to PO tolerance decision, not re-based |
| A4 | **AC-4** Loader and chip share a computed `min-width` of 5rem | computed style | 4a | PASS — computed min-width 80 px (5rem) on loader and chip in every sample; 4v token parity identical |
| A5 | **AC-2 (DRIFT)** Loader width equals the LEAVING chip's width (impl reserves the previous label, not the resolved one) — record, report as AC-2 drift | timeline widths | 4a | DRIFT confirmed (AC-2) — loader width always = LEAVING chip width (154.99/80/167.95/94.89/126.25/704.11 px) |
| A6 | **AC-5** `ul.mega-menu__nav` / `.mega-menu__divider` left constant across SPA category transitions (first-load popover narrowing tracked separately, B12) | timeline | 4a | PASS — nav 186.99 / divider 169.99 constant across all SPA transitions (1920); 158.99/141.99 at 1024 |
| A7 | Original repro re-run: child → breadcrumb parent, input excursion ≪ 115.43 px and no 0-px state | timeline | 4a | PASS (typical labels) — max excursion 28.74 px (31.36 journey) ≪ 115.43, no 0-px state; long-label exception under A3 |

## B. Gap conditions (1d gap-ACs + model + 3x)

| # | Condition | How | Track | Verdict |
|---|---|---|---|---|
| B1 | [JOURNEY] `/printers` → sidebar *Laser Printers* → breadcrumb *Printers* → type keyword + Enter → results scoped to the category the chip names {BL-SRCH-004}{DOC} | full journey | 4a | PASS — /printers?q=laser, "Search for laser in Printers", 11 results all under /printers (unscoped = 19) — 4a-B1-scoped-search-printers.png |
| B2 | Back then Forward between two categories: slot > 0 every frame; settled chip = page h1 | history | 4a | PASS — slot ≥ 126.25 px every frame; chip = h1 both ways (Δ ±28.74 at swap, = A3) |
| B3 | Breadcrumb + Back + Forward within ~400 ms: loader terminates, single chip = h1, no `isScopePending` left (no stuck spinner after 3 s) | rapid history | 4a | PASS — breadcrumb+Back+Forward in 403 ms; loader ends ~1.5 s; one chip = h1; 0 aria-busy |
| B4 | Category → product: loader with OLD label shown for N ms, placeholder generic, then slot collapses; never stuck — record N (limit b, {HYPOTHESIS} → PO) | timeline | 4a | PASS (limit b) — stale loader with OLD label ~584 ms, placeholder "Search", then collapse (input −98.89); never stuck → PO |
| B5 | Category → home (logo): as B4 | timeline | 4a | PASS (limit b) — ~690 ms, then collapse → PO |
| B6 | Category → `/cart`: no loader left behind, slot empty, generic placeholder | timeline + 3 s later | 4a | PASS — loader ~11 ms then empty; 3 s later 0 children, generic placeholder, 0 busy |
| B7 | Submit while pending (GraphQL delayed): the search is **never** scoped to the category the bar no longer shows; record whether it is global or new-category scoped ({DOC} chip = current scope; global vs new → PO) | route-delay + Enter | 4a | PASS (never old-category) — submit while pending → /search?q=laser global (store-catalog filter, 19 results); global vs new-category → PO. Exposed URL-rewrite bug (see findings) |
| B8 | Placeholder generic ("Search") throughout the pending window, "Search within <B>" after settle (= SRCH-012) | timeline placeholder | 4a | PASS — "Search" throughout pending; "Search within <B>" in the same frame the chip mounts |
| B9 | Chip removal clears the scope, generic placeholder, results unscoped on submit (= SRCH-013) | click chip | 4a | PASS — chip click clears scope; generic placeholder; submit unscoped (19 results) |
| B10 | Focus after chip removal stays in the search bar (WCAG 2.4.3, BL-A11Y-001) — 3x saw `activeElement` = BODY; check against `dev`-equivalent behaviour to classify PRE-EXISTING | `document.activeElement` | 4a | **FAIL** (PRE-EXISTING per A/B control, filed VCST-6254) — activeElement = BODY after chip removal, mouse and keyboard; handler untouched by PR |
| B11 | First entry home → category: slot grows 0 → 80 → chip (limit c) — record Δ; PRE-EXISTING residual, not this PR's regression | timeline | 4a | **FAIL** (PRE-EXISTING, PR limit c) — first entry +84 then +14.89 px (layout-shift 0.234 with footer) |
| B12 | First page load: "All products" popover 134→122 px shifts nav 12 px — record as PRE-EXISTING, separate from the slot | first-load layout-shift | 4a | **FAIL** (PRE-EXISTING, not in diff) — first load "All products" popover 134→122, nav 198.2→186.2 (LS 0.00014) |
| B13 | Category JS chunk aborted: loader released ≤ ~1 s, slot collapses, error toast shown | route abort | 4a | PASS — loader released 667 ms after chunk abort; toast "Part of the site could not be loaded…" — 4a-B13-chunk-abort.png |
| B14 | In-store `/category/<id>` → redirects to slug; slot never 0 | direct URL | 4a | PASS — in-store /category/<id> → slug redirect, loader 80 → chip 80, input constant 199.9 |
| B15 | 375 px: mobile search panel shows no scope chip; mobile submit unscoped — record (parity, PO question; slot rows N/A on mobile) | mobile | 4a | ADVISORY (parity → PO) — 375 px mobile panel has no scope chip; submit unscoped |
| B16 | Long labels at 1024 + 1920: chip/loader contained in the bar, input remains usable (≥ 200 px), no document horizontal scroll {BL-UI-004} | box metrics | 4a / 4v | PASS (note) — 1920 chip 704 px, input 624 px, no doc scroll; 1024 chip wraps 3 lines (45.2 px in a 44 px bar, ~0.6 px over), input ≥ 217 px; 4v: contained, no horizontal scroll |
| B17 | Loader a11y: name "Loading search context", disabled, `aria-busy=true`; invisible previous label does not create a duplicate/garbled accessible name; `de` locale shows no raw i18n key | a11y tree + axe | 4v | PASS (4v) — name "Loading search context", disabled, aria-busy; hidden label not in name; axe 0 violations both states; de translated ("Suchkontext wird geladen") |
| B18 | Dark mode: loader/chip contrast ≥ 3:1 (non-text) / text 4.5:1, no flash {BL-A11Y-003} | DevTools | 4v | PASS (4v) — dark: chip/loader tokens identical, text/spinner 7.22:1; no flash captured |
| B19 | Console: no new JS errors; network: no 4xx/5xx on localhost `/graphql`, no `errors[]` inside 200 during transitions | console/network | 4a | PASS — GraphQL 200 no errors[], no localhost 4xx/5xx, no pageerror; console = external image 404 / env noise |

## C. Uncovered (stated, not silently omitted)

- **V4 `/category/<id>` → `/category/<id>` (model #5)** — FIXTURE-GAP: the footer "Popular categories" GUIDs do not resolve in B2B-store; the header menu uses slugs only.
- **Footer removed during the matcher loader (layout-shift 0.213)** — outside this ticket's surface; recorded as a risk.
- **ECL** — no `srch` section exists in the library; no edge-case pattern applied.

## D. Findings outside the A/B rows (4a / 3x / 4v)

| # | Finding | Source | Verdict |
|---|---|---|---|
| D1 | Leaving a category before GetCategory returns rewrites the URL to that category while another page (cart / global search) stays rendered; reload gives different results (11 vs 19). category.vue updateLocalizedUrl after await, no cancel guard (same line on dev); PR pending window makes it easy to hit (breadcrumb, then Cart within ~0.5 s) | 4a | **FAIL** — filed VCST-6253 (Medium, PRE-EXISTING per A/B) — 4a-BUG-stale-category-url-rewrite-cart.png |
| D2 | Mobile search backdrop button aria-label is the raw key "common.labels.close" (375 px) | 4a | KNOWN_ISSUE — VCST-6097 (dismissed at triage) |
| D3 | Every category arrival sends GetCategory twice | 4a | ADVISORY — perf (Low), provenance unknown |
| D4 | Placeholder / accessible name changes three times per navigation ("Search within A" → "Search" → "Search within B") | 4v O-2 | Advisory (Low) |
| D5 | Footer removed during the matcher loader (layout-shift 0.213–0.292) | 3x / 4a | WAIVED — outside this ticket surface (recorded risk) |

## E. Evidence for PASS rows without a screenshot

Geometry rows (A1, A2, A4, A6, B2–B6, B8, B9) were measured by the 4a observer timeline (console/snapshots under `test-results/chrome/`) and re-executed by C1 `REG-2026-10-09-1616` (`suite-004-cases.jsonl`, `traces/`, SRCH-011/012/024/026–029). SRCH-031 (≈ B7) passed only on the third attempt with an unverified {DOC} assertion — treat as not reliably passed until its mechanic fix (delay `GetCategory`) is applied. Bugs filed: VCST-6253, VCST-6254. Verdict: **FAIL** (release gate NO-GO, ratified).

## R2. Round 2 — developer comment 111893 re-verified (2026-10-12)

- **Build:** `2.60.0-pr-2522-ca9d-ca9de11f` (vs Round 1 `6f902c9e`: merge of `dev` only — the fix files are unchanged) · **Control:** vcst-qa-storefront `2.60.0-pr-2523-4263-4263715a` (no #2522 scope loader; dev-equivalent for this area) · Track: qa-frontend-expert, playwright-chrome
- **Method:** MutationObserver + per-rAF painted-frame sampler + `PerformanceObserver('layout-shift')`, real clicks, 3 reps per pair

| # | Developer claim | Verdict | Measured (TEST vs CONTROL) |
|---|---|---|---|
| R2-1a | Loader → chip swap moves the input 0 px; residual is a content change | **CONFIRMED** (mechanism) | Input moves at the loader's label-text mutation; chip mounts 1.1–3.5 ms later with Δ0; loader-at-new-width never painted (13/13 same frame). Single visible jump = label-width diff: −28.74 / −31.36 / +30.04, −354.97 (128-char). LS 0.002–0.004. Control: 3 jumps (−130.25, +84, +Δ), LS 0.179–0.234 |
| R2-1b | At 1024 the header icons keep position | **CONFIRMED** | Compare/Lists/Orders/Cart fixed; only the Bulk order label wraps (box 677.9→705.5). Identical on control → PRE-EXISTING. Corrects Round-1 A3 "icons −15.5 px" |
| R2-2 | Leaving a category: old loader until slug resolves; final change same as dev | **CONFIRMED** | Final Δ −130.25 on both; loader ~0.58 s (product), ~0.56–0.64 s (home — not ~1.2 s) |
| R2-3 | Submit while pending is global, as on dev | **CONFIRMED** (pre-existing) | `/search?q=laser`, 18 results on both; VCST-6253 URL rewrite on both |
| R2-4 | No scope chip in mobile search, as on dev | **CONFIRMED** (pre-existing) | 375 px: no chip, global submit on both |

**Round 2 verdict: PASS on the ticket's filed scope** — the slot never collapses and the three-jump transition is gone. A3 is re-classified from FAIL to **PO decision**: the remaining single jump is a category-name width change that cannot be reserved before the next category loads. BL-UI-003 is INFERRED / SUSPECT with no human source, so it does not by itself carry a FAIL here. Open for PO: (1) is the label-width jump acceptable; (2) chip `max-width` for long names (−355 px, unbounded). Evidence: `screenshots/r2-*.png`.
