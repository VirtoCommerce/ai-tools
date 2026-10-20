# Evidence index — VCST-6398 V6 (configurable PDP CLS vs BL-UI-001)

Saved by the triage orchestrator from the investigator's hand-back (its harness refused `.md` writes).

**Env:** TEST_ENV=vcst · theme footer `Ver. 3.1.0-pr-11-d67b-d67b0e0a` (vc-frontend-next PR #11 head d67b0e0a) · guest · playwright-chrome · 1280×900 and 1920×1080 · unthrottled · 2026-10-20 15:37–15:47 UTC
**Result:** REPRODUCED at 1920×1080 3/3 (0.1015); NOT at 1280×900 0/3 (0.0996). Deterministic.
**Data:** Vintage Wedding cake @td(CFG_WEDDING_CAKE_VINTAGE.id); AGENT-TEST-Wedding-Cake-Cond (live-discovered); simple PDP live-discovered (iPhone XR).

| Page | Viewport | L1 | L2 | L3 | Dominant shift |
|---|---|---|---|---|---|
| Vintage Wedding cake (7 sections, 5 checklist rows) | 1920×1080 | 0.1015 | 0.1015 | 0.1015 | 0.0867, ~25 ms after GetProductConfigurations |
| Vintage Wedding cake | 1280×900 | 0.0996 | 0.0996 | 0.0996 | 0.0654 |
| AGENT-TEST-Wedding-Cake-Cond (2 rows) | 1920×1080 | 0.0623 | 0.0623 | 0.0623 | 0.0319 |
| Simple PDP | 1920×1080 | 0.0363 | – | – | 0.0356 (footer push only) |

| Artifact | File |
|---|---|
| Screenshots | `screenshots/01-vintage-1280-settled.png`, `screenshots/02-vintage-1920-price-block.png` |
| DOM | `screenshots/dom-widget-structure-vintage-1280.json`, `screenshots/dom-price-block-slot-vintage-1280.txt` (checklist ul 212 px + mt-4 16 px = 228 px move) |
| CLS + shift sources + resource timing | `network/cls-vintage-{1280,1920}-L{1,2,3}.json`, `network/cls-cakecond-1920-L{1,2,3}.json`, `network/cls-simple-1920-L1.json` |
| Network | `network/requests-vintage-1280-L1.txt`, `network/requests-vintage-1920.txt`, `network/opnames-vintage-1280-L1.txt`, `network/req-GetProductConfigurations-body.txt` |
| Console | `console/console-vintage-{1280,1920}-L1.log` (external image 404/DNS from test data; not shift sources) |
| HAR | `results/VCST-6398/har/V6-cfg-pdp-cls-chrome.har` |
| Source | `source/pr11-files.txt` |

Not done: Fast 3G repeat (BL-UI-001), 375/768 viewports, a `dev` or upstream build. kb: KB-690403F4 captured.
