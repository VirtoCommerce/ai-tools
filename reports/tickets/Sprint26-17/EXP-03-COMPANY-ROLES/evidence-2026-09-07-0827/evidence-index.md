# Evidence Index — EXP-03-COMPANY-ROLES

**Env:** `vcst` — https://vcst-qa-storefront.govirto.com / https://vcst-qa.govirto.com (ENV_RISK=test)
**Symptom:** Org membership role editing: storefront picker single-select over multi-valued roleIds; assignableRoles ignores caller store and accepts bogus storeId
**Browser:** chrome
**Package:** `reports/tickets/Sprint26-17/EXP-03-COMPANY-ROLES/evidence-2026-09-07-0827`

> Companion: `.claude/skills/qa-investigate/evidence-and-root-cause.md` (Part A).
> Fill each `<fill: …>` slot as you capture. Run `--check` before writing the bug report.

## Header slots (fill these)
| slot | value |
|------|-------|
| TRACE_ID | <fill: Request-Id / traceparent of the failing request — capture DURING repro, unrecoverable later> |
| BUILD_VERSIONS | <fill: Platform <ver>, Theme <ver>, module <name> <ver> — AUTHORITATIVE: vc-deploy-dev backend/packages.json (PlatformVersion + module ids) + theme/artifact.json, branch=vcst-qa via GitHub MCP; {BACK_URL}/#!/workspace/systeminfo = live cross-check> |
| REPRO_RATE | <fill: X/10 (only if intermittent)> |

## Captured artifacts (Part A ordered pass)
| # | artifact | path / value | status |
|---|----------|--------------|--------|
| 1 | Failure-state screenshot | `screenshots/` | <fill> |
| 2 | DOM snapshot | `screenshots/dom-*.txt` | <fill> |
| 3 | Network request list | `network/requests.json` | <fill> |
| 4 | Failing request (URL/payload/status/body) | `network/failing-<op>.json` | <fill> |
| 6 | Console messages | `console/console.json` | <fill> |
| 9 | REST cross-check (if GraphQL wrong) | `network/rest-crosscheck-*.json` | <fill> |
| 10 | App Insights trace for TRACE_ID | `network/appinsights-<opId>.json` | <fill> |
| 13 | Source findings (file:line + quote) | `source/findings.md` | <fill> |

## Raw browser artifacts (auto-discovered, referenced)
| kind | path | note |
|------|------|------|
| HAR | `test-results/chrome/har/session.har` | referenced (gitignored raw artifact) |

## Worksheet
Root-cause synthesis → `root-cause.md`
