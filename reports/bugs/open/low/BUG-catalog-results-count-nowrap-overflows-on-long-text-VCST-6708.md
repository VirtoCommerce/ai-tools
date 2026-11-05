# The catalog's results count never wraps or truncates, so twice-as-long text scrolls the page sideways at 320 px — **Low**

## Status: READY_TO_SUBMIT — filed as [VCST-6708](https://virtocommerce.atlassian.net/browse/VCST-6708) (2026-11-05)
**Found by:** agent — regression REG-2026-11-05-0023-W6R
**Tracker:** VCST-6708 (Bug, Low, Relates → VCST-6042 Stable 16). First seen during VCST-6534 (vcst, 2026-10-27), not filed then.
**Archetype:** `RENDER` · **Provenance:** PRE-EXISTING (theme 2.51.1, 2.59.0, 2.61.0-pr-2577). **kb:** KB-06A3A50F.

**Does not reproduce with today's translations.** Robustness gap: a translation or customer copy about twice as long exposes it.

## Env
- `vcptcore_regression` (Stable 16), store B2B-store, guest, `de`, 320×700, playwright-edge.
- Theme **2.59.0** (footer; matches vc-deploy-dev `vcptcore-regression` themes entry). Repro rate: 3/3 with the stress, 0/5 without.
- No server-side layer: TRACE_ID none, App Insights N/A. HAR: `test-results/edge/har/session.har`.
- Earlier observation: vcst, theme 2.61.0-pr-2577 — scrollWidth 353 (de), 341 (pt), 375 (ru) under the ×2 body stress.

## STR
1. Guest, store B2B-store, viewport 320×700.
2. Open `{{FRONT_URL}}/de/catalog`. H1 reads "Katalog 304 Ergebnisse"; document is 320 wide (PASS).
3. Double the label: `[STRESS:TEXT] x2 sup.category__products-count` ("304 304 Ergebnisse Ergebnisse").
4. `[PROBE:OVERFLOW]` → scrollWidth vs innerWidth.

## Actual
- scrollWidth **329** vs 320 — the page scrolls sideways, the label is cut at the right edge.
- Same 329 when only the label is doubled as when the whole body is — the label alone sets the width.
- Fits (320): real de/en text, real count, 101-char multi-word category name. At 360 even the doubled label fits.

![stress on body](../../screenshots/Catalog-Results-Count-Nowrap-Overflows-320/de-catalog-320-stress-x2-body-runner-FAIL.png)
![stress on count only](../../screenshots/Catalog-Results-Count-Nowrap-Overflows-320/de-catalog-320-stress-x2-count-only-runner-FAIL.png)

## Expected
The count wraps or truncates inside the H1; the document never scrolls sideways at a supported width `{BL}` (BL-UI-004
Content boundary). Control, real text: ![no stress](../../screenshots/Catalog-Results-Count-Nowrap-Overflows-320/de-catalog-320-no-stress.png)

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | `LAYOUT-STR-001-FAIL-trace.json`, `isolation-results.json`, screenshots above |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | PASS | `network/requests.json` (all 200, no `errors[]`) |
| 4. Platform REST API | N/A — not probed by the investigation | — |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis
Package: `reports/regression/REG-2026-11-05-0023-W6R/evidence/LAYOUT-STR-001/` (`root-cause.md` §3–§5, `source/findings.md`).
`category.vue:895-896` `&__products-count { @apply … whitespace-nowrap … }` with no `truncate`/`max-w-full`; the sup
sits inside the H1, so it is one unbreakable inline box wider than the ~272 px H1 line.

## Need hotfixes
Set: the rule is in both latest stable bundles — vc-frontend 2.51.1 (v15, line 788) / 2.59.0 (v16, line 896); not fixed in 2.51.2 or on `dev`.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend catalog category page header
- **RCA anchor:** `client-app/shared/catalog/components/category.vue:895-896` (`&__products-count`) — drop `whitespace-nowrap`, or add `inline-block max-w-full truncate`
- **Routing confidence:** HIGH
