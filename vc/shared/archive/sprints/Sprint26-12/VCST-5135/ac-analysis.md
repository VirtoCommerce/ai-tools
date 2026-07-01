# VCST-5135 — AC Analysis & Traceability

**Story:** [Loyalty] Product Points Program · Epic VCST-5099 · Priority Medium (P2) · Status **Testing**
**Build:** Platform 3.1039.0 · Loyalty 3.1004.0-pr-10 · theme 2.52.0-pr-2335 (vcst-qa)
**Story text:** *"As a Customer, I want to get points reward based on `ProductPoints` program, so that I can get points for each products inside it."*

## AC quality
The story carries **one thin goal statement and no enumerated ACs** — it omits the winner-resolution model, eligibility gates, default fallback, zero-factor behaviour, and *where points are shown*. The conditions below are gap-ACs derived from the deployed ProductPoints resolution model (memory `project_loyalty_productpoints_resolution_model`) + suite 075c. All are REWRITE/SPLIT from the single vague AC. The customer-facing "I want to get points" also implies a **UI display** condition (AC10) the story never states.

## Atomic conditions → coverage

| # | Condition | Layer | Impl verdict | Covering |
|---|---|---|---|---|
| AC1 | Product covered by an eligible+active+in-window ProductPoints program earns `factor × price` (override) | backend | verify live | LOY-031/032/033 |
| AC2 | Earned points appear per-item on `cart.items[].loyaltyPoints` in **PTS** (oracle; `products()` is null in Mixed Cart) | backend | verify live | all 075c |
| AC3 | **Single** highest-priority eligible program wins globally; **no stacking** | backend | verify live | LOY-034, LOY-031 |
| AC4 | User-group eligibility gates (VIP-only, Wholesaler-only) apply only to those groups | backend | verify live | LOY-029/032/033 |
| AC5 | Window (future/expired) + active=false gates block candidacy | backend | verify live | LOY-031 |
| AC6 | SKUs not covered by the winning program earn **default factor=1** (>0) | backend | verify live | LOY-031/032/033/036/037 |
| AC7 | Cart-level `loyaltyPoints` aggregates per-item amounts | backend | verify live | LOY-036 |
| AC8 | Lowest-priority program never wins when higher-priority eligible exist; stable with 5+ programs | backend | verify live | LOY-037 |
| AC9 | **Zero-factor** earning (factor=0 → 0 points) | backend | **GAP — deferred** | LOY-035 (admin-config only via LOY-018; earning NOT asserted, parallel-safety) |
| **AC10** | **Earned ProductPoints points are DISPLAYED to the customer on the storefront** (PDP and/or cart per-line + total), consistent with the backend oracle | **frontend** | **verify live (NOT-FOUND risk)** | NEW — UI agent (user-requested) |

## Verdict spine
PASS requires PASS evidence for AC1–AC8 (backend) **and** AC10 (UI display). AC9 is a known deferred gap — flag, don't fail the story on it (note the coverage gap). LOY-034's no-stacking proof needs a **manual cross-multiplication** check on the evidence (runner can't assert arithmetic cross-path inline). AC10 is discovery-driven: if the storefront does not surface earned points at all, that's a NOT-FOUND to surface (the customer "gets points" but can't see them), not necessarily a defect — reconcile against design.

## Final reconciliation (live)
- **AC1–AC8: SATISFIED-live** — backend 9/9 PASS (075c, incl. new LOY-038), single-winner/no-stacking proven exactly (LOY-034 cross-mult). App Insights window clean.
- **AC1 end-to-end (earn AWARDED, not just previewed):** SATISFIED — LOY-038 proved a cash order with the ALL-winner (LT-001) credits the 500× override (649995) to balance + history `Earned` op, == the cart preview (preview==award; orders CO260624-00031/00032). Closes the 075c gap (was cart-preview only). NOTE: post-settle balance/history assertion is an `[EVIDENCE]` block, not an automated gate, because `scripts/graphql-runner.ts` `[WAIT]` is a no-op (stale pre-settle reads) — see memory `reference_graphql_runner_wait_noop`.
- **AC9 (zero-factor earning): DEFERRED GAP** — uncovered (LOY-035), admin-config only.
- **AC10 (UI display): NOT-FOUND** — theme doesn't query `loyaltyPoints`; earned points render nowhere. **DISPOSITION (QA lead, 2026-06-24): out-of-scope / deferred design** — the story's goal (earning) is met and verified; a real-time earned-points UI is a separate story. No ticket filed; recorded here only.
- **Verdict: PASS WITH NOTES.**
