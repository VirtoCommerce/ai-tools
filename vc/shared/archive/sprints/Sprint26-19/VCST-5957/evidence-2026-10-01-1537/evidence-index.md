# Evidence Index — VCST-5957

**Env:** `vcst` — https://vcst-qa-storefront.govirto.com / https://vcst-qa.govirto.com (ENV_RISK=test)
**Symptom:** SKU mission modal: estimate-hint alert sliced by the sticky footer when the line list overflows; no scroll cue
**Browser:** firefox
**Package:** `reports/tickets/Sprint26-19/VCST-5957/evidence-2026-10-01-1537`
**Account:** `@td(LOY_PERSONAL_NOORG)` · mission "Purchase target quantity of SKUs" (5 SKU targets, 200 points, no deadline)

> Companion: `.claude/skills/qa-investigate/evidence-and-root-cause.md` (Part A).

## Header slots
| slot | value |
|------|-------|
| TRACE_ID | N/A — storefront-only CSS/layout defect: 0 console errors, no 4xx/5xx/`errors[]` in `network/requests.json`; no server-side layer involved (row 5 is M* = server-side only) |
| BUILD_VERSIONS | Theme `vc-theme-b2b-vue 2.59.0-pr-2524-3069-30691594` (vc-deploy-dev `theme/artifact.json` @ vcst-qa; storefront footer "Ver. 2.59.0-pr-2524-3069-30691594" matches) · Platform `3.1075.0` (`backend/packages.json` @ vcst-qa) |
| REPRO_RATE | Deterministic — 3/3 independent captures: 3x Firefox (`../screenshots/3x-sku-modal-overstock-counted-in-summary.png`), 4a Chrome (`../screenshots/4a-sku-modal-overstock-150-of-99.png`), this run Firefox (`screenshots/02-…`). Pure geometry, no timing component |

## Captured artifacts (Part A ordered pass)
| # | artifact | path / value | status |
|---|----------|--------------|--------|
| 1 | Failure-state screenshot | `screenshots/02-ff-sku-modal-qty150-alert-sliced.png` (1920×1080, sliced); context `01-ff-sku-modal-qty0-initial.png`, `03-ff-sku-modal-qty150-scrolled-end.png`, `04-ff-sku-modal-1366x768.png` | DONE |
| 2 | DOM snapshot | `screenshots/dom-sku-modal.md` (+ geometry readings in `root-cause.md` §3) | DONE |
| 3 | Network request list | `network/requests.json` — no failing request | DONE |
| 4 | Failing request (URL/payload/status/body) | N/A — no failing request; the data renders correctly, only its placement is wrong | N/A |
| 6 | Console messages | `console/console.json` — 0 errors, 4 unrelated warnings (GA cookie, preload, scroll-linked effect) | DONE |
| 9 | REST cross-check (if GraphQL wrong) | N/A — GraphQL not implicated | N/A |
| 10 | App Insights trace for TRACE_ID | N/A — no server-side layer | N/A |
| 13 | Source findings (file:line + quote) | `source/findings.md` (+ `source/sku-mission-modal.vue` @ PR head `30691594`) | DONE |
| 15 | Back-office config read | N/A — not data/config-dependent: the modal must lay out any number of SKU targets; the mission's 5 targets are valid data (visible on the card as "0 of 5 SKUs") | N/A |

## Raw browser artifacts (auto-discovered, referenced)
| kind | path | note |
|------|------|------|
| HAR | `test-results/firefox/har/session.har` | referenced (gitignored raw artifact) |
| console-log | `test-results/firefox/console-2026-10-01T15-37-24-543Z.log` | this run |

## Worksheet
Root-cause synthesis → `root-cause.md`
