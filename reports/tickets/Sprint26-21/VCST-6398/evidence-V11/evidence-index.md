# Evidence index — VCST-6398 V11 (/compare Differences rows vs "Differ: N of M rows")

**Env:** TEST_ENV=vcst · FRONT_URL=https://vcst-qa-storefront.govirto.com · ENV_RISK=test · theme footer `Ver. 3.1.0-pr-11-d67b-d67b0e0a` (= vc-frontend-next PR #11 head d67b0e0a) · role guest · Edge (playwright-edge) 1920×1080 · 2026-10-20 15:26–15:29 UTC
**Result:** REPRODUCED 3/3 (initial, after pin/unpin, after full reload).
**Data:** live-discovered, category Aliexpress › iPhone, first three cards: iPhone 8 / SE 2022 / XR. Compare list cleared via Clear all → OK ("Your compare list is empty").

| # | Artifact | File | Note |
|---|---|---|---|
| 1 | Screenshots | `screenshots/01-all-9-rows-1920.png`, `02-differences-4-rows-counter-3-1920.png`, `03-differences-brand-pinned-5-rows-counter-3.png`, `04-compare-cleared.png` | All = 9 rows; Differences = 4 rows (Price, Availability, SKU, Cellular), counter "Differ: 3 of 9 rows"; with Brand pinned = 5 rows, counter still 3 |
| 2 | DOM snapshots | `screenshots/dom-differences-3products.txt`, `screenshots/dom-differences-brand-pinned.txt` | rowheaders + cell values; Availability `1454 / 1454 / 1454` (all In stock) |
| 3 | Network list | `network/requests.txt` | 0 failing; tab switch fires no request (client-side filter, as KB-6CA2F98B) |
| 4 | Failing request | n/a | no request involved — pure client-side computation |
| 5 | Trace/operation ID | n/a (M* not triggered) | no server-side layer involved |
| 6 | Console | `console/console.txt` | 0 errors, 0 warnings |
| 7 | HAR | `results/VCST-6398/har/V11-compare-differences-edge.har` | flushed on context close, last entry 15:28:54Z |
| 10 | App Insights | n/a | frontend-only |
| 12 | Versions | footer above | theme only relevant; backend not involved |
| 13 | Source | `source/findings.md` | counter vs filter predicates, upstream presence, introducing PR |
| 14 | Repro rate | 3/3 | deterministic |

All-mode rows (9): Price (differs) · Availability (equal) · SKU (differs) · Min. order qty (equal) · Biometrics (equal) · Brand (equal) · Cellular (differs) · CPU (equal) · TouchScreen (equal).
Cross-check A2 (lane A, 5 inkjet printers, KB-6CA2F98B): "10 of 11" = 10 rows — consistent with this model because Price and Availability differed there, so the permanent exemption added nothing.
