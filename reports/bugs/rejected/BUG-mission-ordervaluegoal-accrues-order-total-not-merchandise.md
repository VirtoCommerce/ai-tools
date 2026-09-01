# `OrderValueGoal` accrues the order **TOTAL**, so shipping and tax complete a spend mission — a $49.50 goal completed on $45.00 of merchandise — **P1**

## Status: CLOSED BY DESIGN — see Resolution
**Found by:** `/qa-test VCST-5320` → suite `075d` `MSN-028` · re-observed independently in `REG-2026-09-01-2050`
**Archetype:** `MONEY` · **Invariant:** `BL-LOY-016` (VIOLATED)

**Env:** vcst-qa @ Platform `3.1061.0`, `VirtoCommerce.Loyalty_3.1006.0-pr-14-da8a` (`da8abc6`)

## Summary

A loyalty mission's `OrderValueGoal` measures progress against `order.Total` — which includes shipping and tax, and is net of discounts — rather than against the merchandise value the customer actually spent on goods. A mission targeting **49.50** completed on an order carrying **45.00** of merchandise, because shipping and tax carried it to a total of 234.00. The gap is not marginal: on that order the goal advanced by **5.2× the merchandise value**.

## Steps to reproduce

1. Create a Published mission with an `OrderValueGoal`, target **49.50**, currency USD.
2. As a targeted customer, build a cart with **9 units at $5.00 = $45.00** merchandise — deliberately *below* the target.
3. Select **Fixed Rate (Ground)** delivery (+$150.00). Tax is levied at 20% of (subtotal + shipping) = +$39.00. Order total = **$234.00**.
4. Place the order and wait for settlement.
5. Read `loyaltyMissionProgress` for that mission and customer.

## Expected vs Actual

| | |
|---|---|
| **Expected** | Progress advances by the merchandise value (45.00). The mission stays `InProgress` — 45.00 is below the 49.50 target. |
| **Actual** | Progress advances by **234.00**. Mission reads `Completed`, `currentValue 234`, `percentage 100`. |

The target was placed deliberately *between* the two readings so that the correct and incorrect implementations produce **different** observations. It is not a rounding question.

## Reproductions

| Order | Merchandise | Shipping | Tax | Total | `currentValue` |
|---|---|---|---|---|---|
| `CO260901-00003` | 45.00 | 150.00 | 39.00 | 234.00 | **234** |
| `CO260901-00004` | 20.00 | 150.00 | 34.00 | 204.00 | **204** |
| `CO260901-00040` | 60.00 | 150.00 | 42.00 | 252.00 | **252** |

## Root cause

`vc-module-loyalty` @ `da8abc6` — `LoyaltyMissionLogicService.ApplyContribution`:

```csharp
case OrderValueGoal:
    // Currency mismatch is filtered out earlier in ApplyMissionInternalAsync.
    return order.Total;
```

No reference to `SubTotal`, `DiscountTotal`, `ShippingTotal` or `TaxTotal` exists anywhere in the mission path.

**Corroborating internal inconsistency:** on `CO260901-00004` the module's *own* Product-Points ledger row recorded **20 PTS = subTotal**, while the mission advanced by **204**. Two accrual bases, in one module, on one order.

## Impact

A spend-based mission is completable with materially less real revenue than the merchant configured — the shortfall grows with the shipping method, not only with the goods. Conversely a discount *reduces* progress, so a customer applying a promo code may fall short of a goal they would otherwise have reached.

## Note for the fix

The intended behaviour was **never declared** — no acceptance criterion on VCST-5319 states which figure a goal measures. `BL-LOY-016` records merchandise value as the invariant, derived from the customer-facing meaning of "order value for the target total value per mission period". Treat the fix as a **product decision to ratify**, not merely a code correction: the alternative (accrue the total, deliberately) is defensible if stated.

**Refs:** `BL-LOY-016` · `PROPOSED-BL-LOY-016` in `reports/ba/bl-proposals-2026-08-28.md` · test `075d` `MSN-028`, `083d` `MSN-E2E-003`

## Resolution — CLOSED BY DESIGN (2026-09-01) · VCST-5854 Cancelled

**The measurement stands; the expectation was wrong.** A product decision on 2026-09-01 declared that an `OrderValueGoal` is *intended* to measure the **order total** — shipping and tax included, net of discount. The implementation already does exactly that, so there is nothing to fix.

Nothing above is retracted. `currentValue 234` against merchandise **45.00** on a **49.50** target is still what happens, reproduced on three orders. What moved is the rule it was judged against: no acceptance criterion on VCST-5319 ever stated which figure a goal measures, so the original expectation (merchandise value) was **inferred from the AC's phrasing rather than declared**. It has now been declared the other way.

`BL-LOY-016` is inverted accordingly — VIOLATED → **SATISFIED** — keeping this same measurement as its evidence. `075d` `MSN-028` and `083d` `MSN-E2E-003` are updated to assert the declared rule and cite it. The fixture needs no redesign: its target sits deliberately between the two readings, so it discriminates whichever answer is correct.

### Three consequences, now accepted behaviour rather than defects

1. **Shipping is a lever on progress.** `CO260901-00040`: $60 of goods plus $150 shipping accrued **252**. A customer reaches a spend mission faster by choosing costlier delivery.
2. **A discount moves the customer away from the goal.** `order.Total` is net of discount, so a promo code *reduces* progress.
3. **Tax makes completion jurisdiction-dependent.** Tax here is 20% of (subtotal + shipping), so the same basket can complete a mission in one region and not another.

### Still unresolved — NOT closed by this decision

The module accrues on **two different bases**. On `CO260901-00004` the Product-Points ledger row recorded **20 PTS = subTotal** while the mission for the same order advanced by **204**. Choosing "order total" settles the mission side only; it does not explain why product-points earning uses merchandise value on the same order. Either the divergence is deliberate and should be stated, or one of the two is wrong. Needs its own ticket to be tracked.

*Status note: this workflow offers no By-design / Won't-fix resolution, so **Cancelled** was the only Done-category transition available. Read the status as "closed, not a defect" — the reason is here, not in the resolution field.*
