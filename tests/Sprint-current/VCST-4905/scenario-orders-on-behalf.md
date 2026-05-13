# VCST-4905 — Live scenario: Impersonate → Order → Switch Org → Order

Operator: ricreyacrouyi-3425@yopmail.com (multi-org)
Target: maseweinnouwe-5837@yopmail.com (userId: `cab4dd70-f4d0-493c-91cb-dbbb9f94232d`, contactId: `29481528-dc3e-4ab3-872e-04d9777e5391`, display name: Alice May, role: Purchasing agent)
Build: theme PR #2279 / 3ce07383, Platform 3.1026.0
Browser: playwright-chrome (Coffee theme, en-US, 1920x1080)
Date: 2026-05-13
Environment: vcst-qa (FRONT_URL=https://vcst-qa-storefront.govirto.com)

## Step-by-step results
| Step | Action | Result | Evidence |
|---|---|---|---|
| 1 | Operator sign-in | PASS — operator authenticated as "SmokeTest Runner" / org BMW-Group | 01-operator-signed-in.png |
| 2 | Target userId lookup | PASS — found via storefront xAPI `GetOrganizationContacts` (visible because operator is Org Maintainer in same org). userId=`cab4dd70-f4d0-493c-91cb-dbbb9f94232d`. NOTE: storefront Company Members "Actions" menu exposes only Edit role / Block user / Delete — no "Login on behalf" UI action; operator must navigate directly to `/account/impersonate/{userId}`. | 02-target-userid-found.png, contacts-response.json |
| 3 | Impersonation | PASS — silent flow fired; navigated to `/account/impersonate/cab4dd70-...` and was redirected to `/` with header showing `SmokeTest Runner logged in as BMW-Group / Alice May`. No security verification form. | 03-impersonation-banner.png |
| 4 | Order 1 placed | PASS — Order #CO260513-00001 placed via CyberSource embedded form (card 4622943127013705, exp 09/2029, CVV 838). Cart total $1,460.16 across Fanta Mango Soda + 2 Off-Road Bike configurables. Billing address: BUdapest 1, budapest, 1027, Hungary. Header showed "SmokeTest Runner logged in as BMW-Group / Alice May" throughout. | 04-order1-confirmation.png |
| 5 | Org switch | PASS — switched from BMW-Group (cart had ~11 items, $1,460 cleared after order) to "Computing Tabulating Recording Corporation » IBM". Header updated correctly; account-button shows new org + Alice May. Cart context CHANGED (IBM org cart had 48 line items pre-existing, distinct from BMW cart) — per BL-B2B-001 (org-scoped carts). Switch performed via account-menu popup → Organizations section → click second org radio/button. | 05-org-switcher-before.png, 06-org-switcher-after.png |
| 6 | Order 2 placed | PASS — Order #CO260513-00002 placed via CyberSource embedded form (same card data). IBM org cart subtotal $1,089.45. Shipping address: New street 3, Linz, 2323232, Austria; delivery method Fixed Rate (Ground); billing same as shipping. Header confirmed "SmokeTest Runner logged in as Computing Tabulating Recording Corporation » IBM / Alice May" during placement. | 07-order2-confirmation.png |
| 7 | Sign-out | PASS — clicked Account menu → Logout button (popup-only, no /sign-out page navigated, consistent with BL-AUTH-007). Redirected to `/sign-in?returnUrl=/account/orders`; account-button gone; session cleared. Did NOT explicitly click "Stop Impersonation" — sign-out cleanly terminates both the impersonation session and the operator session in a single step. | — |

## Order creator attribution (IMP-030 sanity)
- **Order 1 (CO260513-00001, BMW-Group):** Storefront order detail/list does NOT expose a "Creator/Placed by" field on the UI. Billing/shipping address blocks show "Le Na" (target's saved address contact name) + target email (maseweinnouwe-5837@yopmail.com). No operator (ricreyacrouyi-3425) identifier is visible to the user on the order page. The impersonation banner *was* present in the header at time of placement (`SmokeTest Runner logged in as BMW-Group / Alice May`).
- **Order 2 (CO260513-00002, IBM org):** Same — no Creator field on storefront. Billing/shipping shows "Le Na" + maseweinnouwe-5837@yopmail.com.
- **Follow-up needed (qa-backend-expert):** Cross-check both orders in Admin SPA → Orders → CO260513-00001 / CO260513-00002 → expect `Creator` / `CustomerName` audit fields to differentiate operator (ricreyacrouyi-3425 / SmokeTest Runner) from customer-of-record (Alice May / maseweinnouwe-5837). If Creator = target instead of operator, that is a P0 audit gap (IMP-030 invariant: orders placed under impersonation MUST be attributable to the operator on the back-office side for compliance/audit purposes).

## Findings

### POSITIVE (this scenario PASSED)
- **Silent impersonation works for operators with `platform:security:loginOnBehalf`** — direct navigation to `/account/impersonate/{userId}` swapped the customer context with no challenge form, just a brief loader, then header updated to show `SmokeTest Runner logged in as BMW-Group / Alice May`.
- **Order placement during impersonation is fully functional.** Two orders were created successfully end-to-end (cart + CyberSource embedded card form + Place Order + confirmation page + persisted to /account/orders list).
- **Multi-org switching during impersonation works.** Account popup → Organizations section → click second org. Header updates instantly, cart context swaps to the new org's cart (per BL-B2B-001 org-scoped carts), order history filters to the active org.
- **Sign-out cleanly terminates impersonation + operator session in one step.** No need to explicitly use Stop Impersonation (which has a separate known bug from prior runs).

### OBSERVATIONS / MINOR FINDINGS
1. **F1 — No "Login on behalf" UI action on storefront Company Members page** (Severity: Low/UX). Operator (Org Maintainer role) sees Actions menu with only `Edit role / Block user / Delete`. To impersonate, operator must know the target userId AND construct/visit `/account/impersonate/{userId}` URL manually. This is a friction point — Org Maintainers granted CanImpersonate should have a one-click "Login on behalf" action in the Actions menu on the storefront members table. Currently no UI affordance exposes the silent-impersonation route.
2. **F2 — No Creator/Placed-by field visible on storefront order detail under impersonation** (Severity: Medium/visibility, no UI defect strictly). The target (Alice May) — if she logs in later — will see CO260513-00001/00002 in her order history with no indicator that an operator (SmokeTest Runner / ricreyacrouyi-3425) placed them on her behalf. This is a transparency gap. Back-office attribution (per Admin SPA) is the audit trail; needs qa-backend follow-up to confirm.
3. **F3 — Both orders show status "Payment required" immediately after CyberSource embedded-form submission** (Severity: Likely by-design, needs confirmation). The CyberSource sandbox card `4622943127013705` was accepted on both submits, order numbers were issued (CO260513-00001/00002), confirmation page reached. But the orders list shows status "Payment required" instead of "Processing" or "New". May be normal for CyberSource sandbox (authorization captured but no settle), or could indicate the embedded payment widget didn't finalize the payment intent. Cross-check the order in Admin SPA → Payments tab to see whether the CyberSource transaction is `Authorized` / `Captured` / `Failed`.
4. **F4 — Pre-existing items in both target carts** (Severity: Informational). Both BMW-Group cart (3 items, ~$1,460) and IBM org cart (multiple items, ~$1,089) had inventory from prior sessions. The Fanta Mango Soda added during this run was added on top. This is correct behavior (carts are persisted server-side per org/customer); just noting that the test added 1 item but checked out a cart of many.

## Verdict: PASS WITH NOTES

Core scenario flow (impersonate → order → switch org → order → sign out) executes end-to-end without functional failure. All BL invariants exercised held:
- BL-IMP-001 (silent flow for operators with CanImpersonate): PASS
- BL-B2B-001 (org-scoped cart isolation): PASS — cart context swapped on org switch
- BL-AUTH-007 (popup-only sign-out): PASS
- BL-CHK-003 (double-submit prevention): IMPLICIT PASS — Place Order disabled and orders are sequential CO260513-00001, -00002 (no duplicate numbers)
- BL-CHK-006 (subtotal − discount + tax + shipping = total): Order 1: 1,615.00 − 398.20 + 243.36 + 0 = 1,460.16 PASS. Order 2: 1,089.45 − 138.25 + 220.24 + 150 = 1,321.44 PASS.

Three minor findings (F1–F3) and one informational (F4) merit follow-up; none block the scenario verdict. Recommended next actions: (a) qa-backend-expert verifies Admin SPA Creator attribution for both orders, (b) UX bug ticket for F1 (no Login-on-behalf action in storefront members Actions menu), (c) verify F3 (Payment required status) is sandbox-expected via Admin SPA payment-tab inspection.
