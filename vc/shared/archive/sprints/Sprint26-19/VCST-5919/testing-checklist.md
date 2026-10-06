# VCST-5919 — Testing checklist (Artifact B)

Ticket: Refactoring ICartSharingService for extensibility · Task · Medium · flow `feature-test` · path **FAST**
Env: vcptcore-qa (`{{BACK_URL}}/graphql`, store `{{STORE_ID}}`) · Build (probed 2026-10-06 `/api/platform/modules`):
XCart `3.1038.0-pr-141-b404` · SalesRep `3.1012.0-pr-21-8964` · Xapi `3.1024.0` — 0 validation errors on all three.
**Build note:** the ticket's own PRs (x-cart#140, sales-rep#20) are OPEN and NOT deployed as such. The stand runs
x-cart#141 / sales-rep#21 (VCST-5850/5728), which CONTAIN every #140/#20 commit (only `Merge dev` commits differ).
A finding here may belong to 5850/5728 on top — attribute at triage, never by default to 5919.
Routing: `technical-change` NOT resolved — fails closed: `wishlists(scope: Customer)` narrowing is a runtime behaviour
change on a GraphQL operation (PR notes), and the change spans two repos. → type row Task, single layer (xAPI), one domain.
Oracle: pre-refactor `CartSharingService` / `WishlistScopeType` / `CartSearchCriteriaBuilder.WithScope` on x-cart `dev`
= `{SPEC}` for "behaviour unchanged"; ticket + PR descriptions = `{SPEC}` for the intended deltas. No `BL-*` rule covers
list sharing (none exists in `.claude/knowledge/oracles/bl/`) — stated, not waived. Prior art: VCST-5707, VCST-5925
(same build line), kb KB-2F64A447 / KB-D1DF95A5 (Customer share read paths). Open related bug: **VCST-6147**.
Actors: rep `@td(SR_REP_PRIMARY)` · org pair `@td(ACME_BUYER)` + `@td(ACME_BUYER2)` in `@td(ORG_ACME)` ·
other org `@td(TECHFLOW_BUYER)` in `@td(ORG_TECHFLOW)` · unserved org `@td(SR_UNSERVED_ORG)` · anonymous.
Data: `data_surface: false` — every list is created in the case (`AGENT-TEST-5919-*`) and removed in cleanup.
Not run (FAST): Test Model, case authoring, C1 (no `--coverage` → no `2a` → exact set empty), visual / contract axes.

| # | Source | Condition | Covered by | Result |
|---|---|---|---|---|
| 1 | desc "fail the boot" / PR Module.PostInitialize | XCart + SalesRep load with 0 validation errors; `/graphql` answers | pre-flight probe | PASS — 4 modules installed, 0 errors; /health 200 |
| 2 | desc "No GraphQL schema change" | introspect `WishlistScopeType`: values `Private, AnyoneAnonymous, AnyoneAuthorized, Organization, User` in this order, descriptions identical to `dev` source; plus exactly ONE `Customer` (SalesRep policy description); no duplicates | P-1 | PASS — 5 built-ins in dev order + descriptions, one Customer, no dupes |
| 3 | desc | arg types unchanged: `Query.wishlists(scope: String)`, `InputChangeWishlistType.scope`, `InputCreateWishlistType.scope`; where `WishlistScopeType` is used | P-1 | PASS — all three `scope: String`; enum used only by `SharingSettingType.scope` |
| 4 | Private policy vs dev | owner sets Private → `access` Write, `isOwner` true; org-mate `wishlist(listId)` Forbidden; anonymous Unauthorized | P-2 | PASS — Write/isOwner true; org-mate Forbidden; anon Unauthorized |
| 5 | Organization policy vs dev | owner (ACME_BUYER, ACME ctx) sets Organization → org-mate ACME_BUYER2 reads via `wishlist(listId)` with Write; TECHFLOW_BUYER Forbidden; anonymous Unauthorized | P-2 | PASS — org-mate Write via listId + key; outsider Forbidden; anon Unauthorized |
| 6 | AnyoneAnonymous vs dev | owner sets AnyoneAnonymous → anonymous `sharedWishlist(key)` reads, `access` Read; owner Write; other authorized user Read | P-2 | PASS — anon Read by key; owner Write; others Read |
| 7 | AnyoneAuthorized / User `CanApply=false` vs dev | `changeWishlist(scope: AnyoneAuthorized)` and `(scope: User)` → refused (`Unsupported sharing scope`), HTTP 200 + `errors[]`, list's scope/key unchanged after re-read | P-3 | PASS — HTTP 200 + INVALID_OPERATION (generic text), scope/key unchanged; create refused, nothing persisted |
| 8 | registry lookup | unknown scope `"Foo"` → refused, nothing written; case variant `"organization"` accepted exactly like `"Organization"` (dev used EqualsIgnoreCase) | P-3 | PASS — Foo refused; `organization`/`anyoneanonymous`/`PRIVATE` accepted as canonical |
| 9 | PR note "IsAuthorized ... persisted settings only" (security) | list created in an org context with NO sharing scope/settings → org-mate `wishlist(listId)` Forbidden (never inferred Organization) | P-4 | PASS (partial) — no-scope list: org-mate Forbidden. OrganizationId-set-without-settings state not buildable via xAPI → unit tests only |
| 10 | SalesRep policy (migration) | rep shares to served ACME → succeeds, owner sees target; to `SR_UNSERVED_ORG` → Forbidden, nothing written; Customer with zero resulting targets → refused; Customer → Private clears targets | P-5 | PASS — served add ok; unserved + legacy Forbidden, unchanged; zero targets refused; →Private clears targets |
| 11 | SalesRep policy | target ACME member reads via `sharedWishlist(key)` Read / isOwner false / targets [] (kb KB-D1DF95A5 — confirm, do not re-derive) | P-5 | PASS — KB-D1DF95A5 confirmed |
| 12 | **desc + PR "narrowing" (the new behaviour)** | rep: `wishlists(scope:"Customer")` vs no scope vs `"Private"` — record totalCount + ids + each list's scope; states whether Customer narrows to `OrganizationId=null` (rep-owned) lists | P-6 | PASS / OBSERVED — Customer narrows to OrganizationId=null: same set as Private (Customer + Private lists), not Customer-only |
| 13 | WithScope vs dev | buyer ACME_BUYER2: `scope "Private"` → own lists only; `"Organization"` → ACME org lists incl. ACME_BUYER's Organization list; no scope → own + org; same counts as the `dev` rule predicts | P-6 | PASS — Private/Organization/none counts match dev WithScope rule |
| 14 | PR "unregistered scope widens — inherited" | `wishlists(scope:"Foo")` and `(scope:"AnyoneAnonymous")` → own + org (no narrowing), no error — pinned, not a 5919 regression | P-6 | PASS (pinned, inherited) — = no-scope result, no error |
| 15 | VCST-6147 interaction | target ACME member `wishlists(scope:"Customer")` → record whether the rep's Customer list appears (expected by spec: no — CustomerId = caller). Evidence for VCST-6147 only | P-6 | OBSERVED — target member never gets the Customer list from wishlists() (spec-consistent; VCST-6147 evidence) |
| 16 | regression guard | non-wishlist cart path unaffected: ACME_BUYER `cart(storeId…)` query returns without errors | P-7 | PASS — cart query 200, no errors |
| 17 | incidental | every refusal is HTTP 200 + `errors[]`, never 5xx; no 5xx anywhere in the window | all | PASS — ~140 calls, all 200, refusals in errors[], max 1.3 s |
| 18 | not live-testable — stated | duplicate-scope boot failure, the `EnsureSharingSettings` NRE fix, compile-time breaks → only the PRs' unit tests can show them; record PR CI state | P-8 (GitHub) | RECORDED — x-cart#140 all green; **sales-rep#20 auto-tests FAILED on all 3 DBs** (ci/build/Sonar green); unit-only items rest on green `ci` |

Test window 2026-10-06T01:17:10Z–01:23:10Z · 1 agent (qa-backend-expert, GraphQL, no browser) · cleanup: all 13 AGENT-TEST-5919-* lists removed.
C1: **skipped** — FAST without `--coverage`: no authored cases, no 2a → empty exact set. Release gate: **not-assessed**.

**Verdict: PASS WITH NOTES** — the registry is behaviour-preserving for all five built-in scopes and the Sales Rep Customer scope; the enum is unchanged plus Customer; Customer narrowing works as the PR describes.
Notes: (1) tested build is x-cart#141/sales-rep#21 (superset of #140/#20), not the ticket's PR heads; (2) **sales-rep#20 auto-tests red on all three DBs** — must be explained before merge; (3) `wishlists(scope:"Customer")` returns the caller's Private lists too (narrows by org, not by scope) — by design per PR, worth a PO glance; (4) row 9's exact persisted state is unit-test-only.
Not filed (below severity floor / pre-existing, kb-known): unstable sharing key on a no-scope list (KB-E8234FA0); sharing deltas without scope silently ignored — 5850/5728 (KB-B4377884); generic refusal messages; `sharedWishlist` Private ≡ not-found (Low).
