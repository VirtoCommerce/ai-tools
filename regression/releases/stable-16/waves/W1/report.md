# Regression REG-2026-10-13-0035 — Stable 16, W1 Platform & infrastructure

**Selection:** 095 101 102 096 094 061 034 020 021 049 035 063 050n 050g · **Env:** vcptcore-regression (`TEST_ENV=vcptcore_regression`)
**Build:** Platform 3.1076.1 · BackgroundJobs 3.1052.0 · Theme 2.59.0 · 83 modules · **Plan:** [../../PLAN.md](../../PLAN.md)
**Lanes:** chrome + edge (firefox cannot type `--secrets`) · machine lane for 050n / 050g / 102 (38 cases)

## Executive summary
| Cases | PASS | FAIL | BLOCKED | AMBIGUOUS | SKIPPED | Pass rate (decided) |
|---|---|---|---|---|---|---|
| 538 | 322 | 20 | 148 | 35 | 13 | 94% (322/342) |

**No new confirmed Stable 16 regression in W1.** Most FAILs are long-standing (they reproduce on Stable 15), stale cases, or new-module behaviour that needs a developer ruling. Seven candidates are open (§Candidates).

## Backend Suites
| Suite | Cases | PASS | FAIL | BLOCKED | AMB | SKIP |
|---|---|---|---|---|---|---|
| 095 Background Jobs — Hangfire Migration | 52 | 38 | 2 | 10 | 2 | 0 |
| 101 Platform — Sign-in Log | 46 | 43 | 0 | 0 | 0 | 3 |
| 102 UCP Agentic Commerce | 42 | 7 | 1 | 34 | 0 | 0 |
| 096 Backup Restore | 75 | 32 | 0 | 42 | 1 | 0 |
| 094 UCP Observability | 23 | 1 | 2 | 16 | 0 | 4 |
| 061 Search Indexing Admin | 48 | 17 | 0 | 13 | 18 | 0 |
| 034 Store Management | 44 | 25 | 2 | 15 | 2 | 0 |
| 020 Platform Users Roles & Settings | 65 | 53 | 2 | 2 | 3 | 5 |
| 021 Platform Dynamic Properties | 39 | 32 | 0 | 1 | 6 | 0 |
| 049 Platform API | 52 | 39 | 9 | 2 | 1 | 1 |
| 035 Store Rounding & Email | 25 | 15 | 1 | 7 | 2 | 0 |
| 063 Core Settings | 14 | 12 | 0 | 2 | 0 | 0 |
| 050n GraphQL Store Asset URL | 9 | 5 | 0 | 4 | 0 | 0 |
| 050g GraphQL Cross-Cutting | 4 | 3 | 1 | 0 | 0 | 0 |
| **Subtotal** | **538** | **322** | **20** | **148** | **35** | **13** |

## FAIL triage
| Case | Finding | Verdict |
|---|---|---|
| API-023, 024, 027, 028, 029, 044 | 500 instead of 400 for bad pagination or an empty/duplicate product; 404 with empty body | **Not a regression.** Same on Stable 15 (3.1039.13), and 16 is slightly better (no type-name leak; order 404 instead of 200) |
| API-050 | Product video description >1024 chars → 500 "would be truncated" | Known **VCST-4708**, still open |
| API-017 | B2B-store `seoInfos: []` | Env data (store has no SEO records) |
| XCC-GQL-018 | Orders list 527 ms vs 500 ms budget (other samples 322 / 196 ms) | Env performance noise |
| BGJ-053 | `/api/background-jobs/registered` collapses 4 `LogEntityChangesJobHandler` registrations to 1 (name-only dedup) | **Candidate**, new module; the case itself describes it as known. Check for an existing ticket |
| BGJ-054 | `/sitemap.xml` 404, while the export lands at `/cms-content/assets/stores/B2B-store/sitemap/sitemap.xml` | Routing/config; same symptom as W0 BSM-058 |
| UCPO-004, UCPO-016, UCPA-002 | UCP 3.1010 returns its own envelopes (`invalid_request`, 400 "buyer_id is required", 200 for a search with no store) where the cases expect GraphQL/404 shapes | **Developer ruling needed**: UCP is new in 16 and its release notes are empty |
| STORE-017 | Store SEO: Delete stays disabled with a row selected | **Filed VCST-6306 (Low), pre-existing**: the same on Stable 15; product SEO works |
| STORE-033 | `store:access` alone → 403 on `POST /api/stores/search` | Likely stale case (`store:read` needed) |
| STORE-069 | Verification link still confirms the email after the store's email verification is turned off | **Candidate**, needs a ruling on intended behaviour |
| PLAT-080 | `PUT /api/products/prices` accepts list price −10 / 0 (UI blocks it) | **Candidate**; check against Stable 15 |
| PLAT-069 | After the account is deleted, its open storefront session renders a blank page (`pageContext` NULL_REFERENCE) | **Candidate**; check against Stable 15 |
| API-021 | REST cart: `POST /api/carts/{id}/coupons/{code}` → 204 but `coupons[]` stays empty | **Candidate** (Cart 3.1012) |

## BLOCKED by cause (148)
| Cause | Approx. | Suites |
|---|---|---|
| Unsafe on the shared env (restore, full rebuild, global security/store settings) | 60 | 096, 061, 020, 034, 035, 021 |
| UCP OAuth resource not registered on regression (`invalid_target`); UCP fixtures missing | 38 | 102, 050n |
| No telemetry backend (App Insights unset) | 16 | 094 |
| Fixtures missing (PROCESSING_ORDER, rounding products/coupons, QA-* SKUs, personas) | 20 | 095, 035, 102 |
| Env config: event-based indexation off, Lucene inactive, single instance | 10 | 095, 061 |
| Permission policy refused a write | 2 | 063 |

## Not covered on this environment
- **Restore** (BKRS-050…075): no full-module restore on a shared env. Needs an isolated stand (`/qa-local-env`).
- **UCP commerce flows**: blocked by UCP OAuth configuration of vcptcore-regression.
- **Telemetry export** (094): no App Insights / OTel backend.

## Incidental observations (unconfirmed)
- Sign-in log: the record card shows local time and the grid shows UTC for the same row (101).
- Backup blade: after cancelling a select-all backup, Cancel stays shown and Select all is disabled until the blade is reopened (096).
- Admin SPA: "Tried to load AngularJS more than once" from CustomerExportImport (virto-start) on every load (061, W0).
- Admin SPA session expires after ~11 min; the admin token lifetime is 30 min on both 15 and 16, so the cause is elsewhere.
- LongText dynamic property stores `<b>…</b>` raw; XSS sanitisation not exercised (021).
- Content page delete API returned 500 although the page was removed (021).

## Retry log
| Cases | Issue | Action |
|---|---|---|
| Machine lane 050g / 050n / 102 | graphql-runner exits 0xC0000409 (Windows libuv exit assertion) after printing its verdict | Re-ran each case; took the runner's printed verdict; cases without a verdict stayed BLOCKED |
| 021 | Runner not dispatched with the first slot (orchestration slip) | Dispatched later; suite complete |

## Environment state
- USER persona was locked out for ~5 min (BGJ-018); it recovered on its own. EUR, ORG_USER and MULTI_ORG are healthy.
- Runners restored every setting they changed (B2B-store tax, anonymous access, email verification, EUR rounding, core dictionaries).
- One verification email was sent to the EUR persona (035).

## App Insights (run window)
Skipped — `APPINSIGHTS_*` not configured for this env.

## Promotion
Dry run: 143 of 267 Draft cases promotable, 2 suites refused (legacy headers 061 / 063). Not applied.

## BL freshness
`bl:fresh --write`: 12 records changed in 6 files; 49 BL-* SUSPECT after this run.

## Candidate triage (2026-10-13)
Stable 15 comparisons ran on vcptcore-stable (Platform 3.1039.13). Every temporary AGENT-TEST entity was removed: users/contacts, price lists, content pages, backup files.

| Candidate | Verdict | New in 16? | Evidence |
|---|---|---|---|
| STORE-017 store SEO delete | REAL_BUG, filed **VCST-6306** | no | Delete disabled on 15 and 16; product SEO works |
| API-021 REST cart coupon | NOT A BUG (legacy REST cart, no recalculation); storefront xAPI `addCoupon VALID10` applies −40 | — | skipped per decision |
| BGJ-053 registered handlers | Low cosmetic: 9 modules share the simple name `LogEntityChangesJobHandler`; the admin list keeps 1. `triggerable:false`; execution resolves by full type, so jobs are unaffected | yes (new module) | `/api/background-jobs/registered`, `BackgroundJobsAdminQuery.GetRegisteredJobs` |
| PLAT-080 negative list price | REAL_BUG: `PUT /api/products/prices` stores list −10 and 0 (UI-only guard) | **no**, same on 15 | temporary price lists on both envs |
| PLAT-069 blank page after the account is deleted | REAL_BUG (`pageContext` NULL_REFERENCE in XFrontend `PageContextQueryHandler`) | **no**, same on 15 | screenshots `triage-plat069-*`; local report `BUG-storefront-blank-page-after-session-user-account-deleted.md`, not filed |
| STORE-069 verification link after disabling | Not a bug in our view; undocumented behaviour; questionable test expectation | — | VirtoOZ: no rule |
| UCPO-004 / UCPO-016 | STALE tests: UCP validates store_id (`invalid_request`); `UCP__DefaultStoreId` is set, so search without store_id is valid; order lookup requires a buyer context per the README | — | vc-module-ucp README §errors |
| UCPA-002 | ENV CONFIG: the storefront host does not proxy `/.well-known/oauth-protected-resource/ucp/mcp` (SPA HTML); explains `invalid_target` | — | vc-deploy-dev `infra/environments.yml` route |
| Sign-in log time | REAL_BUG Low: the grid shows browser time; the card and Last login date show the profile timezone | yes (new feature) | screenshots `triage-signinlog-*` |
| Backup toolbar after cancel | NOT A BUG (identical after any finished run); optional UX ask | no | `triage-backup-*` |
| AngularJS loaded twice (CustomerExportImport) | Pre-existing build of a virto-start module (same config 3.1001→3.1002); no breakage seen | no | `dist/app.js` |
| Content page DELETE 500 | NOT A BUG: create 200 / delete 204 on both envs; the runner's `urls` format was wrong | — | REST repro |
| New: `POST /api/content/search` returns a serialized Task (`status:"RanToCompletion"` …) | Low API defect | no, same on 15 | REST |
| New: Sign-in log dashboard shows trend "87600%" and an account named "undefined" in Top failed | Low, not investigated | yes | screenshot `triage-signinlog-*` |
| PageBuilder `legacy-draft` 404 | Low UX, deferred | yes (PageBuilder 3.1032) | W0 |
