# Investigation — org-contacts zero-match filter collapse

Deep root-cause detail split out of [`BUG-org-contacts-zero-match-role-status-filter-returns-whole-roster.md`](../bugs/open/medium/BUG-org-contacts-zero-match-role-status-filter-returns-whole-roster.md) to keep that report inside the 150-line cross-layer cap (`.claude/rules/reports.md` §2). Nothing was deleted — the bug report links here.

**Bug:** Company Members: a zero-match role+status filter silently returns the ENTIRE member roster — Medium
**Date:** 2026-09-08 · **Env:** vcst-qa

## Root Cause Analysis

Populations from REST, same org: contacts (`/api/members/search`, `memberId=<org>`) = **50**, memberships
= **27**. **50 is exactly what the broken query returns** — the resolver is not returning a mis-filtered
membership set, it returns the **unfiltered contacts population**.

`roleIds`/`statuses` are *membership* properties, but the contacts search takes `MembersSearchCriteria`,
which has **no `roleIds` and no `statuses` property at all** (live `VirtoCommerce.Customer` swagger). So
each filter is resolved to an id set and composed into `query.ObjectIds`. **A zero-guard exists — twice —
but sits BEFORE the composition instead of after it**, and nothing re-checks the intersection.
`vc-module-profile-experience-api@3.1017.0` ·
`src/VirtoCommerce.ProfileExperienceApiModule.Data/Schemas/OrganizationType.cs` ·
`ResolveContactsConnectionAsync` (read at the deployed tag, diffed against `dev`):

```csharp
if (roleFilter.FilterRequired) {
    if (roleFilter.Ids.Count == 0) { return new PagedConnection<ContactAggregate>([], …, 0); }   // :137
    query.ObjectIds = IntersectObjectIds(query.ObjectIds, roleFilter.Ids);                       // :142
}
if (statusFilter.FilterRequired) {
    if (statusFilter.Ids.Count == 0) { return new PagedConnection<ContactAggregate>([], …, 0); } // :159
    query.ObjectIds = IntersectObjectIds(query.ObjectIds, statusFilter.Ids);                     // :164
}
var response = await mediator.Send(query);   // :168 — nothing checks ObjectIds is now empty
// :234  existing == null ? additional.ToList() : existing.Intersect(additional).ToList()
```

`IntersectObjectIds` returns a plain empty `List<string>` — not null, not a sentinel — and every consumer
reads empty as *"no id restriction"*: `SearchMembersQueryHandler.cs:60` passes it through, and
`vc-module-customer@3.1023.0` `MemberSearchService.cs:140` guards with
`if (!criteria.ObjectIds.IsNullOrEmpty())` (indexed path likewise, `MemberSearchRequestBuilder.cs:59`).
That is why REST is right and the xAPI is wrong: **the platform criteria never receives the filter.** And
because those criteria cannot express role or status at all, losing the ids does not *widen* the filter, it
**removes it** — hence both arguments vanishing together.

**Why, in one sentence:** with one filter, "this filter resolved to nothing" and "the composed set is
empty" are the same statement; adding a second made them diverge, and the guard was duplicated per-filter
rather than moved after the intersection.

Also explains the asymmetry: REST treats `statuses:["Locked"]` as non-matching (the real predicate is
`onlyLocked`), yet the xAPI correctly returns the 1 locked member — the resolver owns its own `Locked` →
lock translation, upstream of the composition.

### Regression — attributed

- **Introduced:** `e2057b52` — **PR #141 "VCST-5281: Added Organization Invite and Status for Multi
  Organization customers"** (2026-08-04); it added the `statuses` argument *and* `IntersectObjectIds`.
- **Last good:** `c980e237` (PR #137, VCST-5239, 2026-07-10) — a **single** filter behind the same
  zero-guard, correct because with one filter the resolved set *is* the final set.
- **Last touched:** `a8005e96` (PR #143, VCST-5450, 2026-09-01) — refactored into mediator queries, guard
  placement preserved. **Still present on `dev`.** Corroborated by ledger row `Customer 3.1021.0`
  ⚠ BREAKING *"Invites and status for multi-organization customers"* (same VCST-5281 work).
- **Fix-forward, not revert** — PR #141's conjunctive-filter intent must be preserved.


## Notes and limits

- **No `BL-*` governs `organization.contacts` filter semantics.** **BL-SR-009** states the principle
  verbatim (*"fails CLOSED … never 'return everything'"*) but **explicitly scopes itself** to four
  sales-rep axes and says it does not extend elsewhere. It is a **precedent, not the oracle here**, and
  must not be cited as violated; generalising it is a `/qa-review-oracles` **proposal**.
- **Related, deliberately not merged:** `open/medium/BUG-salesrep-customer-orders-zero-match-hides-active-status-filter.md`
  (+ its `-status-chip-raw-enum-label` sibling) — different endpoint and mechanism (facet omission vs
  filter discard), opposite symptom. But **two independent zero-match defects in one product is a pattern
  worth naming**; a systematic "what does every filtered list return when nothing matches?" sweep is warranted.
- **`SILENT`** over `FALLBACK` because the archetype vocabulary is the failure *shape*, not the cause;
  `SCOPE` rejected — all 50 rows are the viewer's own org.
- **VirtoOZ MCP was unreachable all session** (4 attempts, `-32600` proxy error), so the by-design check
  rests on Context7 + the REST control + source, not the primary docs source.
- **A second filter-drop path is NOT filed — unreproduced.** `ResolveOrganizationRoleFilterQueryHandler.cs:53-56`
  returns `FilterRequired = false` when a requested role overlaps the org's own **org-level** roles.
  Same class, different trigger; consistent with footnote ¹ but not proven by it. **Follow-up:** probe
  `roleIds:[org-level-role]` alone where that role's membership set is a strict subset of the roster.

