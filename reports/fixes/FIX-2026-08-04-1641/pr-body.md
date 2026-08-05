## DO NOT MERGE until human review

Fixes [VCST-5657](https://virtocommerce.atlassian.net/browse/VCST-5657) — *[Mixed cart] Place order is active if select only loyalty products*.

### The defect

In Loyalty **Mixed Cart** mode a shopper could **deselect** — rather than remove — every cash line, leaving only points lines selected, and still place the order. `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED` was never emitted, so **PLACE ORDER stayed enabled** and no warning rendered.

Confirmed live on vcst-qa (Platform 3.1055.0, Loyalty 3.1004.0, theme 2.55.0-pr-2407):

```
sku=201482    PEPSI COLA …   currencyCode=USD  selectedForCheckout=false
sku=in724846  Double Drum …  currencyCode=PTS  selectedForCheckout=true
cartTotals: USD $0.00 (isDefaultTotalCurrency=true) | PTS 6.00
cart.validationErrors: []        ← the error is absent
```

### Root cause

Rule 2 compared two operands built over **different sets of line items**:

| Operand | Source | Gifts excluded? | Selection-filtered? |
|---|---|---|---|
| `hasPointProducts` | `cart.CartTotals` | yes (`DefaultShoppingCartTotalsCalculator.cs:33`) | yes (`:81`) |
| `hasCashProducts` (before) | raw `cart.Items` | **no** | **no** |

A deselected USD line remains in `cart.Items`, so `hasCashProducts` stayed `true` while `hasPointProducts` became `true` from the selection-filtered totals. `hasPointProducts && !hasCashProducts` could therefore never be satisfied while any cash line existed in the cart at all — selected or not.

### The change

```csharp
var hasCashProducts = cartValidationContext.CartAggregate.SelectedLineItems.Any(x => !x.Currency.EqualsIgnoreCase(loyaltyCurrencyCode));
```

`SelectedLineItems` is defined as non-gift items filtered to those selected for checkout (`CartAggregate.cs:142-143`) — the same line items the totals calculator sums — so the two operands **cannot drift apart again**. Re-encoding the calculator's two filters by hand is what allowed them to diverge in the first place. This is also the set the platform's own `CartValidator` and this module's `ShoppingCartHook` already use for the same cash-vs-points partition.

**One live defect, one behavioural change.** Excluding gifts is alignment and defence-in-depth, **not** a second reproducible bug: a gift line cannot currently reach this validator, because `RewardExtensions.ApplyRewardsAsync` removes gift lines matching no valid reward on every recalculation, and a cart with no selected cash lines yields an empty promotion result — which matches none. **Please don't spend time trying to reproduce a gift scenario; it is unreachable by design.**

Rules 1, 3 and 4 are byte-identical. Rule 4 (`LOYALTY_INSUFFICIENT_BALANCE`) already reads `pointsTotals.Total` and was consistent. Preserves **BL-LOY-010** (points-only cart rejected, ≥1 cash line required) and **BL-LOY-008**.

### Tests

Three added to `LoyaltyCartValidatorTests` (the module's first real tests; the pre-existing stub `Test.cs` is untouched):

| Test | Purpose |
|---|---|
| `…AllCashLinesDeselected_ReportsOnlyPointProductsError` | The defect. Fails before, passes after. |
| `…CashLineSelected_DoesNotReportOnlyPointProductsError` | Guard against over-correction — an ordinary mixed cart must stay valid. |
| `…GiftLineIsNotCountedAsCashProduct` | Pins gift semantics against future drift in `ApplyRewardsAsync`. A semantics guard, **not** a storefront repro. |

**Red→green verified by reverting only the production predicate** (test file untouched): both repro tests fail with `Assert.Contains() Failure … Collection: []` — the same zero-errors signature as the live capture — while the companion guard and stub stay green. Restoring gives 4/4. A mutation check (`hasCashProducts = false`) fails only the companion, confirming it isn't vacuous.

Build: 0 warnings / 0 errors. Tests: 4/4.

> Note for anyone running these locally: the project is **xunit.v3 / Microsoft.Testing.Platform**, so `dotnet test` reports *"No test is available"* and 0 tests. Run the test-host exe directly (`tests/VirtoCommerce.Loyalty.Tests/bin/Debug/net10.0/VirtoCommerce.Loyalty.Tests.exe`) or `dotnet run --project tests/VirtoCommerce.Loyalty.Tests`.

### Diff scope

Three files: the one-line predicate + comment, the new test file, and one `ProjectReference` adding `VirtoCommerce.Loyalty.ExperienceApi` to the test project (it referenced Core/Data/Web but not the assembly under test). **No new PackageReference** — `ILoyaltyLogicService` is hand-rolled as a fake rather than pulling in a mocking library. No REST/GraphQL/DTO/schema/migration/manifest change.

### needs deploy verification

The fix is unit-proven and static-only; the live symptom needs a redeploy. Once the alpha artifact reaches QA, re-run the original STR (deselect all cash lines → PLACE ORDER must be disabled and the points-only warning shown). The storefront already carries the message — `locales/en.json:190,193` and `client-app/shared/cart/enums/index.ts` (VCST-5365 AC-6) — so no frontend change is required; it was unreachable only because the code was never emitted.

Regression cases `MCO-GQL-012` (Backend/loyalty/075b) and its storefront twin `MCO-E2E` case 008 (Frontend/loyalty/083b) were authored against this defect and are currently expected-RED; they should go green once this deploys.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
