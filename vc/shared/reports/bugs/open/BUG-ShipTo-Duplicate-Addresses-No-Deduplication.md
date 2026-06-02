# BUG: Ship To Selector Allows Unlimited Duplicate Addresses

**Severity:** Medium
**Component:** Ship To / Address Management
**Browser:** Firefox (Playwright MCP)
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Platform Version:** 2.43.0-pr-2188-c129-c1290c2d
**Date:** 2026-03-03
**Reported By:** QA Agent (qa-testing-expert)

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com
2. Log in as `mutykovaelena@gmail.com` (BMW-Group organization)
3. Click the **Ship To** selector in the header bar
4. Click **"See more"** to expand the full address list
5. Observe two identical entries: "deli bumbaoo 453, Delhi, 685, India"
6. Click **"Add new"** to open the "Create a new company address" dialog
7. Fill in: Country = India, ZIP = 685, City = Delhi, Address = "deli bumbaoo 453"
8. Click **Save**
9. Reopen the Ship To dropdown — a **third** identical entry now appears

## Expected Result

The system should prevent creating addresses with identical street, city, postal code, and country. Either:
- Show a validation error: "This address already exists"
- Or at minimum warn the user before saving

## Actual Result

Unlimited duplicate addresses can be created. No client-side or server-side deduplication is performed. The dialog closes successfully with no error, and each duplicate gets a unique internal UUID (`key`), making them appear as distinct addresses to the system.

## Evidence

- Screenshot (pre-existing duplicates): `test-results/bugs/ship-to-2026-03-03/bug001-duplicate-addresses-visible.png`
- Screenshot (after adding third duplicate): `test-results/bugs/ship-to-2026-03-03/bug001-third-duplicate-attempt.png`
- Console errors: None
- Network errors: None (all GraphQL requests returned HTTP 200)
- HAR file: Not captured separately (session-level HAR available)

## Technical Details

- **GraphQL Mutation:** `UpdateMemberAddresses`
- **Input Type:** `InputUpdateMemberAddressType`
- **Behavior:** The mutation sends ALL addresses for the member (identified by `memberId`) as a single array. Each address has a unique `key` (UUID) but no content-based validation is performed against existing addresses (line1, city, postalCode, countryCode).
- **Member ID:** `9d32a961-fe81-4243-a2d1-f6c9a317e5d3` (organization ID)
- **Address Type:** 3 (company address)
- **Follow-up mutation:** `AddOrUpdateCartShipment` is called after creation to update the cart's shipment delivery address

## Impact

- **User confusion:** Identical addresses are indistinguishable in the dropdown, leading users to potentially select the wrong one
- **B2B risk:** In a B2B context with multiple fulfillment centers, duplicate addresses could route shipments incorrectly
- **Data quality:** Over time, address lists accumulate duplicates with no cleanup mechanism in the Ship To dropdown (no edit/delete available there)
- **Affected users:** All B2B users who manage company shipping addresses

## References

- JIRA: [VCST-4722](https://virtocommerce.atlassian.net/browse/VCST-4722)
- Exploratory session: `reports/exploratory/exploratory-ship-to-2026-03-03.md`
