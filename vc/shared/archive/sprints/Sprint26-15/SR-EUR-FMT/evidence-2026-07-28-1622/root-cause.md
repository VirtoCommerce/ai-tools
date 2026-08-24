# Root Cause — Sales Rep `formattedAmount` = `¤` instead of `€`

**Confidence: HIGH (mechanism), MEDIUM-HIGH (exact fix)** · repo `VirtoCommerce/vc-module-sales-rep` @ dev · repoKind: module

## 1. Symptom
Scoped GraphQL `salesRepCustomerOrderStatistics` / `salesRepCustomers.euroStats` return `formattedAmount = ¤107.42` instead of `€107.42` when the caller supplies `currencyCode` but no `cultureName`. `amount`/`currencyCode` correct; HTTP 200; errors[] empty. UI renders `€` correctly.

## 2. Lowest failing layer (proven)
**xAPI/GraphQL** — money formatting in the sales-rep module. → repoKind: **module** → repo: **vc-module-sales-rep** (xAPI in-repo under `.ExperienceApi`).

Call chain (source @ dev):
1. `Schemas/CustomerOrderStatisticsPeriodType.cs` → `StatisticsFieldHelper.ToMoneyAsync(currencyService, CurrencyCode, context.GetCultureName(), amount)`
2. `Schemas/StatisticsFieldHelper.cs` → `currencies.GetCurrencyForLanguage(currencyCode, cultureName); new Money(amount, currency)`
3. `Queries/Statistics/SalesRepStatisticsQueryHandlerBase.cs` → context carries only `CurrencyCode`, no culture captured/defaulted.
4. `cultureName` empty → `GetCurrencyForLanguage(code, null)` → Invariant-culture Currency → `Money.FormattedAmount` = `¤` (Invariant `CurrencySymbol`).

## 3. Each claim → artifact
- `¤107.42` (EUR) vs `$133.20` (USD), amount/code correct, 200/errors empty → live API repro + `graphql-evidence/SR-GQL-062-*.json`, `SR-GQL-095-*.json`.
- UI renders `€107.42` (bug not user-facing) → `EUR-bug-UI-renders-euro-correctly.png`.
- Culture-dependent path → the 3 source files above.

## 4. Alternatives ruled out
- **By-design:** No — `currencyCode` is a documented override, `cultureName` not required, field promises "formatted amount"; SR-GQL-062 contract = "override echoes code + symbol".
- **Data drift:** No — only symbol wrong; amount/code correct; deterministic across repeated runs.
- **Env-specific:** No — pure code path; UI on same env formats € correctly.

## 5. Fix target
`StatisticsFieldHelper.ToMoneyAsync` (+ callers passing `context.GetCultureName()`): when `cultureName` null/empty, fall back to store default language / currency's own culture instead of Invariant; don't require caller `cultureName`. `StatisticsCurrencyConverter` (amount/conversion) is correct — untouched. Covers `salesRepCustomerOrderStatistics` + `salesRepCustomers.euroStats`.

## 6. Trace / App Insights
Endpoint emits no `Request-Id`/`traceparent`; App Insights keys unset for vcptcore. Not blocking — deterministic (100% repro) + source-proven, so no correlation ID needed.

Full report: `reports/bugs/BUG-SalesRep-EUR-formattedAmount-placeholder.md`
