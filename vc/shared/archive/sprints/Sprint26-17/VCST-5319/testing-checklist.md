# Testing Checklist — VCST-5319 `[Missions][Backend] Implement initial missions backend`

**Path:** FULL · **Flow:** feature-test · **Env:** vcst-qa @ Platform `3.1061.0`, `VirtoCommerce.Loyalty_3.1006.0-pr-14-da8a` (`da8abc6`)
**Fixtures:** seed `20260901134918-9421` — 11 missions / 7 accounts / 4 products; pre-completion verified live per account (14 mission×account pairs, all `InProgress 0%`)
**Test Model:** `reports/ba/test-models/VCST-5319-2026-08-28.md` · **DoD:** none declared ⇒ `dod_pct: null`

Verdicts filled from the Step 4 execution run of 2026-09-01 (9 new cases). New cases are `Draft`.

## Step 4 execution — case results (2026-09-01)

| Case | Verdict | Classification | One line |
|---|---|---|---|
| `MSN-027` | **PASS** 11/11 | — | Intermediate `1 of 2 / InProgress` then `2 of 2 / Completed`; 501-PTS `Earned` row present, `object` null |
| `MSN-028` | **FAIL** 2/4 | **product FAIL** | OrderValueGoal accrues `order.Total` = **234** (merch 45 + shipping 150 + tax 39), not merchandise value 45 |
| `MSN-029` | **BLOCKED** | fixture defect | Order never placed — cart `LOYALTY_INSUFFICIENT_BALANCE`; a 0-balance account cannot pay a 1-PTS line |
| `MSN-030` | **PASS** 7/7 | — | Control visible to both; group mission absent for the outsider; `public=false` confirmed inert |
| `MSN-031` | **PASS** 5/5 | — | Omitted `currencyCode` does NOT crash — VCST-5842/5843 do not reproduce on `da8abc6` |
| `MSN-032` | **PASS** (deviation) | open product question | No reverse edge at t+15s and t+5min: balance, progress and ledger all unchanged after cancellation |
| `MSN-033` | **FAIL** 6/7 | **case defect** | Only the exact-sum line fails (2892 vs 1058) — shipping divergence, not a product defect; all 3 attribution lines pass |
| `MSN-034` | **PASS** 7/7 | — | Fabricated transient row: `isStarted:false`, `progressId` null, and `isStarted:true` returns an empty page |
| `MSNA-023` | **FAIL** 3/5 | **product FAIL ×2** | Backend accepts End-before-Start (`endDate 2026-08-30` < `startDate 2026-08-31`) and reward `-1`, both HTTP 200 |

## Story AC conditions (16)

| # | Condition | Covered by | Verdict |
|---|---|---|---|
| AC-1.a | `Missions enabled` store setting persists True/False | `MSN-009` / `MSN-010` (existing) | not in this batch |
| AC-2.a | OrderValueGoal creatable, drives progress from order value | **`MSN-028`** (new) + `MSN-022` | **FAIL** — accrues `order.Total` |
| AC-2.b | OrderCountGoal creatable, drives progress from order count | **`MSN-027`** (new, JOURNEY) + `MSN-019` | **PASS** |
| AC-2.c | PerSkuGoal (ALL/ANY) creatable, drives progress from SKU qty | **`MSN-029`** (new) + `MSN-026` | **BLOCKED** (fixture) |
| AC-2.d | Progress resets/limits per the configured mission period | `MSN-003` — **DRIFT, no execution needed** (periodicity accepted, never branched on) | not run (DRIFT) |
| AC-3.a | Name / Description configurable and render | `MSN-012` (existing) | not in this batch |
| AC-3.b | Start/End bound the active window | `MSN-007` + `MSN-008` (existing) | **FAIL (authoring side)** — `MSNA-023`: an inverted window persists |
| AC-3.c | `CustomerIDs` targets a mission to an explicit customer list | **NOT IMPLEMENTED — no execution** (see Findings 1) | not run |
| AC-3.d | Customer group targets a mission to group members | **`MSN-030`** (new) + `MSN-011` / `MSN-025` | **PASS** |
| AC-3.e | Reward granted exactly once on completion | **`MSN-027`**, **`MSN-033`** (new) + `MSN-021` | **PASS** — exactly one row at each unique amount |
| AC-4.a | Mission CMS record renders (MissionId / Names / Description / BannerUrl) | `MSN-012` (existing) | not in this batch |
| AC-4.b | Untranslated locale falls back to store default, not blank/raw key | `MSN-012` (existing) | not in this batch |
| AC-5.a | A grant is attributable to its specific mission via a reachable field | **`MSN-033`** (new) — **expected to expose `BL-LOY-015`, VIOLATED** | **CONFIRMED VIOLATED** |
| AC-5.b | Mission log entries carry type/date/amount/balance like Program entries | **`MSN-033`** (new) — DRIFT: mission rows carry `object === null` | **CONFIRMED DRIFT** |
| AC-6.a | Summary exposes the nine named progress fields | **NOT AS SPECIFIED — no execution** (see Findings 2) | not run |
| AC-6.b | `IsCompleted` / `IsActive` booleans reflect state | `MSN-013` — DRIFT (status enum, not booleans) | not run (DRIFT) |

## Gap-AC conditions (8)

| # | Condition | Covered by | Verdict |
|---|---|---|---|
| gap-1 | Cancel/refund reverses the order's mission contribution | **`MSN-032`** (new) — `{HYPOTHESIS}`, oracle undeclared | **RESOLVED — it does not.** Route to PO (`PROPOSED-BL-LOY-017`) |
| gap-2 | OrderValueGoal accrual basis is explicitly defined | **`MSN-028`** (new) — target sits strictly between merchandise value and taxed total | **RESOLVED — basis is `order.Total`** (shipping + tax included) |
| gap-3 | Loyalty-currency lines excluded from accrual | **`MSN-029`** (new) — `BL-LOY-009` by analogy | **UNVERIFIED** — case BLOCKED |
| gap-4 | Only a committed order status contributes | **uncovered** — no `MSN_E2E_STATUSGATE` fixture; `BL-ORD-009` dictionary framing | uncovered (unchanged) |
| gap-5 | Multiple same-order grants separately identifiable | **`MSN-033`** (new) — `BL-LOY-015` | **RESOLVED — amount is the only discriminator** |
| gap-6 | Concurrent/retried orders never double-grant | `MSN-021` (existing, dedup) — accrual half still open | partial — `MSN-033` COUNT=1, no duplicate |
| gap-7 | Cross-currency order value handled by a defined rule | `MSN-023` (existing) + **`MSN-031`** (new, read-side filter) | **PASS + new observation** (see Findings 6) |
| gap-8 | Private untargeted mission excluded from a customer's view | **`MSN-030`** (new) + `MSN-015` (existing, CONFIRMED DEFECT) | **CONFIRMED — `public=false` does not gate the read** |

## Invariants to verify

- `BL-LOY-009` — loyalty-currency lines earn zero → `MSN-029` — **UNVERIFIED (BLOCKED)**
- `BL-LOY-015` — per-entity attribution of a many-entity settlement (**VIOLATED**) → `MSN-033` — **CONFIRMED VIOLATED** on `da8abc6`
- `BL-LOY-007` — dedup by (objectType, objectId, operationType) → `MSN-021` — **no duplicate observed** (`MSN-033` COUNT=1)
- `BL-ORD-009` — order status is an admin-editable dictionary, not a fixed enum → gap-4 framing — not exercised
- `BL-B2B-004` — approval is quote-based; **do not assert a native order-approval workflow** — respected

## Integration seams with VCST-5346 (sibling, In progress)

- **`currencyCode` argument coupling — the live one.** `da8abc6` mitigates VCST-5842 via `mission.MissionCurrencyCode ?? context.GetValue("currencyCode")`, but the argument is **optional** (`Argument<StringGraphType>`, `:50`) while `StoreId` is `NonNullGraphType` (`:45`). If the storefront omits it, a PerSku mission resolves null and the page blanks → **`MSN-031`**.
- Frontend treats any `errors[]` entry as fatal for the whole response (VCST-5843), so one unresolvable product blanks all missions, not just the PerSku ones.
- No `IsCompleted`/`IsActive` fields means the frontend derives completion client-side — the source of the date-severity drift (VCST-5832).

## Findings needing no execution

Established from source at `da8abc6`; Step 5 must not re-derive them.

1. **`CustomerIDs` targeting does not exist** — zero hits in mission models, search criteria or the condition tree (only `UserGroupIsCondition` / `AnyUserGroupCondition`). AC-3 names it. Descope or gap — needs the author.
2. **Customer Mission Summary unmet as specified** — `CustomerId` not echoed on the row · `IsCompleted` has no DB column (only a `Status` string) · `IsActive` absent entirely · `OrderTotalValueCompleted`/`OrderQuantityCompleted` collapsed into a shared `currentValue` · `SkusCompleted` reshaped to `items[]` · `CompletedPercentage` → `percentage`. Six of nine.
3. **Periodicity is decorative** — accepted, never branched on; "per mission period" is load-bearing in all three goal-type ACs.
4. **`Mission.Public` is inert** — declared, never set by any server path, despite the dev comment marking that decision resolved.
5. **No organization dimension** — `LoyaltyMissionProgress` is `MissionId` + `UserId`; zero `organization` hits in the mission path; `loyaltyMissionProgress` takes no `organizationId`. A new org member inherits nothing and org purchasing never aggregates. **A PO question, not a test** — asserting org aggregation would assert a capability the platform never claimed (`BL-B2B-004` violation signal).

## Findings added by the execution run (2026-09-01)

6. **`currencyCode` omitted disables the currency filter rather than defaulting it** — `MSN-031` control read (`currencyCode:"USD"`) returns `totalCount 25`; the omitted read returns **26**, the extra row being the AUD mission `MSN_ORDERVALUE_ALTCURRENCY`. Graceful (no crash, VCST-5842/5843 do not reproduce), but the storefront, which omits the argument, would surface a mission denominated in a currency the customer cannot transact in. LOW, PO question.
7. **Mission accrual and Product-Points accrual disagree on the same order.** On `MSN-033`'s order the product-earn ledger row is **20 PTS = subTotal**, while the OrderValueGoal advanced by **204 = order.Total**. Two bases in one module, one order.
8. **Cancellation reverses nothing anywhere** — `MSN-032`: mission progress, `Completed` status, the seven mission grants *and* the product-earn row all survive `status=Cancelled`, re-checked at t+15s and t+5min. No reversal/`Spent` row is written.
9. **Case-batch defect: shipping method diverges from every fixture's measured basis.** `MSN-027/028/032/033` all capture `availableShippingMethods[?code=FixedRate]` = Ground **$150**, but the fixtures were measured at `BuyOnlinePickupInStore/Pickup = 0` (`MSN_E2E_ORDERVALUE_008` even declares `order_shipping_max: 10`). This is what makes `MSN-033`'s `reward_expected_total` line fail. Fix by selecting Pickup, or re-measure the fixtures with Ground.
10. **Case-batch defect: `[AUTH role=MSN_E2E_*]` cannot resolve.** The aliases carry `password_var` but no `password`/`password_env`, so `graphql-auth.ts resolveRole()` throws before any request. Bridged for this run via the runner's own `<ROLE>_EMAIL`/`<ROLE>_PASSWORD` fallback; unattended runs still fail. Owner: `test-data-engineer`.
11. **Case-batch defect: `[SETUP]` is a no-op in `graphql-runner.ts`.** `MSN-032`'s out-of-band cancellation never runs, so an unattended execution would take its post-cancel readings without cancelling and pass vacuously. Run manually or teach the runner `[SETUP]`.
12. **Case-design defect: `MSN-032` and `MSN-033` share one non-resettable fixture.** Both need `MSN_E2E_ORDERVALUE_008` at 0% on `MSN_E2E_USER_008`, and `Completed` is terminal — only one can execute truthfully per seed.
13. **Case defect: `MSNA-023` omits two prerequisite steps.** The blade will not enable Save without at least one condition and a selected Store; the case also never adds the reward row whose amount step 3 edits.

## Accepted gaps

- **gap-4 (order-status gate)** — uncovered; needs an `MSN_E2E_STATUSGATE` fixture. Same position on the sibling session's side.
- **`BL-LOY-015` has no citing case** (`BLC-004`, open by design) — the invariant describes a platform capability gap; a case asserting "attribution is impossible" would assert the absence of an API, not a behaviour.
