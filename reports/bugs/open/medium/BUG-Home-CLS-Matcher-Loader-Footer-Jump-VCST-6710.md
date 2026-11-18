# Home page CLS 0.17 (0.28 at 375px): footer jumps 718px while the Matcher route loads home.vue — P2

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-11-05-0023-W6R

**Tracker:** [VCST-6710](https://virtocommerce.atlassian.net/browse/VCST-6710) (filed 2026-11-05, Relates VCST-6042 Stable 16, VCST-6659) · **Severity:** P2 / Medium · **Type:** Layout / Web Vitals (BL-UI-001)

**Env:** `vcptcore_regression` storefront, store `B2B-store`, guest · Theme **2.59.0** (vc-frontend tag `2.59.0`, bundle `index-Cg7OMg95.js`, index.html last-modified 2026-10-07 20:23 GMT, re-checked live at filing) · Platform 3.1076.8 (vc-deploy-dev `vcptcore-regression`) · Chromium 1280×900 + 375, Fast-3G · Repro 6/6, deterministic to 4 decimals.
Not available from the env: trace id (storefront sends no Request-Id/traceparent), App Insights (client-side defect, no failing call), HAR (lane HAR not exported; runner traces show `consoleErrors: []`, `networkFailures: []`).

## Summary
On a fresh load of `/`, the footer is painted inside the viewport under a route loader and then pushed down **718 px** when ~1,470 px of home content mounts. CLS **0.173** at 1280×900, **0.279** at 375 (0.081 at 1920). `footer#footer` is 96 % of the score.

## Steps to Reproduce
1. Guest, fresh context, viewport 1280x900, Fast-3G.
2. Open `{{FRONT_URL}}/` and wait for networkidle. CLS 0.173: `footer#footer` shifts 718 px (impact 0.166).
3. Deterministic: `TEST_ENV=vcptcore_regression npx tsx scripts/layout/layout-runner.ts --suite regression/suites/Frontend/cross-cutting/048c-layout-stability.csv --run-id <id> --grep LAYOUT-CLS-001`.
4. Repeat at 375 px: CLS 0.279 (footer 0.2513, main 0.0279).

## Expected vs Actual
- **Expected:** CLS ≤ 0.1 (BL-UI-001); the page reserves its space while the route component loads, so the footer stays put.
- **Actual:** before — header, empty `main` with a centred spinner, footer at y≈718, no scrollbar; after — home content, footer at y≈1640. Console clean, all requests 2xx, no `errors[]`.

Screenshots: `reports/bugs/screenshots/home-cls-matcher-loader-footer-jump/home-before-loader-footer-at-718.png`, `…/home-after-viewport.png`, `…/home-after-fullpage.png` (first two embedded in VCST-6710 Actual result).

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | package `screenshots/home-*.png`, `console/home-console.log`, traces row 8/9 |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | PASS | `network/home-requests.md` (all 200, no `errors[]`; home body is not GraphQL data) |
| 4. Platform REST API | N/A — not probed by the investigation | — |

**Owning layer:** Layer 1 — storefront.

## Root Cause Analysis
`/` matches the catch-all Matcher route: `client-app/pages/matcher/matcher.vue` L23–25 shows `<VcLoaderOverlay>` while previewers settle; `pages/matcher/internal.vue` L22 then mounts `defineAsyncComponent(() => import("@/pages/home.vue"))`. The only reserved space is `main-layout__content` `min-h-[60vh]` (`shared/layout/components/main-layout/main-layout.vue` L27) = 540 px at 900, so the ~2.7× taller page drops the footer in one shift. Full analysis: `reports/regression/REG-2026-11-05-0023-W6R/evidence/LAYOUT-CLS-001/root-cause.md` (Defect A). Header-logo width shifts are a separate bug (VCST-6709); catalog CLS is VCST-6712.

**Ruled out:** images without dimensions and the Builder.io `.features-block` this report used to blame (vcst-qa, 2026-07: home 0.502) — on this stand the guest home is the bundled `home.vue` and no image or `.features-block` is among the contributors. Earlier extension to `/account/missions` (2026-09-08, 0.56 at 375) is the same footer-drag class and is not re-verified here; VCST-6659 tracks the 375 px short-page footer shift on vc-frontend-next.

## Regression
Not new in Stable 16: the same code is in Stable 15's vc-frontend 2.51.1 (and 2.51.2). Jira **Need hotfixes** set (v15 + v16).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** Matcher route loader + main layout shell
- **RCA anchor:** `client-app/pages/matcher/matcher.vue:23-25` (`VcLoaderOverlay`), `client-app/shared/layout/components/main-layout/main-layout.vue:27` (`min-h-[60vh]`)
- **Routing confidence:** MEDIUM — one repo, but the fix is a layout choice (page skeleton vs. a taller reserved `main`) touching the shell every route uses; auto-fix labels withheld.
