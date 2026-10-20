# Evidence index — BUG_098_001 (VCST-6398, REG-2026-10-20-1418 suite 098, checklist R13-6)

**Env:** TEST_ENV=vcst · FRONT_URL={{FRONT_URL}} · ENV_RISK=QA · theme footer `Ver. 3.1.0-pr-11-d67b-d67b0e0a` (= vc-frontend-next PR #11 head d67b0e0a) · browser playwright-chrome (Chromium), 1920×1080 · 2026-10-20 15:51–15:57 UTC
**Symptom:** console `[ERROR] A bad HTTP response code (404) was received when fetching the script.` (no source URL)
**Result:** REPRODUCED 2/2 — bound to **Logout**, not to the page. Guest loads of /compare and the configurable PDP: 0/3. Signed-in page loads: 0/2.

| # | Artifact | Path / value | Status |
|---|---|---|---|
| 1 | Failure-state screenshots | `screenshots/01-compare-after-logout.png`, `screenshots/02-config-pdp-after-logout.png` | ok |
| 2 | DOM snapshot | `screenshots/dom-compare-guest.md` (build footer + guest header) | ok |
| 3 | Network list | `network/requests-compare-logout.txt` (no SW fetch in the page's own list, as expected) | ok |
| 4 | Failing request | `network/failing-firebase-messaging-sw.json` — `GET /firebase-messaging-sw.js` → **404 text/html**, request header `Service-Worker: script`, 15:56:30.649Z; preceded at sign-in by `GET /fcm-service-worker-v1.12.js` → 200; followed by `POST /revoke/token` → 200 | ok |
| 5 | Trace / operation ID | n/a — a static 404 from the storefront host, no server component | n/a |
| 6 | Console | `console/console-compare-logout.txt`, `console/console-pdp-logout.txt` (one ERROR each, at Logout) | ok |
| 7 | HAR | `results/VCST-6398/har/BUG_098_001-pdp-logout.har` (run 2). Run 1 HAR was read before being overwritten: same 404 at 15:54:33.263Z | ok |
| 10 | App Insights | n/a — no server-side layer | n/a |
| 12 | Versions | theme vc-frontend-next d67b0e0a; firebase `^12.16.0` (→ @firebase/messaging 0.13.0) | ok |
| 13 | Source | see `root-cause.md` §3 | ok |
| 14 | Repro rate | 2/2 sign-in → Logout (/compare, configurable PDP) | ok |

Direct probe: `curl {{FRONT_URL}}/fcm-service-worker-v1.12.js` → 200 application/javascript; `curl {{FRONT_URL}}/firebase-messaging-sw.js` → 404 text/html.
User: `agent-test-multiorg-20260615@yopmail.com` (098's own sign-in persona), password via `--secrets` key `DEFAULT_TEST_PASSWORD`. No test data was created, so there is nothing to tear down.
