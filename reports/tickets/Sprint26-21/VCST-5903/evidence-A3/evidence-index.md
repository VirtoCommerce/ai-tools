# Evidence index — VCST-5903 / checklist A3 (whitespace-only `value` / `errorText` in VcStatWidget)

**Verdict:** REPRODUCED (4 of 4 attempts) · 2026-10-19 15:39–15:41Z · `playwright-chrome` (Chromium), 1920×1080
**Env:** `TEST_ENV=vcst` (ENV_RISK=test) · surface `{{STORYBOOK_URL}}` (QA Storybook) · no sign-in, no data created
**Build (deployed, read from `vc-deploy-dev@vcst-qa`):** `storybook/image.json` Tag `2.61.0-alpha.2594-vcst-5903-vc-stat-widget-3f8af63a` (committed 2026-10-19T10:37Z) · `theme/artifact.json` `vc-theme-b2b-vue-2.61.0-pr-2568-3f8a-3f8af63a` · source read at `vc-frontend@3f8af63a` (PR #2568 head, PR open/unmerged)
**Back-office dependency:** none — a client-side prop guard inside one Vue SFC; no request, setting or catalog value is involved.
**Documented behaviour:** Context7 `/virtocommerce/vc-docs` has no page for `VcStatWidget` (only vc-shell `VcWidget`, an unrelated component) — NEW component, so ground truth = PR #2568 body `{SPEC}` + the prop JSDoc in source. VirtoOZ MCP not connected in this session; Context7 fallback used.
**kb:** KB-B9BB372D (value) and KB-A4C7F35D (errorText) — both confirmed on `vcst_qa` by this run.

## Reproduction matrix (Storybook Controls, typed into the textbox — URL args reject a bare space)

| # | Story | Input | Expected `{SPEC}` | Observed | Screenshot |
|---|---|---|---|---|---|
| 0 | basic | value `$12,480.00` (default) | figure | figure, card 156px | `screenshots/A3-01-baseline-value-filled.png` |
| 1 | basic | value `""` | dash | dash `—` y67 h38, card 156 | `screenshots/A3-02-value-empty-dash.png` |
| 2 | basic | value `" "` | dash | **no dash, blank 0-height figure row; description y111→73, card 156→118** | `screenshots/A3-03-value-space-blank-figure-FAIL.png` |
| 3 | basic | value `"   "` | dash | **same as #2** (attempt 2) | DOM only: `screenshots/dom-boxes.txt` |
| 4 | basic | value `"0"` | `0` | `0` y67 h38, card 156 | `screenshots/A3-04-value-zero.png` |
| 5 | with-suffix | value `" "` | dash | **figure row shows the unit alone: "items"** (attempt 3) | `screenshots/A3-05-withsuffix-value-space-unit-only-FAIL.png` |
| 6 | with-suffix | errorText `""` | ready card | ready, "34 items" | `screenshots/A3-06-errortext-empty-ready.png` |
| 7 | with-suffix | errorText `" "` | ready card (no message = no error) | **figures/description/delta hidden; red alert icon + blank message; card 92px; status "Active carts:"** (attempt 4) | `screenshots/A3-07-errortext-space-blank-error-FAIL.png`, `screenshots/A3-08-errortext-space-manager-context.png` |

## Artifacts

| Slot | File |
|---|---|
| Screenshots (8) | `screenshots/A3-0*.png` |
| DOM snapshot (boxes) | `screenshots/dom-boxes.txt` |
| Network list | `network/requests.txt` — 101 requests; all Storybook assets 200; 2 × `mf-entry-bootstrap-*.js` ERR_ABORTED = preload credentials-mode mismatch (Cloudflare rocket-loader), present on every load, unrelated; `cdn-cgi/rum` 204 = Cloudflare RUM |
| Failing request | n/a — changing a Control makes no request; purely client-side render |
| Console | `console/console-all.txt` — 0 errors, 1 warning (the preload mismatch above); no Vue warnings on any input |
| HAR | `har/A3-storybook-session.har` (100 entries 15:39:43–15:40:58Z, bodies + cookies stripped; extracted from `test-results/chrome/har/session.har`) |
| Trace / operation id | n/a — no server-side layer involved |
| App Insights | n/a — no server-side layer involved |
| Source | `source/vc-stat-widget.vue`, `source/vc-stat-widget.test.ts` @ `3f8af63a` |
| Prior evidence (same build, earlier today) | `../screenshots/A3-value-space-blank-figure-FAIL.png`, `../screenshots/X-06-errortext-whitespace-blank-error.png` — this run matches both |
