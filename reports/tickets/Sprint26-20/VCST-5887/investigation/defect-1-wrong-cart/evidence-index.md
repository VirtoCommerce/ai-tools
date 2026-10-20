# Evidence index: VCST-5887 defect 1, requisition built from a cart the buyer never saw

**Verdict:** REPRODUCED (1 clean run, 2026-10-14 11:25–11:26 UTC; the same outcome was seen on 5 earlier runs today, listed in the brief)
**Env:** TEST_ENV=vcptcore_qa1 (ENV_RISK=test). Storefront `vcptcore-qa1-storefront.govirto.com`, theme `2.60.0-pr-2564-ff59-ff5983c3` (footer). Punchout `3.1000.0-pr-2-f940` = PR #2 head `f9403cbbe1db1963664cae628df065e39af4301d`.
**Browser:** playwright-chrome (chromium 154), 1920x1080. The buyer acted through the UI only. Setup ran through xAPI as the buyer, and the session was minted through `/api/punchout/cxml`.
**Actor:** dedicated buyer @td(PUNCHOUT_MAPPING_REQUISITION) (mapping AGENT-TEST-PO-300, config 0). Products: X = @td(PUNCHOUT_PRODUCT_UOM), Y = @td(PUNCHOUT_PRODUCT_PLAIN).
**Trace IDs:** the xAPI responses carry no `Request-Id`/`traceparent`; they carry only Cloudflare `cf-ray`. App Insights is not configured for this env (`APPINSIGHTS_APP_ID_*` unset), so there are no server traces. Each claim below is backed by the request/response bodies instead.

| # | Step | Observation | Artifact |
|---|---|---|---|
| 1 | `seed:punchout:reset-carts` | buyer holds only an empty `default` cart | (console run) |
| 2 | xAPI `addItem` with no cartName, X ×3 | cart `default` 1639b85b… = X×3 @24.00 | `network/carts-before.txt` |
| 3 | xAPI `addItem` with cartName `AGENT-TEST-Other-Channel`, Y ×2 | named cart a22dc6c3… = Y×2 @12.00 | `network/carts-before.txt` |
| 4 | Carts before the session | 2 carts. `Query.cart` (no cartName) returns the named cart, `Query.cart(cartName:"default")` returns X×3 | `network/carts-before.txt` |
| 5 | Punchout session (config 0) to the storefront | "Punchout mode" shown, header cart badge **2** | HAR |
| 6 | Click Cart, open `/cart` | page shows **Y (Plain) ×2, Subtotal/Total $24.00** | `screenshots/01-cart-page-shows-named-cart.png` |
| 7 | Request that decides the displayed cart | `GetFullCart` vars `{storeId,userId,currencyCode,cultureName}`: **no cartId, no cartName**. The response is the named cart a22dc6c3… Y×2 | `network/GetFullCart-request.json`, `-response.json` |
| 8 | Incidental: cart-page auto mutation | `AddOrUpdateCartShipment` (no cartId/cartName) returned and **wrote to the `default` cart** 1639b85b… X×3. The page reads one cart and writes another | `network/AddOrUpdateCartShipment-*.json`, `cart-ops-summary.json` |
| 9 | Click **Create requisition** | `createRequisition` vars `{storeId,cultureName,currencyCode}`: the input type has **no cart field** | `network/createRequisition-request.json`, `network/schema-input-fields.txt` |
| 10 | Response and return page | cXML `<Total>` **USD 72.00**, one `ItemIn` **AGENT-TEST-PO-UOM-001 qty 3** @24.00 box. Y is absent | `network/createRequisition-response.json`, `network/cxml-punchoutordermessage.xml`, `screenshots/02-return-page-cxml-default-cart.png` |
| 11 | Carts after | both carts unchanged. `default` modifiedDate 11:25:46 is newer than the named cart's 11:25:09, yet `Query.cart` (no name) **still returns the named cart** | `network/carts-after-requisition.txt` |
| 12 | Cleanup | `reset-carts` run twice (the first hit a transient fetch error after deleting). The buyer is back to one empty `default` cart | (console run) |

Console: no app errors. The only messages are image `ERR_NAME_NOT_RESOLVED` for a demo CDN host and a favicon 404 on the tester site, both unrelated (`console/console-all.log`).
HAR: `har/repro-redacted.har`, scoped to this run. JWTs, cookies, the punchout start token and passwords are redacted.
Full request list: `network/requests-list.txt`. Op summary: `network/cart-ops-summary.json`.

## Can a buyer reach it through the storefront UI alone?
Not in the normal flow. Storefront writes go through cart mutations whose `CartName` defaults to `"default"`, so a buyer who only uses the punchout storefront has just the `default` cart. The defect needs a **second, newer-created cart with a null `type`** for the same user, store and currency. That cart can come from:
- another xAPI client that passes `cartName` (a mobile app, an integration, or an AI/UCP or MCP cart channel creating named carts);
- earlier non-punchout sessions of the same user account (when the punchout user is a regular storefront user too, as in the earlier lanes where {{USER_EMAIL}} held a dozen named carts);
- back-office or REST `POST /api/carts` creating a cart for the customer;
- a currency switch. This is not reproduced here; it is an inference from the `Currency` criterion and would create a per-currency cart.

Saved-for-later and wishlist carts carry a non-null `type`, so they are filtered out of `Query.cart`.
