# Regression Report — REG-2026-05-27-1715

- **Selection:** 083 (loyalty-catalog) · **Mode:** standard · **Browser:** playwright-chrome
- **Env:** vcst-qa @ Platform 3.1030.0, Theme `vc-theme-b2b-vue-2.50.0-pr-2296-d7bf`, Loyalty 3.1002.0-pr-9
- **Verdict:** **PASS** — 23/23 (100%), 0 fail, 0 blocked. Quality gate: PASS (0 Critical/High bugs).

| Suite | Cases | Pass | Fail | Blocked | Result |
|-------|-------|------|------|---------|--------|
| 083 Loyalty Catalog (LOYF-001..023) | 23 | 23 | 0 | 0 | PASS |

**Passes:** LOYF-001..023 (all). Route guards (001–007, 016) correct; listing/PDP/category/recommendations currency = PTS; `/catalog` stays USD with no leakage (013/017). LOYF-019/020 PASS on the primary `GetProductRecommendations currencyCode=PTS` API contract; DOM-render N/A (`@needs-test-data` — no loyalty product has associations/recommendations).

**Bugs found:** None.

**Notes:** No JS errors or i18n missing-key warnings on loyalty pages; only benign external product-image 404s on `/catalog` (env data). Store left in happy-path (Enable=true, Mixed Cart, PTS), verified. Out-of-scope (not run): loyalty cart pricing + loyalty-catalog search (separate stories). Per-suite JSON: `suite-083-results.json`.
