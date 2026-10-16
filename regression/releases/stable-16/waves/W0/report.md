# Regression REG-2026-10-12-1659 — Stable 16, W0 smoke gate

> **The run report as written before triage.** Verdicts reached afterwards — BSM-023 → VCST-6286, BSM-029 → VCST-6315 (a real bug, not a test defect), SMK-005 and BSM-058 env config — are in [ledger.csv](ledger.csv), which is the record. The incidental observations below were not triaged.

**Selection:** 042, 078, 078b, 078c, 078d · **Env:** vcptcore-regression (`TEST_ENV=vcptcore_regression`)
**Build:** Platform 3.1076.1 · Theme 2.59.0 · 83 modules (59 Stable 16 bundle + 24 virto-start, deployed 13:57 UTC via vc-deploy-dev#6910), 0 validation errors
**Window:** 14:00–15:40 UTC · **Seed:** none · **Plan:** [../../PLAN.md](../../PLAN.md)

## Gate verdict: PASS with conditions — proceed to W1
No env-wide blocker: storefront + admin sign-in work, an order was placed end-to-end (CO261012-00001),
indexing runs (Product/Member/CustomerOrder indexed 15:00 UTC), BackgroundJobs recurring jobs are registered and firing.
Conditions for the full run are in §Run constraints.

## Executive summary
| Cases | PASS | FAIL | BLOCKED | AMBIGUOUS | SKIPPED | Pass rate (decided) |
|---|---|---|---|---|---|---|
| 149 | 100 | 4 | 19 | 18 | 8 | 96% (100/104) |

## Frontend Suites
| Suite | Browser | Cases | PASS | FAIL | BLOCKED | AMB | SKIP |
|---|---|---|---|---|---|---|---|
| 042 Smoke Tests | edge | 34 | 15 | 1 | 5 | 8 | 5 (manual) |
| **Subtotal** | | 34 | 15 | 1 | 5 | 8 | 5 |

## Backend Suites
| Suite | Browser | Cases | PASS | FAIL | BLOCKED | AMB | SKIP |
|---|---|---|---|---|---|---|---|
| 078 Platform, API & GraphQL | firefox + chrome retry | 27 | 14 | 2 | 4 | 5 | 2 |
| 078b Catalog, Search & Pricing | chrome | 31 | 24 | 0 | 7 | 0 | 0 |
| 078c Orders, Customers & Marketing | edge | 29 | 26 | 0 | 2 | 0 | 1 |
| 078d Content & Admin Workflows | chrome | 28 | 21 | 1 | 1 | 5 | 0 |
| **Subtotal** | | 115 | 85 | 3 | 14 | 10 | 3 |

## Failures (candidates for triage — nothing filed)
| Case | Finding | First read |
|---|---|---|
| BSM-023 | Hangfire: 2,716 failed jobs; newest (#422950, ~15 min old) `JsonSerializationException` on abstract `PaymentMethod` (KB-936B54EF) | **TRIAGED → REAL BUG (High)**: Subscription 3.1005.0 job payload embeds whole `CustomerOrder[]`; BackgroundJobs serializer cannot rebuild abstract `PaymentMethod` → fails on every order with a payment, no subscription is ever created. Not a setting. Draft: `reports/bugs/open/critical-high/BUG-stable16-subscription-job-payload-paymentmethod-deserialization.md`. Other 2,715 failed jobs date from 2026-07-06 (pre-upgrade) |
| SMK-005 | `/account/quotes` 404, no Quotes link for org maintainer although Quote 3.1003.0 installed | Likely store config of the just-installed module (Quotes not enabled) — verify setting |
| BSM-029 | `POST /api/platform/settings` with full 322-entry array → 500 on `CronPruneExpiredTokensJob`; Platform-only subset → 204 | Possible test-defect (UI posts changed entries only); check vs Stable 15 |
| BSM-058 | `/sitemap.xml` and schema-listed sitemap URLs 404 | `SitemapExportAllToAssetsJobHandler` is disabled on env → probably config |

## Incidental observations (unconfirmed)
- `GET /api/marketing/promotions` → 500 (078c).
- Order CO261004-00001: grid total 909 vs order detail 903 (078c).
- FFC "Andes Supply Node - Chile": 142 of 300 inventory rows reference deleted products (078b, Low).
- `/company/info` for a new org without addresses: 2× `TypeError: reading 'status'` (042).
- CMS page open in Content > Pages shows red "404: Not found" alert (078d, KB-452D7913 confirmed).
- Customer link to a deleted account fails silently (078c).

## BLOCKED / AMBIGUOUS by cause
| Cause | Cases |
|---|---|
| **Permission policy denied env writes** | BSM-030, 031, 037, 039, 076, 079 |
| Stale endpoint / schema in the case (test-defect) | BSM-017, 050, 056, 064, 065, 066 (+ many cross-layer GETs re-verified via `POST …/search`) |
| Fixture missing on this env (`kitchen`, ALCE0128) | SMK-006, 023 (BLOCKED); SMK-008, 010, 011, 020 (AMB, passed on substitute) |
| Payment provider not configured (CyberSource, Skyflow) | SMK-013, 014, 034 |
| Stale UI step | BSM-061, 083, 090, 092, 111; SMK-001, 027 |
| Other | BSM-085 (created product not visible in 60 s), BSM-016/025/067/068, BSM-021, BSM-045, SMK-015, SMK-025 |

## Run constraints for W1–W7
1. **Firefox lane cannot sign in** (no `--secrets` substitution) — 7 cases of 078 re-ran on chrome. Login suites run on chrome + edge only → 2 parallel slots, wall time ≈ ×1.5 vs plan.
2. **Agent-pool slot accounts are `invalid_grant` on this env** — runners use config.js personas (USER / EUR / ORG_USER / MULTI_ORG). USER, ORG_USER, EUR passwords were reset to the configured values on 2026-10-12.
3. **API writes are denied by the session permission policy** — write-heavy cases will BLOCK until a rule allows writes to vcptcore-regression.
4. Pages render slowly (10–30 s); new orders reach order history after ~3 min.

## Env state left behind
- Org `AGENT-TEST-Org-Empty-Org-20260310` description changed to "BSM-Org-Desc-1791816200" (restore denied by policy; original: "Active org with no contacts or users — empty state testing").
- Product `BSM-DEL-1791816900184` (Regress Physical Catalog) may exist, not found by search.
- Org `AGENT-TEST-Org-1791816100000`, order CO261012-00001.

## Retry log
| Cases | From | To | Reason | Result |
|---|---|---|---|---|
| BSM-001, 011, 023, 024, 027, 028, 029 | firefox | chrome | firefox lane has no `--secrets` | 5 PASS, 2 FAIL |

## App Insights (run window)
Skipped — `APPINSIGHTS_*` not configured for this env.

## Promotion
Dry run: 0 promotable of 1 Draft case — BSM-115 held `PR-008` (step line lacks a type tag).

## BL freshness
`bl:fresh --write`: 30 records changed in 10 files; 45 BL-* SUSPECT after this run.

## Detailed results
`suite-<ID>-results.json` and `suite-<ID>-cases.jsonl` in this folder; screenshots in `screenshots/`, traces in `traces/`.
