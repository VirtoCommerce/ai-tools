# KB A/B — 2026-10-01T12-51-46, model sonnet, 3 run(s) per cell

| cell | correctness | falseClaims | evidence | passAll | costPerCorrect | toolCalls | deadEnds | envWrites | tokens | costUsd | costSpread | timeSec | timeSpread | kbAsks | contaminated |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **real.kb** | 1 | 0 | 1 | true | 0.45 | 5 | 0 | 0 | 310870 | 0.18 | 0.88 | 63 | 267 | 4 | 0 |
| **real.nokb** | 0.83 | 0 | 1 | false | 2.11 | 58 | 15 | 5 | 5388081 | 1.81 | 0.91 | 582 | 283 | 0 | 0 |
| **control.kb** | - | 0 | - | false | - | - | - | - | - | - | - | - | - | - | 0 |
| **control.nokb** | - | 0 | - | false | - | - | - | - | - | - | - | - | - | - | 0 |
| T8-returns-colleague · kb | 1 | 0 | 1 | true | 0.45 | 5 | 0 | 0 | 310870 | 0.18 | 0.88 | 63 | 267 | 4 | 0 |
| T8-returns-colleague · nokb | 0.83 | 0 | 1 | false | 2.11 | 58 | 15 | 5 | 5388081 | 1.81 | 0.91 | 582 | 283 | 0 | 0 |

Medians per cell, except correctness (mean score / 2) and falseClaims (count).