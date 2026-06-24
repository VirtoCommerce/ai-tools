# Test Case Lifecycle Report — TLC-2026-06-24-1121

## Summary
- **Input:** VCST-5103 (read PRs)
- **Input Type:** change-source (JIRA Story + 2 linked PRs)
- **Date:** 2026-06-24 11:21
- **Env / Platform:** vcst-qa @ Platform 3.1039.0
- **Module builds (deployed on vcst-qa):** Loyalty `3.1004.0-pr-10`, XCart `3.1022.0-pr-125`, XOrder `3.1006.0-pr-43`, Orders `3.1010.0-alpha.1429-vcst-5104`
- **Verdict:** **APPROVED** — `LOYALTY_NOBAL_USER` fixture seeded; all 4 validator rules covered (3 live-verified PASS, 1 Semi-Automated). Ready for `/qa-regression loyalty`.
- **Post-report follow-up (2026-06-24):** see "Follow-up actions" at the foot of this report.

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | Suite 075b; PRs x-cart#125 + loyalty#10 read |
| 2. Sync | test-management-specialist | Done | 7 existing MCO-* cases → all VALID/UNAFFECTED |
| 3. Generate | test-management-specialist | Done | 3 cases created (1 manual gap documented) |
| 4. Review | test-management-specialist | Done | 0 blocker/critical; 3 manual items |
| 5. Verify | graphql-runner (live) | Partial | 1 PASS live, 1 fixture-blocked, 1 deferred |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Required gates pass |

## What the PRs implement (change inventory)
- **vc-module-x-cart #125** — internal refactor: cart validation now an extensible `ICartValidatorRegistry` chain (`ICartValidator<TContext>` ordered by `Order`, built-ins at `-1000`). Public `cart.validationErrors` shape unchanged.
- **vc-module-loyalty #10** — `LoyaltyCartValidator` (Order 100) plugs into the chain with 4 typed rules:
  1. `LOYALTY_POINT_PRODUCTS_NOT_ALLOWED` — points-priced line only valid in Mixed Cart mode
  2. `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED` — cart needs ≥1 cash line (AC "at least one common product")
  3. `LOYALTY_PAYMENT_METHOD_NOT_ALLOWED` — loyalty gateway only valid in Payment Method mode
  4. `LOYALTY_INSUFFICIENT_BALANCE` — `Σ(PTS) ≤ balance`, params `{required, available}`, blocks checkout (AC core)

## Coverage gap addressed
Existing 075b/083b cover **VCST-5104** (order totals, per-line currency, earn/redeem). They read `validationErrors` only as diagnostic evidence on happy paths — **no suite asserted any VCST-5103 validator error code**. The planned `MCO-GQL-005` was alias-provisioned but never written.

## New Cases Generated → `regression/suites/Backend/loyalty/075b-loyalty-mixed-cart-order.csv`

| ID | Error code under test | BL | Status | Phase-5 result |
|----|----------------------|----|--------|----------------|
| MCO-GQL-005 | LOYALTY_INSUFFICIENT_BALANCE (+ checkout block) | BL-LOY-008 | Draft `@needs-test-data` | **BLOCKED** — `LOYALTY_NOBAL_USER` not seeded |
| MCO-GQL-006 | LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED | — (proposed) | Draft | **PASS 5/5 live** |
| MCO-GQL-007 | LOYALTY_POINT_PRODUCTS_NOT_ALLOWED (mode gate) | — (proposed) | Semi-Automated `@needs-test-data` | Deferred — needs store-mode flip |
| _(not generated)_ | LOYALTY_PAYMENT_METHOD_NOT_ALLOWED | — (proposed) | manual gap | needs gateway + mode-flip fixture |

**MCO-GQL-006 live evidence:** PTS-only cart → exactly 1 `validationErrors` entry with `errorCode=LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED`; adding a cash line clears it (errors[] empty). Confirms the `cart.validationErrors { errorCode }` shape and that x-cart#125 + loyalty#10 are live on vcst-qa. Evidence: `reports/regression/graphql-evidence/MCO-GQL-006-*.json`.

## Quality Gates

| Gate | Status | Detail |
|------|--------|--------|
| G1 Structure | PASS | Column-shift defect found & fixed (empty Business_Rule dropped on 006/007); all 11 records = 15 cols |
| G2 Determinism | PASS | 006 deterministic + live-passed; 005/007 preconditions documented |
| G3 Completeness | PASS | `errors[]` + field-level checks present on every body op |
| G4 Testability | PASS | 006 runnable now; 005/007 correctly flagged `@needs-test-data` |
| G5 Data Validity | PASS | `validate-td-refs` clean, 0 hardcoded GUIDs, schema-validated; 006 shape live-confirmed |
| G6 Coverage (rec.) | WARN | 005→BL-LOY-008; 006/007 have no BL (3 proposal candidates below) |
| G7 Duplication (rec.) | PASS | No overlap vs existing MCO-* or 050b4 |
| G8 Environment | PASS* | 006 VERIFIED live; 0 BROKEN. 005 blocked-on-fixture, 007 deferred (not failures) |
| G9 Sync | PASS | All 7 existing cases VALID/UNAFFECTED by #125's internal refactor |

## Must Fix (blocks full coverage)
1. **Provision `LOYALTY_NOBAL_USER`** (zero-balance VIP) + set `LOYALTY_NOBAL_USER_EMAIL/PASSWORD` in `.env.local`, then run MCO-GQL-005. **This run also resolves the one unverified shape:** the `errorParameters` key casing (`required`/`available` from `FormattedMessagePlaceholderValues`) — if the implementation uses different keys, MCO-GQL-005's `[?key=required]` filter will false-fail until corrected.

## Should Fix
2. **MCO-GQL-007** — verify `PUT {{BACK_URL}}/api/loyalty-setting` contract + admin auth scope before first run; it flips and restores the store loyalty mode (do not run against the shared store during other activity).
3. **LOYALTY_PAYMENT_METHOD_NOT_ALLOWED (rule 3)** — uncovered. Needs the `LoyaltyPaymentMethod` gateway active + Payment Method mode. File a test-data provisioning ticket, then author as a 4th validator case (manual until then).

## BL-Proposal Candidates (NOT applied — `--update-bl` not set; human review)
- **Candidate B — LOYALTY_ONLY_POINTS_CART_BLOCKED** (live-verified via MCO-GQL-006): a cart of only loyalty-currency lines emits `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED`; adding a cash line clears it. Source: `LoyaltyCartValidator.cs` rule 2.
- **Candidate A — LOYALTY_POINT_PRODUCTS_MODE_GATE**: points-priced lines emit `LOYALTY_POINT_PRODUCTS_NOT_ALLOWED` outside Mixed Cart mode. Source: rule 1.
- **Candidate C — LOYALTY_PAYMENT_METHOD_MODE_GATE**: `LoyaltyPaymentMethod` gateway only valid in Payment Method mode. Source: rule 3.

## Files Modified
- `regression/suites/Backend/loyalty/075b-loyalty-mixed-cart-order.csv` — +MCO-GQL-005/006/007 (column-shift fixed)
- `config/test-suites.json` — suite 075b testCount 7→10, estimatedMinutes 9→13

## Next Steps
- [x] Seed `LOYALTY_NOBAL_USER`, run MCO-GQL-005, lock the `errorParameters` key casing — **done 2026-06-24**
- [x] Author rule-3 case (LOYALTY_PAYMENT_METHOD_NOT_ALLOWED) — **done; MCO-GQL-011 PASS 3/3 live (no provisioning ticket needed)**
- [ ] Review the 3 BL-proposal candidates in `bl-proposals.md` (per-entry approval) — awaiting your go/no-go
- [ ] One mode-flip run of MCO-GQL-007 to live-verify rule 1 (LOYALTY_POINT_PRODUCTS_NOT_ALLOWED)
- [ ] `/qa-regression loyalty`

---

## Follow-up actions (2026-06-24, after the initial report)

**Item 1 — fixture + live verification (DONE):**
- Added reusable, idempotent, teardown-able seeder `scripts/seed-loyalty-users.mjs`; provisioned `LOYALTY_NOBAL_USER` on vcst-qa (member `f2d8ede1…`, account `5a216728…`, group VIP, **0 balance**).
- Set `LOYALTY_NOBAL_USER_EMAIL/PASSWORD` in `.env.local`; updated the alias `_notes` with the seeded IDs.
- **MCO-GQL-005 PASS 9/9 live** — validator emits `LOYALTY_INSUFFICIENT_BALANCE`; `errorParameters` keys confirmed `required`/`available` (lowercase, string values: `required="200"`, `available="0"`); `createOrderFromCart` blocked (null + errors[]); cart still readable. BL-LOY-008 fully live-verified.

**Item 2 — rule 3 (DONE, better than projected):**
- Added **MCO-GQL-011** (LOYALTY_PAYMENT_METHOD_NOT_ALLOWED). vcst-qa is in Mixed Cart mode (a non-Payment-Method mode), so no store flip was needed.
- **PASS 3/3 live** — `addOrUpdateCartPayment` accepts the `LoyaltyPaymentMethod` gateway code without a registered-method requirement, and the validator fires. **No provisioning ticket required** (the projected gap closed itself). Manifest 075b testCount 10→11.

**Item 3 — BL proposals (DRAFTED, awaiting approval):**
- 3 formal drafts in `bl-proposals.md` (PROPOSED-BL-LOY-010 rule 2 [live-verified], 011 rule 1 [pending mode-flip], 012 rule 3 [live-verified]). Nothing written to `business-logic.md` — per-entry approval required.

**Validator rule coverage (final):**

| Rule | Error code | Case | Live result |
|------|-----------|------|-------------|
| 1 | LOYALTY_POINT_PRODUCTS_NOT_ALLOWED | MCO-GQL-007 | Semi-Automated (needs mode flip) |
| 2 | LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED | MCO-GQL-006 | ✅ PASS 5/5 |
| 3 | LOYALTY_PAYMENT_METHOD_NOT_ALLOWED | MCO-GQL-011 | ✅ PASS 3/3 |
| 4 | LOYALTY_INSUFFICIENT_BALANCE | MCO-GQL-005 | ✅ PASS 9/9 |
