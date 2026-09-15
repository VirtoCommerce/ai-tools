# BL proposals — 2026-09-14

Unconfirmed candidates from `/qa-review-oracles bl domain loyalty` (BL-AUDIT-2026-09-14). **Neither was
written to `business-logic.md`.** Both are UNGROUNDED on the **docs axis only** — Source and Live are
fresh, strong and agreeing in each case — so a human decision on one question releases each of them.

---

## 1. NEW INVARIANT — organization-scope balance resolution · proposed `P0-revenue` · Value: business `high` · product `low` → **would promote on business value alone**

**Verdict: UNGROUNDED** (docs axis absent; `§1a` waiver withheld).

### Why it is proposed

No `BL-LOY-*` invariant covers organization-scope balance resolution. All 18 existing entries are about
Mixed Cart, missions or the payment gateway. Nothing states that the store setting
`Loyalty.LoyaltyBalanceCalculationMode` selects which scope the storefront reads and writes.

That absence has visible cost: two suite cases carry an empty `Business_Rule` for want of anything
correct to cite, and two open Critical tickets describe violations of a rule nobody wrote down —
**VCST-5954** (a scope change re-grants already-paid rewards and strands balances) and **VCST-5953**
(a buyer with no organization is shown a balance and refused at checkout against `available = 0`).

### Evidence

**Source — strong, every clause anchored at the deployed build** (`vc-module-loyalty` PR #17 head; the
deployed artifact is `3.1008.0-pr-17-116e`, so `dev` does not carry this code):

- `Core/ModuleConstants.cs` — `Loyalty.LoyaltyBalanceCalculationMode`, allowed `{Customer, Organization}`, default `Customer`, `IsPublic = false`
- `Core/Extensions/StoreExtensions.cs` — `IsOrganizationBalanceCalculationMode()`, the single resolution point
- `Data/Handlers/LoyaltyProgramHandler.cs` — all three accrual paths set `OrganizationId` under that branch
- `Data/Services/LoyaltyLogicService.cs` — balance keyed `org:{id}` / `user:{id}`, and the distributed lock matches; `GetOrganizationBalanceAsync` on an empty owner id yields **0** with no null guard
- `Data/Services/LoyaltyBalanceOperationLogSearchService.cs` — `BuildOwnerQuery` predicates `UserId == criteria.UserId && OrganizationId == null`, so a customer-scope read **excludes every organization-owned row by construction**. That one predicate is the strand.
- `ExperienceApi/Validators/LoyaltyCartValidator.cs` — same branch on the spend path, **no null guard** on the cart's organization. That is VCST-5953's mechanism in one line.

**Live — the strongest single observation of the audit, and it needed no write.** With the store in
Customer scope, the organization pool reads a six-figure balance while both member accounts read **0**
at user scope. Those points are visible to an admin endpoint and reachable by nobody else — VCST-5954's
"strands existing balances" half, observable today, re-derivable from three ids.

**Docs — nothing, and two published statements that the organization scope contradicts.** The
PlatformUserGuide enumerates every other field on the same Loyalty settings widget and omits this one;
the points-history guidance (back office and storefront both) describes the balance as the *user's*.

### The one question that releases this

Is this behaviour **genuinely undocumentable** (§1a class 2), or merely **not yet documented**?

- **Held as UNGROUNDED** because it is a store setting on a widget whose siblings are all documented, in
  a module with a published user guide — so a doc *could* exist, and §1a closes with *"when in doubt,
  UNGROUNDED, not N/A"* and *"`N/A` never applies to a user-facing behavior a guide would normally
  describe."*
- **The counter-argument is real:** PR #17 is open and unmerged, so upstream documentation *cannot* exist
  yet — arguably the same position as any project-specific extension.

If a reviewer accepts the counter-argument, the verdict becomes **MISSING**, `Docs` carries
`N/A — project-specific: capability ships in an unmerged upstream PR, no released doc surface`, and it
applies at the next free id (**`BL-LOY-020`** — `BL-LOY-011` is a reserved gap and must not be reused).

### Proposed entry (body only; env-agnostic)

> **BL-LOY-020: A store setting selects the OWNER SCOPE of loyalty points; the read path and the spend path MUST resolve the same scope** `[P0-revenue]`
>
> - **Rule:** The store setting `Loyalty.LoyaltyBalanceCalculationMode` (allowed `Customer` / `Organization`, default `Customer`, non-public) selects the owner of every loyalty balance operation.
>   **(a) Scope of the write.** Every ledger row written while organization scope is in force carries the ordering member's organization as its owner, and the running balance and its distributed lock are keyed on that owner — so all members of one organization accrue into, read and spend ONE pooled balance, and mission progress accrues against that same owner.
>   **(b) Read/spend parity.** The scope MUST be resolved identically on the read path (balance and points-history queries, the storefront account pages, the back-office widgets) and on the spend path (cart validation, points payment). A balance an actor is SHOWN MUST be the balance they are allowed to SPEND. An actor with no organization MUST NOT be shown a balance on one scope and refused against `available = 0` on the other.
>   **(c) No silent re-scope.** Rows owned by an organization are excluded from every customer-scope read and vice versa, so changing the setting does not migrate existing balances or mission progress — it makes them unreadable and unspendable under the new scope. Changing it on a store that already holds loyalty data is a migration, not a toggle; in particular a mission already completed under the previous owner MUST NOT become grantable a second time because its progress was re-keyed.
> - **Verify:** (1) two members of one organization each place a qualifying order → the organization-scope balance and each member's storefront points history report the same pooled figure, and each member's customer-scope balance reads 0; assert deltas, never absolutes. (2) One member spends a points line → the pooled balance decrements and the colleague sees it. (3) An actor with NO organization reads the balance shown on their account page, then adds a points line below it → checkout MUST NOT be refused, and any `available` reported MUST equal the figure shown (BL-LOY-008). (4) A row written under one scope is absent from the other scope's read path — assert the strand, do not repair it. (5) After a scope change, a mission already `Completed` under the previous owner MUST NOT grant again.
> - **Violation signal:** A balance is visible on the account page but the cart reports `available = 0` and blocks checkout; a member's back-office contact balance reads 0 while that member's own orders demonstrably earned points; a pooled balance survives a scope change but is thereafter readable and spendable by nobody; one mission completion rewarded twice across a scope change.
> - **Agents:** qa-backend-expert, qa-frontend-expert

**Caveat to carry if applied:** clause (c)'s second sentence (the mission re-grant) is **source-grounded
and live-unevidenced in this audit's batch 1**. Batch 2 independently evidenced it live — see BL-LOY-018,
now amended — so a reviewer may treat it as covered; the two batches reached it by different routes.

---

## 2. `BL-LOY-010` — DRIFT held on the docs axis · `P1-data`

**Verdict: UNGROUNDED** (docs axis empty; `§1a` waiver **unavailable**, not merely withheld).

The substantive change is a clean DRIFT with unusually strong Source and Live — both tested in **both
directions** — so the human pass should be quick.

**Why `N/A` does not apply here.** This is a blocking validation a shopper hits, and the storefront
renders a dedicated user-facing message for it. §1a: *"`N/A` never applies to a user-facing behavior a
guide would normally describe."* The natural home already exists — the Troubleshooting table on the
loyalty-catalog setup page covers "loyalty catalog shows a 404", "a product is missing from the loyalty
catalog", "a program is not awarding points", and is **silent on this**. That is a documentation gap,
not undocumentability.

**Source** — `LoyaltyCartValidator.cs` rule 2. Both operands are selection-scoped: `hasPointProducts`
from `cart.CartTotals`, `hasCashProducts` from `CartAggregate.SelectedLineItems` — **not** `cart.Items`.
Identical at the deployed PR head and at `dev`, so no divergence.

**Live — all three states observed fresh:**

| State | Guard |
|---|---|
| Points-only cart | message shown, place-order **disabled** |
| + cash line added | message **gone**, place-order **enabled** |
| cash line present but **DESELECTED** | message **returns**, place-order **disabled** |

The third row is the finding: the requirement is on a **selected** cash line, which the current Rule
text does not say.

**Proposed change:** title and Rule narrow "at least one cash line" → "at least one **SELECTED** cash
line", with the deselection case added to Verify and to the Violation signal. Full proposed text is in
the batch-3 triangulation record; it is a one-word semantic narrowing plus its test.

---

## 3. NEW INVARIANT FAMILY — loyalty MISSIONS · 39 uncited cases across 4 suites · **5 candidates, each with a proposed severity**

The second oracle gap of the same shape as §1, and the larger one. `BL-001` fires **98** times across
the 11 loyalty suites; **39** of those are *missions* cases, in `075d` (19), `075e` (13), `083c` (6)
and `083d` (1). They are uncited because **no citable invariant exists** — the three mission entries
that do exist (`BL-LOY-015` attribution, `BL-LOY-018` once-per-owner granting, `BL-LOY-019` reversal)
cover the accrual ledger and nothing else. Visibility, targeting, periodicity, the feature toggle and
progress math have no oracle at all.

**Why this is filed as candidates-with-severities rather than as another audit run.** The 2026-09-14
audit ranked 20 candidates and **HELD all 20** on the same reason: *business value undeclared*. That
is a structural deadlock, not a backlog — `oracle-significance.ts` never promotes an `unknown`-business
candidate, and only a human-initiated triangulation can declare the tag. Re-running
`/qa-review-oracles bl domain loyalty` without declared severities reproduces the identical 20 HOLDs.
So each family below carries a **proposed** tag; the audit's job is to confirm or correct it, not to
invent it.

| # | Candidate family | Proposed | Demand (uncited cases) | What a violation costs |
|---|---|---|---|---|
| 3a | **`Loyalty.Missions.Enable` governs the whole surface — visibility AND accrual** | `P0-revenue` | 6 — MSN-009, MSN-010, MSN-017, MSN-018, MSNA-020, MSNF-076 | Accrual continuing while the feature reads as off mints points nobody authorised. MSN-018 asserts exactly this and can cite nothing. |
| 3b | **A mission is visible only to its declared audience — group scope, `public`, targeting** | `P1-data` | 5 — MSN-008, MSN-011, MSN-015, MSN-030, MSN-034 | The wrong customers see (and can complete) a promotion scoped to someone else. Four of the five are group/targeting cases whose whole assertion is the audience boundary. |
| 3c | **A declared periodicity either constrains accrual or is rejected — never silently accepted** | `P1-data` | 1 — MSN-003 | MSN-003's finding IS the invariant: a non-`None` periodicity is accepted and then never branched on, so a "monthly" mission behaves as unlimited. One case, but it is the only thing standing over the whole periodicity field. |
| 3d | **Progress is bounded and total — capped at 100%, defined at a zero target, and a partial payload failure never voids the rest** | `P1-data` | 11 — MSN-001, MSN-016, MSN-020, MSN-022, MSN-026, MSN-031, MSNF-016, MSNF-025, MSNF-054, MSNF-074, MSN-E2E-002 | The largest cluster. Degenerate targets (zero-target, divide-by-zero), the 100% cap, `ALL` vs `ANY` divergence, and two resilience cases where one bad mission must not take the response down. |
| 3e | **A Published mission is immutable, and the Draft→Published transition is one-way** | `P1-ux` | 13 — MSN-006 + the `075e` admin set | Admin-authoring surface. MSN-006 (edit of a Published mission returns **500**, not a 4xx) is the one with a data edge; the rest are blade/validation behaviour. Lowest tier of the five and the one most likely to be corrected downward on triangulation. |

**One of the 39 is a REMAP, not an ADD.** `MSN-032` ("no reverse edge exists anywhere in the chain —
cancelling the order behind a Completed mission…") is precisely `BL-LOY-019`. It needs a citation, not
an invariant — hand it to `npm run bl:remap -- --from … --to BL-LOY-019` via `/qa-review-tests --fix`,
which is now a capability that exists (`scripts/knowledge/remap-bl-citations.ts`, added this cycle).

**Against the value gate, as proposed.** 3a promotes on business value alone (`high` business ⇒ always).
3b/3c/3d are `medium` business and need product `medium`+ — 3b (5 cases) and 3d (11 cases) clear the
≥3-citing-case bar comfortably; **3c has a demand of 1 and would HOLD**, which is the correct outcome
to record rather than to argue around. 3e at `P1-ux` also needs 3+ and has 13.

**What the audit must still do — this section declares value, it does NOT establish truth.** Every
family above needs the three axes (docs / live / source) before anything is written. Two have a known
axis risk worth naming up front: 3a's toggle semantics are a **store setting** whose write path is
itself a confirmed defect (settings-v2 `204` no-op), so the live axis must read `GET /api/stores/{id}`
→ `settings[]`, never the settings API's own echo; and 3d's resilience pair (MSN-031, MSNF-074) can
only be observed by provoking a partial failure, which may be unreachable live and would then be a
two-axis result under the applicable-axes waiver.

**Scope for the run this releases:** `/qa-review-oracles bl domain loyalty`, restricted to these five
candidates, with the proposed tags supplied as the `--severity` input to `oracles:rank --explain`.

---

## Routed elsewhere, not oracle changes

1. **`bl-audit-criteria.md` §1a names "the Mixed-Cart Loyalty domain" as its class-2 example — that premise is now stale.** The domain has a real published surface in both the Platform and Storefront user guides (the Mixed cart mode, the points price list, a Troubleshooting table, and the customer-facing split-cart description). `N/A` can no longer be granted to a BL-LOY entry on blanket domain grounds; each entry needs its own judgment. Recommend dropping that example. **This is a criteria-file edit and was deliberately not made by the audit.**
2. **Documentation defect (customer-facing).** The points-only-cart rejection is a blocking validation with a rendered storefront message and no guide entry. Separately, the two published points-history statements ("a user has earned or redeemed", "buyers can view **their** accumulated points") become false for any store in organization scope. Both are `ba-doc-writer` items.
3. **Coverage gap — the highest-value one this audit surfaced.** The multi-organization-buyer re-grant path has no test case. It needs no store-setting change, no admin and no unusual flow — a buyer with two companies placing an order under each is the ordinary B2B case, and every existing mission case runs single-org.
4. **Coverage gap for `050b4`.** A per-line catalog-item reward with an empty `ProductId` against a mixed cart — the one path where BL-LOY-004's currency scoping is absent in source and untested in the suites.
5. **Corpus hazard — CLOSED same day, no action needed.** The concern was that any case asserting `object == null` to identify a mission-grant row would false-red on the deployed build. A `/qa-review-tests` sweep found two references, both in `075d-loyalty-missions.csv`, and **neither can fail a run**: `MSN-019` carries the stale assertion but is `Deprecated` (runs nowhere, `EX-201`), and `MSN-033` — its live successor — already asserts `object.type = Mission`, migrated when VCST-5916 shipped. Only a stale prose cross-reference in MSN-033's `Cross_Layer_Checks` remains. Live check confirming the shape change: 0 rows with `object === null`, 19 with `object.type = "Mission"`.
