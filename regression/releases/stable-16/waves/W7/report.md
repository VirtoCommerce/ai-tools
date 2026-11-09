# Stable 16 · W7 — virto-start modules (autotests only)

**Owner:** Aleksandra Mitricheva · **Runs:** REG-2026-11-05-1645-W7 (first run), REG-2026-11-06-1424-W7C (re-run of every case no longer blocked), REG-2026-11-09-0950-W7U (re-run after the suite repairs and re-seed), REG-2026-11-09-1545-W7M (re-run after the balance mode was restored) · **Env:** vcptcore_regression (platform 3.1076.8 → 3.1076.13 on 2026-11-09, theme 2.59.0) · **Sub-task:** VCST-6411

Modules under test, all installed on the stand: Loyalty 3.1009.0, Quote 3.1003.0, News 3.1005.0, TaskManagement 3.1005.0, Skyflow 3.1005.0, CyberSource 3.1002.0, Datatrans 3.1002.0. No suite was gated as not deployed.

## Totals (final status per case)

428 planned and executed over four runs. **241 PASS, 58 FAIL, 111 BLOCKED, 16 SKIPPED, 2 other.**

The first run blocked 321 cases on missing persona credentials. W7C re-ran 173 once they were declared; W7U (2026-11-09) re-ran 129 after the suite repairs, the re-seed and the 040a/040c requirements below; W7M re-ran 17 once the Customer balance mode took effect.

| Suite | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|
| 015 Quotes | 12 | 8 | 5 | 7 |
| 039 CyberSource | 18 | 0 | 0 | 0 |
| 040a Skyflow | 0 | 2 | 27 | 0 |
| 040c Datatrans | 0 | 0 | 8 | 0 |
| 075 Loyalty | 22 | 1 | 6 | 0 |
| 075b Mixed cart (API) | 5 | 3 | 4 | 1 |
| 075c Product points | 8 | 1 | 1 | 0 |
| 075d Missions (API) | 20 | 7 | 1 | 6 |
| 075e Missions Admin | 20 | 3 | 0 | 0 |
| 075f Org balance | 8 | 14 | 0 | 0 |
| 083 Loyalty catalog | 18 | 0 | 8 | 0 |
| 083b Mixed cart (SF) | 8 | 0 | 0 | 0 |
| 083c Missions storefront | 57 | 8 | 33 | 1 |
| 083d Missions E2E | 4 | 0 | 2 | 1 |
| 083e Org balance (SF) | 0 | 0 | 8 | 0 |
| 084 News | 27 | 3 | 4 | 0 |
| 085 Tasks | 14 | 8 | 4 | 0 |

**Verdicts on the 187 non-passing cases (latest run per case):**

| Verdict | Count |
|---|---|
| ENV_CONFIG | 83 |
| DATA | 25 |
| BY_DESIGN | 19 |
| NOT_TESTABLE | 19 |
| TEST_DEFECT | 18 |
| REAL_BUG | 11 |
| DUPLICATE | 6 |
| PENDING_DECISION | 6 |

## Re-run W7U (2026-11-09) — what changed and what it found

**Unblocked before the run:**
- 040a/040c: `config/suite-requirements.json` now skips them when `Payments__Skyflow__vaultId` / `Payments__Datatrans__MerchantId` are absent from the stand config.
- 60 TEST_DEFECT cases repaired in 10 suites, one author per suite:
  - HTTP/GraphQL rows moved to the machine lane;
  - 015 uses the slot-2 quote aliases;
  - the new tasks route, gridcell date pick, and lane secret names.
- Re-seeded: loyalty CRUD programs, mission fixtures, deadline ladder 202611090936, ORGLOY missions, RESTRICTED_USER. Slot-2 carts were swept.
- The mission seeder no longer deletes other seeders' missions (it removed 44 before the fix; all but missions-e2e were restored).

**Bugs filed from W7U** (each reproduced live 2026-11-09, root cause in source, no duplicate in Jira):

| Jira | Case | Defect | Repo | Severity |
|---|---|---|---|---|
| VCST-6757 | NEWS-026 | Admin news article: "Has unsaved changes" banner + close prompt stick after Reset or a language switch whenever the article lacks a content or SEO entry for that language | vc-module-news | Medium |
| VCST-6758 | TASK-025 (side finding) | `POST /api/task-management` with a name over 256 chars: 500 with the raw SQL truncation message (database and table names) | vc-module-task-management | Medium |
| VCST-6759 | TASK-025 (side finding) | `POST /api/task-management` with an unknown `priority`: 500 NullReference | vc-module-task-management | Low |
| VCST-6760 | NEWS (side finding) | `PUT /api/news` with `publishScope: null`: 500 with the SQL NOT NULL message (POST accepts null) | vc-module-news | Low |

TASK-025 itself (the empty-body create) stays PENDING_DECISION: API and Admin-form rules differ.

Known local reports below the filing floor reproduced again:
- MSNF-099: raw GUID title for a deleted product;
- MSNF-102 / MSNF-056: "0 days left" on an ended mission.

**Not bugs:**
- **QUOTE-026 (BY_DESIGN, owner decision):** approving a quote does not re-check stock; the platform allows it. Order CO261109-00009 was cancelled and the stock is back to 0.
- **QUOTE-005 (DUPLICATE VCST-6375):** "Price per item" shows the list price. vc-frontend PR #2588 adds `show-placed-price` to `quote-line-items.vue`.
- **QUOTE-004/025:** the Quote module sends no proposal notification by design.
- **QUOTE-011/022/023:** quote expiry is not implemented anywhere. This is PENDING_DECISION for the Quote product owner, and oracle BL-B2B-003 is INFERRED.
- **QUOTE-013:** the stand has no `quote-attachments` upload scope (ENV_CONFIG).
- **MCO-E2E-002:** the stand is in Organization mode, so the validator checks the organization pool (ENV_CONFIG).
- **TASK-020/021/018, NEWS-017, MCO-GQL-003:** test defects: finish needs a JSON body, `isActive` has no server default, doubled quotes, a gift line.

**Still blocked, by cause:**
- ~~test-john progress 0% / missions-e2e not seeded~~ — fixed in W7M (below).
- **LOYALTY_NOBAL_USER / LOYALTY_WHOLESALE_USER not provisioned on this env** (4 cases).
- **0 news articles on the stand** (NEWS-020/022).
- **075f:** see Environment changes.

## Re-run W7M (2026-11-09) — after the balance mode took effect

- **The Customer mode needed a store save.** The settings-API write read back Customer, but accruals stayed organization-scoped until the store was saved in Admin (Stores > B2B-store > Save); the effective mode follows the store cache, not the setting write (KB-0761662A, suspected defect).
- Re-seeded `seed:missions-e2e` (run 20261109153618-6c4c); mission progress already matched. One stale empty cart on the progress owner removed (`carts:sweep`).
- **17 cases: 14 PASS, 1 FAIL, 2 BLOCKED.** 083c 9/11, 083d 4/4, MCO-E2E-002 PASS.
- **TASK-016 FAIL — real bug, not filed yet:** a read-only task user sees an enabled Create button that opens an unsavable blade (`BaseWorkTasksList.vue` L216-223 has no permission check; server answers 401). Low, vc-module-task-management.
- MSNF-075: TEST_DEFECT — missions are listed per session currency by design (`loyaltyMissionProgress` passes `currencyCode` to the search). MSNF-080: DATA — the fresh msne2e account has no points history.
- Orders CO261109-00017…00022 cancelled.

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
- **NEWS-026:** first classed FLAKY (the re-check used articles with both language entries); W7U found the condition — VCST-6757.

## Waiting for a product decision (Loyalty product owner)

- **MSN-003.** `POST /api/loyalty-missions` accepts and stores `periodicity: "Monthly"`.
  - The source (`LoyaltyMission.cs`, 3.1009.0) says only `None` is processed. `MissionPeriodicities` holds `None` only, and the Admin UI does not show the field, so the value can only come in through REST.
  - Decision: reject non-`None` values until periodicity ships? If yes, it is a Low validation fix.
- **MSNF-068.** In French, an untranslated mission shows its internal Name with an empty description: there is no default-language fallback, while the catalog does fall back. Decision: should missions fall back?
- **Docs gap.** VirtoOZ, vc-docs and the module README say nothing about missions, although they ship in Stable 16. Filed as **VCST-6743** (task), linked to VCST-6042 and VCST-5957.

## Still open from the first two runs

- **Skyflow / Datatrans are not configured on the stand** (37 cases): now skipped by `config/suite-requirements.json`; configure them in vc-deploy-dev to run 040a/040c.
- **Deferred to WX** (28 cases): env-wide loyalty writes (`Loyalty.Enable`, missions toggles, balance mode for LOYORG-*/083e, LoyaltyPaymentMethod for MCO-GQL-011). MULTI_ORG_LOY_POOLS is reserved for WX.
- **Persona credentials still missing:** MULTI_ORG_TF_BR_ALT, and `DEFAULT_TEST_PASSWORD` for two personas.
- **083c — 19 cases NOT_TESTABLE on the browser-agent lane** (evaluate, fault injection, interception): move to Playwright specs.
- **Discovery picks a product with stock of about 3** for qty-20 checkouts (MSN-021..023).
- The W7C test defects and missing fixtures were repaired or re-seeded for W7U (above).

## Environment changes during the wave (all waves on this stand)

- **B2B-store `Loyalty.LoyaltyBalanceCalculationMode` was switched by this wave.**
  - **Before:** the store was in Customer mode.
  - **What happened:** suite 075f's LOYORG-006/007/014/019 write the mode themselves, and their Cleanup always writes `Organization`. W7C ran them on 2026-11-06 11:35Z, and they ran again in W7U.
  - **Effect:** the store has been in Organization mode since then. That mode pools mission progress and points to the organization, which caused the 0% progress, the missions-e2e seed failure and MCO-E2E-002.
  - **Within 075f:** its cases also interfered with each other on the machine lane (LOYORG-009 read the pool as 0 before and 64232 after).
  - **Fix:** list 075f in WX `exclusive`, and make its teardown restore the mode it found.
  - **Current state:** **Customer**, effective since the Admin store save on 2026-11-09 ~15:35Z (verified: new accruals land on the user).
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

1. **Changing the balance mode:** write it, then **save the store in Admin**, or it does not take effect (KB-0761662A).
2. **Run 075f only in WX**, alone on the stand. Repair LOYORG-019 (assert 2xx).
3. **Provision LOYALTY_NOBAL_USER / LOYALTY_WHOLESALE_USER** on vcptcore_regression, declare their keys, then re-run MCO-GQL-005/009/013 and LOY-033.
4. **Repair the remaining test defects** (`/qa-review-tests --fix`):
   - TASK-017/018/020/021 (finish body, `isActive`, DELETE cleanup);
   - NEWS-017;
   - MCO-GQL-003;
   - MSNA-022;
   - LOY-016;
   - QUOTE-004/007/025.
5. **Decisions still open:**
   - QUOTE-031/032: retire or move to the orders suites;
   - NEWS-023: split into an API half and a UI half;
   - the quote-expiry rule (PENDING_DECISION).
6. **TASK-016:** decide on filing (DRAFT). **MSNF-075** ARM 1 and **MSNF-080** data need repair.
7. **The 19 NOT_TESTABLE 083c cases** move to Playwright specs; 5 pilots come first.

Raw evidence (screenshots, traces, results JSON) is on the owner's machine under `reports/regression/REG-2026-11-05-1645-W7/`, `REG-2026-11-06-1424-W7C/` and `REG-2026-11-09-0950-W7U/` (the last in the worktree run folder).
