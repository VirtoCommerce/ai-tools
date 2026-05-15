# Regression Report — 2026-05-14

**Run ID:** `REG-2026-05-14-1138`
**Started:** 2026-05-14 11:38 (local) / 09:30 UTC
**Completed:** 2026-05-14 13:00 (local) / 10:02 UTC
**Duration:** ~32 min
**Selection:** `048b` (user-invoked: `/qa-regression 048b`)
**Environment:** vcst-qa
- Frontend: https://vcst-qa-storefront.govirto.com (HTTP 200)
- Backend: https://vcst-qa.govirto.com (Healthy — Modules/Cache/Redis/SQL)
**Deploy state:** platform `3.1026.0`, theme `2.49.0-pr-2280` (vc-frontend PR #2280 / VCST-4906 login-on-behalf — OPEN, unrelated to layout-stability scope)

---

## Executive Summary

| Metric | Value |
|---|---|
| Suites run | 1 / 1 |
| Suites passed (100% case pass) | 0 |
| Suites with failures | 1 |
| Total test cases | 21 |
| Passed | 11 (52.4%) |
| Failed | 8 |
| Blocked | 2 |
| Skipped | 0 |
| Preliminary bugs | 3 (all `confirmed: false`) |

**Verdict:** FAIL — case-level pass rate 52.4% (below 80% quality gate). Three systemic layout defects identified, all mapping to known invariants in `business-logic.md` Domain 15 (BL-UI-001 CLS budget, BL-UI-005 alignment, BL-UI-006 touch targets). Defects are non-functional but block WCAG 2.1 AA + Core Web Vitals compliance.

---

## Suite Results

| Suite | Name | Browser | Cases | Pass | Fail | Blk | Skip | Pass% | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 048b | Layout Stability | playwright-chrome | 21 | 11 | 8 | 2 | 0 | 52.4% | **FAIL** |

---

## Failures by Section

### CLS — Cumulative Layout Shift (4 FAIL)

All four primary page types exceed the 0.1 CLS budget (BL-UI-001). None exceed the 0.25 P0 threshold.

| Test | Page | CLS observed | Verdict |
|---|---|---|---|
| LAYOUT-CLS-001 | Home (`/`) | **0.2128** | FAIL |
| LAYOUT-CLS-002 | Catalog (`/catalog`) | **0.1842** | FAIL |
| LAYOUT-CLS-003 | PDP (`/kitchen-supplies/.../bending-straws-...`) | **0.1456** | FAIL |
| LAYOUT-CLS-004 | Cart (`/cart`) | **0.1215** | FAIL |

→ **BUG_048b_001** (High severity).

### Alignment (1 FAIL)

| Test | Finding | Verdict |
|---|---|---|
| LAYOUT-ALN-002 | PLP product card top-edge drift = **14px** (BL-UI-005 tolerance 1px). Cards in same row vary 380–394px. | FAIL |

→ **BUG_048b_002** (Medium severity).

### Touch Targets at 375px viewport (3 FAIL)

| Test | Page | Undersized elements | Verdict |
|---|---|---|---|
| LAYOUT-TGT-001 | PDP | Qty stepper 32×32, product action buttons <44px | FAIL |
| LAYOUT-TGT-002 | Cart | 8 undersized (vendor select 20×20, qty 32×32, remove 38×38, 2 pairs at 1px gap) | FAIL |
| LAYOUT-TGT-003 | Order-summary sidebar (checkout proxy) | 12 undersized (coupon inputs 24px h, toggles 20px h, apply buttons 26×26) | FAIL |

→ **BUG_048b_003** (High severity). BL-UI-006 (≥44×44 + ≥8px gap) systemically violated on touch-input contexts.

### Blocked (2)

| Test | Reason | Notes |
|---|---|---|
| LAYOUT-SHIFT-003 | `/sign-up` redirects to `/catalog` for authenticated session | Needs separate unauthenticated context (suite design gap; consider adding `[PRE:LOGOUT]` step) |
| LAYOUT-SHIFT-004 | Playwright MCP does not expose CDP `Network.emulateNetworkConditions` for Slow 3G throttling | Reroute to Chrome DevTools MCP for this case, or wrap test in a `--cdp` capability flag |

Both BLOCKED cases are tooling/preconditions limitations, NOT storefront defects.

### Passes (11)

LAYOUT-SPC-001/002/003, LAYOUT-ALN-001, LAYOUT-OVF-001/002, LAYOUT-SHIFT-001/002, LAYOUT-FOUC-001, LAYOUT-FONT-001, LAYOUT-VPS-001.

---

## Preliminary Bugs (3, `confirmed: false`)

All bugs require qa-testing-expert confirmation before JIRA filing. Reproduction steps and observed values are in `reports/regression/REG-2026-05-14-1138/048b-results.json`.

### BUG_048b_001 — CLS budget breach across primary pages (High)
- **BL:** BL-UI-001 (CLS ≤ 0.1)
- **Scope:** Home / Catalog / PDP / Cart
- **Range:** 0.1215 – 0.2128 (all FAIL threshold, none P0)
- **Likely root cause:** hero `.slider-block` images, image carousel on PDP, cart item render shifts price calculation column. Verify image `width`/`height` attributes, webfont-swap reflow, lazy-loaded grid.

### BUG_048b_002 — PLP product card alignment drift 14px (Medium)
- **BL:** BL-UI-005 (≤1px tolerance)
- **Likely root cause:** variable card height from title/description length and image aspect-ratio. Fix by enforcing fixed `min-height` or aspect-ratio container on `.vc-product-card`.

### BUG_048b_003 — Mobile touch targets systemically <44px (High, a11y)
- **BL:** BL-UI-006 (WCAG 2.5.5 Target Size — Enhanced; AA 2.5.8 Target Size Minimum)
- **Scope:** Qty stepper (32×32), Remove from cart (38×38), coupon/toggle controls (20–26px) across PDP / Cart / Order summary
- **Likely root cause:** desktop-first sizing without responsive breakpoint expansion.

---

## Retry Log

No retries. Suite executed once on `playwright-chrome` (preferred per manifest), browser pool fallback chain (firefox → edge) not invoked.

---

## Tooling / Coverage Gaps

1. **Unauthenticated context** — `LAYOUT-SHIFT-003` requires testing `/sign-up` without auth. Consider:
   - Adding `[PRE:LOGOUT_BEFORE_NAV]` precondition tag to the CSV
   - Or splitting unauth tests into a sub-suite that runs before login in Phase 1
2. **CDP-level network throttling** — `LAYOUT-SHIFT-004` needs Slow 3G emulation. Playwright MCP doesn't expose CDP; suite-author note in `scripts/lib/measure-layout.ts` should specify `chrome-devtools-mcp` for network-throttling-dependent cases.

---

## Quality Gate Evaluation

| Gate | Threshold | Observed | Status |
|---|---|---|---|
| Suite pass rate (case-level) | ≥80% | 52.4% | **FAIL** |
| P0 violations | 0 | 0 | PASS |
| Critical/High preliminary bugs | ≤2 | 2 (BUG_048b_001, _003) | **WARN** |
| Browser/environment failures | 0 | 0 | PASS |

**Recommendation:** Open BUG_048b_001 / _002 / _003 in JIRA after qa-testing-expert confirmation. CLS and touch-target findings should block the next PR-to-vcst-qa promotion if regression on these axes is required.

---

## Artifacts

- Per-suite JSON: `reports/regression/REG-2026-05-14-1138/048b-results.json`
- Failure screenshots: `reports/regression/REG-2026-05-14-1138/LAYOUT-{CLS,ALN,TGT}-*-fail.png`
- HAR: captured automatically by `playwright-chrome` MCP (see config/mcp-playwright-chrome.config.json output dir)
- Status tracker: `reports/regression/test-run-status.json`
- Deploy state: `reports/deploy-state-cache.json`

---

## Next Steps

1. `qa-testing-expert` triage of the 3 preliminary bugs (confirm `confirmed: true` before JIRA).
2. CSV update for `LAYOUT-SHIFT-003` — add explicit logout precondition.
3. CSV update for `LAYOUT-SHIFT-004` — annotate browser requirement (`chrome-devtools-mcp` for network throttling); current 048b assignment to `playwright-chrome` is fine for the other 20 cases.
4. Consider `/qa-bug BUG_048b_001` if you want the CLS finding filed as a JIRA Bug immediately.
