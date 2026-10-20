# Evidence index — cart read/write split (two unnamed-type carts)

- Env: `TEST_ENV=vcptcore_qa1` (vcptcore-qa1-storefront.govirto.com), store B2B-store, USD, en-US
- Versions: Platform 3.1079.0-pr-3135-163c · XCart 3.1042.0 · Cart 3.1012.0 · XOrder 3.1016.0 · Theme 2.60.0-pr-2564-ff59-ff5983c3 (footer)
- Browser: playwright-edge (msedge), 1920x1080, password sign-in
- Window: 2026-10-14 17:29–17:37 UTC
- Buyer (temporary, deleted): AGENT-TEST-CARTSPLIT, org @td(PUNCHOUT_MAPPING_REQUISITION.organizationId)
- Carts: `default` 01d964d6-6679-417d-96dd-73a7df03f8d5 (X = AGENT-TEST-PO-UOM-001 x3, $72) · `AGENT-TEST-Other-Channel` 05aaefca-5d09-4c28-9b40-218d7be00cae (Y = AGENT-TEST-PO-PLAIN-001 x2, $24, created 3 s later)

| # | Artifact | Shows |
|---|---|---|
| 1 | network/01-xapi-addItem-responses.json, 01-carts-after-setup.json | setup: addItem X (no cartName) -> `default`; addItem Y (cartName) -> named cart |
| 2 | screenshots/01-cart-page-shows-named-cart.png | /cart displays Y x2, $24 (the named cart) |
| 3 | network/rest-carts-02-after-cart-load.json | auto AddOrUpdateCartShipment/Payment on load landed on `default` (empty shipment+payment), named cart untouched |
| 4 | screenshots/02-*.png + rest-carts-03 | buyer picked org address -> address saved on `default`; page still "Please select a shipping address" |
| 5 | screenshots/03-*.png + rest-carts-04 | Fixed Rate (Ground) -> saved on `default` (total 72 -> 82); page still "Select a delivery method", total $24 |
| 6 | screenshots/04-*.png + rest-carts-05 | Cash (DefaultManualPaymentMethod) -> saved on `default`; page still "Select a payment method"; Place order disabled |
| 7 | screenshots/05-after-reload.png + rest-carts-06 | reload + 2nd address pick: same; `default` now holds 5 shipments / 3 payments of junk |
| 8 | screenshots/06-after-clear-cart.png + rest-carts-07 | Clear cart -> Yes: page still shows Y x2; `default` cart (X x3, never shown) was emptied |
| 9 | network/graphql-cart-ops.json | every GetFullCart / AddOrUpdateCartShipment / AddOrUpdateCartPayment / ClearCart: no cartId, no cartName in variables; read responses id 05aaefca, write responses id 01d964d6 |
| 10 | har/cart-split-session.redacted.har | full session (auth headers, cookies, token bodies, WS JWTs redacted) |
| 11 | console/*.log | no errors on cart load / reload |
| 12 | repro.gif | frames 01-06 (stills kept beside it) |

Trace IDs: not applicable — no failing request; every op 200 with no GraphQL `errors[]`. App Insights not queried (logic defect, no exception).
Attempts: 3 write attempts (address x2 across a reload, delivery, payment) + Clear cart — 100% reproducible.
