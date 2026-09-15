# BUG — Organization mode: a buyer with no organization sees their loyalty balance and cannot spend it

## Status: CONFIRMED

**Severity:** Critical · **Priority:** High · **Found:** 2026-09-11 · **Ticket:** VCST-5953 (filed 2026-09-11, sub-task of VCST-5024)
**Env:** vcst-qa — `FRONT_URL=https://vcst-qa-storefront.govirto.com`, `BACK_URL=https://vcst-qa.govirto.com`, store `B2B-store`
**Found by:** `/qa-test VCST-5024`, then re-investigated end-to-end via `/qa-investigate`. Reproduced on a fresh session and a fresh page load; deterministic.

## Summary

On a store where `Loyalty.LoyaltyBalanceCalculationMode = Organization`, a customer who belongs to **no organization** is served their own loyalty balance on the account page and is then **refused at checkout** as though the balance were zero. The read path falls back to the user; the spend path does not. Any B2C or unaffiliated shopper on such a store can see their points and can never spend them.

## Steps to reproduce

1. On a store with loyalty enabled in `Mixed Cart` mode, set `Loyalty.LoyaltyBalanceCalculationMode = Organization`.
   ⚠ Set it through the **store entity** (`PATCH /api/stores/{id}` on the `settings[]` element) or the Admin store Settings blade. The platform settings-v2 tenant endpoint returns `204` and does **not** take effect — see the companion bug.
2. Sign in as a customer who belongs to **no** organization and holds a non-zero loyalty balance (`@td(LOY_PERSONAL_NOORG)` — 38,916 PTS at time of writing).
3. Open `/account/points-history`.
4. Add one loyalty-priced (PTS) line **and** one cash line to the cart, then supply address, delivery method, payment method and a purchase-order number so no other validation rule can fire.
5. Open `/cart`.

**Actual:** the account page shows **`Balance: 38916`**. The cart refuses with **`LOYALTY_INSUFFICIENT_BALANCE`**, `required=6`, **`available=0`**, rendered as *"Not enough points — needs 6, you have 0."*, and **Place order is disabled**. The order cannot be placed.

**Expected:** the customer spends the points they hold. A buyer with no organization is unaffected by a setting about organizations — which is exactly what the read path already does for them.

## Mode control — same account, same cart, same balance

| Store mode | Result |
|---|---|
| `Organization` | `LOYALTY_INSUFFICIENT_BALANCE`, `available=0`, Place order **disabled** |
| `Customer` | **No loyalty validation error.** Only the ordinary *"Complete all required information to proceed."* |

Balance unchanged at 38,916 in both; `loyaltyBalance(storeId:)` returned 38,916 on 12 of 12 consecutive reads in `Customer` mode. **The block is attributable to the store mode and to nothing else** — not the account, not the cart, not the fixture, not timing.

## Layer Validation

**Owning layer:** backend module. The storefront faithfully renders a validation error the server produced, and the same server returns the correct balance on the read path in the same session.

Confound eliminated **in the data**, not in narrative: a points-only cart also raises `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED`, which could have explained the refusal. With the cash line added, the cart carries **exactly one** validation error — re-parsed recursively for any `errorCode`, count = 1.

## Root cause analysis

Read first-hand from `feat/VCST-5024-org-level` at the deployed tip `116e902c`:

1. `ExperienceApi/Validators/LoyaltyCartValidator.cs`, rule 4 —
   `if (store.IsOrganizationBalanceCalculationMode()) balance = await loyaltyService.GetOrganizationBalanceAsync(cart.OrganizationId);`
   **No null-check on `cart.OrganizationId`**, which is `null` for a personal cart.
2. `Data/Services/LoyaltyLogicService.cs:69-73` — `GetOrganizationBalanceAsync` → `GetLastLoyaltyOperationLogByOrganization(organizationId)` → `return operationLog?.Balance ?? 0;`
3. `Data/Services/LoyaltyLogicService.cs:350-355` — `if (organizationId.IsNullOrEmpty()) { return null; }`
4. → `?? 0` yields **0**, and rule 4's `balance < pointsTotals.Total` then always fires.

**It is an omission, not a design decision — and the same PR proves it.** The read path explicitly falls back: `GetLoyaltyBalanceQueryBuilderHandler.cs:39-46` does `if (!organizationId.IsNullOrEmpty()) {…} else { balanceRequest.UserId = request.UserId; }`, with `ResolveOrganizationIdAsync:52-62` returning `null` when the organization is empty *or* the store is not in organization mode. The author wrote the fallback on one path and omitted it on the other, in one change.

**Second site, same shape:** `Data/Provider/LoyaltyPaymentMethod.cs` `PostProcessPaymentAsync` branches on the store setting and passes `order.OrganizationId` with no null-check either.

## Module versions

Platform `3.1069.0` · `VirtoCommerce.Loyalty 3.1008.0-pr-17-116e` (tip of OPEN PR `VirtoCommerce/vc-module-loyalty#17`) · theme `vc-theme-b2b-vue 2.58.0-pr-2475-d710-d710e94f`.

## Impact

Every customer without an organization on an organization-mode store is permanently unable to spend loyalty points they can see. There is no workaround available to the customer, and no error explains why — the message asserts they have 0 points while the account page shows otherwise. The exposure begins the moment a merchant adopts the feature and scales with the proportion of unaffiliated shoppers on that store.

Note `BL-LOY-008` **passes on its own terms** here — `required > available`, both parameters present, the order is not created. Every clause of the invariant holds over a wrong outcome, so the rule cannot detect this.

## Fix Routing (→ /qa-fix)

- **repo:** `VirtoCommerce/vc-module-loyalty` · **repoKind:** `module` · **confidence:** HIGH
- **Fix sites:** `ExperienceApi/Validators/LoyaltyCartValidator.cs` rule 4; `Data/Provider/LoyaltyPaymentMethod.cs` `PostProcessPaymentAsync`.
- **Shape:** resolve the balance the way the read path already does — organization when the store is in organization mode **and** the cart/order carries one, otherwise the user. `ResolveOrganizationIdAsync` already implements it; share it rather than re-implement, so the paths cannot diverge again.
- **Not revert-safe.** The feature is gated behind a store setting defaulting to `Customer`, so the blast radius is limited to adopters. Fix-forward.

## Evidence

`reports/tickets/Sprint26-18/VCST-5024/evidence-2026-09-11-1558/` — `bundle-evidence --check` **PASS** (all 7 mandatory slots).
- `network/D2-cart-ptsonly-BOTH-errors.json` — points-only cart, 2 validation errors
- `network/D2-cart-mixed-SOLE-error.json` — mixed cart, **1** error, `required=6 available=0`
- `screenshots/VCST-5024-noorg-cannot-spend.gif` — 3 frames: balance 38,916 → blocked in Organization mode → clean in Customer mode
- `root-cause.md` — full chain with the alternatives-ruled-out table

## Not claimed

- **No trace ID and no HAR** were captured. For this failure class none exists: the response is HTTP **200** carrying a `validationErrors[]` entry, so App Insights holds no exception, no failed request and no dependency failure (0 product exceptions across the whole test window). Stated rather than left blank.
- Whether a **non-member or locked member can spend** an organization's pool is **not tested** — that is the restrictive half of the story's second sentence and is a separate open question.
- The exact proportion of affected shoppers on any real store is not estimated.

## Fixture reset — 2026-09-14, repro identities no longer exist

The org-loyalty fixtures this report and its tracker evidence were captured against were **deliberately
torn down and re-seeded** on 2026-09-14, at operator instruction. The accounts and organization below
were deleted; a re-seed created fresh ones with new GUIDs at zero balance.

**A developer picking this ticket up cannot reproduce against the original identities.** The mechanism is
unchanged and reproducible on freshly seeded fixtures; only these specific rows are gone.

| Entity | Id | Final balance |
|---|---|---|
| Organization (AGENT-TEST-Org-LoyaltyOutlet) | `d2efa4d2-202f-4764-86b4-538ea2ba411e` | **433,912** |
| ORG_LOY_A (member A) | `e663868a-8654-49d3-ae60-0d49e3559c0f` | 39,533 |
| ORG_LOY_B (member B) | `c26999e3-d9e3-42f2-9b23-1a2434e41889` | 100,033 |
| ORG_LOY_LOCKED | `7a403b1c-3086-45ad-8282-f8bde496d05a` | 0 |
| LOY_PERSONAL_NOORG | `f3f27c56-adf5-43ba-afcc-c095d6a60101` | 38,916 |

Full 44-row organization ledger as it stood at deletion:
`reports/regression/REG-2026-09-14-0852/evidence-org-ledger-postrun.json`.

Note the teardown **cannot un-earn points** (`seed-org-loyalty.mjs:34`) — it deletes the accounts, and
their operation-log rows remain stranded in the database with no owner.
