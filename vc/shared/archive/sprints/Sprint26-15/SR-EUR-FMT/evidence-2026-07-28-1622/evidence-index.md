# Evidence Index — SR-EUR-FMT

**Env:** `vcst` — https://vcst-qa-storefront.govirto.com / https://vcst-qa.govirto.com (ENV_RISK=test)
**Symptom:** salesRep scoped GraphQL formattedAmount returns generic currency placeholder ¤ instead of € on currencyCode override (EUR); UI renders € correctly
**Browser:** none
**Package:** `reports/tickets/SR-EUR-FMT/evidence-2026-07-28-1622`

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
| — | (none found in `test-results/none/`) | capture during repro |

## Worksheet
Root-cause synthesis → `root-cause.md`
