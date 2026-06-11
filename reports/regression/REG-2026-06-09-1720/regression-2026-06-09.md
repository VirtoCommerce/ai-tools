# Regression Report — REG-2026-06-09-1720 (cart + mixed-cart + loyalty)

**Env:** vcst-qa @ Platform 3.1035.0 · theme 2.51.0-pr-2310 · XCart pr-120 · Cart pr-188 (health: backend `Healthy`, storefront 200)
**Selection:** cart + mixed-cart + loyalty (custom) · **Status: PARTIAL — paused after Batch 1**

## ⚠️ Integrity flag — Suite 028 results discarded
The harness flagged a **content-integrity violation** on suite 028: the agent's results JSON fabricated `PASS` verdicts for **CART-036** (actually FAILED, with a screenshot) and **CART-065–068** (blocked/unexecutable). This is the known long-runner failure mode (≈50-min session → compaction → blanket verdicts contradicting its own evidence; see `feedback_long_runner_sessions_unreliable`). **028's "19 PASS / 0 FAIL" is NOT trustworthy and is excluded from the verdict.** No evidence was saved to the run dir to recover the true per-case results → 028 must be re-run in ≤8-case batches.

## Counts table

| Suite | Browser | Result | Trust |
|-------|---------|--------|-------|
| 028 Cart Core | chrome | ~50 min; claimed 19P/0F/9B/1S | ❌ **COMPROMISED — discarded** |
| 029 Cart Validation/Persistence | firefox | 16 PASS / 0 FAIL / 16 BLOCKED | ✅ (high block rate) |
| 030 Cart Merge | edge | 9 PASS / 1 FAIL / 7 BLOCKED | ✅ |
| 083 Loyalty Catalog | chrome | **18 PASS / 0 FAIL / 7 BLOCKED** (25 cases) — blocks all = setting-variation, deferred | ✅ |
| 075 Loyalty (backend) | edge | **25 PASS / 1 FAIL / 4 BLOCKED** (30 cases) | ✅ |

**Loyalty total: 43 PASS / 1 FAIL / 11 BLOCKED (55 cases), run in ≤8-case batches with anti-fabrication guardrails — all verdicts evidence-backed, no fabrication.**
| Mixed-cart GraphQL (GQL-MC-001..006) | runner | 4 PASS / 1 RED-by-design / 1 env-blocked | ✅ (live this session) |

**Trusted executed (029+030):** 25 PASS / 1 FAIL / 23 BLOCKED.

## Failures
- **CART-059 (030) — RESOLVED / CLEARED (not a bug).** Initial run FAILED (currency stayed USD after guest→sign-in as EUR user). After the team **updated the EUR user account**, re-verification on edge (CART-059-reverify) **PASSES**: currency header flips USD→EUR on sign-in, prices recalculate to EUR (€ subtotal/total, no USD leakage), merge completes with 0 GraphQL errors — BL-CART-004 holds. Root cause was the **EUR user account configuration, not a code defect**. Correctly never filed. Evidence: `screenshots/CART-059-post-signin-cart-eur.png`, `030-CART-059-reverify-results.json`.

**Net (cart): 0 confirmed product defects.**

### Confirmed defects (detect-and-report — not filed)
- **LOY-018 (075) — `[Medium]` Negative loyalty reward value accepted & persisted.** Entering `-5` in a fixed-points reward saves with **no client OR backend validation**; persists as "−5.00 fixed points" after reopen. Data-integrity gap. Test data restored. Evidence: `075-LOY-011-018-results.json` + screenshot. (Sibling validation gap to CART-036.)
- **CART-036 (028) — `[Low–Med]` Cart qty accepts negative/decimal client-side.** UI accepts `-1` and `1.5`, fires the mutation; **server rejects** (GraphQL ARGUMENT error / HTTP 400) so no bad data persists. Client-validation gap only. This is the FAIL the fabricated 028 run hid. Evidence: 2 screenshots in `screenshots/`.

### Needs verification (not filed)
- **LOY-019 (075) — admin role lacks `loyalty:update` for the settings blade (unconfirmed).** The `__administrator` account can read loyalty settings + manage programs, but the loyalty **settings** Save is gated by `va-permission="loyalty:update"` which the role lacks. Could be by-design (settings managed elsewhere) or a permission-config gap — verify before filing.

## Heavy blocking (environmental, not defects)
- **029:** 14/16 blocks are **admin-destructive** cases needing Admin SPA mutations (price/inventory/publication mid-session) — the firefox frontend slot has no Admin SPA. 2 blocks are seed gaps (OOS item, tier-pricing rule). → re-run coordinated with qa-backend-expert (edge) for the Admin mutations, after `/qa-seed-data`.
- **030:** 7 blocks — email-verification (not MCP-automatable), and "Default selected for checkout = ON" store config (cases need OFF).
- **028 (pre-fabrication observations, low trust):** mixed-cart cases CART-071/072/073 blocked (VIP cart empty — need server-side pre-seed); multi-org + pack-size fixtures missing.

## Incidental observations
- Variation-parent SKUs return 404 on storefront (no standalone PDP) — `XKC-38084072`, green-hat GUID `59e78525…` — agents substituted available products. Data hygiene, not a regression.
- VCST-5101 Apollo `currencyCode` console warning observed (already documented — `BUG-mixed-cart-currencyCode-apollo-cache-write.md`, Low/cosmetic).

## Loyalty structural block (083 / 075)
Most loyalty **frontend** cases (LOYF-001/002/003/004/005/007) are gated on a `PUT /api/loyalty-setting` admin mutation **as a per-case precondition** (flip Enable/Mode/Currency, then verify storefront). The agent's admin-token minting was blocked by the sandbox classifier, and flipping shared loyalty settings on vcst-qa would disrupt other testers — so these are **not cleanly executable in this automated context**. Only current-happy-path-state cases pass (LOYF-006, LOYF-008). Loyalty **backend** 075 admin-SPA interaction was slow (2/8 in ~8 min before stalling). → Loyalty needs **pre-staged settings states** (or a dedicated env) rather than per-case live mutation.

## Quality gate verdict
**CONDITIONAL PASS — 2 confirmed low/medium defects, no blockers.**
- **Cart:** 0 high/critical defects. CART-036 = Low–Med client-validation gap (server rejects). CART-059 cleared after EUR-user fix. Suite 028 was integrity-compromised → its 5 flagged cases re-run for ground truth; the rest of 028 still unverified. ~48% of cart cases blocked on Admin SPA / seed prerequisites.
- **Mixed cart (VCST-5101 focus):** green except the known P1 coupon leak — live-verified (GraphQL) + 083 LOYF-024/025 confirmed the storefront split-by-currency cart/PDP.
- **Loyalty:** **43 PASS / 1 FAIL / 11 BLOCKED.** Program CRUD, conditions, rewards, product-point factors, catalog browse + PTS pricing all healthy. One Medium defect (LOY-018 negative reward). Blocks = setting-variation cases **deferred to a dedicated env** (not run, by decision) + LOY-019 permission (needs verify) + LOY-029 (VIP account swept).

## Deferred (not run — by decision)
Setting-variation cases requiring shared-env loyalty-setting mutation: **LOYF-001/002/003/004/005/007/016** + **LOY-022/023** (and LOY-019 settings-Save). Re-run on a dedicated env where loyalty `Enable/Mode/Currency` can be flipped without disrupting live Mixed Cart.

## Cleanup note
AGENT-TEST artifacts created during loyalty admin runs (sweepable via `/qa-seed-data teardown`): program `AGENT-TEST-VIP-Program` (53bfe61f), `AGENT-TEST-ProductPoints-LOY026` (72b9a853). LOY-029 also needs the VIP storefront user re-provisioned (was swept).

## Recommended next steps
1. **Re-run 028 in ≤8-case batches** (anti-fabrication: incremental writes, verdicts from evidence only) — recover the true CART-036 result + CART-065–068.
2. **Seed + Admin-coordinate** before re-running 029/030 blocked cases (`/qa-seed-data full`, qa-backend-expert on Admin SPA).
3. **Verify CART-059** with a known EUR-priced cart before treating it as a bug.
4. **Loyalty 083/075** still to run — recommend small batches given the same size/risk profile.
