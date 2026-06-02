# VC QA Plugin — One-Pager

> Built by VirtoCommerce's internal QA team. **Same agents we use, your storefront.**

## What it is

An agentic QA system for VirtoCommerce customers. Install once, run the same automated test agents VC's internal QA team runs against vcst-qa — pointed at *your* storefront and Admin SPA, across *your* environments.

Not a test framework you write specs in. Not a saved-test-replay tool. **An agent crew** — 14 specialized roles that drive your VC deployment through real browser interactions, file bugs in your JIRA, and produce regression reports in the same format VC's internal QA produces.

## What it tests

**Out of the box, against every VC deployment:**

| Surface | Coverage |
|---------|----------|
| Storefront (`FRONT_URL`) | 40 suites — catalog, search, cart, checkout, B2B org, BOPIS, payment (CyberSource/Skyflow/Authorize.Net/Datatrance), accessibility, security, perf |
| Admin SPA (`BACK_URL`) | 38 suites — catalog mgmt, customer mgmt, pricing, inventory, marketing/promotions, CMS, orders, store config, search admin |
| Platform APIs | REST + GraphQL xAPI coverage |
| **Total** | **99 suites, ~2,400 test cases**, 76 business-logic invariants (BL-* IDs) |

**Multi-env first-class.** Configure once per env (`dev`, `qa`, `staging`, `prod`, or whatever you call them). Switch with `TEST_ENV=staging`. Production-risk envs auto-protect themselves: destructive suites refuse to run on prod unless you explicitly opt in.

**Modular.** Don't have CMS or Loyalty installed? `MODULES_ENABLED=catalog,customer,orders` — the orchestrator skips suites that don't apply to your deployment.

## What you actually do

```
1. Install                      git clone … && npm install && npm run plugin:install
                                (5-minute interactive wizard per environment)

2. Smoke check                  /qa-smoke
                                (~$1 in Anthropic tokens, ~5 minutes — both surfaces)

3. Real work                    /qa-regression critical    (P0 suites, ~$5)
                                /qa-test VCST-1234          (test a ticket end-to-end)
                                /qa-bug "<description>"    (reproduce, document, file)
                                /qa-design /your-page       (UX + a11y audit)
                                /qa-api ref <module>        (REST/GraphQL surface)
```

## Why now

VirtoCommerce's QA team built and battle-tested this on `vcst-qa` over 2026 H1 — 99 suites, 76 business invariants, dozens of real regressions caught. **Standardizing it as a customer plugin is the natural next step**: every VC customer runs the same platform, so the same agents apply. You don't have to write tests for VC's behavior; we already did.

## How it's different from what you're already doing

| Your current QA | With the plugin |
|-----------------|-----------------|
| QA writes Cypress/Playwright specs by hand | Agents drive real browser flows from natural-language test cases (CSV) |
| Bugs filed inconsistently per QA's preference | Every bug follows the same 4-category, size-capped format ([`docs/reports.md`](../.claude/rules/reports.md)) |
| Test data hardcoded in specs | `@td()` resolver routes through `aliases.json` — change one alias, every test follows |
| Regression script knows nothing about your VC modules | `MODULES_ENABLED` and `STOREFRONT_PROFILE` declare which surfaces apply; orchestrator skips the rest |
| Prod regression = manual carefulness | `ENV_RISK=production` auto-blocks destructive suites |
| Knowledge of VC's behavior lives in your team's heads | 19 shared knowledge files (business-logic, products, edge cases, browser quirks, etc.) ship with the plugin |

## What it's not

- **Not a replacement for unit tests.** Your code's unit tests still belong with your code.
- **Not a load-testing tool.** Plugin agents drive *user-like* flows. Use k6/Gatling/JMeter for load.
- **Not a security-pentest replacement.** Suite 044 catches the OWASP-storefront basics; commission a real pentest for security audits.
- **Not free of cost.** Customer pays Anthropic API tokens. Smoke ~$1, critical regression ~$5, full ~$80. Document this up front with your finance team.
- **Not for mobile apps or marketplace.** Two surfaces only: storefront + Admin SPA. Mobile / marketplace stay out of scope.

## Pricing (TBD, post-pilot)

**Pre-v1.0 (now):** Free. Pilot customers get direct support from VC's pilot owner. Tier 1 GitHub Issues for everyone else.

**Post-v1.0 GA:** Three tiers (see [`docs/distribution.md`](distribution.md) § Support Model). Tier 0 self-serve + Tier 1 public GitHub Issues stay free for all VC customers. Tier 2 direct support + Tier 3 consulting will be paid add-ons; pricing decided after first 3 pilots close.

## Pilot program

Currently piloting with selected VC customers. Each pilot is:
- 2 weeks: kickoff (60 min) → solo run (1 week) → wrap (60 min)
- ≤ 45 minutes install per environment
- Tracked feedback in `reports/pilot-feedback/customer-<name>-<date>.md`
- **Success metric:** customer's QA lead runs `/qa-smoke` on ≥ 2 envs without VC support and files a real bug in the standard format

Interested? Reply to the partner-engineering thread or contact your VC account manager. Pre-pilot qualification per [`docs/pilot-runbook.md`](pilot-runbook.md) § 1.

## Stability promise

Tier A artifacts (methodology, test-case CSV format, evidence policy, defect workflow, quality gates, report rules) freeze at v1.0. Breaking changes only at major-version bumps, paired with migration guides. See [`docs/versioning.md`](versioning.md) for the full contract.

Customers pin a version range (`^1.0`) and the plugin manager auto-updates within it.

## Links

- Customer onboarding: [`docs/onboarding.md`](onboarding.md)
- Versioning + Tier A freeze: [`docs/versioning.md`](versioning.md)
- Distribution model: [`docs/distribution.md`](distribution.md)
- Support runbook: [`docs/support-runbook.md`](support-runbook.md)
- Pilot runbook (VC-internal): [`docs/pilot-runbook.md`](pilot-runbook.md)
- Source: https://github.com/VirtoCommerce/vc-mcp-testing-module
- Current version: see [`CHANGELOG.md`](../CHANGELOG.md)
