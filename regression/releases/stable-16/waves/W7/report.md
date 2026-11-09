# Stable 16 · W7 — virto-start modules (autotests only)

**Owner:** Aleksandra Mitricheva · **Runs:** REG-2026-11-05-1645-W7 (first run), REG-2026-11-06-1424-W7C (re-run of every case no longer blocked) · **Env:** vcptcore_regression (platform 3.1076.8, theme 2.59.0) · **Sub-task:** VCST-6411

Modules under test, all installed on the stand: Loyalty 3.1009.0, Quote 3.1003.0, News 3.1005.0, TaskManagement 3.1005.0, Skyflow 3.1005.0, CyberSource 3.1002.0, Datatrans 3.1002.0. No suite was gated as not deployed.

## Totals (final status per case)

428 planned and executed. **169 PASS, 44 FAIL, 193 BLOCKED, 20 SKIPPED, 2 other.**

The first run blocked 321 cases, almost all on persona credentials missing for this env. The credentials were then declared (`*_VCPTCORE_REGRESSION` keys). The pre-flight dropped from 180 predicted BLOCKED to 3, and W7C re-ran 173 cases.

| Suite | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|
| 015 Quotes | 3 | 2 | 23 | 4 |
| 039 CyberSource | 17 | 0 | 0 | 1 |
| 040a Skyflow | 0 | 2 | 27 | 0 |
| 040c Datatrans | 0 | 0 | 8 | 0 |
| 075 Loyalty | 5 | 0 | 24 | 0 |
| 075b Mixed cart (API) | 3 | 3 | 6 | 1 |
| 075c Product points | 6 | 3 | 1 | 0 |
| 075d Missions (API) | 19 | 7 | 2 | 6 |
| 075e Missions Admin | 18 | 3 | 2 | 0 |
| 075f Org balance | 5 | 13 | 4 | 0 |
| 083 Loyalty catalog | 18 | 0 | 8 | 0 |
| 083b Mixed cart (SF) | 7 | 0 | 1 | 0 |
| 083c Missions storefront | 38 | 6 | 54 | 1 |
| 083d Missions E2E | 0 | 1 | 5 | 1 |
| 083e Org balance (SF) | 0 | 0 | 8 | 0 |
| 084 News | 21 | 2 | 5 | 6 |
| 085 Tasks | 9 | 2 | 15 | 0 |

**Verdicts on the 259 non-passing cases:**

| Verdict | Count |
|---|---|
| ENV_CONFIG | 82 |
| DATA | 67 |
| TEST_DEFECT | 65 |
| NOT_TESTABLE | 19 |
| BY_DESIGN | 13 |
| REAL_BUG | 6 |
| DUPLICATE | 5 |
| PENDING_DECISION | 2 |

## Real bugs — filed

All six are pre-existing, not regressions of this bundle. Each was re-verified live before filing.

| Jira | Defect | Cases | Repo | Severity |
|---|---|---|---|---|
| VCST-6724 | PUT on a Published mission returns 500 instead of a 4xx | MSN-006 | vc-module-loyalty | Medium |
| VCST-6725 | Mission OrderValueGoal accepts an invalid or lowercase currencyCode, stored as is | MSN-005 | vc-module-loyalty | Medium |
| VCST-6726 | News SEO slug with spaces, uppercase and `& % !` saved as is | NEWS-031 | vc-module-news | Low |
| VCST-6727 | Mission save accepts an End date before the Start date (REST and Admin) | MSN-007, MSNA-023 | vc-module-loyalty | Medium |
| VCST-6728 | Admin "All tasks" lists archived (Done/Canceled) tasks | TASK-005, TASK-006 | vc-module-task-management | Medium |
| VCST-6742 | Every mission card's "Open mission" button has the same accessible name | MSNF-046 | vc-frontend | Medium (a11y) |

**Already tracked:**

| Cases | Existing ticket |
|---|---|
| MSNF-010, MSNF-044 | VCST-5346 |
| MSNF-093 | VCST-5957 |

**Re-checked, not bugs:**
- **TEST_DEFECT:**
  - MSNF-047: dialogs are named; axe aria-dialog-name passes, the MCP snapshot omits the name.
  - MSNF-095: the icon is `shopping-bag`, not a lock.
  - QUOTE-031/032: no date filter on the quotes list in any version.
  - NEWS-030: documented SEO duplicate resolution.
  - MSNA-012: read-only is enforced.
- **DATA:** MSN-E2E-005, which ran in Organization mode.
- **ENV_CONFIG:** MCO-GQL-007 (Mixed Cart mode); MCO-GQL-011 (LoyaltyPaymentMethod is inactive).
- **FLAKY:** NEWS-026, 7/7 passes on re-check.

## Waiting for a product decision (Loyalty product owner)

- **MSN-003.** `POST /api/loyalty-missions` accepts and stores `periodicity: "Monthly"`.
  - The source (`LoyaltyMission.cs`, 3.1009.0) says only `None` is processed. `MissionPeriodicities` holds `None` only, and the Admin UI does not show the field, so the value can only come in through REST.
  - Decision: reject non-`None` values until periodicity ships? If yes, it is a Low validation fix.
- **MSNF-068.** In French, an untranslated mission shows its internal Name with an empty description: there is no default-language fallback, while the catalog does fall back. Decision: should missions fall back?
- **Docs gap.** VirtoOZ, vc-docs and the module README say nothing about missions, although they ship in Stable 16. Filed as **VCST-6743** (task), linked to VCST-6042 and VCST-5957.

## Still BLOCKED — causes

- **Skyflow is not configured on the stand** (29 cases: 040a and saved cards). The payment card stays on Loading, and the deploy config has no `Payments__Skyflow__*` keys. Fix in vc-deploy-dev, then add a suite-requirements entry.
- **Datatrans is not configured or offered on B2B-store** (8 cases: 040c).
- **Deferred to WX by the parallel-run rule** (28 cases). These need env-wide loyalty writes:
  - `Loyalty.Enable` and missions toggles;
  - the balance calculation mode (LOYORG-*, 083e);
  - activating LoyaltyPaymentMethod (MCO-GQL-011).
- **Persona credentials still missing** (6 cases): RESTRICTED_USER, MULTI_ORG_TF_BR_ALT, and `DEFAULT_TEST_PASSWORD` for two personas.
- **MULTI_ORG_LOY_POOLS** is reserved for WX and was not seeded, because its seeder writes the store.

## Test defects (repairs not made here; one author per suite)

- **015 — 17 cases.** The quote fixtures belong to the slot-1 buyer, but the cases ran on slot 2. Pin the persona, or seed the fixtures per slot.
- **Lane routing.** HTTP, GraphQL and bearer rows are routed to the browser lane. They need runner-native steps:
  - 085: TASK-017..025
  - 075b: MCO-GQL-001/003/004, MCO-ADM-001
  - 075: LOY-021/024/025
  - 084: NEWS-017/023
- **083c — 5 cases.** The progress owner has no password name visible to the lane, so the runner signed in as a different user.
- **075f.** LOYORG-006/007/014 assert 200 on a settings write that answers 204.
- **084.** NEWS-013/032/033: the datepicker needs a gridcell recipe (`dp-YYYY-MM-DD`).
- **085.** The route is stale: `/apps/tasks` → `/#!/workspace/embedded-app/tasks`.
- **Stale literals:**
  - MSNA-009: 250.00 vs the seeded 109.50.
  - LOY-016: 10 languages expected, the store has 3.
  - MCO-GQL-009: a guest query on a store that refuses anonymous access.
- **083c — 19 cases are NOT_TESTABLE on the browser-agent lane.** They need evaluate, fault injection or interception. Move them to a Playwright spec.

## Data

- **Missing on this env:**
  - AGENT-TEST loyalty CRUD programs (14 cases in 075: `seed:loyalty`);
  - zero-mission, EUR order-value and PerSku mission fixtures (083c);
  - ProductPoints factor programs (075c).
- **Expired:** the mission deadline ladder from run 202611051339 was valid until 2026-11-06 01:39Z, so 7 cases in 083c need a fresh run.
- **Slot-2 buyer has 3 competing carts.** Affects MSNF-032..038 and QUOTE-004/025.
- **Discovery picks a product with stock of about 3** for qty-20 checkouts (MSN-021..023).

## Environment changes during the wave (all waves on this stand)

- **B2B-store `Loyalty.LoyaltyBalanceCalculationMode`.** It was Customer on 2026-11-06 and was Organization by 2026-11-09. Who changed it is unknown, and it was not this wave. It was left as found: Customer-mode cases from other waves may now fail.
- **vc-deploy-dev #7050 was merged 2026-11-08 23:35Z.** It restarted the platform: runs active at that moment may show a burst of 5xx or timeouts.

## Data created and removed

- **Seeded:**
  - quotes AGENT-TEST-QTE-* (`seed:quotes`, aliases in `test-data/aliases.vcptcore_regression.json`);
  - the mission deadline ladder 202611051339 (`seed-missions-deadline.mjs --teardown --run 202611051339`).
- **Removed after the runs:**
  - suite 085 tasks #1, #2, #4 and #5;
  - RFQ261108-00001 and -00002 (deleted);
  - orders CO261108-00001/-00002/-00004/-00006/-00007, cancelled (reason "AGENT-TEST cleanup") because orders are not deleted.
  - All of this was verified afterwards.

## Before the next owner continues

1. Configure Skyflow and Datatrans on the stand (vc-deploy-dev), or record them as not deployed in suite-requirements.
2. Run the WX cases after the env-wide loyalty writes, and confirm the balance mode first.
3. Seed `seed:loyalty` and a fresh mission ladder, then run `/qa-run stable:16 W7 --continue`.
4. Re-run the pre-flight before step 3.

Raw evidence (screenshots, traces, results JSON) is on the owner's machine under `reports/regression/REG-2026-11-05-1645-W7/` and `reports/regression/REG-2026-11-06-1424-W7C/`.
