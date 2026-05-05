# BUG-006-001 — Org switch from deep category page does not redirect to neutral page

| Field | Value |
|-------|-------|
| Suite | 006 — B2C Organization |
| Test case | B2C-ORG-008 — Switch Org - Navigation Reset |
| Run ID | REG-2026-05-04-1527 |
| Severity | Medium |
| Priority | Medium |
| Confirmed | No (preliminary — needs qa-testing-expert investigation) |
| Browser | playwright-firefox |
| Environment | https://vcst-qa-storefront.govirto.com |
| Business Rule | BL-B2C-004 |
| Date | 2026-05-05 |

## Summary

When a multi-org user is browsing a deep category page in Org A and switches to Org B via the org switcher, the user remains on the same URL with the same breadcrumb trail rather than being redirected to a neutral landing page (home or catalog root). The new org's branding (e.g., ACME Store 2 badge) is applied immediately, but contextual navigation (URL, breadcrumbs, page heading) is not reset.

## Steps to reproduce

1. Sign in as multi-org user `ricreyacrouyi-3425@yopmail.com` / `Password1!` (or any user with access to both ACME Store and ACME Store 2).
2. Confirm ACME Store is the active org (header shows "ACME Store / SmokeTest Runner").
3. Navigate to a deep category, e.g. `https://vcst-qa-storefront.govirto.com/category/36b507a9-0bdf-4cd9-821e-4dcbb6e1d578`. URL resolves to `/accessories/aliexpress/consumer-electronics` and shows the "Consumer Electronics" category.
4. Click the account-menu button to open the popup; click `ACME Store 2` under the Organizations section.
5. Wait ~3 seconds for context swap. The header whoami updates to "ACME Store 2 / SmokeTest Runner" and the org name badge in the navigation rail changes from "ACME Store" to "ACME Store 2".

## Expected

- URL is reset to a neutral page (home `/` or catalog root `/catalog`), OR
- Breadcrumbs and page heading reflect Org B's catalog scope (e.g., re-rendered as Home, with no remembered Org A category).

## Actual

- URL stays at `/accessories/aliexpress/consumer-electronics`.
- Breadcrumbs still show: Home > Catalog > Accessories > Ali > Consumer Electronics.
- Page heading still reads "Consumer Electronics".
- Only the org branding/name and the user's contextual data (cart, prices, addresses) update.

## Evidence

- Screenshot: `reports/regression/REG-2026-05-04-1527/006-evidence/B2C-ORG-008-no-redirect.png`
- HAR: captured automatically by playwright-firefox MCP for this run.

## Console / Network

- No JavaScript errors during or after the org switch.
- Multiple `/graphql` POSTs fired during the context swap (cart, catalog, permissions, user context) — all returned 200.

## Notes / Severity rationale

- The page renders correctly in Org B context (products load with Org B's catalog scope; no broken state).
- The category URL happens to resolve in both org contexts because the storefront's catalog routing tolerates org-agnostic paths.
- Real risk: if the category does NOT exist in the target org's virtual catalog, the user could land on an empty/404-like state without any indication that the switch caused it. This run did not hit that scenario, but it should be probed in a follow-up exploratory pass.
- Severity Medium because the storefront stays usable; this is a UX consistency concern rather than a functional break.

## Suggested follow-up

1. `qa-testing-expert` confirm by repeating the steps with a category that is exclusive to one of the orgs (likely will produce a 404 or empty state after switch, raising severity).
2. Decide product behavior: should `useUser.changeOrg()` (or equivalent) trigger `router.push('/')` after the org context store updates, or is "stay on page" the intended UX?
3. If "redirect to neutral" is the answer, scope the change to the org-switcher component and verify it does not break tests that intentionally remain on a page (e.g., cart) across switches.
