# [vc-frontend] Cart configurable line-item summary header shows wrong selected-option label (data correct, rendering wrong)

## Status: CONFIRMED

**Severity:** Medium (display/UX — misleads the customer about what they configured; data + totals are correct)
**Env:** vcst-qa storefront — Theme `2.51.0-pr-2310`, Platform `3.1035.0`, XCart `3.1019.0-pr-124-89a6`
**Owning layer:** Layer 1 — vc-frontend (line-item configuration summary rendering)
**Reproduced:** 2026-06-11 (REG-2026-06-11-1423, suite 030 CART-114 + CART-116 — renumbered 2026-07-25 from CART-071 + CART-073, 2× confirmed)

## Summary

On `/cart`, a configurable product line's **summary header** shows the wrong selected-option value (e.g. always "Color: Emerald green / Size: S") regardless of the actual configuration. The line's expandable **Components list** correctly shows the real selection (e.g. "Black hat"), and lineItemId / per-line totals / quantities are all correct. So the data is right; only the collapsed summary-header label is mis-rendered.

## Steps to Reproduce

1. Sign in; add a configurable product (e.g. the Configurable Hat) to the cart with a specific option — **Variant A: Black**.
2. Add the same configurable product again with a **different** option — **Variant B: Green** (distinct line).
3. Go to `/cart` and read each line's **summary header** vs its expanded **Components** list.

## Expected vs Actual

- **Expected:** each line's summary header reflects that line's actual selected option (Black line shows Black; Green line shows Green).
- **Actual:** both lines' summary headers show the **same wrong** value (e.g. "Emerald green") while the Components list and totals are correct per line.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | summary header label wrong; Components list + totals + lineItemIds correct |
| 2. Backend Admin | N/A | — |
| 3. GraphQL xAPI | PASS | cart line `configurationItems[]` / components return the correct per-line option (Components list renders them correctly) |
| 4. Platform REST | N/A | — |

**Owning layer:** Layer 1 — vc-frontend. The summary-header binding reads the wrong source (likely a shared/first-config value or a wrong index) while the Components renderer reads the correct per-line `configurationItems`.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Component / module:** cart line-item configurable-summary component (the collapsed config header on `/cart`)
- **RCA anchor:** the line-item config-summary binding (search vc-frontend for the cart line configuration summary/label render vs the components list); confirm it reads per-line `configurationItems` not a shared value
- **Routing confidence:** HIGH (data correct at xAPI, defect is purely the storefront summary rendering)

## References
- REG-2026-06-11-1423 suite 030 CART-114, CART-116 (renumbered 2026-07-25 from CART-071, CART-073 — cases predating the rename, incl. historical `REG-*` artifacts, keep the old IDs) — evidence `screenshots/CART-071-FAIL-config-summary-label-mismatch.png`, `CART-073-FAIL-config-summary-label-mismatch.png`

---

## Re-verification 2026-08-26 — STILL REPRODUCES (source axis), and the root cause is NOT what the draft assumed

The draft hypothesised "a shared/first-config value or a wrong index". Source says otherwise, and the correction matters because it changes the fix.

**There is no indexing bug. The summary header is not rendering the configuration at all.**

`client-app/shared/cart/components/cart-line-items.vue@dev` passes `with-properties` to `VcLineItems`, and those properties come from `client-app/core/utilities/line-items/index.ts@dev` `prepareLineItem`:
```js
const properties = Object.values(getPropertiesGroupedByName(item.product?.properties ?? []));
...
properties: properties.filter((p) => p.name !== PRODUCT_VARIATIONS_LAYOUT_PROPERTY_NAME).slice(0, 3),
```
That reads **`item.product.properties`** — the base configurable product's own catalog properties. Every line for the same configurable product shares the same `product`, so the header is **identical on every line by construction**. Meanwhile `configurationItems` is mapped per line (`"configurationItems" in item ? item.configurationItems : undefined`) and rendered separately by `<ConfigurationItems :configuration-items="item.configurationItems" :line-item-id="item.id">` — which is why the expandable Components list is correct.

So "Color: Emerald green / Size: S" is not a stale or mis-indexed selection — it is the **base product's** static property values, truncated to the first 3 by `.slice(0, 3)`. The observable ("both lines show the same wrong value") is a perfect fit and needs no bug in the config path to explain it.

**Consequence for the fix:** do not go looking for an index. Either suppress `with-properties` for `isConfigurable` lines, or render a configuration summary in that slot instead. A per-line "wrong value" fix would find nothing to correct.

**Severity unchanged (Medium)** — data and totals remain correct — but note the mislead is systematic rather than intermittent: it will show base-product properties on *every* configurable cart line, in every cart, not just when two variants are present. The two-variant STR is what makes it *visible*, not what causes it.

`VcLineItems`, `ConfigurationItems` and `prepareLineItem` are all unchanged on `dev` relative to the draft. No live re-run (source is decisive here and the render path is deterministic).

**Verdict: still open, Medium, root cause corrected.** No tracker item found.
