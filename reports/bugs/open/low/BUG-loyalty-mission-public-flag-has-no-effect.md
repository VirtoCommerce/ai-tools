# `LoyaltyMission.Public` appears to have no effect on any code path — **LOW / open question**

**Env:** vcst-qa @ Platform `3.1061.0`, `VirtoCommerce.Loyalty_3.1006.0-pr-14-1be7` (PR #14, SHA `1be73b4`)

## Summary

A Published mission with `public=false` is returned by the customer-facing GraphQL `loyaltyMissionProgress`
query exactly like a public one. No server-side code path in vc-module-loyalty ever populates
`LoyaltyMissionSearchCriteria.Public` — the search predicate exists but is guarded by
`if (criteria.Public != null)`, and nothing sets it. Status filtering does work (a Draft mission is
correctly excluded), so the flag is not merely unused in one place; it looks inert everywhere.

**This is filed as an open question, not a confirmed defect, because the intended meaning of `Public` is
undocumented.** If it is meant to gate customer visibility, this is a bug. If it is a listing/publishing
hint with no eligibility meaning, the current behaviour is correct and the expectation in test `MSN-015`
is what needs changing.

## Decisive evidence — targeting held constant, `public` varied alone

Queried `loyaltyMissionProgress` live (2026-08-27, post store-repair) as a **member** and a verified
**non-member** of group `VIP`:

| Mission | Condition | `public` | VIP member | Wholesaler (non-VIP) |
|---|---|---|---|---|
| `MSN_GROUP_VIP` | `UserGroupIsCondition[VIP]` | **true** | **VISIBLE** (Completed) | not visible |
| `MSN_GROUP_VIP_PRIVATE` | `UserGroupIsCondition[VIP]` | **false** | **VISIBLE** (Completed) | not visible |
| `MSN_PUBLISHED_PRIVATE` | `AnyUserGroupCondition` | false | VISIBLE (Completed) | **VISIBLE** (InProgress) |

Totals: VIP member sees **15** missions, non-member sees **13** — a difference of exactly the two
VIP-targeted rows.

Two independent readings, same conclusion: **rows 1 vs 2** hold the audience identical and vary `public`
alone — both are visible to the eligible user, so `public=false` does not hide a mission from someone in
its audience; **row 3** shows that with a neutral condition it is visible to everyone, so the flag gates
nothing on its own either. **Group targeting itself works in both directions**, which is what makes this a
clean experiment rather than a broken-mission artifact.

## What this is NOT

**Not an audience-control failure.** Mission targeting is done by the condition tree —
`UserGroupIsCondition { groups: string[] }` vs `AnyUserGroupCondition` — and **it works**: test `MSN-011`
("group-scoped mission is visible to a matching-group user and absent for a non-matching user") passes on
this build. The fixture used below deliberately carries `AnyUserGroupCondition` (the neutral placeholder,
required because the server rejects a mission with no condition), so **every customer is its intended
audience** and the fact that an arbitrary customer can earn it is correct behaviour, not a leak.

An earlier draft of this report graded the same observation P1 on the theory that `Public` was the only
audience control. That was wrong and is retracted.

## Steps to reproduce

Preconditions: `npm run seed:loyalty-missions`; `Loyalty.Missions.Enable = true`.

1. As admin, confirm the record: `GET {{BACK_URL}}/api/loyalty-missions/@td(MSN_GROUP_VIP_PRIVATE.id)`
   → `"status": "Published"`, `"public": false`, condition `UserGroupIsCondition[VIP]`.
2. As `@td(LOYALTY_VIP_USER.email)` (a member of `VIP`), POST `{{BACK_URL}}/graphql`:
   `query { loyaltyMissionProgress(storeId:"{{STORE_ID}}" userId:"<me.id>" cultureName:"en-US" first:100){ items { missionId name status } } }`
3. The `public=false` mission is present in `items[]`. Repeat as `@td(LOYALTY_WHOLESALE_USER.email)`
   (not in `VIP`) — it is correctly absent, proving the filter that *is* applied is the condition tree.

Runner repro: `npx tsx scripts/graphql/graphql-runner.ts --case regression/suites/Backend/loyalty/075d-loyalty-missions.csv:MSN-015`

## Expected vs actual

**Expected** — unknown, pending a product answer (see Open question).
**Actual** — `public=false` has no observable effect: the mission is returned to customers, accrues
progress, and pays its reward, identically to `public=true`.

**The reward really is paid** — `AGENT-TEST-MSN-PUBLISHED-PRIVATE` reached `Completed` / 100% with an
`Earned` / `sourceType: LoyaltyMission` ledger row crediting the customer. Stated because "listed" and
"pays out points" are very different asks of a reviewer. Under the advertising reading the payout is
correct (that fixture's audience is everyone); under an eligibility reading it is a points leak.

## Three clean negatives — the flag has no consumer anywhere

| Surface | Finding | Source |
|---|---|---|
| **Admin UI** | No field, toggle, or label containing "Public" or "Private" exists on the mission details blade or the banner blade. The flag is settable **only** via `POST`/`PUT /api/loyalty-missions`. | `MSNA-014` `{OBSERVED}`, suite `075e` |
| **Storefront** | `GetLoyaltyMissionProgress` (vc-frontend PR #2396 — the only mission query the frontend issues) does not select `public` at all. The client never receives it and cannot filter on it. | VCST-5346 session |
| **Design** | The Claude Design project on VCST-5346 ("E-commerce missions feature", 8 frames) contains no public/private concept. | VCST-5346 session |

A flag with no admin control, no frontend consumer, no design and no documentation reads more like an
**unfinished feature** than a broken one — which is the main reason this is filed LOW rather than as a
defect. It also means enforcement, if wanted, must be server-side in `GetUserMissionsAsync`; the storefront
is structurally incapable of it.

## Open question for the product owner

What is `LoyaltyMission.Public` for? Three possibilities, each implying a different fix:
1. **Customer visibility gate** → `GetQualifyingMissionsAsync` must set `criteria.Public = true`; also decide
   whether the *accrual* path (`ProcessOrderAsync`, which builds its own criteria) should honour it, since
   filtering only the read path would leave a hidden mission still paying out.
2. **Listing/publishing hint only** → behaviour is correct; `MSN-015`'s expectation is wrong and the test
   should be re-pointed.
3. **Vestigial** → remove the property so it cannot mislead.

There is no documentation for Missions anywhere (VirtoOZ has none; PR #14 adds 4 lines), so this cannot be
resolved from product sources.

**A working model exists, but it is ours, not the product's.** This QA repo's
`scripts/seed-data/loyalty/missions-specs.mjs` says *"the condition tree decides WHO a mission is FOR, and
`public` decides whether it is advertised"*, while its header encodes the opposite expectation — that a
`public=false` mission *"must not reach the customer-facing query"*. Both were written by our own agent
today, inferred from the field name and observed behaviour. Reasonable, and why LOW is the right grade —
but not a contract, and the two statements only agree if "advertised" means "appears in the list", which
is the question itself.

## Root cause (if #1)

`LoyaltyMissionSearchService` exposes a working `Public` predicate behind `if (criteria.Public != null)`;
neither `GetQualifyingMissionsAsync` (read) nor `ProcessOrderAsync` (accrual) sets it. The storefront xAPI
criteria type has no `Public` field at all.

## Fix Routing

Repo: `VirtoCommerce/vc-module-loyalty` (PR #14 / `feat/VCST-5319`). Ticket: VCST-5319 (Epic VCST-5320).
Blocked on the product answer above — do not implement a filter before #1 is confirmed.
