# Test Case Lifecycle Report — TLC-2026-07-16-0204

## Summary
- **Input:** `VCST-5293` — [BE] Sales Rep Role · VC-Shell App (Story, status *Testing*). Continuation of `TLC-2026-07-15-1723`.
- **Input Type:** change-source (JIRA story + PR #2 `vc-module-sales-rep`, VCST-4907/5304/5308)
- **Date:** 2026-07-16
- **Env (verification):** vcptcore-qa @ Platform 3.1043.0, SalesRep `3.1000.0-pr-2` — the **only** env with the module (absent on vcst/virtostart)
- **Verdict:** **APPROVED WITH WARNINGS** — suite registered + **28/35 cases verified live green** (after a 2nd recheck pass); the 7 non-green are 3 test-design/env-config FAILs + 4 BLOCK, surfacing **2 likely product bugs** (see below).

Resumed from the prior run's remaining checklist. All authoring was already done (35-case suite `050m`, fixtures, seeder, aliases); this run closed the env-var gaps, **seeded vcptcore-qa live + persisted the GUID write-back**, **verified all 35 cases against the deployed scoped schema**, fixed the confirmed test defects, and **registered `050m`** (kept out of the vcst CI selections).

## Phase Results
| Phase | Status | Key result |
|-------|--------|-----------|
| 1. Scope | Done | 1 suite (050m); layer = scoped GraphQL xAPI `POST /graphql/sales-rep` |
| 2. Sync | N/A | New module, no existing cases |
| 3. Generate / data-prep | Done (prior) | 35 cases + fixtures + seeder already authored |
| 4. Review & Fix | Done | 3 confirmed test defects fixed (below) |
| 5. Verify (live) | **Done — direct-HTTP, 2 passes** | 28 PASS / 3 FAIL / 4 BLOCK across all 35 (rechecked) |
| 6. Approve | **APPROVED W/ WARNINGS** | registered + excluded from vcst CI; findings logged |

> **Verification method note:** the suite is authored as GraphiQL-UI browser mode only because the runner (`graphql-runner.ts`) can't target the scoped schema. For this run I verified via **direct HTTP POST to `/graphql/sales-rep`** with per-role bearer tokens — the identical contract the GraphiQL UI exercises, but deterministic. Harness + raw results saved alongside this report (`verify-050m-harness.mjs`, `verify-050m-raw.txt`).

## What this run changed
- **Env vars (was: 3 undefined tokens):** added `CULTURE_NAME=en-US` (`.env.defaults`, makes the implicit runner default explicit for browser-mode; also hardens 37 other refs) + `ORDER_KEYWORD_TOKEN=Beacon` (`.env.vcptcore`). Rebound `SR_REP_PRIMARY_EMAIL` → `@td(SR_REP_PRIMARY.email)` (no redundant env var). `@td`: **97/97 resolve**.
- **Seed (vcptcore-qa):** teardown + reseed with a known `SR_REP_PASSWORD` (prior seed's password was unknown & unrecoverable — the security reset endpoint and multi-password probes are correctly gated). All 5 reps + owner + enriched ACME + 9 orders re-created; **runtime GUIDs written back to `test-data/aliases.vcptcore.json`** (the missing piece — the prior seed never persisted them).
- **Manifest:** `050m` registered (114 suites); added `sales-rep` selection; **excluded from `backend`/`full`/`sprint`/`concern:api`** so it never runs on the CI-default vcst (module absent). `MODULES_ENABLED` is empty in every env, so the runner's module gate can't do this — exclusion is the correct interim fix.

## Confirmed test-defect fixes (Phase 4)
| Case | Defect | Fix |
|------|--------|-----|
| **SR-GQL-026** | Asserted `items[].number contains keyword`, but the seeded `Beacon` token lives in the order's CustomerName, and the response `customerName` field returns the **denormalized org name**. | Assert keyword narrows 6→1 to the seeded Beacon order (by `number` = `SRO-ACME-KEYWORD`); noted the customerName-field semantics. |
| **All AUTH steps** | `[AUTH]` didn't specify `storeId`; store-bound rep/buyer accounts return **HTTP 400 invalid_grant** without it. | Added the `storeId` form-param requirement to every `[AUTH]` step (verified). |
| **SR-GQL-020** | Used an undefined `{{SR_REP_PRIMARY_EMAIL}}` env var. | Rebound to `@td(SR_REP_PRIMARY.email)`. |

## Live verification — 28 PASS / 3 FAIL / 4 BLOCK (rechecked)
A 2nd diagnostic pass (raw responses) reclassified two cases from the first pass: **026** (keyword filter actually works — my prior assertion targeted the wrong field, now fixed) and **004** (a 3rd visible ACME rep is now present — paging works). It also **confirmed two likely product bugs** with clean controls.

**PASS (28):** SR-GQL-001,002,003,004,005,006,007,008,009,010,011,013,014,015,016,018,019,020,021,022,023,025,026,027,030,031,032,034 — full auth model (anonymous denied), org/rep scoping, no-leak, paging/sort/keyword, hydration (lastOrder totals, primaryContact owner-vs-fallback, accountType/shipTo), store-scoping, cross-customer dashboard.

- **026 (→PASS):** `keyword="Beacon"` narrows 6→1 to exactly `AGENT-TEST-SRO-ACME-KEYWORD`. The response `customerName` field is the denormalized ORG name (`AGENT-TEST-Org-AcmeCorp`), but the filter correctly matches the order's indexed CustomerName. Assertion fixed accordingly.
- **004 (→PASS):** ACME now has **3 visible reps** — `Ava Adams`, `Priya Rao`, `Sam Store`. `first:2`→`[Ava Adams, Priya Rao]` hasNextPage=true; page2→`[Sam Store]`, no overlap. ⚠ `Ava Adams` is **not in our seed** (external actor on vcptcore); 004 currently passes on borrowed data — the seed should add a 3rd ACME rep for reliability.

**FAIL (3) — one confirmed product-robustness bug behind all three:**
Store's `salesRepOrderStatuses` = `[Cancelled, Completed, New, Pending, Processing]` — **no "Inactive" composite, no "Failed".** Filter behavior (all as SR_REP_PRIMARY, ACME, 6 orders baseline):

| `statuses` arg | totalCount | verdict |
|----------------|-----------|---------|
| `["Cancelled"]` | 1 | correct |
| `["New","Cancelled"]` | 4 | correct union |
| `["Failed"]` | **6 (all)** | unrecognized → no filter |
| `["Inactive"]` | **6 (all)** | unrecognized → no filter |
| `["New","Inactive"]` | 3 (New only) | Inactive silently dropped |

> **Product-robustness bug:** an unrecognized status value is silently ignored, and when *every* provided status is unrecognized the filter returns **all** orders instead of none/error. Cases **028/029/033** assumed an "Inactive"→[Cancelled,Failed] composite that this store doesn't define → they FAIL here. Fix path: rework the 3 cases to derive statuses from `salesRepOrderStatuses` at runtime (033 already queries it) **and** raise the unrecognized-status behavior with the module team.

**BLOCK (4):**
| Case | Reason |
|------|--------|
| SR-GQL-012/017/024 | **CONFIRMED (control):** `SR_REP_LOCKED` cannot sign in at all (400 invalid_grant, any store). `SR_REP_EXCLUSIVE_TECHFLOW` — **identical** account flags (emailConfirmed=false, lockoutEnabled=true, lockoutEnd=null) but **no** membership lock — logs in fine. Only difference = SR_REP_LOCKED's per-org ACME membership lock ⇒ **the membership-lock blocks the whole account sign-in.** Likely product bug (a rep locked out of one org should still sign in for its other active orgs); the cases can't run until resolved. |
| SR-GQL-035 | admin store-setting toggle (`SalesRep.Enabled=false`) not performed (admin write). API-not-gated half **confirmed** (`salesRepCustomers(storeId)` still returns 4); UI-toggle half needs the admin step. |

## Quality Gates
| Gate | Status | Note |
|------|--------|------|
| G1 Structure / G2 Determinism / G3 Completeness / G4 Testability | PASS | 35 rows, unique IDs, deterministic steps |
| G5 Data Validity | **PASS** (was WARN) | 97/97 `@td` resolve; env vars closed |
| G6 Coverage / G7 Duplication | PASS | 7/8 invariants; no dupes |
| G8 Environment | **PASS w/ warnings** | contract + 28 cases VERIFIED live; **2 likely product bugs surfaced** (unrecognized-status→no-filter; membership-lock blocks sign-in) — flagged, not code-blocking for the suite |
| G9 Sync | N/A | new module |

## Remaining Items
### Should do (follow-up)
1. **[Likely bug] SR_REP_LOCKED cannot sign in** (012/017/024) — CONFIRMED: per-org membership lock blocks the entire account sign-in (control: unlocked rep with identical flags logs in). File a bug or confirm by-design; the 3 cases can't run until resolved.
2. **[Likely bug] Unrecognized order-status → no filter** (028/029/033) — `statuses:["Failed"]`/`["Inactive"]` return ALL orders. Raise with the module team; rework the 3 cases to derive statuses from `salesRepOrderStatuses` at runtime.
3. **Add a 3rd active ACME rep** to `test-data/sales-rep/sales-reps.csv` + reseed → SR-GQL-004 currently passes only via an external rep (`Ava Adams`); make it seed-reliable.
4. **README doc-fix (upstream, English):** `salesRepCustomerOrderStatistics` not implemented; `salesRepCustomer` arg is `id` not `organizationId`; `[AUTH]` needs `storeId`. (carried from prior run)
5. **Promote `PROPOSED-BL-SR-*`** into `business-logic.md` after sign-off (7 invariants; advisory, not auto-applied).
6. **Populate `MODULES_ENABLED` per env** so the runner's module gate replaces the manual `050m` selection exclusions.

## Files Modified
- `regression/suites/Backend/graphql/050m-graphql-sales-rep.csv` — SR-GQL-020/026 + all `[AUTH]` steps
- `.env.defaults` (+CULTURE_NAME), `.env.vcptcore` (+ORDER_KEYWORD_TOKEN)
- `config/test-suites.json` — registered `050m`; `sales-rep` selection; excluded from backend/full/sprint/concern:api; `_meta.totalSuites` 113→114
- `test-data/aliases.vcptcore.json` — rep/owner runtime GUIDs (seed write-back)
- Not committed by me: seed created live fixtures on vcptcore-qa (AGENT-TEST-*).
