# Organization returns: a draft cancelled before it was ever submitted is listed to organization holders, who can read its comment and line reasons — **P2**

## Status: CONFIRMED — filed as VCST-6226 (Sub-task of VCST-5884)
**Found by:** agent — testing VCST-5884
**Tracker:** [VCST-6226](https://virtocommerce.atlassian.net/browse/VCST-6226), Sub-task of VCST-5884 (IN-SCOPE) · labels `found-by-agent`, `found-in-testing`
**Oracle:** `{DOC}` vc-module-return PR #28 description — *"Drafts are never listed, the caller's own included"*; module guide
(`docs/return-module-guide.md:236-239`) — a draft abandoned before submit is something *"the buyer never heard of"*, and `:359-360` —
*"a draft is the buyer's work in progress and stays in their own list"*. The Acceptance of VCST-5884 does not mention drafts, so what
counts as a draft is the PO's call; the build breaks the module's own written contract either way.
**Nature:** implementation contradicts its documented contract. The exclusion tests `Status != Draft`, and a draft cancelled before submit is
`Cancelled` — indistinguishable from a return cancelled after submit.

## Environment
- Backend vcst: Return `3.1005.0-pr-28-62f9` (vc-module-return PR #28 @ 62f9aae), Platform 3.1076.0, Customer 3.1029.0
- Storefront: theme `2.60.0-pr-2523-9e4e-9e4e67ef` (vc-frontend PR #2523 @ 9e4e67e)
- Reproduced five times, API and UI, by four independent runs: discovery (3x), lane A (RET261008-00022, -00051), lane B (-00026, -00028),
  C1 `REG-2026-10-08-1840` cases RET-ORG-006 (-00088) and RET-ORG-019 (-00105)

## Steps to reproduce
1. As the buyer `@td(ORG_RET_BUYER.email)`: open a Completed order, **Request return**, quantity 1, enter a comment and a line reason. **Do not submit.**
2. Open `/account/returns/<id>` → **Cancel return** → confirm. The return is now `Cancelled` and was never announced (no email).
3. As a holder in the same organization `@td(ORG_RET_HOLDER_GLOBAL.email)` (role holding `xapi:my_organization:return:view`):
   Purchasing → Returns → the organization tab — or xAPI `organizationReturns(keyword: "<RMA>")` and `return(id: …)`.

## Expected
Not listed, and `return(id)` is `null` — exactly what a live **Draft** does (hidden from the list, `return(id)` null, absent even with
`statuses:[Draft]`).

## Actual
Listed as **Cancelled**; the details open read-only and expose the buyer's `customerComment`, `items[0].reasonCode` and `reasonComment`
(e.g. comment *"AGENT-TEST VCST-5884 abandoned draft"*, reason `DamagedInTransit`). The deep link works.

![Organization tab lists the never-submitted, cancelled draft](../../screenshots/organization-returns-cancelled-draft-visible-to-holders-VCST-5884/A1-A9-org-tab-holder-global-lists-cancelled-draft-00022.png)
![A holder reads the buyer's private comment and line reason](../../screenshots/organization-returns-cancelled-draft-visible-to-holders-VCST-5884/A9-holder-opens-never-submitted-draft-00022-private-comment-readable.png)

Supporting: `RET-ORG-019-FAIL-draft-listed.png`, `RET-ORG-019-FAIL-draft-details-readable.png` (same folder); C1 evidence
`reports/regression/REG-2026-10-08-1840/graphql-evidence/RET-ORG-006-*.json` (assertions `holder_list`, `holder_read`).

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | FAIL (symptom) | the organization tab lists the row and the details page renders the comment — the UI only shows what the API returns |
| 2. Backend Admin | N/A | the Admin Return list is back-office and is meant to show every return |
| 3. GraphQL xAPI | **FAIL (cause)** | `organizationReturns` lists it; `return(id)` returns the comment and line reasons |
| 4. Platform REST API | N/A | `POST /api/return/search` with `excludeDrafts` uses the same status test |

**Owning layer:** 3 — vc-module-return. `ReturnSearchService.cs:77-80` (`Status != Draft`), `ReturnAccessService.cs:75-80`
(`CanViewReturnAsync` tests `Status == Draft`), `ReturnFlowService.cs:288-298` (`CancelReturn` moves `Draft → Cancelled` and keeps no memory of
the previous status; `Return` has no submitted date).

## Impact / severity — P2, Medium
The module's own contract is broken and the content leaked is what the buyer typed and never sent. Graded Medium, not High: the exposure is
limited to holders of an **opt-in permission that no stock role holds**, inside the **same organization**, and the fields are the same ones
that organization already sees on every submitted return. There is no way for the buyer to erase it (an administrator can delete the return).

## Fix Routing
Repo `vc-module-return` (module). Record whether a return was ever submitted (a submitted date, or the transition history) and exclude
returns that never were, in both `ReturnSearchService` and `ReturnAccessService`; add a cancelled-draft case to `ReturnAccessServiceTests`.
Not a breaking change. **If the PO instead decides cancelled drafts ARE visible,** the module guide and PR note need that sentence and
cases `RET-ORG-006` / `RET-ORG-019` (held at `Draft`) change their expectation — a decision, not a test edit.
