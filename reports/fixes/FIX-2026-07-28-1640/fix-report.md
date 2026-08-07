# FIX run — SR-EUR-FMT (Sales Rep EUR `formattedAmount` = `¤`)

**Outcome: Gate 0 BAIL — handed off to human. No clone, no PR, no tracker transition.**
**Date:** 2026-07-28 · **Env:** vcptcore-qa (Platform 3.1051.0, module vc-module-sales-rep @ dev)
**Input:** local report `reports/bugs/BUG-SalesRep-EUR-formattedAmount-placeholder.md` (no tracker ticket exists).

## Gate 0 — fix-eligibility triage → BAIL

Routed (from the completed /qa-investigate): `VirtoCommerce/vc-module-sales-rep`, `repoKind: module`, agent `fullstack-backend`. Root cause proven: `StatisticsFieldHelper.ToMoneyAsync` builds `Money` via `GetCurrencyForLanguage(currencyCode, context.GetCultureName())`; empty `cultureName` → Invariant culture → `¤`.

BAILed before any clone on **two** independent Gate-0 conditions:
1. **API-only-repro** — the storefront UI renders `€` correctly (live-verified); the defect surfaces only for a GraphQL caller that omits `cultureName`. No user-facing manifestation.
2. **Ambiguous / needs design-product confirmation** — the finding is `confirmed:false`: open question whether emitting `¤` on a `currencyCode` override without `cultureName` is a defect or an acceptable "caller must pass cultureName" contract.

Additionally the fix would target the **public VirtoCommerce upstream** (fork-PR) — an outward-facing action inappropriate for a confirmed:false, API-only finding. Gate 0 rule "when in doubt, BAIL" applies. User confirmed accepting the BAIL (2026-07-28).

## Hand-off package (everything a human/dev needs)
- Bug report + Fix Routing block: `reports/bugs/BUG-SalesRep-EUR-formattedAmount-placeholder.md`
- Root-cause worksheet: `reports/tickets/SR-EUR-FMT/evidence-2026-07-28-1622/root-cause.md`
- Repo/kind/fix-site: `vc-module-sales-rep` / `module` / `StatisticsFieldHelper.ToMoneyAsync` (+ callers passing `context.GetCultureName()`) — fall back to store default language / currency culture instead of Invariant.
- Evidence: `EUR-bug-UI-renders-euro-correctly.png` (UI = €), `graphql-evidence/SR-GQL-062-*.json`, `-095-*.json`.

## Next step for a human
The sales-rep dev decides whether `¤`-on-omitted-culture is in-scope; if yes, the fix is the documented culture-fallback (minimal, non-breaking) and can be re-run through `/qa-fix` once a tracker ticket exists and the design question is resolved.
