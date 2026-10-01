# KB A/B — 2026-10-01T10-30-03, model sonnet, 3 run(s) per cell

| cell | correctness | falseClaims | evidence | passAll | costPerCorrect | toolCalls | deadEnds | envWrites | tokens | costUsd | costSpread | timeSec | timeSpread | kbAsks | contaminated |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **real.kb** | 0 | 3 | 0.33 | false | - | 28 | 0 | 7 | 2372990 | 1.04 | 0.22 | 458 | 168 | 1 | 0 |
| **real.nokb** | 0.67 | 1 | 0.83 | false | 1 | 21 | 2 | 1 | 1731327 | 0.71 | 0.24 | 248 | 73 | 0 | 0 |
| **control.kb** | - | 0 | - | false | - | - | - | - | - | - | - | - | - | - | 0 |
| **control.nokb** | - | 0 | - | false | - | - | - | - | - | - | - | - | - | - | 0 |
| T1-promo-stack · kb | 0 | 3 | 0.33 | false | - | 28 | 0 | 7 | 2372990 | 1.04 | 0.22 | 458 | 168 | 1 | 0 |
| T1-promo-stack · nokb | 0.67 | 1 | 0.83 | false | 1 | 21 | 2 | 1 | 1731327 | 0.71 | 0.24 | 248 | 73 | 0 | 0 |

Medians per cell, except correctness (mean score / 2) and falseClaims (count).