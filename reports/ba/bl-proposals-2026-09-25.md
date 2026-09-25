# BL Proposals — 2026-09-25 (staged, not applied)

Triggered by: `BL-AUDIT-2026-09-25` (`/qa-review-oracles bl BL-CART-015`). Held because the Live axis
was unavailable this run (network policy denied the QA env); Source agrees. Value: medium · medium →
qualified — `oracles:rank` gate says APPLY once the evidence bar is met.

## DRIFT candidate — BL-CART-015 (precision, not reversal)

- **Current rule (excerpt):** "…MUST preserve its `configurationItems` (customText, selected
  option/productId, files, section) unchanged…"
- **Observed in source:** preserved for Text, Product/Variation and File sections, rebuilt on each leg by
  `vc-module-x-cart` `SavedForLaterListService.CopyConfiguredItemsAsync` / `CreateConfiguredLineItemContainerAsync`
  (fix `9fe8d07`, VCST-4205). Two conditions are unstated: a Product/Variation section whose product does
  not resolve for the target cart is dropped; configuration files are carried only when owned by the
  source cart.
- **Suggested wording:** append to Rule — "*…unchanged, provided every referenced section product still
  resolves for the store and the files belong to the source cart; a section that fails either condition is
  dropped rather than reset.*" Add to Source:
  `vc-module-x-cart src/VirtoCommerce.XCart.Data/Services/SavedForLaterListService.cs` (`CopyConfiguredItemsAsync`).
  Add a scope note: the Saved-for-Later **card** does not render configuration
  (`savedForLaterLineItem.graphql` selects none) — a display gap, not a violation of this rule.
- **Re-audit trigger:** a session with egress to `vcst-qa.govirto.com` / `vcst-qa-storefront.govirto.com`
  and Playwright MCP: run the `CART-070` path once and capture the `moveFromSavedForLater` response.

## Suspected defect — not an oracle change (route to `/qa-bug` after a live repro)

`MoveItemsAsync` removes every requested line from the source list (`:123`) even when
`CopyConfiguredItemsAsync` skipped it because the configurable product did not resolve (`:163`). A
configured item whose product became unavailable while saved for later would therefore disappear from
both lists. Source-only; needs a live reproduction before it is a bug.

## Registry correction — not an oracle change

`config/known-false-positives.json` entry `CART-070` is stale: the case was re-scoped 2026-07-27 to the
round trip BL-CART-015 describes, so the entry would hide a real regression. Suggested: remove the entry
(and, separately, restore the deferred display assertion when the Saved-for-Later card renders
configuration). Owner: whoever maintains the registry — `/qa-review-tests` for any `CART-070` change.
**Applied 2026-09-25** at the user's request — the entry is removed; the deferred display assertion is still pending.
