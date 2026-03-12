# Speaker Notes — Agentic QA: AI-Driven Testing (EN)

Presentation: `agentic-qa-workflow.html` · 20 slides · ~20 minutes
Style: conversational, confident, technically precise. Lead with the "so what", back it up with specifics.

---

## Slide 1 — Title

Welcome everyone. Today I want to show you something that changes how we think about QA engineering.

This is our **Agentic QA system** — instead of writing Playwright scripts, we write plain English prompts, and AI agents execute real tests in real browsers. 14 specialized agents, ~1,546 test cases, zero code required.

The key shift here: QA engineers stop being script writers and start being test strategists. The AI handles the mechanics. We handle the thinking.

*[~45 sec]*

---

## Slide 2 — Agenda

We'll cover 13 topics in roughly 20 minutes. If you're here for a quick overview, pay most attention to slides 3–7. If you want to understand the operational details, slides 8–17 are where the depth is. The live demo at the end takes 20 more minutes — we'll decide together whether to run it.

A few navigation tips: press **S** to show or hide these speaker notes during the talk, **L** to switch the spinner label language between English and Russian, and arrow keys or spacebar to advance slides.

*[~30 sec]*

---

## Slide 3 — Why Agentic QA?

Let me show you the problem we solved. On the left — traditional Playwright automation. It's fragile. Every CSS class rename, every UI refactor breaks a selector. You end up with developers maintaining test infrastructure instead of shipping features.

On the right — Agentic QA. Instead of `await page.click('.submit-btn-v2')`, you write "click the Place Order button". The agent finds the button by context, not by selector. When the button's class changes tomorrow, the test still works.

Look at the code comparison. Multiple lines of fragile script vs. three lines of natural language that do the same thing. This is not a minor improvement — it's a different paradigm.

*[~55 sec]*

---

## Slide 4 — Agentic QA at a Glance

Let me give you the scale. **14 agents** in two teams. **36 test suites**, ~1,546 cases. **9 MCP servers** that give agents eyes and hands. **18 methodology skills** encoding ISTQB, WCAG, SBTM, and risk-based testing.

Two things I want to highlight: the budget model — daily smoke runs cost about **$5**, a full weekly regression **$80**. That's the entire cost of running comprehensive automated testing. And the CI schedule: smoke runs every weekday morning at 6 AM UTC, full regression every Sunday night.

*[~45 sec]*

---

## Slide 5 — Two Testing Modes, One Shared Foundation

Now that you have the numbers, let's talk about how the system actually works. There are two operating modes.

**Interactive mode** — what engineers use every day. You type a command in VS Code or Cursor. The agent stack (14 agents, 9 MCP servers, 3 browsers) springs into action. JIRA integration, Figma comparison, DevTools inspection — everything available.

**CI mode** — runs headless in Docker, triggered by GitHub Actions on a schedule. Single Chromium, Agent SDK orchestration, Teams notification at the end.

The key insight: both modes read from the same `config/test-suites.json`, same CSV suites, same agent definitions. One test suite format, two runtimes. You write a test case once and it runs in both.

*[~70 sec]*

---

## Slide 6 — 9 MCP Servers — Claude's "Hands and Eyes"

MCP — Model Context Protocol — is what transforms Claude from a text generator into a testing agent. Without MCP, it can only describe what to do. With MCP, it opens real browsers, clicks real buttons, exports real HAR files, and reads real JIRA tickets.

The 6 project-level servers are in `.mcp.json` — everyone on the team gets them automatically when they clone the repo. The 3 user-level servers (Chrome DevTools, Atlassian, Figma) need to be configured once per machine in IDE settings.

The practical impact: agents can diff a screenshot against a Figma design, query Azure App Insights for errors that appeared during a test, and run a Postman collection to seed test data — all in one uninterrupted test run.

*[~60 sec]*

---

## Slide 7 — 14 Specialized Agents — Two Teams

Here's who actually does the work. The QA team has 10 agents organized by function.

The three **Opus-powered** specialists — frontend-expert, backend-expert, testing-expert — do the actual testing. They use heavy reasoning to understand UI context, interpret API responses, and formulate bug reports. Sonnet handles everything that needs speed over depth: orchestration, planning, documentation.

The two **template agents** — autonomous-test-runner and test-runner-agent — are parameterized. They have no fixed identity. The orchestrator instantiates one per suite run, injects the suite CSV and browser assignment, and the agent executes. This is how we parallelize without duplicating agent definitions.

The **BA team** is separate — it reads code and produces business artifacts (stories, API docs, user flows) without needing browser access.

*[~70 sec]*

---

## Slide 8 — How Agents "Think" — Four Decision Layers

Every QA agent's prompt definition follows a consistent four-layer structure. This is what makes agents trustworthy rather than just capable.

**Layer 1 — Business Logic**: shared across all agents. `business-logic.md` is the single source of truth for what constitutes correct behavior. BL-PRICE-001 says discounts can't exceed 100%. BL-CART-004 says out-of-stock items can't be purchased. Every agent knows these rules.

**Layer 2 — Domain Knowledge**: agent-specific expertise. The frontend expert knows about Vue component patterns, the backend expert knows about REST conventions and GraphQL pagination.

**Layer 3 — Skill Set**: the technique layer — how to find what's broken. Selector strategy (data-testid first), evidence capture (HAR + console + screenshot), API test ordering (health check before business flows).

**Layer 4 — Design Decisions**: constraints and tools. Which browser, which MCP server, what's the turn budget. This is where isolation rules are enforced.

*[~60 sec]*

---

## Slide 9 — 3 Concurrent Browsers, Zero Interference

This is a hard constraint. If two agents share a browser session, one agent's navigation destroys the other's context — cookies reset, auth lost, cart cleared. Every agent gets its own isolated Playwright MCP server with separate cookies, storage, and viewport.

The three Playwright servers (chrome, firefox, edge) form the browser pool. The orchestrator tracks which slots are occupied and assigns the next available one when a suite is dispatched. If the primary slot is busy, it falls back through the chain.

One important Windows-specific rule: WebKit is not supported on Windows. Never attempt to install or use it — fall back to Edge immediately.

*[~45 sec]*

---

## Slide 10 — Lead Delegates, Never Executes

The lead orchestrator is a coordinator, not an executor. It reads the JIRA ticket, decides which specialists to dispatch based on what's changed, monitors their progress, and makes the final go/no-go call based on quality gates. It never touches a browser itself.

The five workflows cover the full QA lifecycle: new feature testing from a JIRA ticket, PR review from GitHub, module verification after an install, release testing via the regression orchestrator, and bug fix verification. Each workflow dispatches a different combination of specialists.

The important design decision here: concentration of authority without concentration of execution. One agent decides, multiple agents act in parallel.

*[~55 sec]*

---

## Slide 11 — 36 Suites, Parallel Batching, Quality Gates

Four selection keywords cover every scenario: **smoke** before every deployment, **critical** before any release, **sprint** before a sprint ship, **full** before production.

The pipeline sorts P0 suites first — if anything critical is broken, you know within the first batch rather than waiting for 30 more suites to finish. Suites run in batches of 3 to match the 3-browser pool. Failures retry up to twice with browser fallback before being marked as blocked.

The regression orchestrator writes a `run-ID/` directory with per-suite results, a `summary.json`, and a consolidated `regression-report.md` with the final verdict.

*[~60 sec]*

---

## Slide 12 — Non-Negotiable Thresholds

These gates are enforced automatically. No subjective decisions, no schedule pressure overrides.

The strictest gate is **smoke**: 100% pass rate, 0 P0 bugs, 0 P1 bugs. If the daily smoke fails, the day's deployment is blocked until it's fixed. This gate is intentionally strict because smoke tests only cover P0 revenue flows — if something in that set fails, there is no acceptable excuse to ship.

**BLOCKED** means no deployment, period. Even if the release is urgent. Even if it's Friday. Even if stakeholders are pushing. The gate exists precisely for those moments.

*[~45 sec]*

---

## Slide 13 — Docker + GitHub Actions + Teams

The CI pipeline is zero-touch once configured. Docker ensures reproducibility — the same container image runs in every environment. The Agent SDK orchestrates suites with the same logic as interactive mode, just without a human in the loop.

Budget management is explicit: each suite gets a minimum $2 allocation, the global budget is tracked per-run, and the orchestrator stops dispatching new suites if the budget is exhausted. This prevents a runaway regression from costing hundreds of dollars.

The Teams Adaptive Card notification is the final handoff to humans — it contains pass/fail counts, bugs found, suite-by-suite breakdown, and a link to the full report. Everything else is automated.

*[~55 sec]*

---

## Slide 14 — 10 Commands + 18 Skills

Commands and skills are two different abstractions. Commands **trigger workflows** — they dispatch agents, run tests, file bugs, and transition JIRA tickets. Skills **inject methodology** — they load structured reference material that guides how agents reason.

The most important commands for daily use: `/qa-smoke` before every deployment, `/qa-test VCST-XXXX` for feature testing, `/qa-regression sprint` before sprint releases.

Two commands are auto-invocable: `/qa-status` and `/qa-env-check`. They trigger themselves when you open the project — you always have a current picture of environment health without asking for it.

The 18 skills cover the full ISTQB testing lifecycle, divided into three categories. `testing/` skills operate browsers and tools. `qa-methodology/` skills encode processes and frameworks. `vc-knowledge/` has one skill — `/vc-docs` — that pulls live Virto Commerce documentation via Context7.

*[~65 sec]*

---

## Slide 15 — 12 Shared Knowledge Files

The knowledge layer is what makes agents consistent across the team. Every QA agent loads these 12 files as part of its context.

`business-logic.md` is the most critical — it contains testable invariants that define what "correct behavior" means. BL-PRICE-001: discount stacking must never exceed 100%. BL-ORD-002: order cancellation must reverse inventory. When an agent detects a violation, it cites the rule number in its report — which gives developers an exact starting point for investigation.

The four recently added files — `e-commerce-edge-cases-library.md`, `module-suite-map.md`, `sitemap.md`, and `products.md` — replace what used to be four separate skills (`/vc-module`, `/vc-api`, `/vc-frontend`). Moving this content into the knowledge layer means agents no longer need to invoke a skill to get basic platform information — it's always in context.

*[~55 sec]*

---

## Slide 16 — How Methodology Skills Connect

The 9 methodology skills are not independent — they form a dependency graph rooted at `qa-process` (the ISTQB 7-phase lifecycle umbrella).

The important pattern is the **continuous loop** at the bottom: investigate → defect → risk → SBTM → metrics and back. When an agent finds a bug, it follows the investigation skill to isolate root cause, the defect skill to file it correctly in JIRA, the risk skill to assess the impact on the test plan, and the metrics skill to update quality indicators. This loop runs automatically in the background of every test execution.

Test design and planning feed forward into checklist creation. Checklists feed into test case generation. Generation feeds into execution. Execution produces evidence. Evidence feeds metrics. Everything is connected.

*[~45 sec]*

---

## Slide 17 — How Agents Know What to Load and When

This is the glue that keeps 18 skills and 12 knowledge files from being chaos.

**Mechanism 1** — hardcoded references in the agent prompt. The `test-management-specialist` loads `business-logic.md` and 15 other files at every startup, regardless of what task it's doing. This is long-term memory.

**Mechanism 2** — the conditional routing table. Each agent prompt has a "situation → skill" table: "Writing test cases? Load `/qa-plan` and `e2e-scenario-catalog.md`." This is on-demand memory.

**Mechanism 3** — auto-invocable. `/vc-docs` is the only skill Claude calls without being asked. If it hits an unknown Virto Commerce concept during testing, it automatically calls `/vc-docs` to fetch current documentation from Context7. No gate, no prompt required.

**Mechanisms 4 and 5** — `ROUTING.md` and the agent→skill map in `skills/README.md` — serve as human-readable decision trees for both new team members and agents that need to orient themselves in an unfamiliar task.

*[~50 sec]*

---

## Slide 18 — End-to-End: `/qa-smoke`

Let me walk you through what actually happens when you type `/qa-smoke`.

The orchestrator reads Suite 01, generates a run ID, and dispatches two agents **simultaneously** — Track A (qa-frontend-expert, Chrome) runs 12 storefront smoke tests: sign in, browse catalog, add to cart, apply coupon, checkout. Track B (qa-backend-expert, Edge) runs admin health checks: modules active, APIs responding, GraphQL working.

Both tracks complete in ~15 minutes. The orchestrator collects results and applies verdict rules. If any checkout test fails — **NO-GO**, no exceptions. If the admin SPA won't load — **NO-GO**. If all 12 pass — **GO**, safe to deploy.

This is the daily ritual. One command, two parallel agents, a consolidated verdict. No manual coordination, no dashboard, no context switching.

*[~75 sec]*

---

## Slide 19 — What Agentic QA Delivers

The biggest wins are self-healing and the removal of coding expertise as a barrier.

**Self-healing** means the QA team is not woken up at 2 AM when a developer renames a CSS class. Tests adapt. The time that used to go into maintaining brittle selectors now goes into writing more test coverage.

**Business-aware failures** mean developers understand bugs without a QA walkthrough. "BL-PRICE-001 violated: coupon reduced order total below $0" is actionable. "AssertionError at line 47" is not.

**No coding required** means the QA discipline is open to everyone on the team — product managers can add acceptance tests, designers can add visual regression cases, junior QAs can add dozens of test cases in an afternoon without writing a single line of JavaScript.

*[~60 sec]*

---

## Slide 20 — What's Next

Two things already shipped and in daily use: **AI-generated test cases** (`/qa-test-cases-generator`) and **Agent Teams mode** (`autonomous-regression-orchestrator`).

The Q2 2026 priorities focus on breadth: multi-browser CI (Chrome + Firefox + Edge, not just headless Chromium), visual regression baselines for all 55 Storybook components, and sprint coverage reports that auto-select which test suites to run based on what code changed in the PR.

Q3 2026 adds depth: real-device mobile testing via BrowserStack (iOS Safari, Android Chrome), and self-updating suites that propose new test cases when code changes are detected.

The long-term vision: a system that tests continuously, learns from failures, and maintains its own test suite. Zero manual scripting. Real-time quality signals. The QA team focused entirely on judgment.

Thank you — questions?

*[~65 sec]*

---

## Timing Guide

| Slides | Topic | Time |
|--------|-------|------|
| 1–4 | Title + Agenda + Why + Numbers | ~3 min |
| 5–7 | Architecture + MCP + Agents | ~3.5 min |
| 8–10 | Decision Layers + Browsers + Delegation | ~2.5 min |
| 11–13 | Regression + Gates + CI | ~2.5 min |
| 14–17 | Commands + Knowledge + Skills + Routing | ~3.5 min |
| 18–20 | Live Flow + Benefits + Roadmap | ~3.5 min |
| **Total** | | **~19 min** |

*Trim slides 2 (Agenda), 9 (Browsers), or 16 (Methodology graph) if running short. Extend slides 7 (Agents), 14 (Commands), or 18 (Live flow) if you have extra time or Q&A.*
