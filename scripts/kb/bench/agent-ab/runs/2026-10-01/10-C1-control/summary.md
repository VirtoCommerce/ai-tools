# KB A/B — 2026-10-01T13-35-25, model sonnet, 3 run(s) per cell

| cell | correctness | falseClaims | evidence | passAll | costPerCorrect | toolCalls | deadEnds | envWrites | tokens | costUsd | costSpread | timeSec | timeSpread | kbAsks | contaminated |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **real.kb** | - | 0 | - | false | - | - | - | - | - | - | - | - | - | - | 0 |
| **real.nokb** | - | 0 | - | false | - | - | - | - | - | - | - | - | - | - | 0 |
| **control.kb** | 1 | 0 | 1 | true | 0.51 | 22 | 1 | 0 | 1218812 | 0.54 | 0.31 | 151 | 74 | 2 | 0 |
| **control.nokb** | 1 | 0 | 1 | true | 0.54 | 19 | 1 | 2 | 1258519 | 0.54 | 0.26 | 172 | 81 | 0 | 0 |
| C1-punchout · kb | 1 | 0 | 1 | true | 0.51 | 22 | 1 | 0 | 1218812 | 0.54 | 0.31 | 151 | 74 | 2 | 0 |
| C1-punchout · nokb | 1 | 0 | 1 | true | 0.54 | 19 | 1 | 2 | 1258519 | 0.54 | 0.26 | 172 | 81 | 0 | 0 |

Medians per cell, except correctness (mean score / 2) and falseClaims (count).