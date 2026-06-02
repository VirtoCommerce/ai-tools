# Inverted Range Repro — Firefox Second Source — 2026-05-26

## Env
- URL: https://vcst-qa-storefront.govirto.com/account/orders
- Build: 2.50.0-pr-2291-fed4-fed4fe16 (footer)
- Browser: playwright-firefox
- User: mutykovaelena@gmail.com (Boundaries Inc. / Elena Mutykova)
- Time: 2026-05-26 ~12:22 UTC

## Baseline
- Total orders visible: 7
- Newest order date: 2026-03-09 (CO260309-00006)

## Inverted-range attempt
- Typed: Start=05/26/2026, End=04/26/2026
- Apply button state immediately after typing: ENABLED
- Validation message visible: YES — inline under End date: "Date must be on or after 2026-05-26"
- Apply clicked: YES

## GQL capture
- Operation: GetOrders
- Request `filter` variable (verbatim): `createddate:["2026-05-25T22:00:00.000Z" TO]`
- Full variables: userId, cultureName=en-US, sort=createdDate:desc, first=10, after=0, facet=status
- HTTP status: 200
- Response: `{"data":{"orders":{"totalCount":0,"items":[],"term_facets":[],"__typename":"CustomerOrderConnection"}}}`
- Response item count: 0

## UI state after apply
- Filter chip(s): ONLY one chip shown — "Start: 5/26/2026". No End chip. No range chip.
- Visible row count: 0 ("There are no results found" empty state with "Reset search" button)
- Error toast / inline error: NO error on the results page (the inline "Date must be on or after 2026-05-26" message was only inside the popover, which closed on Apply)

## Verdict
- Bug reproduces on Firefox: **YES — CONFIRMED**
- Decision matrix row matched: *"Apply enabled, GQL filter has ONLY Start (`createddate:["...Z" TO]`) — End dropped | Same bug as Chrome. **CONFIRMED.**"*
- Confidence: HIGH

## Notes
- Important nuance vs. Chrome: Firefox DOES surface client-side validation ("Date must be on or after 2026-05-26") inline under the End date field WHILE the popover is open. However:
  1. The Apply button is NOT disabled by this validation (still clickable).
  2. After clicking Apply, the popover closes and the inline message is lost.
  3. Only the Start chip persists on the results page; End is silently dropped from both UI and GQL payload.
- The GQL filter shape `createddate:["...Z" TO]` (open-ended upper bound) is identical to the Chrome finding — the bug is in the payload construction layer, not browser-specific.
- The validation message presence suggests partial logic exists but is not wired to disable Apply or block submission — a fix path could be to disable Apply while any field-level validation error is active.
- No JS console errors during the flow (3 warnings only, unrelated to the filter).
