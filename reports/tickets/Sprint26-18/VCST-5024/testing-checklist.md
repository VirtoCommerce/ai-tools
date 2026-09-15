# Testing checklist — VCST-5024

**[E2E] [Loyalty] Calculate earned/redeemed loyalty points totals on the organization level**
Story · Medium · Sprint26-18 · FULL path · Epic VCST-5099 (Draft)
Build under test: `VirtoCommerce.Loyalty 3.1008.0-pr-17-116e` (tip of open PR #17) + theme `2.58.0-pr-2475-d710`
Model: `reports/ba/test-models/VCST-5024-2026-09-11.md` · verdicts filled in at 5e — **flip window 14:34:06Z → 15:07:52Z**, store restored and verified

## The precondition that governs this whole run

`Loyalty.LoyaltyBalanceCalculationMode` on `B2B-store` is **unset → effectively `Customer`**, so the feature is
dormant. Items marked **[ORG]** require the store flipped to `Organization`; items marked **[CUST]** must be
observed **before** the flip; items marked **[ANY]** are mode-independent.

**Flip window discipline** — the store is shared. **Corrected in-run; the first attempt silently failed:**
- Capture every [CUST] item first.
- **Do NOT flip via `POST /api/platform/settings/v2/tenant/Store/{id}/values`.** It returns **204**, changes what the
  settings API reports, and **changes nothing the module reads** — `StoreExtensions.IsOrganizationBalanceCalculationMode()`
  resolves `store.Settings.GetValue<string>(…)` off the **store entity**, which stays `null` → `Customer`. This run lost
  ~16 minutes and one consumed mission fixture to that. It is filed as a defect in its own right (K1).
- **Flip via `PATCH /api/stores/{id}`** with JSON Patch on the `settings[]` element
  (`[{"op":"replace","path":"/settings/<i>/value","value":"Organization"}]`) — never a whole-entity `PUT /api/stores`,
  which replaces the store object and can null required defaults (currency / language / url).
- **Verify by BEHAVIOUR, never by reading the setting back.** The decisive check: a member's `loyaltyBalance(storeId:)`
  switches from their user-scoped figure to the organization's. Two settings readers disagree, so neither is evidence.
- No loyalty regression suite may run inside the window.
- Restore the same way, then diff **all** settings against `_preflip-B2B-store-baseline.json`.
  Achieved this run: effective `Customer`, stored `null`, **zero diff across 106 settings**.

---

## A. Contract and scope guards [ANY] — decidable without the flip

- [x] **A1** `loyaltyBalance` without `storeId` is rejected — `Argument 'storeId' of type 'String!' is required` *(S15)*
      → **PASS — HTTP 400, `Argument 'storeId' of type 'String!' is required`**
- [x] **A2** `loyaltyPointsHistory` without `storeId` is rejected, same error class *(S15)*
      → **PASS — same error class (`PROVIDED_NON_NULL_ARGUMENTS`)**
- [x] **A3** A caller supplying `organizationId` to `loyaltyBalance` is rejected as an unknown argument — scope cannot be caller-chosen *(S13)*
      → **PASS — `Unknown argument 'organizationId'`; the schema itself is the scope guard**
- [x] **A4** A member requesting **another member's** `userId` on `loyaltyPointsHistory` is **refused**, not returned empty — an empty success reads as clean and is not acceptable evidence *(S14)*
      → **PASS — `Access denied.` with `data: null` on both balance and history; the own-id control returns normally**
- [x] **A5** Corpus impact of A1/A2 is quantified: how many suite rows call these queries without `storeId` *(feeds the verdict; 8 found and repaired in-run)*
      → **8 occurrences across 3 suites (075b 1, 075c 1, 075d 6) — repaired in-run, re-linted, executed as C1b**

## B. Customer-mode baseline [CUST] — must be captured BEFORE the flip

- [x] **B1** Balance, points-history `totalCount` and mission-progress `totalCount` recorded for a known loyalty account *(S16)*
      → **CAPTURED — VIP fixture 2,702,311,237 · 219 ledger rows · 60 mission-progress rows**
- [x] **B2** Org-scoped balance recorded for the fixture organization — expected `0` pre-flip, since no historical row carries an `organizationId` *(S16, and the control for S8)*
      → **CAPTURED — org pool 0 pre-flip, as predicted: no historical row carries an organizationId**
- [x] **B3** A member's user-scoped Admin balance (`balance/user/{userId}`) and their contact operation-log blade both render real, non-zero data *(the control for S4)*
      → **CAPTURED — contact blade and `balance/user/{id}` both render real non-zero data**
- [x] **B4** Mission progress for one member recorded with `status` + `percentage` *(the control for S8/S7)*
      → **CAPTURED — A resolved 30 rows with a progressId, incl. the per-run mission Completed 1/1**

## C. The mechanism under org mode [ORG] — the story's actual promise

- [x] **C1** **[JOURNEY]** Member A orders, then member B orders; both read the **same pooled balance** = baseline + A + B; then one of them redeems at checkout and the pool decrements *(S1 — if this fails, the feature does not work)*
      → **PASS — pool 0 → 40,152 (A alone) → 133,086 (A+B) → 163,505 (after redeem). B read 40,152, identical to A, having ordered nothing since the flip**
- [x] **C2** Both members' orders produce ledger rows carrying **their own** `UserId` **and** the shared `OrganizationId` *(S1, sentence 3's "logging" half)*
      → **PASS — all 26 post-flip rows carry `organizationId` AND the acting member's own `userId`**
- [x] **C3** `balance/organization/{orgId}` equals the summed `Amount` of that organization's rows *(S6)*
      → **PASS — `balance/organization` = 163,505 = the exact signed sum of the org rows, computed independently**
- [x] **C4** Exactly **one** `Earned` and **one** `Redeemed` row per order — the dedup key was deliberately not org-scoped and must still hold *(S22, BL-LOY-007; a PASS here is the informative result)*
      → **PASS — order cb99afd1 produced exactly {Earned:1, Redeemed:1}, coexisting, no duplicates. Independently re-proven by both lanes. BL-LOY-007 holds when the credit is org-keyed, which was the open half**

## D. The scope split — highest-severity hypotheses [ORG]

- [x] **D1** A **no-org** account can still **READ** its own personal balance on an org-mode store *(S3)*
      → **PASS — the no-org account reads its own 38,916 on an org-mode store**
- [x] **D2** A **no-org** account can still **SPEND** those points at checkout. Hypothesis: it cannot — the validator reads `0` and raises `LOYALTY_INSUFFICIENT_BALANCE` with `available: 0` *(S2 — P0-revenue)*
      → **FAIL — P0-revenue. Sees 38,916; cart refuses with `available: 0`; Place order disabled.** Durable evidence: `evidence/D2-cart-mixed-SOLE-error.json`.
- [x] **D3** D1 and D2 are compared explicitly. The finding is the **disagreement**, not either reading alone
      → **FAIL — and the sole-cause attribution is EVIDENCED IN DATA, not asserted (strengthened at the 5b gate).** The PTS-only cart carries BOTH `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED` and `LOYALTY_INSUFFICIENT_BALANCE` (`evidence/D2-cart-ptsonly-BOTH-errors.json`); the mixed cart, with a cash line added, carries **exactly one** validation error — `LOYALTY_INSUFFICIENT_BALANCE`, `required=6 available=0` (`evidence/D2-cart-mixed-SOLE-error.json`). The confound is removed in the data, not only in the narrative. **GAP: no HAR was captured this run**, against this checklist's own "HAR always" rule — the saved payloads stand in for it.
- [x] **D4** A member's **user-scoped** balance and contact operation-log after earning in org mode. Hypothesis: both read `0`/empty, because org-scoped rows are excluded from every user-scoped read *(S4 — sentence 3's "stats" half)*
      → **FAIL — 0 of 22 org-scoped rows visible in any user-scoped read; contact blade shows 39,533 while the same person's storefront reads 133,086**

## E. Shared-ledger visibility [ORG]

- [x] **E1** Member B's `/account/points-history` contains rows caused by member A *(S5)*
      → **FAIL — B's points history shows A's order earning 30,000; A's shows B's Redeemed and Earned rows**
- [x] **E2** Nothing in the rendered row or the GraphQL payload identifies **which member** caused it *(S5, escalates BL-LOY-015)*
      → **FAIL — no member field exists in the GraphQL schema, and the Admin org ledger has no member column**
- [x] **E3** The page's headings and possessive wording are recorded verbatim — the published guide says buyers view *their* points *(S21, {DOC} contradiction)*
      → **CAPTURED — verbatim. Points-history makes NO ownership claim; the missions page says "Redeem your points"**

## F. Missions under org mode [ORG]

- [x] **F1** Member A completes the per-run mission; member B then sees it **Completed** and cannot earn it *(S7 — BL-LOY-018 becomes per-organization)*
      → **PASS, behaviour CHANGED — B saw the mission Completed 1/1 carrying A's same progressId, having ordered nothing**
- [x] **F2** The reward is granted **once**, not once per member *(S7)*
      → **PASS, behaviour CHANGED — reward 619 granted ONCE for the organization. In Customer mode 617 fired once per member. BL-LOY-018 is now per-organization**

## G. Mode-flip data behaviour [ORG → CUST]

- [x] **G1** Immediately after the flip, the org balance reads `0` and each member's pre-flip mission progress no longer resolves *(S8)*
      → **CONFIRMED — A 39,533 → "Balance: 0" and "No records found"; mission progress reverted to 0%, "0 of 1 orders"**
- [x] **G2** Whether an already-completed mission can be completed **again** at org scope *(S8 — the double-reward risk)*
      → **CONFIRMED — P0-revenue, and EXACTLY RE-DERIVED from the live ledger at the 5b gate** (`evidence/G2-org-ledger-full.json`, all 33 org rows re-read live and persisted). Member A pre-flip user-scoped: **20 mission rows totalling 9,533**. Post-flip org-scoped: **21 rows totalling 10,152** — the same amount multiset PLUS a single 619 (the genuinely new ORG_LOY_MISSION_2). So 20 of 21 reproduce the earlier set amount-for-amount: 617, 508x3, 506x3, 505x3, 503x3, 500x5, 250, 100 = 9,533. **MECHANISM, newly evidenced: the (objectId, amount) overlap is ZERO** — the org-scope rows carry NEW objectIds because new progress rows are created under the new owner key, so the dedup index structurally cannot see them as duplicates. FAILURE MODE (corrected): opening-balance INFLATION ON ADOPTION, not double-credit on rollback — 9,533 of the 40,152 opening pool (24%) was money already paid out once. The duplicate is written at org scope, so a flip back strands it rather than doubling anyone's spendable balance**
- [x] **G3** After the restore, the member's pre-flip personal balance is intact and equals B1 *(S9, and the run's own restore verification)*
      → **PASS — restore exact: effective Customer, stored null, ZERO diff across all 106 store settings**
- [x] **G4** Points earned **during** the window are reachable from neither scope after restore, or are reachable — state which *(S9)*
      → **CONFIRMED — the 163,505 pool persists but is readable ONLY via the admin-only `GET /api/loyalty-program-operation-log/balance/organization/{organizationId}`. No member can read or spend it from either scope. A and B revert to their intact pre-flip 39,533 / 100,033, and their original mission progressIds resolve again**

## H. Authorization [ORG]

- [x] **H1** A member **locked** in the organization, using a token minted before the lock, is refused the pooled balance and ledger *(S12 — ECL-14.3 on a money surface)*
      → **PASS — `/connect/token` refuses the org claim for a locked membership even when explicitly requested; balance, ledger and progress all 0 against a non-zero pool of 133,086. ECL-14.3 (locked AFTER minting) remains untested**
- [x] **H2** A multi-org member sees the correct organization's pool, and switching the active org changes it with no bleed *(S17)*
      → **PASS, weak form — per-org grants resolve the right claim; both of MULTI's orgs read 0 while the outlet held 133,086. No bleed**

## I. Back office [ORG]

- [x] **I1** The organization blade's loyalty widget renders the correct pooled balance and opens the operation-log blade filtered by `organizationId` *(S20)*
      → **PASS — the widget renders the correct pooled figure and opens the operation log filtered by organizationId**
- [x] **I2** A failed request behind the widget is distinguishable from a genuine zero balance *(S20 — it initialises to `0` and early-returns)*
      → **{HYPOTHESIS}, SOURCE-DERIVED — regraded at the 5b gate.** `organization-loyalty-widget.js` has a success callback only, no error callback and no loading/error state, and initialises `balance = 0` — so a failed request would leave a literal 0. **No 4xx was induced and no artifact shows one.** Reported as a source reading, not an observed verdict.

## J. Accrual-eligibility scope [ORG]

- [x] **J1** A second member's **first order** in an organization that has already ordered — does a first-order reward fire again? *(S19)*
      → **BLOCKED — no first-order-conditioned program or mission exists on this store, so the hypothesis is not decidable without new fixtures**
- [x] **J2** A registration bonus for a multi-org contact — which organization receives it? *(S18, `Organizations.FirstOrDefault()`)*
      → **PARTIAL — read path only. The registration-time trigger needs a brand-new two-organization contact that no fixture provides**

## K. Discoverability and documentation [ANY]

- [x] **K1** The setting's location recorded: it is under group `Loyalty|Missions`, **absent** from the store's Loyalty settings widget, and `isPublic: false` *(S21 context)*
      → **CONFIRMED defect — the settings-v2 tenant write returns 204 and changes nothing the module reads. The Admin UI path (entity mode → the blade's own PUT /api/stores) DOES work, so High rather than Critical**
- [x] **K2** Whether any published guide documents organization-level loyalty *(1c found none across 13 VirtoOZ queries; confirm rather than assume)*
      → **CONFIRMED — zero published coverage across 13 VirtoOZ queries, and it contradicts two currently-correct published statements**

---

## Conditions NOT covered by an item above — stated, because a blank reads as covered

| Condition | Disposition |
|---|---|
| **Concurrent earn** — two members of one organization ordering simultaneously; the pooled balance must equal the sum with no lost update *(S10)* | **`PENDING-A`** — covered by an Artifact-A row in `075f`, authored this run, executed at `4c`. The lock was re-keyed to the organization at `116e902c`, so the ticket comment that reported it broken is stale in CODE; this is the behavioural proof, and it needs two genuinely parallel sessions rather than a checklist step |
| **Concurrent redeem** — two members spending one pool at once must not overdraw it *(S11)* | **`PENDING-A`** — as above, `075f` |
| **Cancelled order in organization mode** *(S21 in the model's reverse-edge block)* | **WAIVED, and reported as a finding rather than tested.** `BL-LOY-019` already records that no reversal path exists anywhere in this module — the effect is not reversed today at user scope either. This change does not introduce the defect; it widens its blast radius from one person's balance to a pool every member can spend. Writing a case that asserts the broken behaviour would certify a defect |

**Both `PENDING-A` entries must resolve to a real appended row at the `3-cases` gate.** A `PENDING-A` that
survives that gate is a REJECT, not a note.

---

**Out-of-scope-bug rule applies.** The checklist is the floor, not the ceiling: file any incidental defect found on
these surfaces. Verify before filing — a disabled control, an API-only limitation or declared by-design behaviour is
not a bug.

**Evidence:** `.claude/skills/qa-evidence/evidence-capture-policy.md`. Screenshots to
`reports/tickets/Sprint26-18/VCST-5024/screenshots/`. HAR always; console errors only; network 4xx/5xx and >2 s.
**Every balance assertion is RELATIVE to a value read immediately before** — a loyalty balance cannot be reset on
this platform, so absolute figures are not reproducible.
