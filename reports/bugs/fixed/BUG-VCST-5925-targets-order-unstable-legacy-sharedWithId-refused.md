
## Resolution
- **Fixed in:** vc-module-x-cart#141 commit cd42696 (deployed as VirtoCommerce.XCart 3.1038.0-pr-141-b404, PR head b40455e — PR still open, not merged)
- **Tracker:** VCST-6152
- **Verified:** 2026-10-06 on vcptcore-qa via /qa-verify-fix (GraphQL xAPI, 3/3 runs, 10/10 checklist)
- **Method:** `targets` now sorted by id on write responses and reads alike, `sharedWithId` = `targets[0]` everywhere; legacy re-send of any present id (incl. case variant) is a no-op; an id not on the list is still INVALID_OPERATION with grants intact. Evidence: `reports/tickets/Sprint26-19/VCST-5925/evidence.html`, `verification-report.md`

## Status: FIXED
