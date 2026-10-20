# Evidence index: QUOTE-005 / R13-2 (VCST-6398 --verify)

**Verdict:** REPRODUCED (deterministic, 3/3 attempts, 2 quotes, 2 viewports)
**Symptom:** on `/account/quotes/{id}` the desktop "Price per item" shows the list price, while the line Total uses the proposed price, so unit x qty does not equal the shown total.

## Env header
| Field | Value |
|---|---|
| TEST_ENV | `vcst` (ENV_RISK=test) — kb deployment `vcst_qa` |
| FRONT_URL | `{{FRONT_URL}}` (vcst-qa storefront) |
| Theme (footer, read live) | `Ver. 3.1.0-pr-11-d67b-d67b0e0a` = vc-frontend-next PR #11 head `d67b0e0a` (build matches the brief) |
| Platform (run preflight) | `3.1086.0-pr-3139-5d63-…` (`reports/regression/REG-2026-10-20-1418/preflight.json`) |
| Browser | `playwright-firefox`, 1920x1080, then 375x900 |
| Account | slot-1 pool buyer `@td(ADMIN_RESPONSE_QUOTE.buyer_email_slot1)`, password from the `B2B_USER_PASSWORD` secret key |
| Run | 2026-10-20 15:40–15:43 UTC |

## Fixtures (existing; nothing created)
| Quote | id | Status | Lines (list / proposed x qty = shown total) |
|---|---|---|---|
| AGENT-TEST-QTE-ADMIN-RESPONSE | `0aaa2b5b-72e6-4cf1-8132-94edef5145a7` | Proposal sent | Xerox 349.00 / 314.10 x2 = 628.20; Canon 189.00 / 170.10 x3 = 510.30 |
| AGENT-TEST-QTE-TO-CONVERT | `d096d4eb-b541-4b10-9c6c-0db6941f18d4` | Ordered | Canon 189.00 / 170.10 x2 = 340.20 |

## Attempts
1. 1920px, ADMIN-RESPONSE: Price per item **$349.00 / $189.00**, totals $628.20 / $510.30, footer Subtotal $1,138.50, summary Subtotal $1,265.00, Discount $126.50, Total $1,366.20.
2. Same page resized to 375px: the same label "Price per item" now shows **$314.10 / $170.10**. Totals and summary unchanged.
3. 1920px, Ordered quote TO-CONVERT: Price per item **$189.00**, qty 2, total **$340.20**. The defect persists after Approve.

## Artifacts (Part A)
| # | Artifact | Path | Status |
|---|---|---|---|
| 1 | Failure screenshot, desktop | `screenshots/01-desktop-1920-price-per-item-list.png` | M ok |
| 1 | Narrow layout shows the proposal | `screenshots/02-mobile-375-price-per-item-proposed.png` | M ok |
| 1 | Ordered quote, same mismatch | `screenshots/03-desktop-ordered-quote-same-mismatch.png` | ok |
| 2 | DOM snapshots | `screenshots/dom-desktop-1920-admin-response.yml`, `screenshots/dom-desktop-1920-ordered-to-convert.yml` | M ok |
| 3 | Full request list | in HAR (row 7); browser closed before a separate list export | M via HAR |
| 4 | The data request: `GetQuote` 200, no `errors[]` | `network/quote-op-request-body.json`, `network/quote-op-response.json` | M ok |
| 5 | Trace / operation ID | not required: no server-side fault (response is correct; see root-cause.md). GetQuote `cf-ray a4d91f8bfc885bb0-VIE`, `request-context appId=cid-v1:7d07a5e2-…` | n/a |
| 6 | Console | `console/console-warnings.log`: 0 errors, 4 warnings, all noise (GA cookie expiry, unused preload, WebSocket closed) | M ok |
| 7 | HAR | `results/VCST-6398/har/QUOTE-005-firefox-session.har` (lane session HAR, may also hold the same lane's earlier traffic since 17:36 local) | M ok |
| 10 | App Insights | not required: storefront rendering only, server data correct | n/a |
| 12 | Versions | env header above | M ok |
| 13 | Source | root-cause.md §Source (vc-frontend-next `d67b0e0a` + `dev`, vc-frontend `dev`/`master`) | C ok |

## Prior run
REG-2026-10-20-1418 suite 015 QUOTE-005 FAIL (chrome lane): `reports/regression/REG-2026-10-20-1418/screenshots/QUOTE-005-FAIL-quote-detail-unit-price.png`, `BUG_015_002`.

## kb
- KB-563D7FE5: opened and confirmed on this build, marked `defect: suspected`, with a note that it holds for the wide layout only.
- KB-110978AE (suspected defect, list vs actual price swaps at the 896px container width): confirmed on the quote DETAIL page.
- KB-B1990E1B: new capture of the narrow-vs-wide split on `/account/quotes/{id}` with a proposal price. It overlaps KB-110978AE (which anchors `/account/quotes/{id}/edit`). I tried to pull it from the local queue but the action was denied, so it ships unless a human drops it.
