# VC QA Plugin — One-Pager

> A QA agent crew + authoring framework + reference suite library for VirtoCommerce customers. **Standardized methodology, your storefront, your suites.**

## What it actually is

An **agentic QA toolkit** for VirtoCommerce customers, in three layers:

1. **An agent crew + methodology** — 14 specialized agents (frontend, backend, UI/UX, BA, test-management, orchestration), 20 skills, ISTQB lifecycle, evidence policy, defect workflow. Same crew VC's internal QA uses. **Same for every customer.**

2. **An authoring framework** — Enriched CSV test-case format, `@td()` test-data resolver, multi-env aware orchestrator (`TEST_ENV` + `ENV_RISK` + `MODULES_ENABLED` + `STOREFRONT_PROFILE` + `PAYMENT_PROCESSORS_ENABLED`), per-suite filtering, parallel browser pool. **The infrastructure you'd otherwise build yourself.**

3. **A reference suite library** — ~99 starter suites covering universal VC platform behavior (auth, cart, checkout, payment-processor patterns, GraphQL xAPI, Admin SPA modules). Plug in your own product/org/user IDs via `@td()`, the universal suites run as-is. **Some apply to your deployment directly; some are reference patterns to clone and adapt; some are vcst-specific and won't apply.**

**Customer authoring is the expected workflow, not the exception.** Your custom modules, your custom checkout flow, your branded theme, your business-specific invariants — those need suites written by your team. The plugin gives you the framework + reference patterns; the suites for *your* customizations are yours to write.

## What it ships out of the box

| Layer | What | Universal? |
|-------|------|------------|
| Methodology | ISTQB process, defect workflow, evidence policy, report templates, BL ID convention | 100% — same for any QA team |
| Capability | Agents, skills, commands, orchestrator, env loader, `@td()` resolver, MCP browser configs | 100% — same infrastructure for every customer |
| Reference suites — universal VC platform | Auth flow, cart mechanics, checkout shape, payment-processor integration patterns, Admin SPA module surfaces, GraphQL xAPI queries | ~60-70% — runs as-is with your `@td()` data overrides |
| Reference suites — vcst-qa-specific | Some BL invariants assume vcst-qa's data shape; some UI assertions match VC's default Coffee theme; some suites reference specific vcst-qa orgs/products | ~30-40% — patterns to clone, not run as-is |

**99 suites total, ~2,400 test cases, 76 business-logic invariants.** Coverage: storefront (40 Frontend suites) + Admin SPA + Platform APIs + GraphQL xAPI (38 Backend + 1 release).

## What you do as a customer

```
1. Install + configure                npm run plugin:install     (5 min per env)
                                       Customer fills in: their URLs, creds, store ID,
                                       theme, modules enabled, payment processors.

2. Run universal suites               TEST_ENV=qa /qa-smoke      (~5 min, ~$1)
                                       Verifies VC platform is healthy on your env.
                                       Auto-skips suites that don't apply to your
                                       deployment (your modules, your processors,
                                       your storefront profile, your risk class).

3. Adapt vcst-specific suites          Clone-and-adapt as needed. Most VCST data
                                       references already go through @td() — you
                                       override your TEST_ORG, TEST_PRODUCT, etc.
                                       in test-data/aliases.{env}.json.

4. Author YOUR OWN suites             For your custom modules / custom checkout /
                                       branded theme assertions / business-specific
                                       invariants. Same Enriched CSV format, same
                                       @td() resolver, same agent crew runs them.
                                       Put them under regression/suites/customer/.
                                       See docs/test-authoring.md.

5. Maintain                            Plugin auto-updates via the manager;
                                       your customer/ suites are yours forever.
```

## What the plugin gives you that you don't have to build

- A 14-agent QA crew, pre-trained on VC platform behavior
- Multi-env orchestration with safety gates (`ENV_RISK`, `MODULES_ENABLED`, `STOREFRONT_PROFILE`, `PAYMENT_PROCESSORS_ENABLED`, `envRiskGate`)
- Standardized bug-filing format (every bug looks identical, regardless of which agent surfaced it)
- ISTQB-compliant test process with evidence policy + quality gates
- Parallel browser pool (3 isolated contexts, slot-pair-aware for B2B tests)
- Test data resolver with per-env override layering
- Reference patterns for testing every major VC surface — clone the closest one as your starting point

## What it explicitly does NOT give you

- **Tests for your custom modules.** You write those.
- **Tests for your custom checkout / payment / catalog flow modifications.** You write those.
- **Tests for your branded theme.** You write those (or use `/qa-design` Figma comparison if you have Figma).
- **A full out-of-the-box pass rate.** Expect some vcst-specific suites to fail or skip on your deployment until you adapt them.
- **Load testing.** Use k6/Gatling/JMeter.
- **Security pentests.** Suite 044 catches OWASP basics; commission a real pentest for audits.
- **Mobile or marketplace coverage.** Two surfaces only: storefront + Admin SPA.

## Why this is still valuable even though you'll write your own suites

| Without the plugin | With the plugin |
|--------------------|-----------------|
| Build a QA framework from scratch | Framework + 14 agents + methodology shipped |
| Write checkout test from a blank page | Clone reference suite 011, adapt for your custom flow |
| Decide your own test-data convention | `@td()` resolver pattern documented + lint-enforced |
| Decide your own bug-report format | `reports.md` is the standard; every bug filed looks identical |
| Build multi-env orchestration | Already wired (`TEST_ENV` + `ENV_RISK` + module/profile gates) |
| Hire/train QA from scratch | Onboard onto a published methodology with reference implementation |

**You're not paying for the 99 specific suites. You're paying for everything that surrounds them.** The suites are the visible artifact; the agent crew + methodology + framework + standardization is the deliverable.

## Pricing (TBD, post-pilot)

**Pre-v1.0 (now):** Free for pilot customers. Tier 1 GitHub Issues for everyone else.

**Post-v1.0 GA:** Three tiers (see [`docs/distribution.md`](distribution.md) § Support Model). Tier 0 self-serve + Tier 1 public GitHub Issues stay free for all VC customers. Tier 2 direct support + Tier 3 consulting (including custom suite authoring for customers who want VC to write theirs) will be paid; pricing decided after first 3 pilots close.

## Pilot program

Currently piloting with selected VC customers. Each pilot is:
- 2 weeks: kickoff (60 min) → solo run (1 week) → wrap (60 min)
- ≤ 45 minutes install per environment
- **Success metric** (updated, honest version): customer's QA lead runs the universal suites green on ≥ 2 envs (skipping vcst-specifics as expected) AND authors at least one suite for one of their own custom features, in the standard Enriched CSV format with `@td()` resolver.

Interested? Reply to the partner-engineering thread or contact your VC account manager. Pre-pilot qualification per [`docs/pilot-runbook.md`](pilot-runbook.md) § 1.

## Stability promise

Tier A artifacts (methodology, test-case CSV format, evidence policy, defect workflow, quality gates, report rules, `@td()` resolver syntax) freeze at v1.0. Customer-authored suites built on top of these will keep working across plugin updates. Breaking changes only at major-version bumps, paired with migration guides. See [`docs/versioning.md`](versioning.md) for the full contract.

## Links

- Customer onboarding: [`docs/onboarding.md`](onboarding.md)
- **Test authoring (customer-written suites):** [`docs/test-authoring.md`](test-authoring.md)
- Versioning + Tier A freeze: [`docs/versioning.md`](versioning.md)
- Distribution model: [`docs/distribution.md`](distribution.md)
- Support runbook: [`docs/support-runbook.md`](support-runbook.md)
- Pilot runbook (VC-internal): [`docs/pilot-runbook.md`](pilot-runbook.md)
- Source: https://github.com/VirtoCommerce/vc-mcp-testing-module
- Current version: see [`CHANGELOG.md`](../CHANGELOG.md)
