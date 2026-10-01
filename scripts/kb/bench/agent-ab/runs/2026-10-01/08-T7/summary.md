# KB A/B — 2026-10-01T12-00-13, model sonnet, 3 run(s) per cell

| cell | correctness | falseClaims | evidence | passAll | costPerCorrect | toolCalls | deadEnds | envWrites | tokens | costUsd | costSpread | timeSec | timeSpread | kbAsks | contaminated |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **real.kb** | 0.33 | 0 | 0.67 | false | 1.75 | 5 | 0 | 0 | 313505 | 0.34 | 1.08 | 72 | 898 | 2 | 0 |
| **real.nokb** | 0 | 3 | 1 | false | - | 43 | 8 | 3 | 3587581 | 1.21 | 0.59 | 393 | 246 | 0 | 0 |
| **control.kb** | - | 0 | - | false | - | - | - | - | - | - | - | - | - | - | 0 |
| **control.nokb** | - | 0 | - | false | - | - | - | - | - | - | - | - | - | - | 0 |
| T7-lockout · kb | 0.33 | 0 | 0.67 | false | 1.75 | 5 | 0 | 0 | 313505 | 0.34 | 1.08 | 72 | 898 | 2 | 0 |
| T7-lockout · nokb | 0 | 3 | 1 | false | - | 43 | 8 | 3 | 3587581 | 1.21 | 0.59 | 393 | 246 | 0 | 0 |

Medians per cell, except correctness (mean score / 2) and falseClaims (count).