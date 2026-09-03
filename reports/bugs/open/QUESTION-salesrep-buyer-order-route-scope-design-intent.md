# OPEN QUESTION (not filed): is a sales rep intended to read any order via the buyer route?

**Status:** **NOT FILED — reclassified pending design confirmation.** Provisional archetype `BY-DESIGN`
(`vc-bug-catalog` §Defect archetypes: *"The behaviour is intentional. Filing it is the bug."*)
**Type:** Authorization scope — a design-intent question, not a confirmed defect
**Provenance:** IN-SCOPE — introduced by the widened rep visibility in `vc-module-sales-rep#14` / `vc-module-x-api#84` being consumed by the pre-existing buyer-order resolver
**Invariant violated:** `BL-SR-002` `[P0-security]` — *"an organization the rep does not serve yields no data (null / zero / empty), never a leak"*
**Ticket:** VCST-5733 · **Case:** `SR-CO-012` · **Condition:** G11

**Env:** vcst-qa @ Platform 3.1063.0 · SalesRep `3.1007.0-pr-14-5569` · Xapi `3.1021.0-pr-84-0180` · XOrder 3.1010.0 · theme `2.57.0-pr-2444-5946`

## Why this is a question and not a bug report

**Reclassified 2026-09-02 on the product owner's judgment:** the order-details rendering — including
`Pay now` — is stated to be the frontend's own logic, applied uniformly on every order-details page.
Two claims this report originally made are retracted, both correctly:

1. **`Pay now` is not a rep capability.** It renders for any order in `New` / `Payment required` status,
   exactly what these fixtures carry. Its presence is ordinary status-driven rendering, downstream of the
   read rather than independent evidence of escalation. The first grading double-counted it.
2. **The frontend is not the right place to look.** It can only render what the API returns, so "the
   frontend shows it" and "the API should have returned it" are different questions, and only the second
   is a defect question.

Per `feedback_verify_design_intent_before_bug`, design intent is verified **before** filing — so this is
filed nowhere and blocks nothing. It is retained because one observation is not yet explained by uniform
frontend logic, and it is cheap to settle.

**The single discriminating fact.** Identical URL, same order, same environment:

| Caller | Result |
|---|---|
| sales rep (does **not** serve that org) | HTTP **200**, `errors: null`, full order rendered |
| plain TechFlow org **maintainer** (non-rep) | **403 Access denied** |

Uniform frontend logic would treat both callers the same. Something server-side distinguishes them, and
`GetFullOrder` answering `200` with `errors: null` is the **API** releasing the data — not the storefront
choosing to draw it.

**The one question that closes this:** is the sales-rep role *intended* to carry broad, store-wide order
read — in which case this is fully by design, `BL-SR-002`'s scoping statement governs only the
`salesRep*` query family, and the finding is retracted outright — or is it intended to be limited to the
organizations the rep serves, in which case the buyer `order(id:)` resolver is the gap, and the new hub
routes guarding themselves correctly is what made the difference visible?

If the answer is **by design**, the useful follow-up is not a bug but an **oracle amendment**:
`BL-SR-002` `[P0-security]` currently reads *"an organization the rep does not serve yields no data …
never a leak"* with no surface qualifier, so as written it asserts something untrue of this route and
will re-trigger this same finding on every future run.
## Summary
The Sales Rep Hub's own new routes scope correctly on **every** authorization cell tested. But the
**pre-existing buyer-facing route `/account/orders/{orderId}`** now honours the rep's widened visibility
with no scope check of its own. A signed-in sales rep who types that URL gets the full buyer order page —
including for an organization they **do not serve**. (The `Pay now` control visible on it is ordinary
status-driven rendering for a `New` / `Payment required` order, not a rep-specific capability.)

Two pages, two authorization rules, one order. The hub route refuses; the buyer route serves.

## Steps to Reproduce
1. Sign in to the storefront as a sales rep: `@td(SR_REP_PRIMARY.email)`.
2. **Served org, order the rep did NOT place** — navigate directly to `/account/orders/@td(ORDER_BUYER_PLACED.id)`.
   → Buyer order page renders with **`Pay now` enabled**. Clicking it reaches a live
   `/account/orders/{id}/payment` page offering **Edit** on both billing address and payment method.
   *(No payment was submitted.)*
3. **Organization the rep does NOT serve** — navigate directly to `/account/orders/@td(ORDER_NOT_SERVED.id)`.
   → Page renders **in full**: order number, totals, buyer name, complete German billing address, phone,
   email, and `Pay now`. The underlying `GetFullOrder` returns **HTTP 200 with `errors: null`** and a
   populated `availablePaymentMethods`.
4. **Discriminator — prove it is rep-specific, not a platform-wide IDOR.** Sign in as a plain TechFlow
   organization **maintainer** (non-rep) and open the same URL from step 3.
   → **`/403 Access denied`.**
5. **Control — the ticket's own routes are correct.** As the same rep: the list route for an unserved org
   returns a 404 guard (*"Customer not found or not among your customers"*, zero orders leaked), and the
   hub order-detail route for an unserved order returns *"Order not found"* without leaking the number.

## Expected vs Actual
- **Expected (`BL-SR-002`, membership half):** an order belonging to an organization the rep does not serve yields no data on **every** surface. The rep pathway should be refused exactly as the non-rep maintainer is.
- **Expected (PR #2444's own spec):** *"A rep can therefore see and print a colleague's order but never act on it."*
- **Actual:** the buyer route returns the complete order, i.e. cross-organization PII. Whether the payment it offers would actually be authorized for this caller is UNVERIFIED (see above).

## Why this is IN-SCOPE rather than a pre-existing buyer-page bug
Step 4 is the discriminator: the identical URL is correctly refused (`403`) for a non-rep with
organization-maintainer privileges. Only the **sales-rep** pathway passes. The buyer route is old; the
*visibility it now honours* is new, arriving with the widened rep scope in `SalesRep#14` /
`Xapi#84`, which the buyer `order(id:)` resolver also consumes. Every route this PR added guards itself;
the leak is the un-guarded surface downstream of the same shared builders.

## Caveat that survives either answer

Whether the server would **authorize a payment** by a non-owning rep on a foreign order is
**UNVERIFIED** — the run reached the payment page but submitted nothing. That question is independent of
the read question above and is not settled by a "by design" answer to it. **Settle it by reading the
payment authorization path in source, never by attempting a live payment** on another organization's
real order in a shared environment.

## Suggested fix direction (not prescriptive)
The hub surfaces re-check every **loaded** order through `ISalesRepOrderVisibilityService`
(`IsVisibleAsync` / `FilterVisibleAsync`) precisely because index scope can be stale. The buyer
`order(id:)` path appears to have gained rep visibility without the corresponding re-check. Note that
`CanAccessOrderAuthorizationRequirement`'s effective rule is *administrator role OR
`order.CustomerId == caller` OR the caller's contact belongs to the order's organization* — a serving rep
is none of those, which is why the non-rep maintainer is correctly refused and is the shape the rep
pathway should match.

## Evidence
`reports/tickets/Sprint26-17/VCST-5733/screenshots/SR-CO-012-FAIL-typed-buyer-url-paynow-on-foreign-order.png`

## Notes
**Nothing was filed and no tracker item exists for this.** The file is the run's record of a question
raised and reclassified, not an open defect. If the answer is "by design", delete it and amend
`BL-SR-002` instead; if the answer is "should be scoped", re-grade and file it then.
