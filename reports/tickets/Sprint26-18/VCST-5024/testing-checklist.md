# Testing Checklist — VCST-5024 (Artifact B)

Run: 2026-09-16 · `TEST_ENV=localhost` · `--iterate --max-rounds 2` · Round 1
Build: `VirtoCommerce.Loyalty 3.1008.0-pr-17-973e` (PR #17 head, confirmed via `/api/platform/modules`)
Model: `reports/ba/test-models/VCST-5024-2026-09-16.md` (amends `-2026-09-11.md`)
Prior round's checklist preserved at `testing-checklist-2026-09-11.md` — this file is NOT its continuation
(different environment, different build); `--iterate` round 2 APPENDS to this file, never overwrites it.

**THIS CHECKLIST IS ORDERED.** Phase 1 funds the organization pool. Until it does, the pool is 0 and every
"can X spend the pool" question is refused for *insufficient balance* rather than *authorization* — the two
are indistinguishable, which is a data defect, not a result (`test-data.md` SECOND RULE). Discovery (`3x`)
measured the pool at 0.0 with all three outlet members at 0.0. **Do not run Phase 5 before Phase 1 passes.**

## Standing rules for every item
- Balances CANNOT be reset (op-log is read-only, no set/debit API, no reversal path — `BL-LOY-019`).
  Read a balance IMMEDIATELY before an action and assert the **delta**. Never an absolute, never a figure
  carried over from an earlier item or an earlier round.
- Query a PTS product with `currencyCode:"PTS"`. Under `"USD"` the same healthy product reports
  `isAvailable:false, isBuyable:false, price 0`. **That is the wrong query, not a bug — do not file it.**
- Storefront free-text search does NOT match product code. Reach the PDP via `/product/<id>`
  (302s to the slug) or the category `01a0a9dd-e645-7e8b-abdf-b825425e8952`. `/product/<sku>` always 404s.
- The storefront's own default currency is **USD**, and in USD the points-only SKU renders
  **"Price: $0.00" with no Add-to-Cart**. Every storefront item touching a PTS line must FIRST switch the
  storefront currency to PTS via the currency selector. This is an explicit step, not a precondition.
- `ORG_LOY_LOCKED` signs in normally — the lock is on the org MEMBERSHIP, not the account. Sign-in
  succeeding is not evidence the lock is unapplied.
- HAR always. Screenshots on every failure and on the final state of each phase.

## Fixtures (seeded 2026-09-16T11:29:30Z, all confirmed live)
| Role | Email | Org / state |
|---|---|---|
| `ORG_LOY_A` | agent-test-orgloy-a@test-agent.com | outlet `01a0a9fa-8015-76aa-ac3a-0237b8e17e10`, Approved · earn plan qty 1 → 30,000 |
| `ORG_LOY_B` | agent-test-orgloy-b@test-agent.com | same outlet, Approved · earn plan qty 3 → 90,000 |
| `ORG_LOY_LOCKED` | agent-test-orgloy-locked@test-agent.com | same outlet, membership `isLocked=true` |
| `LOY_PERSONAL_NOORG` | agent-test-orgloy-noorg@test-agent.com | **no org**, 33,872 PTS (stranded, pre-flip) |

PTS SKU `AGENT-TEST-PTS-UNIT-001` @ 1 PTS · cash SKU `QA-LOY-PRIO-001` @ 60 USD ·
missions 617 / 619 / 631 (fresh, 0 progress rows) · password `process.env.DEFAULT_TEST_PASSWORD`.

---

**Verdict legend:** `[x]` decided · `[~]` partial · `[!]` executed but **CONFOUNDED** — the observation is real,
the cause is not isolated, so it decides nothing. Per-item evidence lives in `summary.json` → `ac_analysis.atomic_conditions` (the 21 conditions),
`ac_analysis.dod_enumerated` (the 10 DoD items) and `regression.c1.case_triage` (the 20 C1 cases), kept there so
this file stays under the 160-line report cap.

## Phase 0 — preconditions (verify, do not assume)
- [x] **P0.1** · **PASS** · Store `B2B-store` reads `Loyalty.LoyaltyBalanceCalculationMode = "Organization"` **off the
      store entity** (`GET /api/stores/B2B-store`), not off `/api/loyalty-setting/store/...`, which does not
      expose this field. A seeder has already flipped and restored it once this run.
      → if `Customer`: **STOP, report BLOCKED.** Every item below is void.
- [x] **P0.2** · **PASS (with a trap recorded)** · Outlet org pooled balance and each member's user-scoped balance read 0 at start
      (`/api/loyalty-program-operation-log/balance/{organization|user}/{id}`). Record all four figures + timestamp.

## Phase 1 — FUND THE POOL (gates Phases 3–5)  · model scenarios 1, 19 · `BL-LOY-007`
- [x] **1.1** · **PASS** · `ORG_LOY_A` places one order for `QA-LOY-PRIO-001` qty 1 in Organization mode.
      Assert: order created; ledger gains exactly ONE `Earned` row; that row carries **both** `UserId=A`
      **and** `OrganizationId=outlet` (the pre-flip rows carry `organizationId: null` — the contrast is the point).
- [~] **1.2** · **PARTIAL — this IS the S3 defect, not a separate one** · Pooled org balance moves 0 → **30,000**; A's user-scoped balance also reflects the earn.
      Record both. If the pool stays 0, Phases 3–5 are BLOCKED, not failing — say so.
- [x] **1.3** · **PASS (order-attributable; raw total includes mission fires)** · `ORG_LOY_B` places one order for `QA-LOY-PRIO-001` qty 3.
      Assert: pooled balance moves 30,000 → **120,000**. 120,000 is distinct from A alone (30,000), B alone
      (90,000), 2A and 2B — so a wrong scope key cannot produce this number by coincidence.
      **Known fixture limit:** 90,000 is an exact 3× of 30,000, so this data CANNOT separate "pooled"
      from "B counted three times". Do not claim it does.
- [x] **1.4** · **PASS for (a)(b)(c) — (d) NOT VERIFIED, (e) not exercised** · Exactly ONE `Earned` and at most one `Redeemed` per order id — dedup holds under org scope
      (`BL-LOY-007`, whose dedup key is NOT owner-scoped and was deliberately not changed).

## Phase 2 — THE FIX UNDER TEST (VCST-5953 · scenarios 2 + 3) — independent of Phase 1
- [x] **2.1** · **PASS** · `LOY_PERSONAL_NOORG` READ path: account page / `loyaltyBalance` serves a positive personal
      balance (~33,872) on an Organization-mode store. Record the figure. *(`3x` observed 33,872.)*
- [x] **2.2** · **PASS** · SPEND path, cart validation: a 1 PTS line produces **no `LOYALTY_INSUFFICIENT_BALANCE`**.
      `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED` on a points-only cart is a legitimate Mixed-Cart rule and
      is NOT the defect. *(`3x` confirmed GREEN at this layer — this item re-confirms and extends it.)*
- [x] **2.3** · **PASS via API · BLOCKED via storefront** · **The half `3x` could not reach: ORDER CREATION.** Add a cash line to satisfy Mixed Cart,
      then place the order. Assert it is created with an order number, and the points actually move
      (balance delta = the PTS total). This is the clause that makes RED→GREEN complete.
- [x] **2.4** · **PASS — the decisive result** · Read and spend AGREE for this actor. The 2026-09-11 run's finding was their DISAGREEMENT;
      agreement is what proves the fix. If `available` is reported at all, it equals 2.1's figure.

## Phase 3 — pooled read (scenarios 5, 4) · `BL-LOY-015`
- [x] **3.1** · **PASS** · `ORG_LOY_B` reads the pooled balance and sees A's contribution — one shared wallet.
- [x] **3.2** · **FAIL — BL-LOY-015** · B's points history contains A's rows, and **no field names which member caused each row**.
      Record verbatim what a buyer can and cannot tell. *(`BL-LOY-015` attribution — already recorded as
      violated on the 2026-09-11 run; this re-checks it under the new build.)*
- [x] **3.3** · **MEASURED — feeds the S3 verdict** · Admin: `balance/user/{A}` vs `balance/organization/{outlet}`. The prior run found org-scoped
      rows excluded from every user-scoped read (`0 of 22` visible). Re-measure and record both numbers.
- [x] **3.4** · **PASS — matrix cell R3/L9 CLOSED** · **Matrix cell R3/L9** — Admin CONTACT blade for `LOY_PERSONAL_NOORG` (the no-org actor) on an
      Organization-mode store: does the existing `customerDetail1` loyalty widget show their 33,872, a 0, or
      nothing at all? A literal 0 here is indistinguishable from a failed request (scenario 20's SILENT
      archetype). `3x` did not reach this cell; it is covered here so no condition is left unmapped.

## Phase 4 — mission under org scope (scenario 7) · `BL-LOY-018`
- [x] **4.1** · **PASS** · After 1.1, mission progress accrues against the **shared owner key**, not A's user id.
      Record `ownerId`, `userId`, `organizationId` on the progress row.
- [x] **4.2** · **PASS** · A completes mission 617 → reward credited **once**. Pool moves by exactly 617.
- [x] **4.3** · **ANSWERED — and it is the RULE, per BL-LOY-018** · **The open question the implementer's own 2026-09-02 comment raised and the PR answered
      unilaterally:** can `ORG_LOY_B` still earn that same mission, or did A consume it for the whole org?
      Record which, with the progress rows as evidence. Either answer is a finding; neither is a pass by default.
      *Constraint: mission targeting here is a customer-GROUP proxy, not org-native (this build has only
      `UserGroupIsCondition`/`AnyUserGroupCondition`). Conclude nothing about org-native targeting.*

## Phase 5 — authorization, decidable ONLY after Phase 1 · scenario 12 · matrix GAP R5/L8
- [!] **5.1** · **CONFOUNDED — not answered** · With the pool at 120,000, `ORG_LOY_LOCKED` READS the pooled balance. Refused, served, or
      served-empty? *(`3x` observed served-200-empty at pool=0, which was confounded — this is the
      unconfounded measurement.)*
- [!] **5.2** · **CONFOUNDED — not answered** · **THE UNCOVERED CELL: can the locked member SPEND it?** Cart a PTS line and take it as far
      as the platform allows. Record whether the cart validates, `Place Order` is enabled, and an order is
      created. Hypothesis: membership is checked by `Contains()` over the org list with no status check.
- [x] **5.3** · **PASS** · A member requesting ANOTHER member's `userId` is **refused at the server**, not merely
      returned empty — empty reads as clean (scenario 14).

## Phase 6 — scope, contract and backward compatibility
- [x] **6.1** · **PASS** · Scope is ambient: a caller supplying `organizationId` cannot choose another org's pool (scenario 13).
- [x] **6.2** · **PASS — and BREAKING, carried to DoD** · `storeId` is now REQUIRED on `loyaltyBalance` and `loyaltyPointsHistory` — omitting it fails
      cleanly. This is a BREAKING contract change for third-party consumers (scenario 15, carried to 5b as DoD).
- [x] **6.3** · **PASS** · Multi-org: `MULTI_ORG_LOY_POOLS` — switching active org changes which pool is read, with no
      bleed (scenarios 17, 18). **Re-read BuildRight immediately before asserting**: it is shared with the
      multiorg lane and its figure moves underneath this suite.
- [x] **6.4** · **CONFIRMED contradiction (advisory, does not fail 5c)** · Storefront copy renders a SHARED company pool under personal-possessive wording the published
      guide endorses (scenario 21, `{DOC}` contradiction — advisory, does not fail 5c).

---

## Conditions NOT covered by this checklist, and why — silence is not an answer
- **R3/L9 — Admin contact widget for the no-org actor.** `3x` NOT REACHED (box expired). Uncovered.
- **Scenarios 10 / 11 (concurrent earn, concurrent redeem).** Covered by cases `LOYORG-008` (Automated) and
  `LOYORG-009` (Draft), executed at `4c`, not by a checklist item — two simultaneous sessions are not a
  checklist shape.
- **Reverse edges.** `BL-LOY-019`: no reversal path exists for a balance accrual, and mission `Completed`
  is terminal. **ABSENT IN PRODUCT** — reported as a finding, not covered by an item, and now pooled across
  every member, which widens the blast radius from one person to a company.
- **Scenario 8/9 (the mode flip).** Already measured this run, before execution: the flip is a **no-op on
  existing data** in both directions. Recorded in the model (A2), not re-tested here.
