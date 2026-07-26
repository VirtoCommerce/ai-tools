# VCST-5505 — Reproduction Report `[Bug/Medium]`

**Verdict: BUG REPRODUCED** (backend / GraphQL xAPI layer)

**Env:** vcst-qa @ Platform 3.1046.0, XCart **3.1026.0** (released) — pre-fix baseline. Fix PR (vc-module-x-cart #135, XCart 3.1027.0-pr-135) NOT deployed.

## Summary
When the platform REST Cart API (`/api/carts`, vc-module-cart) saves a change to a cart, the XCart (xAPI) `CartAggregate` cache keyed by cart id is not invalidated. A subsequent GraphQL `cart` query returns the STALE pre-change aggregate. Confirmed: a REST quantity change landed server-side (2→5, verified by REST GET) yet xAPI kept returning quantity 2 / subtotal $119.98, still stale after 45s.

## Method
Fully API-driven, single canonical GraphQL-runner case (GraphQL through `scripts/graphql/graphql-runner.ts`, REST through its `[REST-OP]` tags — same OAuth2 ORG_USER token throughout). No hardcoded data: product resolved via `@td(BUYABLE_PRICED_PRODUCT.id)` (STD-001 / `ALCE0128`, $59.99).

- Auth: OAuth2 password grant, `ORG_USER` (`USER_EMAIL`), storeId `B2B-store`.
- Cart: `f5896eb9-4dd7-4953-b12c-cc62c777daae` · line item `26f2f1cb…` · userId `68fed13a…`

## Steps + Evidence (before → after)

| # | Action (layer) | Result |
|---|----------------|--------|
| 1 | xAPI `addItem` qty **2**, then xAPI `cart` query (primes XCart cache) | `itemsQuantity=2`, line qty **2**, `subTotal=$119.98` |
| 2 | REST `GET /api/carts/{id}` (verify seed landed) | line qty **2** — consistent |
| 3 | REST `PUT /api/carts/{id}/items?lineItemId=…&quantity=5` | **204** (write) |
| 4 | REST `GET /api/carts/{id}` (verify write landed) | line qty **5** ✅ write landed server-side |
| 5 | xAPI `cart` query (same query as step 1) | line qty **2**, `subTotal=$119.98` ❌ **STALE** |
| 6 | wait 45s, xAPI `cart` query again | line qty **2**, `subTotal=$119.98` ❌ **STILL STALE** |

**Decisive contrast:** after the REST change, REST reports qty **5** while xAPI reports qty **2** (and unchanged $119.98 subtotal). A fresh xAPI read would show qty 5 / subtotal $299.95.

Rigor checks satisfied: write verified before blaming cache (step 4 = 5); staleness persists ≥45s so it is not a short-TTL eventual-consistency lag (step 6); the GraphQL endpoint was called server-side directly (`POST /graphql`), so this is the server-side XCart `CartAggregate` cache, not an Apollo/client cache.

Runner verdict PASS 11/11 (all before/after assertions held). Evidence: `scripts/.graphql-evidence/VCST-5505-REPRO-*.json`; case `.fix-workspace/_scratch/vcst-5505-repro.csv`.

## Business Rule
Violates **BL-CROSS-009** (bounded eventual consistency — any change must be reflected across cache layers within 120s; here the xAPI cache stays stale indefinitely, never invalidated). Also a cart-state cross-surface consistency defect: REST and xAPI must agree on the same cart id.

## Root cause (per PR #135)
REST cart save raises `CartChangedEvent` but pre-fix xAPI does not handle it, so `GenericCachingRegion<CartAggregate>.ExpireTokenForKey` is never called. PR #135 adds a `CartChangedEvent` handler that expires the token.

_Pre-fix baseline on XCart 3.1026.0; fix PR #135 pending deploy. No tracker ticket filed, no JIRA change, no PR opened — reproduction only._
