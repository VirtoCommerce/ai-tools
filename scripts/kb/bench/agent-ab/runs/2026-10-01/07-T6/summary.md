# KB A/B — 2026-10-01T11-48-23, model sonnet, 3 run(s) per cell

| cell | correctness | falseClaims | evidence | passAll | costPerCorrect | toolCalls | deadEnds | envWrites | tokens | costUsd | costSpread | timeSec | timeSpread | kbAsks | contaminated |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **real.kb** | 1 | 0 | 1 | true | 0.86 | 34 | 6 | 0 | 2482797 | 0.86 | 0.82 | 285 | 181 | 11 | 0 |
| **real.nokb** | 0.83 | 0 | 1 | false | 1.75 | 52 | 11 | 4 | 4365855 | 1.36 | 0.33 | 484 | 181 | 0 | 0 |
| **control.kb** | - | 0 | - | false | - | - | - | - | - | - | - | - | - | - | 0 |
| **control.nokb** | - | 0 | - | false | - | - | - | - | - | - | - | - | - | - | 0 |
| T6-api-navigation · kb | 1 | 0 | 1 | true | 0.86 | 34 | 6 | 0 | 2482797 | 0.86 | 0.82 | 285 | 181 | 11 | 0 |
| T6-api-navigation · nokb | 0.83 | 0 | 1 | false | 1.75 | 52 | 11 | 4 | 4365855 | 1.36 | 0.33 | 484 | 181 | 0 | 0 |

Medians per cell, except correctness (mean score / 2) and falseClaims (count).