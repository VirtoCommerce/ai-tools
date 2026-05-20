# Speaker Notes — Agentic QA: AI-Driven Testing v2 (EN)

Presentation: `agentic-qa-v2.html` · 22 slides · ~22 minutes
Style: conversational, confident, technically precise. Lead with the "so what", back it up with specifics.

---

## Slide 1 — Title

Welcome everyone. Today I want to show you something that changes how we think about QA engineering.

This is our **Agentic QA system** — instead of writing Playwright scripts, we write plain English prompts, and AI agents execute real tests in real browsers. 14 specialized agents, ~3,000 test cases, zero code required.

Five key characteristics are visible right on the screen: 14 AI agents, 97 test suites, 3 parallel browsers, CI/CD automation (planned), and self-healing. This is not a concept — it's running in production right now.

*[~45 sec]*

---

## Slide 2 — The Problem and the Solution

Let me show you the problem we solved. On the left — traditional Playwright automation: requires engineering skills, breaks on every CSS class rename, high maintenance cost, can't reason about business logic.

On the right — Agentic QA: natural language prompts, self-healing through contextual understanding, adding a suite = adding a CSV file, agents apply BL-* invariants to every test.

Look at the code comparison at the bottom: 140 lines of fragile script vs. 3 lines of natural language that do the same thing. This is not just an improvement — it's a different paradigm. When `.submit-btn-v2` gets renamed tomorrow, the traditional test breaks. The agentic test simply finds the button by context — search priority: `data-testid` → ARIA labels → visible text → position.

*[~55 sec]*

---

## Slide 3 — Project Overview

The system tests the Virto Commerce B2B e-commerce platform — storefront, admin SPA, REST API, GraphQL, checkout, payments, B2B multi-org, and accessibility.

Three words describe its essence: **AI-Native** (tests are prompts, not code — the LLM reasons about what to click and what to verify), **Modular** (97 CSV suites, 14 agents, 20 skills — each can be improved independently), **CI-integrated** (GitHub Actions runs everything on schedule with Teams notifications — planned).

The number to remember: **~3,000 test cases** in 97 suites — ~1,500 frontend scenarios and ~1,500 backend scenarios. Maintaining this manually is impossible. With our system — virtually zero maintenance.

*[~50 sec]*

---

## Slide 4 — Architecture

Now that you've seen what and why, let me show you how it works. Three testing modes, one shared foundation.

**Interactive mode**: engineer types a command in the IDE → Claude Code CLI → 14 agents → 10 MCP servers → 3 real browsers. Best for sprint testing, debugging, testing specific tickets.

**Agent Teams mode**: fully autonomous — `autonomous-orchestrator` creates a team via TeamCreate API, manages a token bucket (3 browser slots + 1 reporter), applies exponential backoff on failures, automatically creates JIRA tickets for bugs.

**CI pipeline** (planned): Docker container → Claude Agent SDK → Headless Chromium → Teams notification. Triggered on a GitHub Actions schedule with no human involvement.

The key point at the bottom: all three modes read from the **same** `test-suites.json`, CSV suites, agent definitions, and knowledge files. One set of tests — three ways to run them.

*[~65 sec]*

---

## Slide 5 — By the Numbers

Here's the scale. **14 agents** in two teams (10 QA + 4 BA). **97 suites**, ~3,000 cases (~1,500 frontend + ~1,500 backend). **10 MCP servers** that give agents eyes, hands, and memory.

Below — two important blocks. The intelligence layer: **20 skills** with methodology — ISTQB, WCAG, SBTM, risk-based testing, plus **23 knowledge files** that agents consult collectively, including BL-* business rules.

Coverage groups: **smoke** — ~140 tests (2 suites) before deployment, **critical** — ~230 P0 tests (5 suites), **sprint** — plan-driven (~2,700 tests), **full** — all ~3,000 cases. Choose the right level with a single command.

*[~45 sec]*

---

## Slide 6 — Agent Teams

Here's who actually does the work. 14 agents across four layers.

**Orchestrators**: three agents coordinate, plan, and route work. `qa-lead-orchestrator` reads JIRA tickets, makes GO/NO-GO decisions. `regression-orchestrator` runs parallel suites with a browser pool. `autonomous-orchestrator` manages Agent Teams mode with a 3+1 token bucket.

**Execution Specialists**: four **Opus-powered** agents with deep browser reasoning. Notice the browsers — each agent gets its own isolated browser. `qa-frontend-expert` — Chrome, `qa-backend-expert` — Edge, `qa-testing-expert` — Firefox, `ui-ux-expert` — Chrome DevTools.

At the bottom: **4 BA agents** for business analysis without browser access, and **test-management-specialist** for test plans, RTM, and coverage matrix.

*[~70 sec]*

---

## Slide 7 — Commands

Sixteen commands — the entire interface for the full QA lifecycle. Type a command in the terminal — the system does the rest.

**Top row**: `/qa-smoke` — 12 P0 tests, two parallel tracks, GO/NO-GO verdict in 15 minutes. `/qa-test VCST-XXXX` — reads the JIRA ticket, dispatches the right specialists, files bugs with evidence, transitions the ticket status. `/qa-regression sprint` — plan-driven run (~88 suites, ~2,700 tests) in batches of 3.

**Bottom row**: `/qa-bug` — reproduces, collects HAR and screenshots, files JIRA with P0–P3 severity. `/qa-status` and `/qa-env-check` — **auto-invocable**, triggered when you open the project. You always have an up-to-date picture of environment health without explicitly asking.

*[~65 sec]*

---

## Slide 8 — Pipeline & Quality Commands

Three commands that round out the QA cycle — the next slide gives them their own spotlight because they're newer and each does something the first six don't.

**`/qa-test-lifecycle`** is the unified pipeline command. Point it at a suite ID, a domain, a JIRA ticket, a PR number, a module name, or a raw git diff — it scopes the work, syncs stale Steps and Assertions, analyses coverage gaps, generates the missing cases, runs the 7-dimension quality review, fixes what it can, verifies the result, and only then approves. This is what keeps the ~3,000-case suite from rotting as code changes underneath it.

**`/qa-design`** runs a dual audit — first against Storybook in isolation, then against the live storefront in integration. The split catches two distinct bug classes that single-surface audits miss: bugs that only appear when a component is rendered in isolation (wrong default props, missing slot fallbacks), and bugs that only appear when it's wired into a real page (state collisions, layout shifts under real data). Scope is matrix-driven from the critical-UI scope file, with a heuristic fallback for off-matrix targets.

**`/qa-verify-fix VCST-XXXX`** closes the JIRA loop. It fetches the ticket, reproduces the original steps-to-reproduce, confirms the fix actually works, runs the relevant regression checks to make sure nothing else broke, and transitions the ticket. Used after a developer marks a fix as ready — no human re-execution needed.

Together these three turn the QA system from "runs tests on demand" into "keeps the entire test asset and bug pipeline in sync with the codebase automatically."

*[~70 sec]*

---

## Slide 9 — 10 MCP Servers

MCP — Model Context Protocol — is what transforms Claude from a text generator into a testing agent. Without MCP, it can only describe what to do. With MCP — it opens real browsers, clicks real buttons, compares Figma designs, queries Azure, and exports HAR files.

At the top of the slide is the full flow: engineer types a command → Claude reasons and plans → 10 MCP servers provide tool access → 3 browsers in parallel → reports, screenshots, HAR, JIRA.

Four categories below: **Browser Automation** — Chrome, Firefox, Edge plus DevTools for tracing. **Design Comparison** — Figma MCP for pixel-diff. **API & Code** — Postman + GitHub. **Cloud & Docs** — Azure App Insights + Context7 for documentation.

*[~60 sec]*

---

## Slide 10 — Business Rules & Edge Cases

Two mechanisms that make the system truly intelligent.

**BL-* Business Invariants** (left): all agents share `business-logic.md`. BL-PRICE-001: discounts can't exceed 100%. BL-CART-004: out-of-stock items can't be purchased. BL-AUTH-002: unauthenticated users are redirected to login. When an agent detects a violation, it doesn't just fail the test — it explains: "BL-PRICE-001 violated — coupon reduced the price below $0."

**ECL-* Edge Case Library** (right): 13 generic + 7 VC-specific patterns cross-referenced to BL-*. Every generated test case cites both BL-* and ECL-*.

Bottom right — the flow: JIRA ticket → auto-detect BL-* + ECL-* → test cases with cited rules.

*[~60 sec]*

---

## Slide 11 — Parallel Regression

Four keywords: **smoke, critical, sprint, full**. Selection groups for every scenario. Smoke — 2 suites (~140 tests) before every deployment. Critical — 5 P0 suites (~230 tests) before any release. Sprint — plan-driven (~88 suites, ~2,700 tests) before a sprint release. Full — all 97 (~3,000 tests) before production.

At the top of the slide — the browser pool visualization: three Chrome/Firefox/Edge lanes executing suites simultaneously. The orchestrator sorts P0 suites first — if something critical is broken, you know immediately rather than waiting for 30 other suites.

Quality gates (right) are automatic:
- **APPROVED** — ≥95% pass rate, 0 P0 bugs — safe to deploy
- **CONDITIONAL** — P2/P3 only — deploy with tracked follow-ups
- **BLOCKED** — P0/P1 failure — **no deployment, regardless of schedule**

On failure — retry up to 2 times with fallback chain: chrome → firefox → edge.

*[~60 sec]*

---

## Slide 12 — CI/CD Automation (Planned)

Note — this pipeline is in the planning stage. The architecture is already designed.

GitHub Actions will run daily smoke Monday through Friday at 6:00 AM UTC ($5 budget, Suite 042), full regression every Sunday at 2:00 AM UTC ($80 budget, all 97 suites). Manual trigger available for any scope, any environment via `workflow_dispatch`.

Left — pipeline visualization: Docker ensures a clean reproducible environment → Claude Agent SDK manages orchestration → Headless Chromium executes tests → reports to `reports/regression/ci-YYYY-MM-DD/` → Adaptive Card to Teams.

Right — key features: budget control, 90-day rolling history, 30-day artifact retention. One-line command to run: `docker run --env-file .env -e SUITE_SELECTION=critical vc-regression`.

*[~55 sec]*

---

## Slide 13 — Knowledge Base + Skills

Each agent is smart partly because of the shared knowledge base. On the left — **23 files**: business rules (BL-*), edge case library (ECL-*), platform patterns, sitemap, performance thresholds, GraphQL schema + runner authoring contract, live-discovery decision tree. Update one file — all 14 agents instantly learn the new rule.

On the right — **20 skills** in three categories. `testing/` — 10 skills for working with browsers and tools: Storybook, Accessibility, Design review, Test plans, Checklists, API testing, Postman authoring, Coverage gap, Seed data, Test-case review. `qa-methodology/` — 9 process skills: ISTQB, SBTM, risk matrix, metrics, test design, test-case generator. `vc-knowledge/` — 1 skill `/vc-docs`, auto-invoked via Context7 for unfamiliar concepts.

Important point: this is institutional knowledge that doesn't leave when an employee does. New team member? From day one they have access to the same methodology.

*[~55 sec]*

---

## Slide 14 — GraphQL xAPI Schema + Runner-Native Tests

The next four slides zoom into specific knowledge files and their companion scripts — these are what give the agents the discipline to write tests that actually work against the live platform.

Start with GraphQL. **`graphql-schema.md`** is a snapshot of the live xAPI schema — all queries, mutations, input types, return types — taken from introspection. Every agent that writes or reviews a GraphQL query consults it first. Without this file, agents invent plausible-looking but non-existent field names; with it, they verify before they write.

**`graphql-test-cases-runner.md`** is the canonical authoring contract for runner-native GraphQL CSV cases. It defines the full tag grammar: Steps are `[AUTH]`, `[GQL-OP]`, `[GQL-VARS]`, `[GQL-EXEC]`, `[GQL-CAPTURE]` — plus REST counterparts. Assertions are `[ERRORS]`, `[DATA]`, `[NULL]`, `[COUNT]`, `[VAR]`. Predicates support `getByPath` filter syntax, arithmetic, cross-path matching, OR-AND combinations. There's a worked example and an authoring checklist at the end.

**`scripts/graphql-runner.ts`** is the canonical runner. **Never write custom JavaScript to execute these CSV cases.** The runner does schema validation, variable substitution, `@td()` resolution, evidence capture. Invoke it with `npx tsx scripts/graphql-runner.ts --case <csv>:<ID>`.

Gold-standard reference suite: `050i-graphql-configurations.csv` — when you're authoring new GraphQL tests, copy that pattern.

*[~70 sec]*

---

## Slide 15 — Live Test-Data Discovery — No Hardcoded IDs

This solves a problem we hit repeatedly: catalogs get reseeded, B2B orgs get re-created, virtual-catalog roots migrate. Tests that hardcode an entity ID rot — they silently fail or skip.

**`live-discovery.md`** is the decision tree: when do you use `{{VAR}}` from `.env` (environmental things — URLs, credentials), when `@td()` from the alias registry (named entities you assert by name — "the canonical Skyflow card"), when `live-discover` (any entity that might drift — "first available product, assert shape not value"), when `random-data` (unique inputs you never assert on — registration emails, comments).

Two scripts back this up. **`scripts/lib/live-discover.ts`** provides typed xAPI primitives — catalog root, products by filter, addresses, cart state, active coupons. It returns a real entity from the current environment, never a hardcoded ID.

**`scripts/lib/random-data.ts`** is zero-dep — generates emails, org names, SKUs, quantities, comments. The defaults prefix everything with `AGENT-TEST-{date}` so `/qa-seed-data teardown` sweeps it safely without touching real data.

The anti-pattern is hardcoding a product GUID or SKU in a CSV's `Test_Data` column. A literal that isn't `{{VAR}}` or `@td()` is an automatic review failure under Dimension 6 — Data Validity.

*[~65 sec]*

---

## Slide 16 — Test Runner Tags + @td() Resolver

This slide explains how a CSV row becomes an executable test case.

**`test-runner-tags.md`** is the shared tag reference — used by both `test-runner-agent` (standard parallel regression) and `autonomous-test-runner` (Agent Teams mode). Three tag categories: **Step tags** — `[NAV]` to navigate, `[ACT]` to interact, `[WAIT]` for explicit waits, `[LOGIN]` for auth, `[SETUP]` for fixtures. **Assertion tags** — `[DOM]` for element checks, `[STATE]` for app state, `[MATH]` for arithmetic, `[API]` for network response checks, `[CONSOLE]` for console-error checks. **Cross-layer** — `[HAR]`, `[SCREEN]`, `[PERF]` for evidence capture.

The **`@td(ALIAS.field)` resolver** is the second half. Test data is resolved at runtime, never hardcoded. The resolver reads `test-data/aliases.json` — the registry — and looks up the matching CSV row in `test-data/`. When the catalog reseeds and a product GUID changes, you update the alias once in the CSV; every consumer follows automatically.

Three files matter: `scripts/lib/test-data-resolver.ts` (the resolver), `test-data/aliases.json` (the registry), and the CSV rows in `test-data/`.

Validation runs as `npx tsx scripts/validate-td-refs.ts` — it verifies every `@td()` reference in the repo actually resolves. The GraphQL runner rejects unresolved tokens at lint time too.

*[~65 sec]*

---

## Slide 17 — Critical UI Scope — Regression-Enforced Component Checklist

This is the file you opened in the IDE. It's our defense against the most insidious class of UI bugs — the ones that only appear on specific component-page combinations.

**`critical-ui-scope.md`** is a 7×8 matrix. Seven components down the side: **VcButton, VcProductCard, VcLineItem, VcTable, VcDialog, Popover, VcSidebar**. Eight pages across the top: **`/`, `/catalog`, PDP, `/cart`, `/account/orders`, `/account/lists`, `/company/members`, `/company/info`**. Each cell lists the applicable BL-UI invariants — focus-ring visibility, hover state, disabled state, loading skeleton, layout stability under data, empty state, error state, keyboard navigation. Invariants run `BL-UI-001` through `BL-UI-010`.

**`scripts/lib/measure-layout.ts`** is the layout-measurement helper used by these BL-UI tests — it measures component dimensions, position deltas before/after data load, CLS contributions. Without this helper, layout-stability checks would be vibes-based; with it, they're numeric.

The single suite that exclusively covers the matrix is **`048b-layout-stability.csv`**, selection name `layout-stability`. If you want to know whether a component layout regressed across all 8 pages, you run this suite.

Enforcement: **`npm run scope:validate`** exits non-zero in CI if any cell in the matrix points at a missing test ID. That's the mechanism that keeps the matrix and the test suite from drifting apart silently.

*[~70 sec]*

---

## Slide 18 — Test Case Generation

This is one of the most powerful features: `/qa-test-cases-generator` creates test cases automatically from a JIRA ticket, BDD scenario, domain checklist, or legacy TestRail suite.

At the top — the flow: JIRA ticket → parse acceptance criteria + detect layers → generate cases with BL-* and ECL-* references → route to the appropriate agent.

Left — five input formats: `VCST-XXXX`, `domain`, `suite NN`, `from-checklist`, `from-bdd`. Right — what every case includes: **BL-* reference** to a business invariant, **ECL-* pattern** for an edge case, typed step tags (`[NAV]`, `[ACT]`, `[WAIT]`), assertion tags (`[DOM]`, `[STATE]`, `[MATH]`), and at least 2 failure signals. Generate once — cases are ready for agent execution without modification.

*[~60 sec]*

---

## Slide 19 — Test Data Generation

Before running tests, you need data. `/qa-seed-data` creates a complete test environment via Postman MCP — catalogs, products, pricing, B2B organizations, users — in one command.

At the top — the flow: pick a profile → Postman MCP builds and runs a collection → test data with AGENT-TEST-* prefix → run tests → safe teardown.

Six profiles in the table: **minimal** — 1 product for smoke, **catalog** — 3-level tree + 5 products + multi-currency, **b2b** — organization with 3 roles, **pricing** — two price lists with tiered prices, **full** — everything combined, **teardown** — deletes only AGENT-TEST-* entities.

Safety rule: all entities are created with the `AGENT-TEST-{date}` prefix. Teardown only deletes entities with that name — production data is never touched.

*[~55 sec]*

---

## Slide 20 — End-to-End Flow: /qa-test

Let me walk you through what actually happens when you type `/qa-test VCST-XXXX`.

Five steps on the timeline:

**Step 1** — read the JIRA ticket via Atlassian MCP: title, description, acceptance criteria, determine scope — storefront, admin, or API.

**Step 2** — dispatch specialists: qa-frontend-expert (Chrome) takes storefront ACs, qa-backend-expert (Edge) — API and admin ACs. They run in parallel.

**Step 3** — execution: navigate to the feature, verify each AC through a real browser, screenshots + HAR + console.

**Step 4** — if anything fails: bug report with P0–P3 severity, screenshots, HAR, BL-* rule reference, auto-created in JIRA.

**Step 5** — all ACs pass → ticket transitions to "Testing Complete" with evidence linked. Bugs found → release blocked.

*[~65 sec]*

---

## Slide 21 — Benefits

Six strong sides, three of them especially important.

**Zero maintenance** — UI changes don't break tests. Self-healing means the QA team isn't woken up at 2 AM every time someone refactors a button. Time that used to go into maintaining brittle selectors now goes into writing more coverage.

**Business awareness** — agents don't just detect failures, they explain them in business terms. "BL-PRICE-001 violated" tells the developer where to look. "AssertionError at line 47" tells them nothing.

**No coding required** — the QA discipline is open to the whole team. Product managers can add acceptance tests, designers can add visual regression cases, junior QAs can write 50 test cases in a single day. Zero entry barrier.

The three numbers at the bottom speak for themselves: **~0** selector maintenance incidents per sprint, **15 minutes** from command to verdict, **1 CSV row** — the cost of adding a new test case.

*[~60 sec]*

---

## Slide 22 — Roadmap

Two items already shipped and in daily use: **AI test case generator** (`/qa-test-cases-generator`) and **Agent Teams mode** — both running in production right now.

**Q2 2026** — three directions: multi-browser CI (expanding from single headless Chromium to Chrome + Firefox + Edge), visual regression baselines (persistent snapshots of all 55 Storybook components with pixel-diff against Figma), sprint coverage reports (automatic mapping: which PR changes affect which suites, auto-select regression scope).

**Q3 2026**: mobile testing via BrowserStack (iOS Safari iPhone 15 Pro, Android Chrome Samsung Galaxy S24 — critical for B2C checkout), self-updating suites (agent analyzes code changes, identifies gaps, proposes new test cases for team review).

**Future**: performance regression (Core Web Vitals baselines per release, LCP/CLS alerts), test impact analysis (ML prediction of which suites are most likely to fail), multi-tenant testing.

**Long-term vision**: a fully autonomous QA system. Continuous testing. Learns from failures. Updates its own test suite. Zero manual scripting.

Thank you — questions?

*[~65 sec]*

---

## Timing Guide

| Slides | Topic | Time |
|--------|-------|------|
| 1–3 | Title + Problem + Overview | ~2.5 min |
| 4–7 | Architecture + Numbers + Agents + Commands | ~4 min |
| 8 | Pipeline & Quality Commands | ~1 min |
| 9–10 | MCP + Business Rules/ECL-* | ~2 min |
| 11–12 | Regression + CI/CD | ~2 min |
| 13 | Knowledge + Skills (overview) | ~1 min |
| 14–17 | GraphQL · Live Discovery · Tags+@td() · Critical UI Scope | ~4.5 min |
| 18–19 | Case Generation + Test Data | ~2 min |
| 20–21 | End-to-End Flow + Benefits | ~2 min |
| 22 | Roadmap | ~1 min |
| **Total** | | **~22 min** |

*Trim slides 14–17 (the deep-dive on knowledge files + scripts) if running short — they're high-information for a technical audience but skippable for executives. Slide 8 (pipeline commands) can be shown briefly or expanded. Extend slide 6 (agents) or slide 20 (end-to-end flow) if you have extra time or Q&A.*

---

## Presentation Tips

**For a 10-minute lightning talk**: slides 1, 2, 5, 6, 8, 11, 21, 22. Skip slides 12–19.

**For a technical audience**: spend more time on slides 8 (lifecycle commands), 10 (BL-* + ECL-* rules), 14–17 (GraphQL runner, live discovery, tags+@td(), critical UI scope), and 18 (case generation). These are what produce the "wow" effect for developers.

**For management**: focus on slides 5 (numbers), 21 (benefits + three KPIs), and 22 (roadmap). Skip slides 10, 13–19.

**Before a live demo**: verify `.env` is configured, Chrome is closed (user data dir conflict), and run `/qa-env-check` before the presentation.
