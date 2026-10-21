# Account sidebar breaks words mid-word at 768 px — "Missions & challeng|es", "Coupons & promoti|ons" — **P3**

## Status: FIXED (verified on PR build, 2026-10-13 — PR not yet merged)
**Found by:** agent — testing VCST-5957 (`/qa-test`, incidental)
**Tracker:** VCST-6265 (filed 2026-10-10). Named earlier in the VCST-5957 QA comment.
**Oracle:** `BL-UI-004` · **Provenance:** OUT-OF-SCOPE. The shared account sidebar; PR #2524 does not touch it.

At 768 px the account sidebar's Marketing group labels wrap with a mid-word break instead of at a word boundary or with ellipsis. Seen on `/account/missions`; it is likely on every `/account/*` page.

**Evidence:** `reports/tickets/Sprint26-19/VCST-5957/screenshots/4a-missions-768-top.png`
**Fix Routing:** `VirtoCommerce/vc-frontend` · account layout sidebar (word-break / hyphenation on the nav link).

## Resolution
- **Tracker:** VCST-6265, moved to Tested on 2026-10-13. Done waits for the PR merge.
- **Fix:** vc-frontend#2571 @ `55d99674` (open). The label goes in `account-navigation-item__title` with `word-break: normal; overflow-wrap: anywhere`; the shared VcMenuItem `break-all` rule is unchanged.
- **Verified on:** theme `2.60.0-pr-2571-55d9-55d99674`, local frontend-only with the vcst-qa API. The bug reproduced on vcst-qa first (theme `pr-2543`, before the fix).
- **Method:** `/qa-test` → verify-fix. The steps passed 3 of 3 runs at 768/1024/1279 px. All 17 account menu labels were checked and all 10 checks pass. Evidence: `reports/tickets/Sprint26-20/VCST-6265/evidence.html`.
