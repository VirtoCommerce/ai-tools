# Evidence Index — VCST-5024

**Env:** `vcst` — https://vcst-qa-storefront.govirto.com / https://vcst-qa.govirto.com (ENV_RISK=test)
**Symptom:** Organization mode: an account with no organization displays a loyalty balance of 38916 and cannot spend it - cart reports available=0
**Browser:** chrome
**Package:** `reports/tickets/Sprint26-18/VCST-5024/evidence-2026-09-11-1558`

> Companion: `.claude/skills/qa-investigate/evidence-and-root-cause.md` (Part A).
> Fill each `<fill: …>` slot as you capture. Run `--check` before writing the bug report.

## Header slots (fill these)
| slot | value |
|------|-------|
| TRACE_ID | **NONE EXISTS for this failure — stated, not skipped.** The defect surfaces as HTTP **200** carrying a `validationErrors[]` entry, which is the designed shape for a cart validation failure, so there is no failed request, no exception and no dependency failure to correlate. App Insights across the whole window holds **0 product exceptions** (see `network/appinsights-window-query.json`). The available join key is the **cart id `0e56ebc2-7e7d-4750-b314-2a3ac8ef7d75`**, present in both captured payloads. SEPARATE GAP, also stated: no `Request-Id`/`traceparent` was captured during the original repro, and no HAR was taken this run. |
| BUILD_VERSIONS | Platform **3.1069.0** · Theme **vc-theme-b2b-vue 2.58.0-pr-2475-d710-d710e94f** · module **VirtoCommerce.Loyalty 3.1008.0-pr-17-116e** (tip of OPEN PR #17, `116e902c`). Source: `vc-deploy-dev` `backend/packages.json` + `theme/artifact.json` @ branch `vcst-qa`, cross-checked live against `GET /api/platform/modules` and the storefront footer. |
| REPRO_RATE | Deterministic, not intermittent — it is a missing null-check on a code path, reached whenever a cart with a points line has `OrganizationId == null` on an organization-mode store. Observed on the single attempt made; **re-verification requires re-enabling organization mode on a store** (the store was restored to `Customer` after the run). |

## Captured artifacts (Part A ordered pass)
| # | artifact | path / value | status |
|---|----------|--------------|--------|
| 1 | Failure-state screenshot | `screenshots/sf-12…`, `sf-13…` | captured
| 2 | DOM snapshot | `screenshots/dom-*.txt` | <fill> |
| 3 | Network request list | `network/` (3 payloads) | captured
| 4 | Failing request (URL/payload/status/body) | `network/D2-cart-mixed-SOLE-error.json` | captured — 1 validationError, `required=6 available=0`
| 6 | Console messages | `console/` (2 logs) | captured — clean, zero JS exceptions
| 9 | REST cross-check (if GraphQL wrong) | `network/rest-crosscheck-*.json` | <fill> |
| 10 | App Insights trace for TRACE_ID | `network/appinsights-window-query.json` | N/A by failure class — 0 product exceptions in the window
| 13 | Source findings (file:line + quote) | `root-cause.md` §Lowest failing layer | captured — 5 sites read at the deployed ref

## Raw browser artifacts (auto-discovered, referenced)
| kind | path | note |
|------|------|------|
| HAR | `test-results/chrome/har/session.har` | referenced (gitignored raw artifact) |
| console-log | `test-results/chrome/console-2026-09-11T15-05-48-386Z.log` | referenced (gitignored raw artifact) |
| console-log | `test-results/chrome/console-2026-09-11T15-05-35-396Z.log` | referenced (gitignored raw artifact) |
| console-log | `test-results/chrome/console-2026-09-11T15-03-09-516Z.log` | referenced (gitignored raw artifact) |

## Worksheet
Root-cause synthesis → `root-cause.md`
