# UCP — Stable 16 regression

**Run:** REG-2026-10-13-0035 (W1) · **Status:** ⛔ mostly blocked · **Bugs:** ruling needed: UCPO-004/016, UCPA-002

| Suite | Cases | PASS | FAIL | BLOCKED | AMB | SKIP |
|---|---|---|---|---|---|---|
| 094 UCP Observability | 23 | 1 | 2 | 16 | 0 | 4 |
| 102 UCP Agentic Commerce | 42 | 36 | 3 | 3 | 0 | 0 |

UCP OAuth resource not registered on regression (invalid_target).

Details and FAIL triage: ../../REG-2026-10-13-0035/regression-2026-10-13.md (local run folder)

## Re-run after fixture seeding (2026-10-13, run REG-2026-10-13-1241-UCP)
UCP signed-in config deployed (vc-deploy-dev#6912), ACME_ADMIN password override set, UCP contract buyer seeded, FC_EAST overlay = store main FFC.
- 102 machine lane: 35 PASS · 1 FAIL · 2 BLOCKED (was 8 · 0 · 30).
- UCPA-010 FAIL = test defect: env charges 20% tax (subTotal 16.60 + tax 3.32 = 19.92); the case expects total = line sum (written on tax-free vcst). Cart and checkout totals agree. Suite repair: assert subtotal or tax-inclusive total.
- UCPA-019 BLOCKED: ACME_BUYER (test-sarah.chen) password unknown on this env.
- UCPA-021 BLOCKED: 960 s wait exceeds the runner's 300 s ceiling — manual run only.
- UCPA-042 first failed because @td(FC_EAST.id) resolved to the business key FFC-001 (inventory PUT 500); after the overlay it passes 15/15.
- Browser lane (playwright-chrome): UCPA-018 PASS (contract price 11.11 survives handoff); UCPA-001 FAIL = test defect (asserts tax-free total, subtotal 122.25 matches); UCPA-029 FAIL = outdated expectation (agent shipping_address is applied to the cart per UCP Web API doc §Checkout handoff); UCPA-013 BLOCKED (no store with guest checkout disabled). Screenshots: REG-2026-10-13-1241-UCP/screenshots/.
