# Coverage gap analysis — vc-frontend-next storefront

**Run:** COV-2026-11-17-1230 · **Scope:** vc-frontend-next (the 3.x redesign theme, repo `VirtoCommerce/vc-frontend-next`, branch `dev`) · **Stand:** virtostart · **Records:** `gap-inventory.json`

## Verdict

Next has **no regression suite of its own**. All storefront suites are written for vc-frontend
(the 2.x theme), and Next has its own design, so a vc-frontend case is not evidence for Next.
The only Next-related rows are **27 Draft cases** inside vc-frontend suites. They are gated on a
Next build, none is Automated, and they assert vc-frontend UI:

| Suite | Rows | What they cover |
|---|---|---|
| 028 Cart core | CART-119..123 | Single-page checkout sections in the cart, max quantity |
| 033 Auth / company account menu | AUTH-078..082 | Mobile menu highlight, profile and address server errors |
| 043 Google Analytics | GA-061..067 | GA4 list events on infinite scroll, compare, sign-in |
| 046 Localization | L10N-001..006 | Language switch on PDP, category, single-language pages |
| 111 MFA sign-in | MFASF-014 | Code step on the static-page sign-in |
| 114 Passkey sign-in | PKS-023..024 | Security page link and passkey delete |

**What Next serves (inventory, from `client-app/router/routes/*` and `client-app/modules/*` on `dev`):**
about 30 routes (home, catalog/category, product, search, compare, bulk order, branch, sign-in,
sign-up, password flows, error pages, account, company, checkout routes and a completed page)
plus 12 modules (quotes, returns, loyalty, purchase requests, back-in-stock, customer reviews,
push messages, news, MFA, punchout, Skyflow, Google Analytics).

## Totals

| Priority | Gaps | Covered by the new P0 suite (121) |
|---|---|---|
| P0 | 8 | 8 |
| P1 | 11 | 2 (forgot-password page, mobile header) |
| P2 | 7 | 1 (404 page) |

By category: ZERO_COVERAGE 19 · SHALLOW_HAPPY 7. By domain: purchase-flow 5, customer-b2b 7,
catalog-search 4, cross-cutting 4, auth-security 3, marketing 2, communication 1, platform-config 1.

## Top gaps (score = revenue 40% · frequency 25% · severity 20% · existing coverage 15%)

| Gap | Pri | Score | Feature |
|---|---|---|---|
| GAP-004 | P0 | 9.6 | Product page: price, stock, add to cart, add to list or compare |
| GAP-006 | P0 | 9.5 | Checkout: shipping, billing, review, payment, completed page |
| GAP-001 | P0 | 9.4 | Home page: built-in demo home (KB-A788D882) |
| GAP-005 | P0 | 9.4 | Cart: add, change quantity, remove, totals |
| GAP-007 | P0 | 9.1 | Sign-in and sign-out, form validation |
| GAP-002 | P0 | 8.9 | Header search: suggestions, results page, no results |
| GAP-003 | P0 | 8.9 | Catalog redesign (VCST-6050): view toggle, 4 sorts, 3 switches, end of list |
| GAP-008 | P0 | 8.3 | Account: dashboard, order history, order details |
| GAP-017 | P1 | 7.6 | Mobile (390 px) header, menu, cart |
| GAP-009 | P1 | 7.2 | Sign-up form and validation |
| GAP-010 | P1 | 6.8 | Forgot, reset and set password |
| GAP-015 | P1 | 6.7 | Bulk order |
| GAP-012 | P1 | 6.4 | Lists, shared list, saved for later |
| GAP-013 | P1 | 6.2 | Company info, members, organization switcher (KB-F97583AC, VCST-6136) |
| GAP-020 | P1 | 5.9 | Quotes |
| GAP-011 | P1 | 5.7 | Profile, addresses, change password, security page |
| GAP-018 | P1 | 5.5 | Language and currency switch |
| GAP-014 | P1 | 5.1 | Compare |
| GAP-019 | P1 | 5.0 | GA4 events |
| GAP-022 | P2 | 4.8 | Loyalty |

## Grounding

- **Docs:** the VirtoOZ storefront guide names Next only as the redesign that is "still evolving"
  and illustrates vc-frontend. So for Next, the guide is evidence of the **mechanism** (for example
  the In stock and Purchased before filters), never of the **surface** (labels, layout, controls).
  Surface claims in the new suite are `{OBSERVED}` on virtostart or `{SPEC}` from Next source.
- **Design:** the catalog follows the Paprika design. Its decided departures are listed in
  `client-app/shared/catalog/specs/VCST-6050-paprika-catalog/DIVERGENCES.md` in Next. A case asserts
  what that file says the catalog does, not what the design draws.
- **Rule:** a vc-frontend case is never edited to match Next. Next behaviour gets its own cases.

## Live on virtostart (Next 3.3.0, 2026-11-17)

The stand's footer reads "Ver. 3.3.0" (Next), while the source read is `dev` 3.4.0. Checkout is one
page on `/cart` and ends on `/checkout/completed` (KB-8357EF95); the step routes in the source are
not used. One order was placed with the invoice method. Suspected defects, none filed:
the home "Shop by category" and "Popular with buyers" sections render empty (KB-6FCBD344);
PDP recommendations list products from another assortment at $0.00 (KB-110F4580);
Application Insights is blocked by the CSP `connect-src` on every page; the profile placeholders
are wrong (KB-052D601E); the listing switches expose no on/off state to screen readers; a footer
link has no leading slash. For a product decision: "Pay now" on an invoice order, no PO number on
the order page, and the 404 page returns HTTP 200.

## Next

1. Suite **121 — Next P0 smoke** (this run) covers GAP-001..008, plus GAP-010, 016 and 017.
2. P1 gaps: one suite per domain (account and company, sign-up and passwords, lists and compare,
   bulk order, quotes). The 27 Draft rows above should be moved out of the vc-frontend suites into
   these Next suites, rather than run as vc-frontend cases.
