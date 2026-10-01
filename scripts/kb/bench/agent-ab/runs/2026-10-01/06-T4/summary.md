# KB A/B — 2026-10-01T10-47-51, model sonnet, 3 run(s) per cell

| cell | correctness | falseClaims | evidence | passAll | costPerCorrect | toolCalls | deadEnds | envWrites | tokens | costUsd | costSpread | timeSec | timeSpread | kbAsks | contaminated |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **real.kb** | 1 | 0 | 1 | true | 0.12 | 2 | 0 | 0 | 180809 | 0.11 | 0.04 | 40 | 15 | 1 | 0 |
| **real.nokb** | 1 | 0 | 1 | true | 0.62 | 11 | 2 | 1 | 777078 | 0.39 | 0.83 | 286 | 299 | 0 | 0 |
| **control.kb** | - | 0 | - | false | - | - | - | - | - | - | - | - | - | - | 0 |
| **control.nokb** | - | 0 | - | false | - | - | - | - | - | - | - | - | - | - | 0 |
| T4-line-discount · kb | 1 | 0 | 1 | true | 0.12 | 2 | 0 | 0 | 180809 | 0.11 | 0.04 | 40 | 15 | 1 | 0 |
| T4-line-discount · nokb | 1 | 0 | 1 | true | 0.62 | 11 | 2 | 1 | 777078 | 0.39 | 0.83 | 286 | 299 | 0 | 0 |

Medians per cell, except correctness (mean score / 2) and falseClaims (count).