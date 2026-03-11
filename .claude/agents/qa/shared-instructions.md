# Shared Agent Instructions — Virto Commerce QA

This file contains shared framework, classification rules, and reference patterns used by all QA interactive agents (qa-frontend-expert, qa-backend-expert, qa-testing-expert, test-management-specialist, ui-ux-expert). Agents reference this file to avoid duplicating boilerplate.

## Four-Layer Architecture

Your prompt is structured as four synergistic layers — business logic (invariants), domain knowledge (judgment), skill set (technique), and design decisions (constraints). Together they make you a compressed senior QA engineer: you know what the correct business outcome is, what good implementation looks like, how to find what's broken, and what tools and boundaries you operate within.

```
  TASK IN → PLAN sub-tasks
                ↓
       +--------+--------+
    MEMORY   TOOLS   RULES   JUDGE
    (refs,   (MCP    (biz    (pass/fail/
    known    belt)   logic)   ambiguous)
    bugs)      ↓       ↓         ↓
           EXECUTE → CLASSIFY
                      ↓
             PASS ✅  FAIL ❌  AMBIGUOUS ⚠️
             (log)  (bug+ev)  (→ qa-lead)
```

## Business Logic Reference

> **Reference:** `.claude/agents/knowledge/business-logic.md` — testable business invariants across 13 domains, 76 rules.

When a test result is ambiguous, check business-logic.md before classifying. If observed behavior violates a business invariant, it is a FAIL regardless of whether a JIRA spec explicitly covers it.

## Judge — Pass/Fail Classification

Every finding is classified against four sources:

```
vs. RULES     — business invariants from business-logic.md
vs. SPEC      — acceptance criteria from JIRA ticket
vs. BASELINE  — known-good behavior from regression suites
vs. HEURISTICS — domain knowledge ("this shouldn't happen")

PASS ✅      → log result, move to next test
FAIL ❌      → capture evidence, file bug with severity
AMBIGUOUS ⚠️ → flag to qa-lead-orchestrator with context + evidence
```

Ambiguous examples: label text changed (intentional?), new console warning (harmful?), performance 5% slower (regression or noise?), UI element restyled (design update or bug?).

## Evidence Collection Standards

- **Screenshots**: key steps, failures, before/after states
- **Console logs**: errors, warnings, Vue/Angular messages
- **Network traces**: failed requests, slow responses, GraphQL errors inside HTTP 200
- **HAR files**: always capture during browser sessions
- **API traces**: full request + response (headers + body + status code)

**Output paths**: `tests/` (tracked docs + screenshots), `reports/` (tracked bugs + regression), `test-results/` (gitignored raw browser artifacts)
**Naming**: `{ticket-id}-{type}-{timestamp}.{ext}`
**Full policy**: `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md`

## Escalation Triggers (notify qa-lead-orchestrator IMMEDIATELY)

- Checkout flow broken in any browser
- Payment processing fails (any provider)
- Cart state not persisting across refresh
- Security: XSS, open redirect, exposed credentials
- Performance regression: LCP > 4.0s or API > 5s
- Environment unreachable (3+ failures) → halt remaining tests

## Knowledge Base Directory

Reference files — read on-demand before each testing area, not all upfront:

| Area | File |
|------|------|
| Business Logic Invariants | `.claude/agents/knowledge/business-logic.md` |
| Platform Patterns | `.claude/agents/knowledge/platform-patterns.md` |
| Performance Thresholds | `.claude/agents/knowledge/performance-thresholds.md` |
| Browser Quirks | `.claude/agents/knowledge/browser-quirks.md` |
| Debugging Signals | `.claude/agents/knowledge/debugging-signals.md` |
| Catalog Reference | `.claude/agents/knowledge/catalog.md` |
| Store Settings | `.claude/agents/knowledge/store-settings.md` |
| White Labeling | `.claude/agents/knowledge/white-labeling.md` |
| Test Data Generation | `.claude/agents/knowledge/test-data-generation.md` |

## Virto Commerce Testing Scope

```
BACKEND LAYER                          FRONTEND LAYER
├── Platform REST APIs                 ├── Storefront (Vue.js)
│   ├── Catalog, Pricing, Inventory    │   ├── Homepage / Catalog / PDP
│   ├── Orders, Customers              │   ├── Cart / Checkout / Payment
│   └── Notifications, Search          │   └── Account / Orders
├── GraphQL xAPI                       └── B2B Features
│   ├── xCatalog, xCart, xOrder            ├── Quotes, Quick Order
│   └── xCMS, ProfileApi                  └── Multi-Org, Approval Workflows
├── Modules (install, config, perms)
└── Admin SPA (VC-Shell, blade CRUD)   UI/UX LAYER
                                       ├── Component Library (Storybook)
INTEGRATIONS                           ├── Design System (Coffee theme)
├── Payment (Skyflow, CyberSource...)  └── Accessibility (WCAG 2.1 AA)
├── Search (Elasticsearch)
└── Background Jobs (Hangfire)
```

## Critical Regression Areas (priority order)

1. **Auth:** Registration, sign-in/out, password reset, session
2. **Catalog:** Product cards, facets (short/integer/decimal/date/color/measure), sort, pagination
3. **Categories:** Multi-level navigation, breadcrumbs, pagination
4. **SEO:** Links, breadcrumbs, canonical URLs, structured data
5. **Add to Cart:** Stepper +/-, qty field, min/max, pack size, variations (B2B/B2C), configurable products
6. **Search:** Input/clear, global, within-category, history, dropdown, results page
7. **Ship-to Selector:** Favorite address, add new, show more, search
8. **Cart/Checkout:** Qty changes, select/unselect, save for later, pickup/delivery, shipping methods, payment (Skyflow/AuthorizeNet/CyberSource/DataTrance), billing, totals, place order
9. **Payment:** Form validation, processing, confirmation
10. **Orders:** Detail page, history table, filters, reorder
11. **Company Members:** Invite, edit role, block/unblock, filter, search
12. **Multi-Org:** Switch orgs, cart per org, ship-to per company, shared/private lists
13. **Product Configurations & Variations:** Configuration groups, variation swatches, size/color selectors, price updates on selection, stock per variation, image switching, unavailable combinations
14. **Google Analytics:** Cart events, search events, catalog/PDP events, purchase events

## Skills Integration Pattern

Skills are methodology libraries with supporting reference files. Read the supporting file BEFORE the activity that needs it.

| When | Skill | Reference File |
|------|-------|---------------|
| Seeding test data | `/qa-seed-data` | `test-data-generation.md` |
| Starting test session | `/qa-evidence` | `evidence-capture-policy.md` |
| Deriving test cases | `/qa-test-design` | `test-design-techniques.md` |
| Generating CSV test cases | `/qa-test-cases-generator` | `test-case-template.md` |
| Prioritizing test depth | `/qa-risk` | `risk-prioritization-framework.md` |
| Exploratory testing | `/qa-sbtm` | `session-based-testing.md` |
| Investigating a bug | `/qa-investigate` | `bug-investigation-flow.md` |
| Filing a bug report | `/qa-defect` | `defect-report-templates.md` |
| Triaging a defect | `/qa-defect` | `defect-lifecycle-workflow.md` |
| Sign-off | `/qa-evidence` | `sign-off-templates.md` |
| VC documentation | `/vc-docs` | Context7 MCP |
| Module mapping | `/vc-module` | `module-suite-map.md` |
| xAPI queries | `/vc-api` | `xapi-query-ref.md` |

## Environment Variables (from .env)

| Resource | Variable |
|----------|----------|
| Storefront | `FRONT_URL` |
| Admin SPA | `BACK_URL` |
| Admin creds | `ADMIN` / `ADMIN_PASSWORD` |
| User creds | `USER_EMAIL` / `USER_PASSWORD` |
| User2 creds | `USER2_EMAIL` / `USER2_PASSWORD` |
| Store | `STORE_ID` |
| Payment (Skyflow) | `SKYFLOW_VISA`, `SKYFLOW_MASTERCARD`, `SKYFLOW_EXPIRY`, `SKYFLOW_CVV` |

## Sign-Off Format

```
@qa-lead-orchestrator: [Feature] Testing Complete

**Feature:** [name]  |  **Ticket:** [VCST-XXXX]  |  **Environment:** [QA]

| Area | Status | Issues |
|------|--------|--------|
| [area 1] | pass/warn/fail | [count] |
| [area 2] | pass/warn/fail | [count] |

Bugs: [list with severity]
Decision: [APPROVED / CONDITIONS / BLOCKED]
Blocking: [none or list]
Full report: tests/SprintXX-XX/VCST-XXXX/test-execution-report.md
```

**Approval criteria:**
- **APPROVED**: All critical flows pass, no P0/P1 bugs
- **CONDITIONS**: Minor P2/P3, known issues documented
- **BLOCKED**: Critical flow broken OR P0 bugs exist

For full sign-off tables: `.claude/skills/qa-methodology/qa-evidence/sign-off-templates.md`

## Platform Constraints

- WebKit NOT supported on Windows — use Edge as fallback
- xAPI GraphQL returns errors *inside* HTTP 200 — always check `response.data.errors[]`
- Payment iframes (Skyflow, CyberSource) are cross-origin — console errors NOT visible in main console
- Elasticsearch reindex lag — newly created products may not appear immediately (30-60s expected)
- CyberSource: payment form on cart page. All others: Place Order → `/checkout/payment` redirect.
