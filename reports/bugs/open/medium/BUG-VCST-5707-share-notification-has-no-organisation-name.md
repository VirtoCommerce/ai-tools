# List-share notification does not name the organisation (VCST-5707 AC1 not implemented) — [Medium]

**Env:** vcptcore-qa · theme 2.59.0-pr-2476-0604 · SalesRep 3.1012.0-pr-21-f681 · 2026-09-29
**Found by:** /qa-test VCST-5707 (3x, 4a A1.1, C1 B2C-LIST-070/053) · **Provenance:** IN-SCOPE (AC1) · **Archetype:** FALLBACK

## Summary
VCST-5707 AC1: *"The notification template includes the Organisation Name to clarify which organisation was shared."* The push a recipient receives has no organisation name, and neither does the default text. No PR in the change set touches the notification template (`SalesRepMessageEmailNotification` renders only `title` + `message`); the frontend design spec lists it as out of scope.

## STR
1. As @td(SR_REP_PRIMARY) share a list with @td(ORG_ACME) (Specific customers), with and without a message.
2. As @td(ACME_BUYER) read the notification bell / `pushMessages`.

## Expected vs Actual
- Expected: the notification names the organisation the list was shared for.
- Actual: title "A new list from your sales representative"; body = rep note + link, or the default "Hi! I've just shared the list "X" with your organization. Take a look:" + link. No organisation name — a member of several target organisations cannot tell which one it is for. Email was not readable in this run (no admin access); the template source has no organisation field.

## Evidence
`reports/tickets/Sprint26-19/VCST-5707/screenshots/4a-fe-reader-bell-no-org-name.png`; `SendCustomerCommunication` request bodies (4a storefront run).

## Fix Routing
Decide the layer — the email/push template in `vc-module-sales-rep`, or the title the storefront composes in `wishlist-customer-sharing.vue`. The design spec deferred exactly this decision.
