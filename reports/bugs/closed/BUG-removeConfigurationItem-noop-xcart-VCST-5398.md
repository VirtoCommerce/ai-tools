# BUG: removeConfigurationItem / removeConfigurationItems no-op — `[High]`

## Status: CLOSED — CANCELLED (VCST-5398, 2026-06-30)

## Resolution
- **Outcome:** Cancelled (won't fix). Minor API-ergonomics quirk, not a functional defect — Product-section removal works when `option.productId` is supplied; required sections correctly can't be emptied; no storefront path triggers the minimal-payload case (Layer 1 = N/A). Working contract exists.
- **JIRA:** VCST-5398 → Cancelled.
- **Coverage retained:** 050i CFG-GQL-011 re-authored to assert the working contract (optional section + `option.productId` → removed).
- **Reopen if:** a storefront edit-config flow is built that calls remove with the minimal `{sectionId,type}` payload.

> **CORRECTION (2026-06-30, supersedes the "no-op / never worked" framing below).** Narrowed by further live testing: removal of a **Product** section requires `option.productId`. With it, the item **is removed** (optional section: 1→0, verified). The minimal payload `{sectionId,type:"Product"}` is *silently rejected* (`validationErrors:[CONFIGURATION_SECTION_PRODUCT_REQUIRED]`, but 200 + empty `errors[]`). **Required** sections (CFG_LAPTOP) can't be removed either way — that's correct behavior, not this bug. So this is a **minor API-ergonomics / silent-failure** defect on **optional** Product-section removal, not "remove is broken." Workaround: pass `option.productId`. Severity High → **Low**.

**JIRA:** VCST-5398 · **Env:** vcst-qa @ Platform 3.1039.0, Theme 2.52.0-pr-2335 · **Layer:** xAPI (vc-module-x-cart)

## Summary
The xAPI cart mutations `removeConfigurationItem` and `removeConfigurationItems` return 200 with empty `errors[]` (apparent success) but **do not remove the targeted configuration item**. The mutation's own response `items[].configurationItems[]` is unchanged. Add/update mutations on the same line item work, so the cart projection is fine — only the remove mutations no-op.

## STR (GraphQL, ORG_USER, B2B-store)
1. `clearCart` → `addItem` a configurable product with sections selected → line item with N configurationItems (confirmed in `addItem` response).
2. `removeConfigurationItem(command:{ storeId, userId, lineItemId, configurationSection:{ sectionId, type } })`.
3. Read the mutation's own `items[?id=lineItemId].configurationItems.length`.

## Expected vs Actual
- **Expected:** removed section gone (N−1); `removeConfigurationItems(all)` → 0.
- **Actual:** length **unchanged** after both mutations. No errors, no validationErrors.

## Reproduction (copy-paste — vcst-qa CFG_LAPTOP)
```bash
# 0. Auth (ORG_USER, B2B-store)
TOKEN=$(curl -sk -X POST "$BACK_URL/connect/token" \
  -d "grant_type=password&username=$ORG_USER_EMAIL&password=$ORG_USER_PASSWORD&scope=offline_access&storeId=B2B-store" | jq -r .access_token)
GQL() { curl -sk -X POST "$BACK_URL/graphql" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$1"; }
USER_ID=$(GQL '{"query":"{ me { id } }"}' | jq -r .data.me.id)
GQL "{\"query\":\"mutation{ clearCart(command:{storeId:\\\"B2B-store\\\" userId:\\\"$USER_ID\\\"}){id} }\"}" >/dev/null
```
```graphql
# 1. addItem — creates a line item with 2 configurationItems (RAM + Storage). Capture items[0].id -> LINE_ITEM_ID.
mutation AddItem($cs:[ConfigurationSectionInput]) {
  addItem(command:{ storeId:"B2B-store" userId:"<USER_ID>"
      productId:"dd56d770-3c3b-4e09-b126-0c2bb8bd0f72" quantity:1 configurationSections:$cs }) {
    itemsCount items { id configurationItems { id sectionId productId } } } }
# variables:
# {"cs":[
#   {"sectionId":"5190d8cc-56f5-4675-9a34-d94c28f306f7","type":"Product","option":{"productId":"b147e934-6255-4a39-902c-17a816591932","quantity":1}},
#   {"sectionId":"e5fbc712-8697-4c48-b4f4-a8943f8d3d21","type":"Product","option":{"productId":"d6f1452a-ab62-49ff-8241-85a51b542a8c","quantity":1}}
# ]}
# => items[0].configurationItems.length == 2   (OK)

# 2. removeConfigurationItem — remove the RAM section. THE BUG:
mutation Remove($cs:ConfigurationSectionInput!) {
  removeConfigurationItem(command:{ storeId:"B2B-store" userId:"<USER_ID>"
      lineItemId:"<LINE_ITEM_ID>" configurationSection:$cs }) {
    id items { id configurationItems { id sectionId } } } }
# variables: {"cs":{"sectionId":"5190d8cc-56f5-4675-9a34-d94c28f306f7","type":"Product"}}
# EXPECTED: items[0].configurationItems.length == 1
# ACTUAL:   items[0].configurationItems.length == 2   <-- 200, errors[] empty, item NOT removed

# 3. removeConfigurationItems — remove both sections. Same no-op:
mutation RemoveAll($cs:[ConfigurationSectionInput!]!) {
  removeConfigurationItems(command:{ storeId:"B2B-store" userId:"<USER_ID>"
      lineItemId:"<LINE_ITEM_ID>" configurationSections:$cs }) {
    id items { id configurationItems { id } } } }
# variables: {"cs":[{"sectionId":"5190d8cc-...","type":"Product"},{"sectionId":"e5fbc712-...","type":"Product"}]}
# EXPECTED: 0   ACTUAL: 2
```
Optional-section variant (rules out by-design required protection): repeat with CFG-032 bike `78daa2db-5373-44fc-9226-2c18b2518808` (single Optional Product section) → remove leaves it at **1** (expect 0).

## Live reproduction (2026-06-30)
| Fixture | Sections | After remove | Expected |
|---------|----------|--------------|----------|
| CFG_LAPTOP `dd56d770` | 2 Required Product | removeConfigurationItem → **2**; removeConfigurationItems → **2** | 1; 0 |
| CFG-032 bike `78daa2db` | 1 **Optional** Product | removeConfigurationItem → **1** | 0 |

The optional-section case rules out by-design required-section protection. Contrast (same session): `addItem` / `addConfigurationItem` / `updateConfigurationItem` / `changeCartConfiguredItem` all reflect changes correctly.

## Impact
**xAPI-only — no shopper-facing path today.** Layer-1 browser repro (2026-06-30, qa-testing-expert) confirmed the storefront exposes **no per-configuration-item remove/deselect control**: the PDP optional section is a radiogroup with a "None" radio (whole-section reselect, not per-item remove → fires `CreateConfiguredLineItem`+`AddItem`), and the cart line offers only "Customize" (re-open PDP) and whole-line "Remove from cart". So the no-op cannot manifest in the UI. Impact is on **direct xAPI consumers** (headless/integration clients, and any future storefront edit-config UI built on these mutations): the remove silently no-ops.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **N/A** | No UI control fires these mutations — PDP radiogroup + cart "Customize"/"Remove from cart" only. `VCST-5398-L1-pdp-config-section-radiogroup-with-None.png` |
| 2. Backend Admin | N/A | Cart mutation — not an Admin-SPA surface |
| 3. GraphQL xAPI | **FAIL** | `removeConfigurationItem`/`removeConfigurationItems` → 200, `errors[] empty`, configurationItems count unchanged (live repro above) |
| 4. Platform REST API | N/A | No REST equivalent for cart configuration-item removal |

**Owning layer:** Layer 3 (GraphQL xAPI).

## Root cause (when & why)
**Why:** `CartAggregate.RemoveConfigurationItemsAsync(LineItem, sections)` (`src/VirtoCommerce.XCart.Core/CartAggregate.cs` ~L1860) gates on `ValidateConfigurationSections(...)` then `if (OperationValidationErrors.Any()) return this;`. `ValidateConfigurationSections` (~L1912) requires `section.Option.ProductId` for **Product/Variation** sections (`SelectedProductIsRequired`). But removal matches **Product/Text/File by `{Type, SectionId}` only** — `FindConfigurationItem` (~L1948) uses `ProductId` *only* for `Variation`. So the natural minimal payload `{sectionId, type:"Product"}` (no `option`) fails validation → early `return this` → **no removal**. The error is added to `OperationValidationErrors` (cart validation), **NOT** GraphQL `errors[]`, so the mutation returns 200 looking successful → silent no-op. The validator was written for add/update (where ProductId *is* needed) and applied wholesale to remove.

**When:** shipped broken with the feature — PR **#114** "feat: add configurationItem selection mutations" (commit `7a9ab8573`, **2026-05-07**, VCST-5043). The remove path has called the over-broad validator since introduction; it has never removed a Product-section item via the minimal payload. (Verified in the raw file at the introducing commit; later validation refactors #120/#124 on 2026-06-11 retained the gate.)

**Workaround:** pass the item's `option.productId` in the remove section → validation passes, `FindConfigurationItem` (Product, by Type+SectionId) removes it. The remove input is a full `ConfigurationSectionInput`, so `option` is accepted.

**Fix direction:** the remove path must NOT require `Option.ProductId` for Product/Text/File — only `Variation` (which needs it for matching). Give remove its own validation, branch the Product check by operation, or skip `SelectedProductIsRequired` on removal.

## Detection
Regression suite 050i, case **CFG-GQL-011** (now quarantined pending fix). Run REG-2026-06-30-1051; evidence under `reports/regression/REG-2026-06-30-1051/050i-evidence/`.

## Playground reproduction (GraphiQL, 2026-06-30)
Reproduced live in GraphiQL UI (`{BACK_URL}/ui/graphiql`): `addItem` → `items[0].configurationItems.length == 2`; `removeConfigurationItem(RAM)` → 200, no `errors[]`; a follow-up full cart read shows the same line item **still holding both config items** (RAM not removed). Screenshots in `reports/bugs/screenshots/`: `VCST-5398-removeConfigItem-emptyItems-staleLineItem.png`, `VCST-5398-graphiql-auth-valid-me-query.png`; Layer-1: `VCST-5398-L1-pdp-config-section-radiogroup-with-None.png`, `VCST-5398-L1-cart-shows-asus-only-bike-absent.png`.

> Note (NOT part of this bug): a real `clearCart` returns `itemsCount: 0`, so the storefront cart-render mismatch seen during Layer-1 testing was a **stale-cart artifact**, not a data defect — no separate ticket. Separately, the test org user hit a transient `Forbidden`-on-cart-mutation state mid-session (environmental; cart may need a reset before re-test).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 3 — GraphQL xAPI
- **Suggested repo:** VirtoCommerce/vc-module-x-cart
- **repoKind:** module
- **Component / module:** xCart — `removeConfigurationItem` / `removeConfigurationItems` command handlers
- **RCA anchor:** search `repo:VirtoCommerce/vc-module-x-cart "RemoveConfigurationItem"` (handler + command); added under VCST-5043
- **Routing confidence:** HIGH (xAPI-only confirmed; REST/Admin/Storefront layers all N/A)
