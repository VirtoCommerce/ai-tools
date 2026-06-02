# VCST-5100 Frontend Execution Report — Loyalty Catalog Browsing

## RE-TEST 2026-05-27 — build d7bf

**Env:** vcst-qa @ Platform 3.1030.0, Theme **`2.50.0-pr-2296-d7bf-d7bfc020`** (new commit; prior run was `-1a3c-…`), Loyalty `3.1002.0-pr-9` · Store: B2B-store (default USD/en-US, loyalty PTS) · Browser: playwright-chrome (fresh context, cache-busted, build hash verified in footer) · Auth: BMW-Group / Elena Mutykova (Customer-typed)
**Suite:** `regression/suites/Frontend/loyalty/083-loyalty-catalog.csv` (LOYF-001..017)
**Loyalty-setting re-seeded to happy-path before start; restored + verified after each guard case; happy-path verified at end.**

> **Scope note:** Currency-continuity comments fixed in this commit. CSV's "acceptable USD" notes on LOYF-011/012/015 are STALE — expected is now full PTS continuity. Per coordinator: **cart line-item pricing (item 5) and search-in-loyalty (item 6) are OUT OF SCOPE for VCST-5100 (separate stories)** — recorded informationally, excluded from verdict/counts.

**VERDICT: All 5 in-scope fix items (1,2,3,4,7) FIXED/PASS. All 17 cases PASS. Core AC "open products → currency PTS" now MET.**

## Counts

| Result | Count | Cases |
|--------|-------|-------|
| PASS | 17 | LOYF-001..017 |
| FAIL | 0 | — |
| BLOCKED | 0 | — |

## Per-case results
LOYF-001..017 — **all PASS**.
- Route guard (LOYF-001..007, 016): Enable=false→/404; Currency empty→/404; Mode empty→/404; Coupon Redemption→/404; Payment Method→/404; Mixed Cart→opens; Loyalty Store→opens; authenticated+Enable=false→/404. All restored to happy-path, re-verified.
- LOYF-008 i18n: title "QA & Loyalty catalog", breadcrumb + H1 "Loyalty catalog" (no raw keys).
- LOYF-009/010 grid+PTS: 50 cards, prices in PTS (PTS80/150.00), SearchProducts `currencyCode:"PTS"`, `price.PTS:(0 TO)`.
- LOYF-011 links: namespaced (see fix table).
- LOYF-012 PDP: PTS (see fix table).
- LOYF-013 /catalog: USD, no PTS, generic `/product/{id}` links.
- LOYF-014 stock: in-stock badges + real counts (369, 122, 1596…).
- LOYF-015 deep-link: bogus slug→clean 404; real namespaced product deep-link→PDP in PTS (see fix table).
- LOYF-016 auth guard: /404.
- LOYF-017 back-button: loyalty→/catalog→back→loyalty re-renders 16 PTS, 0 USD; no leakage.

## Fix-verification table (in-scope = items 1,2,3,4,7)

| # | Item | PTS/USD | Payload evidence | Verdict |
|---|------|---------|------------------|---------|
| 1 | PDP `GetProduct` → PTS; PDP displays PTS | **PTS** | `GetProduct` `currencyCode:"PTS"` (id 42aae9db); PDP shows **PTS150.00** (was $101.00/USD run 1). Screenshot `RETEST-PDP-PTS-d7bf.png` | **FIXED** |
| 2 | Product card links namespaced | **n/a** | Cards now `/loyalty-catalog/product/{id}` + sidebar cats `/loyalty-catalog/<slug>` (was generic `/product/{id}` run 1). Screenshot `RETEST-loyalty-grid-PTS-d7bf.png` | **FIXED** |
| 3 | Deep-link `/loyalty-catalog/<slug>` resolves to PDP | **PTS** | Typed `/loyalty-catalog/product/962f1531…` → PDP "BACTERIAL FILTER", **PTS80.00**, `GetProduct currencyCode:"PTS"` (was 404 run 1). Screenshot `RETEST-deeplink-PDP-PTS-d7bf.png` | **FIXED** |
| 4 | `GetCategory` → currencyCode PTS | **PTS** (loyalty-scoped call) | Loyalty `GetCategory` (maxLevel:1, `productFilter price.PTS`) now `currencyCode:"PTS"` (was USD run 1). Note: global menu-tree `GetCategory` (maxLevel:4) still USD, but selects only id/name/slug — no price fields, cosmetic. | **FIXED** (loyalty-context query now PTS) |
| 7 | /catalog no-leakage regression guard | **USD** | /catalog SearchProducts `currencyCode:"USD"`, `price.USD:(0 TO)`; grid 0 PTS / all USD; 0 `/loyalty-catalog` links. No over-correction. | **PASS** |

**In-scope verdict: 5 of 5 FIXED/PASS (items 1,2,3,4 FIXED; item 7 regression guard PASS).**

## LOYF-018 — GetCategory passes loyalty currency (dedicated case, build d7bf, 2026-05-27)
**PASS.** NAV /loyalty-catalog (fresh/cache-busted), category sidebar rendered (Accessories, Loyalty products). Two `GetCategory` (childCategories) calls captured:
- Loyalty-scoped (maxLevel:1, `productFilter: category.subtree:fc596540…864a41bf8ab78734ee7353a3 price.PTS:(0 TO)`): **`currencyCode:"PTS"`** — meets MUST.
- Site-wide menu/tree (maxLevel:4, no productFilter): `currencyCode:"USD"` — acceptable per MAY (selects only id/name/slug, no price fields).
Both HTTP 200; loyalty-scoped response `data.childCategories` populated, no `errors[]`; no JS console errors; no 4xx/5xx.
Payload evidence: `GetCategory {maxLevel:1, currencyCode:"PTS", productFilter:"…price.PTS:(0 TO)…"}` vs `GetCategory {maxLevel:4, currencyCode:"USD"}`.

## Out-of-scope observations (informational only — excluded from verdict)
- **Item 5 — cart line item:** Loyalty product added via PDP (+) stepper lands in cart at **$156.00 USD** (listing/PDP showed PTS150.00); cart `GetShortCart currencyCode:"USD"`. **Cart loyalty pricing deferred to a separate story** — not a VCST-5100 failure. Evidence: `RETEST-FAIL-cart-USD-not-PTS-d7bf.png` (retained as record, not counted as fail). Added item removed (cart cleanup verified).
- **Item 6 — search in loyalty-catalog:** Header search from /loyalty-catalog → `/search?q=…` standard results, 28 hits all USD, generic links. **TBD/separate story** — unchanged, excluded.

## Evidence
- `screenshots/RETEST-loyalty-grid-PTS-d7bf.png` — grid in PTS, namespaced links (positive)
- `screenshots/RETEST-PDP-PTS-d7bf.png` — clicked-through PDP in PTS (positive)
- `screenshots/RETEST-deeplink-PDP-PTS-d7bf.png` — direct deep-link PDP in PTS (positive)
- `screenshots/RETEST-FAIL-cart-USD-not-PTS-d7bf.png` — out-of-scope cart-USD record

## Core ACs
- Browse loyalty catalog in PTS: **MET** (50 products, PTS, SearchProducts+GetCategory currencyCode=PTS).
- **Open products → currency PTS: NOW MET** (PDP via click and via direct deep-link both render PTS; GetProduct sends PTS) — the run-1 USD defect is FIXED.
- Revert to standard catalog: **MET** (/catalog USD, no leakage, back-button safe).
- Route guard: **MET** (8/8 guard cases, incl. authenticated).

**Final store state (re-verified): Enable=true, Mode='Mixed Cart', Currency='PTS'.** No stray test debris.
