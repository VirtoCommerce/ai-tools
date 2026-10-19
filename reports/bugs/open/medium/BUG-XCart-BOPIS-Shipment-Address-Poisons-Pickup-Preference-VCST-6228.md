# BUG: addOrUpdateCartShipment (BuyOnlinePickupInStore) with a deliveryAddress stores the address JSON as the user's last pickup location — DB_UPDATE/SQL, and every later pickup call without pickupLocationId fails — Medium

## Status: CONFIRMED
**Found by:** agent — testing VCST-5755
**Tracker:** [VCST-6228](https://virtocommerce.atlassian.net/browse/VCST-6228) (Bug, Medium, Draft; relates to VCST-3698; labels found-by-agent, found-in-testing; vc-fix/qa-autofix withheld — API-only repro)

**Env:** vcst_qa (`TEST_ENV=vcst_qa`) · captured 2026-10-08 21:40 and 22:12–22:23 UTC · reproduction rate: trigger 6/6, poisoned preference 3/3, controls 5/5
**Recurrence of VCST-3698** (Done 2025-10-03, same symptom: `String or binary data would be truncated … CartShipment.PickupLocationId`). That ticket was closed after a customer-module release and a data cleanup (`DELETE FROM CustomerPreference`); the code path that writes the bad value was not changed, so it re-poisons on the next qualifying call. Found incidentally during VCST-5755 (Sales Rep statistics cache) exploratory testing — **out of scope for VCST-5755**.

## Summary
For a pickup shipment (`shipmentMethodCode: BuyOnlinePickupInStore`), the xAPI cart handler saves the request's `deliveryAddress` — serialised as JSON (~650 chars) — into the user+organization "last pickup location" preference whenever no `pickupLocationId` is sent. The next load copies that JSON into `Shipment.PickupLocationId` (max 128), so the cart save fails with a database error instead of a validation error. The preference stays poisoned: from then on **every** pickup call by that user in that organization that omits `pickupLocationId` fails, in any cart and across sessions, until a valid location is chosen once.

## Preconditions
- A store with the BuyOnlinePickupInStore shipping method and at least one active pickup location.
- A signed-in customer with a cart in an organization (token from `POST /connect/token` with `storeId` + `organization_id`).

## Steps to reproduce (xAPI, `POST /graphql`)
1. `addOrUpdateCartShipment` with `shipment: { shipmentMethodCode: "BuyOnlinePickupInStore", shipmentMethodOption: "Pickup", deliveryAddress: { …any valid address… } }` and **no** `pickupLocationId`.
2. Repeat with no `deliveryAddress` and no `pickupLocationId`.
3. Control: the same call with a valid `pickupLocationId`, then step 2 again.

## Actual
1. HTTP 200 with `errors[].extensions.codes = ["DB_UPDATE","SQL"]` ("Error trying to resolve field 'addOrUpdateCartShipment'"); the cart is not saved. The preference `CartShipmentLastAddress.<orgId>.BuyOnlinePickupInStore` now holds the address JSON (657 chars), written although the mutation failed.
2. Same `DB_UPDATE/SQL` — the poisoned preference alone breaks it (also on a fresh empty cart).
3. With a valid `pickupLocationId` the call succeeds and the preference is back to the 36-char id; step 2 then succeeds.
The storefront's own payload shape (`{ id, deliveryAddress }` against an existing pickup shipment, as `useCheckout.updateBillingOrDeliveryAddress` sends it) triggers it too (`111-R2`).

## Expected
Per the documented contract every `command.shipment` field is optional (docs: xAPI › Cart › mutations › add-or-update-cart-shipment), so the call either ignores the address for a pickup shipment or fails with a validation error. It never stores an address as a pickup location id, and never returns a database error.

## Evidence (non-visual — API defect, no browser; no screenshot applies)
Investigation package: `reports/tickets/Sprint26-20/VCST-5755/vcst_qa/evidence-X11/` — `evidence-index.md` (call ledger), `root-cause.md`, `network/` (52 request/response logs; trigger `11-`…`13-B*`, `62-N4`, `81-S2`, `111-R2`; poisoned `10-A`, `14-C`, `63-N5`; repair `65-N6`→`66-N7`, `112-R3`→`113-R4`; preference read-back `POST /api/customer-preferences/search` in `00-`, `20-`, `100-`, `122-`). No trace id is exposed in the responses and no App Insights query was run, so the SQL truncation itself is inferred from source and from VCST-3698's stack trace.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | not exercised in a browser; the storefront payload shape reproduces over API (`111-R2`); UI reachability not established |
| 2. Backend Admin | N/A | no admin surface; stored state read over REST (layer 4) |
| 3. GraphQL xAPI | FAIL | `addOrUpdateCartShipment` → `DB_UPDATE/SQL` (`network/11-B1`) |
| 4. Platform REST API | PASS (state read) | `POST /api/customer-preferences/search` shows the poisoned preference value; `GET /api/carts/{id}` shows the unsaved cart |

**Owning layer:** Layer 3 — xAPI cart command handler.

## Module Versions
Platform 3.1076.0 · XCart 3.1040.0-pr-149-9fe0 (`git diff` vs `origin/dev` empty for the 3 files involved) · XPickup 3.1008.0 · Cart 3.1012.0 · Customer 3.1029.0 · Shipping 3.1009.0 · Xapi 3.1026.0

## Root Cause Analysis
- `vc-module-x-cart` `src/VirtoCommerce.XCart.Data/Commands/AddOrUpdateCartShipmentCommandHandler.cs` l.149 `var value = pickupLocationId ?? JsonConvert.SerializeObject(address);` — the BOPIS-keyed preference falls back to the address JSON; l.57–60 save it before (and independently of) the cart save.
- Same file l.128–131: for BOPIS the saved value is loaded into `shipment.PickupLocationId` (after `ClearAddressInfo` l.166–169 nulls the address).
- `vc-module-cart` `ShipmentEntity.cs` l.90–91 `[StringLength(IdLength)] PickupLocationId` (128) — the 634–657-char value cannot be stored.
- Introduced by `1878a7e` (VCST-3449, #59, 2025-07-23) on top of `50686c1` (VCST-3126); the handler is unchanged since `846065c` (2026-04-01). Not a recent regression; fix-forward.
- Collateral (MEDIUM): after a failure on a cart with a line, other mutations on that cart (FixedRate, valid-location BOPIS, `changeComment`) also failed for 1–7 min, and a comment sent by failed calls was persisted by the next successful save — consistent with `CartAggregateRepository.SaveAsync` l.66–86 not clearing the cached aggregate when the save throws. May deserve its own ticket.
- Possibly related: `reports/bugs/open/critical-high/BUG-cart-mutations-target-shadow-cart-not-rendered-cart.md` records unexplained `Error trying to resolve field 'addOrUpdateCartShipment'` errors.

## Data
rep2 / AGENT-TEST-SR5755-Org-C: cart `d45a89c0-…` cleared (0 lines/shipments/addresses/payments), cart `d7870076-…` removed, BOPIS preference `e180674c` repaired to a valid location id and re-verified, FixedRate preference `9180571e` holds an AGENT-TEST address (a normal value). kb: KB-BABFCC8C.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** VirtoCommerce/vc-module-x-cart
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** xCart `AddOrUpdateCartShipmentCommandHandler` (BOPIS last-address preference save/load); secondary `CartAggregateRepository.SaveAsync` cache on a failed save
- **RCA anchor:** `AddOrUpdateCartShipmentCommandHandler.cs` l.149 `pickupLocationId ?? JsonConvert.SerializeObject(address)` and l.128–131 `shipment.PickupLocationId = savedValue`
- **Routing confidence:** HIGH (primary defect, single repo); the collateral cache item is MEDIUM and may be a separate ticket
