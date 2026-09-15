# BUG — Organization mode: contact-level loyalty transactions are written but unreachable from every user-scoped read

## Status: CONFIRMED

**Severity:** High · **Priority:** High · **Found:** 2026-09-11 · **Ticket:** VCST-5024 (in-scope)
**Env:** vcst-qa — `BACK_URL=https://vcst-qa.govirto.com`, store `B2B-store`
**Found by:** `/qa-test VCST-5024`, backend/Admin lane. Confirmed in source and across three surfaces.

## Summary

VCST-5024's third requirement is *"Still keep loyalty points transactions on the contact level for stats and logging purposes."* The rows **are** written with the causing member's own `UserId` — and **no user-scoped read can return them**. The logging half is delivered; the stats half has no working consumer path.

## Steps to reproduce

1. Put a store into `Organization` mode with at least two members of one organization.
2. Have each member place a qualifying order, so both earn.
3. Read, for one of those members: `GET /api/loyalty-program-operation-log/balance/user/{userId}`; `POST /api/loyalty-program-operation-log/search` filtered by that `userId`; and the member's Admin **contact** blade loyalty widget.

**Actual, measured:**

| Read | Member A | Member B |
|---|---|---|
| `search {userId}` | 21 rows — **all pre-flip**, `organizationId: null` | 22 rows — all pre-flip |
| `balance/user/{userId}` | 39,533 (pre-flip only) | 100,033 (pre-flip only) |
| Org-scoped rows physically carrying that `userId` | 22 | 7 |
| **Of those, visible in any user-scoped read** | **0 of 22** | **0 of 7** |

Cross-layer consequence captured live: **contact A's Admin blade shows `39,533` while the same person's storefront reads `133,086`.** Three surfaces, three numbers, none wrong on its own terms.

**Expected:** a per-contact read returns that contact's transactions regardless of the scope the balance is computed at — that is what "keep them for stats and logging" asks for.

## Root cause analysis

`Data/Services/LoyaltyBalanceOperationLogSearchService.cs`, `BuildOwnerQuery`:

```csharp
predicate = predicate.Or(x => x.UserId == criteria.UserId && x.OrganizationId == null);
```

The `&& x.OrganizationId == null` conjunct **excludes every organization-scoped row from every user-scoped search**. This is the single search service behind the xAPI history query, the Admin `POST …/search`, the Admin contact widget, and `GetUserBalanceAsync` — so all four inherit it.

The write side is correct: `LogLoyaltyProgramOperationInternalAsync` sets **both** `operationLog.UserId` and `operationLog.OrganizationId` on every row, and `LoyaltyMissionTransaction` likewise keeps both. The data is there.

**Reachable today only through the organization-filtered admin search** (`POST …/search {organizationId}` does return `userId`). There is no per-contact path.

## Module versions

Platform `3.1069.0` · `VirtoCommerce.Loyalty 3.1008.0-pr-17-116e` (tip of OPEN PR `vc-module-loyalty#17`).

## Impact

A support agent opening a customer's contact record sees a **zero** loyalty balance and an empty transaction log for someone who has earned thousands — indistinguishable from a customer who has never earned. Any per-contact reporting, reconciliation or dispute handling silently returns nothing. This is the story's own third sentence, so it is a requirement gap rather than only a defect.

It also compounds `BL-LOY-015` (attribution), which this run records as escalated at organization scope: the ledger a customer *can* see contains colleagues' rows with no field naming who caused them, while the per-contact view that would answer it returns nothing.

## Fix Routing (→ /qa-fix)

- **repo:** `VirtoCommerce/vc-module-loyalty` · **repoKind:** `module` · **confidence:** HIGH
- **Site:** `Data/Services/LoyaltyBalanceOperationLogSearchService.cs` `BuildOwnerQuery`.
- **Shape — needs one product decision:** should a user-scoped read return org-scoped rows the user caused? If yes, drop the `&& x.OrganizationId == null` conjunct (or make it opt-in via a criterion) so a per-contact query returns that contact's rows at any scope. If no, then the story's third sentence is not implementable as written and should be renegotiated rather than left looking delivered.
- Note the **balance** figure is a separate question: `Balance` is a stored running total, so in organization mode a row's `Balance` is the *organization's* total at that moment. Returning rows fixes stats; it does not by itself yield a correct per-contact balance.

## Evidence

- `reports/tickets/Sprint26-18/VCST-5024/testing-checklist.md` item **D4**
- `reports/tickets/Sprint26-18/VCST-5024/screenshots/D4-contact-blade-A-user-scoped-39533.png`
- `reports/tickets/Sprint26-18/VCST-5024/summary.json` → `ac_analysis.sentences[S3]`

## Not claimed

- Whether a correct **per-contact balance** can be derived at all is not established — per-row `Amount` is attributable and summable, the stored `Balance` is not. Not investigated further.
- No claim about what the "stats" consumer is intended to be; the story names none.
