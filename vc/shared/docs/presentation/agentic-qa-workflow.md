# Agentic QA: Key Features & Architecture

**Topic:** LLM-Driven Testing for Virto Commerce B2B Platform
**Slide count:** 20 slides
**Audience:** Stakeholders, team leads, engineers evaluating the agentic QA approach

---

## Slide 1: Title

**Title:** Agentic QA: LLM-Driven Testing for Virto Commerce
**Subtitle:** Architecture, Agent Teams, and Orchestration Patterns

**Speaker notes:** This presentation covers the architecture and key features of our agentic QA system — a fully LLM-driven testing workflow where AI agents execute tests through real browsers using natural language instructions.

---

## Slide 2: Agenda

**Title:** Agenda

1. Why Agentic QA? The problem we solve
2. By the Numbers
3. Architecture: Two Modes, One Foundation
4. MCP Servers — Claude's "Hands and Eyes"
5. Agent Teams (14 agents, 2 teams)
6. Four-Layer Prompt Architecture
7. Browser Isolation & Orchestration
8. Regression Pipeline & Quality Gates
9. CI/CD, Commands & Skills
10. Knowledge Layer & Skill Graph
11. Agent Routing: Skills vs Knowledge
12. Live: Smoke Test in Action
13. Benefits & Roadmap

**Total presentation ~40 min | Live demo +20 min | Q&A +10 min**

**Speaker notes:** Adjust depth based on audience. For a 20-min lightning talk, focus on slides 1-5 and 16-17. For the full 60-min session, include live demo after slide 16. Press S to toggle speaker notes during the talk, L to switch spinner language between English, Russian, or mixed.

---

## Slide 3: The Problem

**Title:** Why Agentic QA?

| Challenge | Traditional Automation | Agentic QA |
|-----------|----------------------|------------|
| Selector changes | Tests break | Agents adapt (self-healing) |
| Skill requirement | Developer-level coding | Natural language prompts |
| Maintenance cost | High (brittle scripts) | Low (prompt updates) |
| Cross-browser | Separate configs per browser | One prompt, 3 browsers |
| Scale | Hard to grow test suites | ~3,000 tests, 97 suites |

```
Traditional:                         Agentic:
await page.goto('/login');           "Sign in to the storefront
await page.fill('#email', '...');    with the test user and verify
await page.fill('#pass', '...');     the dashboard loads correctly"
await page.click('#submit');
assert(page.url()).contains('/dashboard');
```

**Speaker notes:** Traditional test automation requires Playwright/Selenium expertise and produces brittle scripts that break on every UI change. Our approach replaces code with natural language — Claude reads the instructions and drives real browsers. When a developer renames a CSS class, traditional tests break; agentic tests just find the button by context.

---

## Slide 4: By the Numbers

**Title:** Agentic QA at a Glance

| Metric | Value |
|--------|-------|
| AI Agents | 14 (10 QA + 4 BA) |
| Regression Suites | 97 (45 frontend + 52 backend) |
| Total Test Cases | ~3,000 (~1,500 frontend + ~1,500 backend) |
| Slash Commands | 16 |
| Skills (methodology libraries) | 20 across 3 categories |
| MCP Servers | 10 (7 project + 3 user-level) |
| Shared Knowledge Files | 23 cross-agent references |
| Max Concurrent Browsers | 3 |
| CI Schedule | Daily smoke + weekly full regression |

**Speaker notes:** These are the current numbers from the repository. The system is modular — adding a new suite or skill is a file addition, not a code change.

---

## Slide 5: Architecture Overview

**Title:** Two Testing Modes, One Shared Foundation

```
+-------------- INTERACTIVE MODE ---------------+    +------------- CI MODE ----------------+
|                                                |    |                                     |
|  Engineer in IDE (VS Code / Cursor)            |    |  GitHub Actions (schedule / manual)  |
|       |                                        |    |       |                              |
|  Claude Code CLI                               |    |  Docker container                    |
|       |                                        |    |       |                              |
|  14 Specialized Agents                         |    |  Claude Agent SDK                    |
|       |                                        |    |  (run-regression.ts)                 |
| 10 MCP Servers                                 |    |       |                              |
|  (3 browsers + DevTools + JIRA + Figma + ...)  |    |  Headless Chromium (single browser)  |
|       |                                        |    |       |                              |
|  Reports + JIRA updates + Screenshots          |    |  Reports + Teams notifications       |
+------------------------------------------------+    +-------------------------------------+
                         \                                      /
                          \                                    /
                    +---------- SHARED FOUNDATION -----------+
                    |                                        |
                    |  config/test-suites.json (97 suites)   |
                    |  regression/suites/ (CSV test cases)   |
                    |  .claude/agents/ (agent definitions)   |
                    |  .claude/agents/knowledge/ (23 files)  |
                    +----------------------------------------+
```

**Speaker notes:** Interactive mode is what engineers use daily — full MCP server stack, 3 concurrent browsers, JIRA integration. CI mode runs in Docker with a single headless Chromium, triggered by GitHub Actions on schedule or manually. Both modes share the same suite manifest, test cases, and agent definitions.

---

## Slide 6: MCP Server Ecosystem

**Title:** 10 MCP Servers — Claude's "Hands and Eyes"

MCP (Model Context Protocol) turns Claude from a text generator into an agent that can interact with external tools.

**Project-level servers (configured in `.mcp.json`):**

| Server | Purpose |
|--------|---------|
| **playwright-chrome** | Browser automation with Chromium |
| **playwright-firefox** | Browser automation with Firefox |
| **playwright-edge** | Browser automation with Edge (msedge channel) |
| **Chrome DevTools** | Console logs, network requests, HAR export, performance tracing |
| **postman** | API testing — collections, environments, monitors |
| **github** | PR review, code search, issue management |
| **context7** | Up-to-date Virto Commerce documentation lookup |
| **azure-mcp** | Azure App Insights, resource health, monitoring |
| **figma-remote-mcp** | Visual comparison against design specs |
| **atlassian** | JIRA ticket management, bug filing, status transitions |

**Speaker notes:** Without MCP servers, Claude can only generate text. With them, it opens browsers, clicks buttons, reads JIRA tickets, captures screenshots, exports HAR files, and compares designs against Figma. The 3-browser pool enables parallel testing — each agent gets its own isolated browser session.

---

## Slide 7: Agent Team Structure

**Title:** 14 Specialized Agents — Two Teams

**QA Team (10 agents):**

| Agent | Model | Role |
|-------|-------|------|
| **qa-lead-orchestrator** | Sonnet | Coordinates team, manages JIRA workflow, makes go/no-go decisions |
| **qa-frontend-expert** | Opus | Storefront testing, checkout flows, mobile, cross-browser |
| **qa-backend-expert** | Opus | REST APIs, GraphQL xAPI, Admin SPA, module CRUD, RBAC |
| **qa-testing-expert** | Opus | Interactive execution, Figma comparison, console/network debugging |
| **ui-ux-expert** | Sonnet | Storybook (55 components), WCAG 2.1 AA accessibility, design system |
| **test-management-specialist** | Sonnet | Test planning, case writing, 18 domain checklists, coverage tracking |
| **regression-orchestrator** | Sonnet | 36-suite regression, parallel batching, browser fallback, quality gates |
| **autonomous-regression-orchestrator** | Sonnet | Agent Teams regression: token bucket, exponential backoff, failure recovery, JIRA integration |
| **autonomous-test-runner** | — | Parameterized template for Agent Teams mode suite execution |
| **test-runner-agent** | — | Parameterized template for standard suite execution (used by regression-orchestrator) |

**BA Team (4 agents):**

| Agent | Model | Role |
|-------|-------|------|
| **ba-system-analyzer** | Sonnet | Repo structure, module inventory, user flows, pain points |
| **ba-api-specialist** | Sonnet | API surface analysis via Postman/Swagger |
| **ba-story-writer** | Sonnet | Agile user stories with BDD acceptance criteria |
| **ba-doc-writer** | Sonnet | User docs, admin guides, API quick-start |

**Speaker notes:** Opus models are used for the 3 specialist testing agents that need deep reasoning (frontend, backend, testing). Sonnet models handle coordination, planning, and documentation where speed matters more than depth. The two template agents (autonomous-test-runner, test-runner-agent) are parameterized — they have no fixed model and are instantiated per suite run. Each agent has a focused role — no agent tries to do everything.

---

## Slide 8: Four-Layer Prompt Architecture

**Title:** How Agents "Think" — Four Decision Layers

Each QA agent's prompt definition (`.claude/agents/*.md`) follows a consistent four-layer structure:

```
+-----------------------------------------------------------+
|  LAYER 1: BUSINESS LOGIC (Invariants)                     |
|  "What the correct business outcome is"                   |
|  Source: knowledge/business-logic.md                      |
|  Rules like BL-PRICE-001, BL-CART-004, BL-ORD-001        |
+-----------------------------------------------------------+
                          |
+-----------------------------------------------------------+
|  LAYER 2: DOMAIN KNOWLEDGE (Judgment)                     |
|  "What good implementation looks like"                    |
|  Sources: platform-patterns.md, browser-quirks.md         |
|  Example: "Checkout must use async validation"            |
+-----------------------------------------------------------+
                          |
+-----------------------------------------------------------+
|  LAYER 3: SKILL SET (Technique)                           |
|  "How to find what's broken"                              |
|  Selector strategy, API test order, evidence capture      |
|  Example: data-testid > aria-label > semantic HTML        |
+-----------------------------------------------------------+
                          |
+-----------------------------------------------------------+
|  LAYER 4: DESIGN DECISIONS (Constraints)                  |
|  "Tools available and boundaries"                         |
|  MCP servers, browser assignment, quality thresholds      |
|  Example: "Use playwright-chrome, max 100 turns"          |
+-----------------------------------------------------------+
```

**Speaker notes:** Layer 1 is shared across all agents — business-logic.md is the single source of truth for what constitutes correct behavior. Layers 2-4 are agent-specific. This architecture ensures every agent applies the same business rules while using domain-appropriate techniques to find violations.

---

## Slide 9: Browser Isolation Strategy

**Title:** 3 Concurrent Browsers, Zero Interference

```
+-- Browser Pool (max 3 concurrent) --+
|                                      |
|  Slot 1: playwright-chrome           |
|    --> qa-frontend-expert            |
|                                      |
|  Slot 2: playwright-firefox          |
|    --> qa-testing-expert             |
|                                      |
|  Slot 3: playwright-edge             |
|    --> qa-backend-expert             |
|                                      |
+--------------------------------------+
    ui-ux-expert --> Chrome DevTools MCP (separate)
    test-management-specialist --> sequential only
```

| Rule | Rationale |
|------|-----------|
| Never share a browser session between agents | Navigation, cookies, and state would conflict |
| Max 3 concurrent browser agents | 3 Playwright MCP servers available |
| Fallback chain: chrome -> firefox -> edge | If primary browser slot is occupied |
| Never use WebKit on Windows | Not supported — fall back to Edge immediately |

**Speaker notes:** This is a hard constraint. If two agents share a browser, one agent's navigation destroys the other's context. Each agent gets its own isolated Playwright MCP server with separate cookies, storage, and viewport.

---

## Slide 10: Orchestration Pattern

**Title:** Lead Delegates, Never Executes

The `qa-lead-orchestrator` NEVER runs tests directly. It follows a strict delegation pattern:

```
  JIRA Ticket / User Request
            |
     +------v------+
     |   ANALYZE    |  Read ticket, parse ACs, identify scope
     +------+-------+
            |
  +---------+---------+---------+
  |         |         |         |
DELEGATE  MONITOR   RULES    JUDGE
(assign   (track    (apply   (approve/
agents)   progress) BL-*)    reject)
  |         |         |         |
  +---------+---------+---------+
            |
     +------v------+
     | CONSOLIDATE |  Collect results from all specialists
     +------+------+
            |
     +------v------+------v------+
     |             |             |
  APPROVED    CONDITIONAL    BLOCKED
  (TESTED)   (minor issues) (REOPEN)
```

**Five Orchestration Workflows:**

| Workflow | Trigger | Agents Dispatched |
|----------|---------|-------------------|
| New Feature Testing | VCST-XXXX ticket | frontend + backend + (optional) ui-ux |
| PR Review | GitHub PR | backend (APIs) + frontend (UI) + testing (interactive) |
| Module Testing | Module install/update | backend (API verification) + test-mgmt (regression mapping) |
| Release Testing | Sprint/prod gate | regression-orchestrator (batches of 3 sub-agents) |
| Bug Fix Verification | Bug ticket | testing (reproduction) + test-mgmt (checklist) |

**Speaker notes:** The lead agent is a coordinator, not an executor. It reads the JIRA ticket, decides which specialists to dispatch based on the scope (frontend changes? backend APIs? accessibility?), monitors their progress, and makes the final go/no-go decision based on quality gates.

---

## Slide 11: Regression Pipeline

**Title:** 97 Suites, Parallel Batching, Quality Gates

**Pipeline Steps:**

```
  1. Read config/test-suites.json manifest
  2. Resolve selection (smoke | critical | sprint | full | IDs)
  3. Generate run ID (REG-YYYY-MM-DD-HHMM)
  4. Sort suites by priority (P0 first)
  5. Dispatch sub-agents in batches of 3 (one per browser slot)
  6. Monitor results, free browser slots on completion
  7. Retry failures (max 2 retries, browser fallback chain)
  8. Consolidate final report
  9. Evaluate quality gates --> APPROVED | CONDITIONAL | BLOCKED
```

**Selection Groups:**

| Selection | Suites | Tests | Use Case |
|-----------|--------|-------|----------|
| `smoke` | 042, 078 | ~140 | Daily pre-deploy validation |
| `critical` | 042, 078, 039, 044, 049 | ~230 | P0 gate before any release |
| `sprint` | Plan-driven (~88) | ~2,700 | Sprint release gate |
| `full` | All 97 | ~3,000 | Production release gate |
| `frontend` | All Frontend/ suites (45) | ~1,500 | Frontend-only regression |
| `backend` | All Backend/ suites (52) | ~1,500 | Backend-only regression |

**Speaker notes:** The regression-orchestrator reads the manifest, groups suites into batches of 3 (matching the browser pool), and dispatches sub-agents in parallel. P0 suites run first. If a suite fails, it retries with the next browser in the fallback chain. The result is a consolidated report with a quality gate verdict.

---

## Slide 12: Quality Gates

**Title:** Non-Negotiable Thresholds

| Gate | Pass Rate | P0 Bugs Allowed | P1 Bugs Allowed | Verdict |
|------|-----------|-----------------|-----------------|---------|
| **Smoke** (daily) | 100% | 0 | 0 | GO / NO-GO |
| **Sprint** (pre-release) | >= 95% | 0 | Any | APPROVED / CONDITIONAL / BLOCKED |
| **Full Release** (major) | >= 95% | 0 | <= 3 | APPROVED / CONDITIONAL / BLOCKED |

**Verdict Definitions:**

| Verdict | Meaning | Action |
|---------|---------|--------|
| **APPROVED** | All gates pass | Safe to deploy |
| **CONDITIONAL** | Minor issues (P2/P3 only) | Deploy with tracked follow-ups |
| **BLOCKED** | P0/P1 failures or low pass rate | No deployment, regardless of schedule |

**Speaker notes:** BLOCKED means no deployment, period. These gates are enforced automatically by the regression-orchestrator and qa-lead-orchestrator agents. Schedule pressure does not override quality gates.

---

## Slide 13: CI/CD Pipeline

**Title:** Docker + GitHub Actions + Teams

```
  GitHub Actions (trigger)
        |
        v
  Docker Container (Playwright + Agent SDK)
        |
        v
  run-regression.ts (orchestrator)
        |
        v
  Claude Agent SDK --> Headless Chromium
        |                    |
        v                    v
  Budget tracking       Suite execution
  ($5 smoke / $80 full)  (parallel batches of 3)
        |
        v
  reports/regression/ci-YYYY-MM-DD/
        |
        v
  Teams Adaptive Card notification
```

**Schedule:**

| Trigger | When | Selection | Budget |
|---------|------|-----------|--------|
| Daily smoke | Mon-Fri 6:00 AM UTC | Suite 042 | $5 |
| Weekly full | Sunday 2:00 AM UTC | All 97 suites | $80 |
| Manual | Any time (workflow_dispatch) | Any selection | Custom |

**Features:**
- Budget management with per-suite allocation ($2 minimum floor)
- 90-day rolling history in `reports/regression/history.json`
- Artifacts uploaded with 30-day retention
- Teams webhook notifications with suite-by-suite breakdown

**Speaker notes:** CI mode uses a single headless Chromium (not the 3-browser pool). The orchestrator dispatches suites sequentially in batches, tracks budget globally, and sends a Teams notification with an Adaptive Card showing the full breakdown. Manual triggers allow any selection, any environment, any budget.

---

## Slide 14: Commands & Skills Ecosystem

**Title:** 16 Commands + 20 Skills

**Commands (action-oriented, execute immediately):**

| Command | Purpose |
|---------|---------|
| `/qa-smoke` | Daily GO/NO-GO smoke test (~15 min) |
| `/qa-test VCST-XXXX` | Test a JIRA ticket, feature, or PR |
| `/qa-regression [scope]` | Run regression suites in parallel (plan-driven `sprint`) |
| `/qa-status` | Dashboard: run status, JIRA queue, env health (auto-invocable) |
| `/qa-bug [description]` | Reproduce, document, file bug to JIRA |
| `/qa-exploratory [area]` | Guided exploratory testing session |
| `/qa-env-check` | Validate environment health (auto-invocable) |
| `/qa-design [target]` | Dual Storybook + Storefront BL-UI audit |
| `/qa-test-lifecycle [scope]` | Unified pipeline: sync stale → analyze gaps → generate → review → fix → approve |
| `/qa-test-plan [sprint]` | Build sprint test plan from JIRA + merged PRs |
| `/qa-verify-fix VCST-XXXX` | Verify a bug fix and transition JIRA |
| `/qa-sync-tests` | _Deprecated_ — redirects to `/qa-test-lifecycle` |
| `/qa-seed-data [profile]` | Seed test data via Postman MCP / teardown AGENT-TEST-* entities |
| `/ba-analyze [scope]` | Business analysis coordination |
| `/ba-stories [feature]` | Generate BDD user stories |

**Skills (methodology libraries, 3 categories):**

| Category | Count | Skills |
|----------|-------|--------|
| **vc-knowledge** | 1 | /vc-docs (auto-invocable) |
| **testing** | 10 | /qa-storybook, /qa-accessibility, /qa-design, /qa-plan, /qa-checklist, /qa-api, /qa-postman, /qa-coverage-gap, /qa-seed-data, /qa-review-tests |
| **qa-methodology** | 9 | /qa-process, /qa-investigate, /qa-evidence, /qa-defect, /qa-test-design, /qa-test-cases-generator, /qa-risk, /qa-metrics, /qa-sbtm |

**Speaker notes:** Commands trigger agent workflows. Skills inject methodology knowledge. For example, `/qa-test VCST-1234` triggers the lead orchestrator to analyze the ticket and dispatch specialists. `/qa-checklist checkout` loads the checkout domain checklist (158 items across 18 domains) to guide test case writing.

---

## Slide 15: Knowledge Sharing Layer

**Title:** 23 Shared Knowledge Files

All QA agents consult shared reference files in `.claude/agents/knowledge/`:

| File | Content | Used By |
|------|---------|---------|
| **business-logic.md** | Testable business invariants with BL-* IDs (pricing, cart, checkout, auth, orders) | All QA agents |
| **platform-patterns.md** | Storefront, admin SPA, API implementation patterns | frontend, backend, testing |
| **browser-quirks.md** | Chrome/Firefox/Edge behavioral differences and workarounds | frontend, testing |
| **debugging-signals.md** | Console error patterns, network failure signals, HAR interpretation | frontend, backend, testing |
| **performance-thresholds.md** | LCP, CLS, API latency targets, Core Web Vitals | frontend, testing |
| **catalog.md** | B2B catalog structure, product types, xCatalog GraphQL | frontend, backend |
| **store-settings.md** | Multi-currency, feature flags, payment processor config | frontend, backend |
| **white-labeling.md** | Branding overrides, themes, custom domains | frontend, ui-ux |
| **e-commerce-edge-cases-library.md** | 13 generic + 7 VC-specific edge case categories (ECL-* IDs with BL-* cross-references) | All QA agents |
| **module-suite-map.md** | Module-to-suite mapping: which suites cover which VC modules | lead, test-mgmt, regression |
| **sitemap.md** | Full storefront sitemap (May 2026) — all routes and page hierarchy | frontend, testing |
| **products.md** | Product types, xAPI fields, configurable sections, test data | frontend, backend |
| **api-auth.md** | Platform API OAuth2 authentication (token endpoint, headers) | backend, testing |
| **graphql-schema.md** | xAPI GraphQL schema reference (live introspection) | backend, test-mgmt |
| **graphql-test-cases-runner.md** | Canonical authoring contract for runner-native GraphQL CSV cases | backend, test-mgmt, test-runner |
| **graphiql-interaction.md** | CodeMirror GraphiQL UI interaction guide | backend, testing |
| **order-creation-matrix.md** | Order creation flow matrix for payment/shipping combos | backend, testing |
| **live-discovery.md** | Decision tree for runtime test data (vs `@td()`/random) | All QA agents |
| **test-runner-tags.md** | Shared CSV column/step/assertion tag reference | test-runner, autonomous |
| **test-execution-preflight.md** | Pre-flight checks before suite execution | regression, test-runner |
| **critical-ui-scope.md** | 7 components × 8 pages matrix enforced by layout-stability suite | frontend, ui-ux |
| **storefront-config-flags.md** | `$cfg.*` flag inventory snapshot | frontend, testing |
| **storefront-selectors.md** | Canonical selectors for vc-frontend components | frontend, testing |

**Speaker notes:** Business-logic.md is the most important file — it contains testable invariants like "discount stacking must never exceed 100%" (BL-PRICE-001) or "order cancellation must reverse inventory" (BL-ORD-002). Every QA agent consults this file to know what constitutes a real bug vs. expected behavior.

---

## Slide 16: Skill Dependency Graph

**Title:** How Methodology Skills Connect

```
  qa-process (ISTQB 7-phase lifecycle) ---- umbrella
       |
       +-- qa-test-design (EP, BVA, decision tables, state transitions)
       |       |
       |       +-- qa-plan (test suite composition from 105 E2E scenarios)
       |       +-- qa-checklist (18 domain checklists, 158 items)
       |
       +-- qa-risk (5x5 risk matrix, severity/priority, test depth)
       |       |
       |       +-- qa-sbtm (session-based exploratory testing, CRISP/SFDPOT)
       |
       +-- qa-investigate (5-phase bug investigation)
       |       |
       |       +-- qa-defect (JIRA bug workflow, 16 statuses, triage)
       |               |
       |               +-- qa-metrics (defect density, DRE, escape rate)
       |
       +-- qa-evidence (capture policy, output paths, sign-off templates)

  Continuous loop: investigate -> defect -> risk -> sbtm -> metrics
```

**Speaker notes:** Skills are not isolated — they form a dependency graph. The process skill is the umbrella (ISTQB lifecycle). Test design feeds into planning and checklists. Risk assessment drives exploratory testing priorities. Bug investigation feeds into defect management which feeds into metrics. This creates a continuous learning loop.

---

## Slide 17: Agent Routing — Skills vs Knowledge

**Title:** How Agents Know What to Load and When

```
                    AGENT PROMPT (e.g., test-management-specialist.md)
                    ┌───────────────────────────────────────────────┐
                    │                                               │
  ALWAYS LOADED     │  > Reference: business-logic.md      ←──── Mechanism 1
  (hardcoded)       │  > Reference: e2e-scenario-catalog.md        │  Hardcoded
                    │  > Reference: domain-checklists.md           │  References
                    │  + 13 more long-term reference files         │
                    │                                               │
  ON-DEMAND         │  | Situation         | Skill → File |  ←──── Mechanism 2
  (conditional)     │  | Writing cases     | /qa-plan     |        │  Conditional
                    │  | Coverage check    | /qa-checklist |        │  Routing Table
                    │  | Risk assessment   | /qa-risk     |        │
                    │  | ISTQB lifecycle   | /qa-process  |        │
                    │  | 9 more rows...    | ...          |        │
                    └───────────────────────────────────────────────┘

  AUTO-INVOCABLE    /vc-docs                                      ←── Mechanism 3
  (1 skill)         Claude calls this automatically when needed        No gate

  SYSTEM GUIDE      .claude/ROUTING.md                            ←── Mechanism 4
                    Decision tree: "I want to..." → use this          For humans
                                                                      and agents

  FORMAL MAP        Agent → Skill Map in skills/README.md         ←── Mechanism 5
                    Explicit binding per agent role                    Cross-reference
```

| Mechanism | Type | Example |
|-----------|------|---------|
| **1. Hardcoded refs** | Always loaded | `test-management-specialist` loads `business-logic.md` + 15 reference files at every startup |
| **2. Conditional table** | On-demand | "Writing test cases?" → load `/qa-plan` → `e2e-scenario-catalog.md` |
| **3. Auto-invocable** | Automatic | Agent hits unknown VC concept → Claude auto-calls `/vc-docs` → gets documentation |
| **4. ROUTING.md** | System guide | "I want a checklist" → use `/qa-checklist` (Skill) |
| **5. Agent→Skill Map** | Cross-reference | `test-management-specialist` → qa-plan, qa-checklist, qa-evidence, qa-test-design, qa-risk, qa-process |

**Key insight:** Knowledge files = memory (always available). Skills = reference books (loaded when needed).

**Speaker notes:** This is the glue that makes 20 skills and 23 knowledge files work together without chaos. Agents don't guess — each agent prompt has hardcoded references (always loaded) and a conditional routing table (loaded on-demand by situation). One VC knowledge skill (/vc-docs via Context7) is auto-invocable — Claude calls it without explicit instruction. The vc-module, vc-api, and vc-frontend skills were retired; their content moved into the shared knowledge files (sitemap.md, products.md, module-suite-map.md) and the qa-api testing skill. The ROUTING.md file serves as a system-level decision tree for both humans and agents. The test-management-specialist is the best example: it has 16 hardcoded reference files and a 13-row conditional skill table — more than any other agent, because test planning touches every methodology.

---

## Slide 18: A Smoke Test in Action

**Title:** End-to-End: `/qa-smoke`

```
  Step 1: User types /qa-smoke in IDE
            |
  Step 2: qa-lead-orchestrator reads config/test-suites.json (Suite 01)
            |
  Step 3: Generates run ID: SMOKE-2026-03-05-0900
            |
  Step 4: Dispatches TWO parallel tracks:
            |
     +------+------+
     |             |
  Track A       Track B
  qa-frontend   qa-backend
  -expert       -expert
  (chrome)      (edge)
  12 P0 tests   Admin health
     |             |
  Step 5: Both tracks execute tests through real browsers
            |
  Step 6: Orchestrator collects results, applies verdict rules:
          - All pass + admin healthy = GO
          - Checkout fails = NO-GO
          - 3+ failures = NO-GO
            |
  Step 7: Writes smoke-report.md, delivers verdict:
          "GO -- Safe to deploy"
```

**Time:** ~15 minutes from invocation to verdict.

**Speaker notes:** This is the daily ritual. One command, two parallel agents, a consolidated verdict. No manual coordination. The lead orchestrator handles everything — scope analysis, agent dispatch, result collection, and final decision.

---

## Slide 19: Benefits & Results

**Title:** What Agentic QA Delivers

| Benefit | Detail |
|---------|--------|
| **No coding expertise needed** | Tests are plain English prompts, not Playwright scripts |
| **Self-healing** | Agents adapt to UI changes — no broken selectors |
| **Parallel execution** | 3 concurrent browser agents reduce wall-clock time |
| **Full JIRA integration** | Read tickets, file bugs, transition status — all from IDE |
| **Quality gates enforced** | Automated at smoke/sprint/release levels |
| **CI automation** | Daily smoke + weekly full regression on schedule |
| **Budget controlled** | Per-suite allocation, $5-$80 per run depending on scope |
| **Methodology built-in** | 20 skills encode ISTQB, SBTM, WCAG, risk-based testing |
| **Evidence-driven** | HAR files, screenshots, console logs captured automatically |
| **Modular architecture** | Adding a suite = adding a CSV file + manifest entry |

**Speaker notes:** The biggest wins are self-healing (no maintenance when UI changes) and the elimination of coding expertise as a barrier. QA engineers write prompts, not code. The system scales by adding CSV suites, not by writing more automation scripts.

---

## Slide 20: Future Roadmap

**Title:** What's Next

| Initiative | Description |
|------------|-------------|
| **Multi-browser CI** | Extend CI from single headless Chromium to 3-browser pool |
| **Visual regression baselines** | Persistent Storybook component snapshots for automated comparison |
| **BrowserStack integration** | Cloud-based mobile device testing (iOS Safari, Android Chrome) |
| **AI-generated test cases** | ✓ Shipped — `/qa-test-cases-generator` derives enriched CSV test cases from JIRA tickets, features, checklists, or legacy suites |
| **Sprint coverage reports** | Automated mapping of code changes to affected test suites |
| **Self-updating suites** | Regression suites that evolve based on code change analysis |

**Speaker notes:** The current system is a strong foundation. The roadmap focuses on expanding coverage (mobile, multi-browser CI), reducing manual effort (AI-generated tests, self-updating suites), and improving feedback loops (sprint coverage reports).

---

*Updated: 2026-05-20 | Repository: vc-mcp-testing-module*
