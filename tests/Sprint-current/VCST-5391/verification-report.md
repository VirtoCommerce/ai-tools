# VCST-5391 — Fix Verification Report

**Verdict: PASS (3/3).** The `changeCartConfiguredItem` mutation now returns an **empty `errors[]`** and a **populated, non-null `configurationItems`** (each with a non-null `extendedPrice`) across all 3 consecutive edit-config-from-cart runs. The previously reported `"Error trying to resolve field 'extendedPrice'"` / `ARGUMENT_NULL` (`configurationItems = [null]`) defect is **resolved**.

- **Env:** vcst-qa storefront (`https://vcst-qa-storefront.govirto.com`, B2B-store) @ frontend theme `2.52.0-pr-2353-fa77`
- **Account:** `@td(AGENT_POOL_SLOT_1.email)` (Agent Chrome, B2B / TechFlow context) — no `/change-password` interstitial encountered; password untouched
- **Fixture:** `@td(CFG_BIKE.id)` (CFG-032, GUID `78daa2db…`, base $350; "Select one" Product section)
- **Browser:** playwright-chrome
- **Build note:** XCart backend version (`3.1024.0-pr-132-fd69`) is **not exposed** in the storefront `/graphql` response headers (only `request-context: appId=cid-v1:7d07a5e2…`) or body, so it could not be confirmed client-side as a real user. Behavior is consistent with the PR #132 fix being deployed.

## Captured `changeCartConfiguredItem` mutation responses (load-bearing evidence)

All three POST `/graphql` `ChangeCartConfiguredItem` ops returned HTTP 200. Saved bodies: `vcst5391-run1-response.json`, `…run2…`, `…run3…`.

| Run | Option change | top-level `errors[]` | `items[0].configurationItems` | `configurationItems[0].name` | `configurationItems[0].extendedPrice` | line `extendedPrice` | itemsCount / lineItemId |
|-----|---------------|----------------------|-------------------------------|------------------------------|---------------------------------------|----------------------|-------------------------|
| 1 | Seat → **Engine $225** | **none** (no `errors` key) | array len 1, **not `[null]`** | `200CC 250CC 4-Stroke Engine Motor` | **$225.00** (amount 225, non-null) | $575.00 | 1 / `43ced5bd…` (in place) |
| 2 | Seat → **Pedals $14** | **none** | array len 1, **not `[null]`** | `Pedals` | **$14.00** (amount 14, non-null) | $364.00 | 1 / `da060dde…` (in place) |
| 3 | Seat → **Rear wheel ×2 $176** | **none** | array len 1, **not `[null]`** | `Rear wheel, 26", double-wall rim, motorized` | **$176.00** (amount 176, non-null) | $526.00 | 1 / `61c6e4b3…` (in place) |

Run 1 `configurationItems[0]` (representative — was `[null]` pre-fix):
```json
{ "name": "200CC 250CC 4-Stroke Engine Motor", "type": "Product",
  "extendedPrice": { "amount": 225, "formattedAmount": "$225.00", "currency": { "code": "USD" } },
  "configurationSection": { "name": "Select one" } }
```

## Verification checklist

**Fix confirmation**
1. Original bug understanding (mutation returned `errors[]` + `[null]`) — context, confirmed by query shape (`configurationItems { … extendedPrice { …money } }`). ✅ PASS
2. After fix: `changeCartConfiguredItem` response has empty `errors[]` — **3/3**. ✅ PASS
3. After fix: `configurationItems` populated + `extendedPrice` non-null — **3/3**, root cause addressed. ✅ PASS

**Regression**
4. Cart line updates in place (itemsCount 1→1, same lineItemId per run, new price correct, no duplicate). ✅ PASS
5. Components list shows the new option after save (Engine / Pedals / Rear wheel respectively). ✅ PASS
6. No new browser console errors — only a benign external option-thumbnail 404 (`images.netdirector.co.uk … honda_crf450rx`); no ARGUMENT_NULL, no JS exceptions, no GraphQL errors. ✅ PASS

**Cross-layer**
7. Storefront reflects corrected behavior — cart line + Components list + Order Summary subtotal updated ($575 / $364 / $526). ✅ PASS
8. GraphQL `changeCartConfiguredItem` returns the expected shape (the load-bearing check) — `fullCart` with populated `items[].configurationItems[].extendedPrice`. ✅ PASS

**Edge / BL**
9. Works across ≥2 different Product-section option changes — 3 distinct options exercised (Engine, Pedals, Rear wheel-qty2). ✅ PASS
10. BL per-line config price consistent: base $350 + option extended = line `extendedPrice` ($350+$225=$575; $350+$14=$364; $350+$176=$526). ✅ PASS

## Notes
- UI does mask the response-level shape via a full-cart re-fetch (as flagged in the brief), so the verdict rests on the captured mutation **response bodies**, not just visible cart state — all three are clean.
- Console/network: GraphQL ops all 200, no `errors[]`; `x-response-time` ~1.3s. HAR auto-captured under `test-results/chrome/har/`.
- Teardown: cart cleared ("Your cart is empty"); slot-1 password not modified.

## Evidence
- Mutation responses: `vcst5391-run{1,2,3}-response.json` (this folder)
- Screenshots: `screenshots/vcst5391-run1-editmode-success.png` (edit mode, Engine $575), `screenshots/vcst5391-run1-cart-engine.png` (cart reflects Engine), `screenshots/vcst5391-run3-final-cart.png` (cart reflects Rear wheel)

---

## moveFromSavedForLater verification

**Verdict: PASS (3/3).** The `moveFromSavedForLater` mutation now returns an **empty top-level `errors[]`** and a **populated, non-null `configurationItems`** (the Seat option, with a non-null `extendedPrice`) across all 3 consecutive save-for-later → move-back runs. The previously reported `"Error trying to resolve field 'extendedPrice'"` / `ARGUMENT_NULL` (`configurationItems = [null]`) defect is **resolved** on this path too.

- **Env:** vcst-qa storefront (B2B-store) @ frontend theme `2.52.0-pr-2353-fa77`; browser playwright-chrome; account `@td(AGENT_POOL_SLOT_1.email)` (Agent Chrome) — no `/change-password` interstitial, password untouched.
- **Fixture:** `@td(CFG_BIKE.id)` (CFG-032), configured with **Seat (+$15)** → list price $365.
- **Flow per run:** add configured bike → `/cart` "Save for later" (fires `MoveToSavedForLater`) → Saved-for-later "Move to cart" (fires **`MoveFromSavedForLater`**) → capture the mutation response body.
- **Build note:** XCart backend version (`3.1024.0-pr-132-175a`) is **not exposed** in the storefront `/graphql` response headers or body, so it could not be read client-side as a real user. The clean response shape is consistent with the central-stamp fix being deployed.

### Per-run `moveFromSavedForLater` response (load-bearing evidence)

| Run | net idx | top-level `errors[]` | line `extendedPrice` | `configurationItems` | subTotal / total |
|-----|---------|----------------------|----------------------|----------------------|------------------|
| 1 | 136 | **null (empty)** | $365.00 | `[{name:"Seat", type:"Product", extendedPrice:$15.00, section:"Select one"}]` — non-null | $365.00 / $438.00 |
| 2 | 145 | **null (empty)** | $365.00 | `[{name:"Seat", type:"Product", extendedPrice:$15.00, section:"Select one"}]` — non-null | $365.00 / $438.00 |
| 3 | 153 | **null (empty)** | $365.00 | `[{name:"Seat", type:"Product", extendedPrice:$15.00, section:"Select one"}]` — non-null | $365.00 / $438.00 |

All three: `errors` = `null`; `configurationItems` populated (NOT `[null]`); every `configurationItems[].extendedPrice` resolves non-null ($15.00).

### Pass-criteria checklist (each run)
1. `errors[]` empty — no `extendedPrice` resolve error / ARGUMENT_NULL. ✅ 3/3
2. moved configured line `configurationItems` non-null & populated with the Seat option (NOT `[null]`). ✅ 3/3
3. each `configurationItems[].extendedPrice` non-null. ✅ 3/3
4. Item lands back in cart at $365.00, Components list shows `1. Select one: Seat +$15.00`. ✅ 3/3

### Notes
- UI masks the response shape via a full-cart re-fetch (as flagged in the brief), so the verdict rests on the captured `MoveFromSavedForLater` **response bodies**, not just visible cart state — all three are clean.
- Console: 0 errors / 0 warnings during the move flows (only benign Apollo-devtools INFO + WebSocket connect logs).
- Network: all `/graphql` ops 200; no `errors[]`; `dc.services.visualstudio.com/v2/track` initial 400s/ERR_ABORTED are benign App Insights beacons unrelated to the cart mutations.
- HAR auto-captured under `test-results/chrome/har/`.
- Teardown: cart cleared via "Clear cart" → "Yes" ("Your cart is empty"); saved-for-later list empty; slot-1 password not modified.

### Evidence (moveFromSavedForLater)
- Mutation responses: `run1-movefrom-response.json`, `run2-movefrom-response.json`, `run3-movefrom-response.json` (this folder)
- Screenshots: `screenshots/movefromsaved-run1-01-cart-before-save.png` (configured bike $365 in cart), `screenshots/movefromsaved-run1-02-cart-after-move-components.png` (item back in cart, Components list = Seat +$15.00), `screenshots/movefromsaved-run3-cart-final.png`
