# Account sidebar breaks words mid-word at 768 px — "Missions & challeng|es", "Coupons & promoti|ons" — **P3**

## Status: CONFIRMED (live: 4a chrome, 2026-10-01)
**Found by:** agent — testing VCST-5957 (`/qa-test`, incidental)
**Tracker:** not filed — below the severity floor (Low). Named in the VCST-5957 QA comment.
**Oracle:** `BL-UI-004` · **Provenance:** OUT-OF-SCOPE. The shared account sidebar; PR #2524 does not touch it.

At 768 px the account sidebar's Marketing group labels wrap with a mid-word break instead of at a word boundary or with ellipsis. Seen on `/account/missions`; it is likely on every `/account/*` page.

**Evidence:** `reports/tickets/Sprint26-19/VCST-5957/screenshots/4a-missions-768-top.png`
**Fix Routing:** `VirtoCommerce/vc-frontend` · account layout sidebar (word-break / hyphenation on the nav link).
