# Evidence index — R13-3 quotes pages render raw i18n keys on hard load

Saved by the triage orchestrator from the investigator's hand-back (its harness refused `.md` writes).

- **Env:** TEST_ENV=vcst · theme `3.1.0-pr-11-d67b-d67b0e0a` (footer). Storefront-only: all GraphQL 200, quote rows rendered.
- **Browser / user:** playwright-chrome 1920×1080 · `@td(AGENT_POOL_SLOT_1.b2b_email)` via `--secrets` key `B2B_USER_PASSWORD`.
- **Data:** existing quote RFQ261020-00002 (`e76d7e91-bf02-40ca-829f-c992b58af28d`); nothing created.
- **Result:** REPRODUCED 7/10 hard loads; SPA navigation translated 2/2.

## Repro log
| Context | Load | Page | Result |
|---|---|---|---|
| 1 | 1 | /account/quotes | PASS |
| 1 | 2–3 | /account/quotes | FAIL |
| 1 | 1 | /account/quotes/{id} | PASS (title "Quote request #") |
| 1 | 2–3 | /account/quotes/{id} | FAIL |
| 2 | redirect after login | /account/quotes | PASS |
| 2 | 3 hard loads | /account/quotes | 3 FAIL |
| 1 | breadcrumb (SPA) | /account/quotes | PASS |

## Files
- `screenshots/01-hard-load-quotes-raw-keys.png` — H1 translated, column headers raw
- `screenshots/02-hard-load-quote-detail-raw-title.png` — tab title "QA & quote_details.title"
- `screenshots/03-spa-nav-quotes-translated.png` — control
- `screenshots/dom-attempt2-hard-quotes-FAIL.yml`, `dom-detail-attempt2-FAIL.yml`
- `network/locale-vs-page-chunk-timing.txt`, `requests-attempt1-PASS.txt`, `requests-attempt2-FAIL.txt`
- `console/attempt2-hard-quotes-warnings.txt` (0 errors), `context2-hard-load3-all.txt`
- HAR: `results/VCST-6398/har/r13-3-session1-warm.har`, `results/VCST-6398/har/r13-3-session2.har`

## Late request
Locale chunk `/assets/en-CX6YgJ2h.js` (quotes/locales/en.json) vs page chunk `/assets/quotes-D0D84Rce.js` (detail: `view-quote-C7A2TZeY.js`). Every FAIL (7/7): page chunk from browser cache (~1 ms) while the locale needed a 20–50 ms 304 revalidation (`max-age=14400, must-revalidate`, CDN `age: 26235` > max-age). Every PASS (3/3): page chunk fetched over the network.

kb: KB-429A791E confirmed · KB-80095B02 captured.
