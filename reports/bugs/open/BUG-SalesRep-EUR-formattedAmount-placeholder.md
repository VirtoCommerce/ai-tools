# BUG — Sales Rep statistics `formattedAmount` renders `¤` instead of `€` when `cultureName` is omitted  ·  **Severity: Low–Medium**

**Env:** vcptcore-qa @ Platform 3.1051.0, Theme 2.54.0-pr-2395 · scoped GraphQL `POST /graphql/sales-rep` (store `B2B-store`) · Backend module **vc-module-sales-rep @ dev**
**Found:** REG-2026-07-28-1355 (SR-GQL-062, SR-GQL-095) · investigated 2026-07-28 · **reproducible 100%** (API), deterministic

## Summary

The scoped sales-rep statistics resolvers return the **generic currency placeholder `¤`** instead of the currency symbol (`€`) in `formattedAmount` when the GraphQL request supplies a `currencyCode` (or currency context) but **no `cultureName`**. The `amount` and `currencyCode` are correct — only the formatted symbol is wrong. **The storefront UI is NOT affected** (it always sends a `cultureName`, so it renders `€107.42` correctly — verified live). This is an **API-contract robustness defect**, not a user-facing storefront bug.

## Steps to reproduce (API)

1. Acquire a `SALES_REP` token (password grant, `storeId=B2B-store`).
2. `POST /graphql/sales-rep`:
   ```graphql
   query { salesRepCustomerOrderStatistics(organizationId: "105c2c4e-…-568a0ff190be", currencyCode: "EUR") {
     currencyCode period { total { amount formattedAmount } } } }
   ```
3. Read `data.salesRepCustomerOrderStatistics.period.total.formattedAmount`.

**Expected:** `€107.42` (currency symbol for EUR).
**Actual:** `¤107.42` (generic ¤ / U+00A4). `amount=107.42`, `currencyCode=EUR` are correct; `errors[]` empty; HTTP 200.

Contrast (same call, `currencyCode:"USD"`) → `$133.20` ✅ — so the defect is specific to the culture/currency-symbol formatting path, not the statistics computation. Second affected field: `salesRepCustomers.items[].euroStats.total.formattedAmount` (SR-GQL-095), same path.

## Live scoping — the UI renders `€` correctly (bug is API-only)

Signed in as a rep on the storefront, switched store currency USD→EUR, opened a customer profile → the statistics widgets render **€107.42** correctly (screenshot `EUR-bug-UI-renders-euro-correctly.png`, run dir). The UI request carries a `cultureName`, so the same code path formats correctly. → the defect only surfaces for API callers that omit `cultureName`.

## Root cause (traced from source — vc-module-sales-rep @ dev)

The `total`/`average` money fields format via a **culture supplied by the request**, which falls back to Invariant when absent:

1. `Schemas/CustomerOrderStatisticsPeriodType.cs` — resolves `total`/`average` with
   `StatisticsFieldHelper.ToMoneyAsync(currencyService, context.Source.CurrencyCode, context.GetCultureName(), amount)`.
2. `Schemas/StatisticsFieldHelper.cs` `ToMoneyAsync` — `var currency = currencies.GetCurrencyForLanguage(currencyCode, cultureName); return new Money(amount, currency);`
3. `Queries/Statistics/SalesRepStatisticsQueryHandlerBase.cs` `Handle` — stores only `CurrencyCode` on the context (`ResolveCurrencyCodeAsync` returns the raw code string; on the override path it just echoes `"EUR"`). **No culture is captured or defaulted.**
4. When the caller omits `cultureName`, `context.GetCultureName()` is null/empty → `GetCurrencyForLanguage("EUR", null)` yields a `Currency` bound to the **Invariant** culture → `Money.FormattedAmount` = `¤107.42` (Invariant's `CurrencySymbol` is `¤`).

**Alternatives ruled out:**
- *By-design?* No — the field description promises "formatted amount", `currencyCode` is a documented override, and the query does **not** require `cultureName`. A `¤` for a valid configured currency is not a usable formatted value. (SR-GQL-062's contract is "override echoes code **+ symbol**".)
- *Data drift?* No — `amount`/`currencyCode` correct; only symbol formatting wrong; reproduces deterministically across repeated runs.
- *Env-specific?* No — pure code path in the module; independent of vcptcore data.

## Fix Routing

- **Owning layer:** xAPI (L3) statistics resolvers → **repo `VirtoCommerce/vc-module-sales-rep`**, **`repoKind: module`** (xAPI ships in-repo under `…ExperienceApi`).
- **Fix site:** `src/VirtoCommerce.SalesRep.ExperienceApi/Schemas/StatisticsFieldHelper.cs` `ToMoneyAsync` (+ its callers in `CustomerOrderStatisticsPeriodType.cs` / the `euroStats`/`CustomerCartStatisticsPeriodType` / counts period types that pass `context.GetCultureName()`).
- **Direction:** when `cultureName` is null/empty, **fall back to a real culture** rather than Invariant — the store's default language (StoreId is on the context) or the resolved currency's own configured culture — before building `Money`. Do not require the caller to pass `cultureName`.
- **Preserve:** amount/conversion logic (`StatisticsCurrencyConverter`) is correct — do not touch; the fix is culture resolution only. Covers both `salesRepCustomerOrderStatistics` and `salesRepCustomers.euroStats`.

## Evidence

- Live API repro (both currencies) + trace attempt: server emits no `Request-Id`/`traceparent` on this endpoint, App Insights keys unset for vcptcore — bug is deterministic + source-proven, so no correlation ID needed.
- Screenshot (UI renders € correctly): `reports/regression/REG-2026-07-28-1355/screenshots/EUR-bug-UI-renders-euro-correctly.png`
- GraphQL evidence JSON: `reports/regression/REG-2026-07-28-1355/graphql-evidence/SR-GQL-062-*.json`, `SR-GQL-095-*.json`
- Evidence package: `reports/tickets/SR-EUR-FMT/evidence-2026-07-28-1622/`

---

## Re-verification 2026-08-26 — STILL REPRODUCES (source axis)

`vc-module-sales-rep@dev` is **byte-unchanged** along the entire path this report traced.

`Schemas/StatisticsFieldHelper.cs` — no culture fallback was added:
```csharp
public static async Task<object> ToMoneyAsync(ICurrencyService currencyService, string currencyCode, string cultureName, decimal amount)
{
    var currencies = await currencyService.GetAllCurrenciesAsync();
    var currency = currencies.GetCurrencyForLanguage(currencyCode, cultureName);
    return new Money(amount, currency);
}
```

`Schemas/CustomerOrderStatisticsPeriodType.cs` — both callers still hand it the raw request culture:
```csharp
.ResolveAsync(context => StatisticsFieldHelper.ToMoneyAsync(currencyService, context.Source.CurrencyCode, context.GetCultureName(), context.Source.Total));
.ResolveAsync(context => StatisticsFieldHelper.ToMoneyAsync(currencyService, context.Source.CurrencyCode, context.GetCultureName(), context.Source.Average));
```

So a caller that omits `cultureName` still lands on Invariant, whose `CurrencySymbol` is `¤`.

**Blast radius is wider than this report recorded.** `ToMoneyAsync` now has **six** call sites, not two:
`StatisticsFieldHelper.cs`, `SalesRepTopSellerType.cs`, `CustomerCartStatisticsPeriodType.cs`,
`CustomerOrderStatisticsPeriodType.cs`, `CustomerCartStatisticsComparisonType.cs`,
`CustomerOrderStatisticsComparisonType.cs`. The report names the period types and `euroStats`; the two
**comparison** types and `SalesRepTopSellerType` are also affected. That strengthens the recommended
fix site — putting the fallback inside `ToMoneyAsync` fixes all six at once, whereas patching callers
would now mean six edits.

**Not re-verified live.** The API repro needs a `SALES_REP` password-grant token, and the source path is
unchanged in full, so a live call could only confirm what the code already determines. Recorded as
source-confirmed rather than claimed as an end-to-end re-run.

**Verdict: still open, Low–Medium, API-only** (the storefront always sends `cultureName`, so the UI
remains unaffected — that scoping still holds).
