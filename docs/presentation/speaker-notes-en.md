# Speaker Notes — Agentic QA: AI-Driven Testing v2 (EN)

Presentation: `agentic-qa-v2.html` · 19 slides · ~18 minutes
Style: conversational, confident, technically precise. Lead with the "so what", back it up with specifics.

Navigation: **←/→** or **Space** to advance · **S** to show/hide speaker notes panel · **L** to switch language between EN and RU.

---

## Slide 1 — Title

Welcome everyone. Today I want to show you something that changes how we think about QA engineering.

This is our **Agentic QA system** — instead of writing Playwright scripts, we write plain English prompts, and AI agents execute real tests in real browsers. 14 specialized agents, ~3,000 test cases, zero code required.

Five key characteristics are visible right on the screen: 14 AI agents, 97 test suites, 3 parallel browsers, CI/CD automation (on the roadmap), and self-healing. This is not a concept — it's running in QA right now.

*[~45 sec]*

---

## Slide 2 — Project Overview

The system tests the Virto Commerce B2B e-commerce platform — storefront, admin SPA, REST API, GraphQL, checkout, payments, B2B multi-org, GA4 tracking, WCAG, and Storybook components.

Three words describe its essence: **AI-Native** (tests are prompts, not code — the LLM reasons about what to click and what to verify), **Modular** (97 CSV suites, 14 agents, 20 skills, 23 knowledge files — each can be improved independently), and **CI Pipeline (planned)** (GitHub Actions runs everything on schedule with Teams notifications).

The number to remember: **~3,000 test cases** in 97 suites. Maintaining this manually is impossible. With our system — virtually zero maintenance.

*[~50 sec]*

---

## Slide 3 — Architecture: Three Testing Modes, One Foundation

Now that you've seen what and why, here's how it's built. Three testing modes share one foundation.

**Interactive mode**: engineer types a command in the IDE → Claude Code CLI → 14 agents → 10 MCP servers → 3 real browsers. Best for sprint testing, debugging, testing a specific ticket.

**Agent Teams mode**: fully autonomous — `autonomous-orchestrator` creates a team via TeamCreate API, manages a token bucket (3 browser slots + 1 reporter), applies exponential backoff on failures, and creates JIRA tickets for bugs automatically.

**CI Pipeline (planned)**: GitHub Actions, Docker container with the Claude Agent SDK, headless Chromium, and a Teams Adaptive Card notification when a run completes.

All three modes read the same `test-suites.json`, same CSV test cases, same agent definitions, same knowledge files. Improvement in one mode benefits all three.

*[~55 sec]*

---

## Slide 4 — System Scale: Agentic QA at a Glance

Some numbers to set scale. **14 specialized agents** in two teams — QA and BA. **97 test suites** with **~3,000 test cases** total, split roughly half frontend / half backend. **10 MCP integrations** covering browsers, design tools, ticketing, and clouds.

Coverage selectors give you the right slice for the moment. **Smoke** is ~140 tests — daily pre-deploy. **Critical** is ~230 P0 tests — pre-release gate. **Sprint** is plan-driven (~2,700 tests) — auto-reads `docs/Sprint plans/sprint-*-summary.json`. **Full** is everything for production releases.

Behind the scenes there's an intelligence layer: 20 methodology skills (ISTQB, WCAG, SBTM), 23 shared knowledge files, and BL-* business rule enforcement. None of this requires a developer to maintain.

*[~50 sec]*

---

## Slide 5 — Agent Teams: 14 Specialized Agents

The team has two sides: 10 QA agents and 4 BA agents.

**Three orchestrators** coordinate everything. `qa-lead-orchestrator` handles JIRA workflow, triages bugs, and makes go/no-go decisions. `regression-orchestrator` manages 97-suite parallel runs with retry and browser fallback. `autonomous-orchestrator` runs the Agent Teams API mode with the token bucket and exponential backoff.

**Four execution specialists** each own a dedicated browser. Frontend-expert on Chrome for storefront and checkout. Backend-expert on Edge for REST + GraphQL + Admin SPA. Testing-expert on Firefox for interactive testing and Figma comparison. UI-UX-expert on Chrome DevTools for Storybook and WCAG audits.

Plus **four BA agents** for system analysis, API specification, story writing, and documentation. Plus a **test-management specialist** for plans, RTM, and coverage matrices.

Each agent has its own browser context. They never collide on parallel runs.

*[~70 sec]*

---

## Slide 6 — 16 Slash Commands: Full QA Lifecycle

16 commands cover the entire QA lifecycle from inside the IDE.

**Three you'll use daily**: `/qa-smoke` runs 12 P0 tests in 2 parallel tracks and gives you a GO/NO-GO verdict in ~15 minutes. `/qa-test VCST-XXXX` reads a JIRA ticket, dispatches the right agents, executes all acceptance criteria, files bugs with evidence, and closes the ticket. `/qa-regression sprint` runs ~88 suites across 3 browsers in parallel — the sprint selection is plan-driven from JIRA.

**Three more for the loop**: `/qa-bug` reproduces a bug, captures HAR + screenshots, files JIRA with severity and root cause. `/qa-status` and `/qa-env-check` are read-only and auto-invocable — agents can call them without explicit permission.

The full list covers 16 commands. Type a slash, get the autocomplete menu. No scripts, no dashboards, no context switching.

*[~55 sec]*

---

## Slide 7 — Pipeline & Quality Commands

Three commands that round out the QA cycle.

`/qa-test-lifecycle` is the unified pipeline for keeping test cases in sync with code. Point it at a suite, domain, ticket, PR, module, or git diff — it runs scope → sync stale → analyze gaps → generate → review → fix → verify → approve. No more stale Steps after a PR.

`/qa-design` is unique because it's a **dual** audit — Storybook AND storefront together. This catches bugs that hide in one of the two contexts: a hover state that works in isolation but breaks in integration, or a button that's fine on a real page but broken in its story.

`/qa-verify-fix VCST-XXXX` closes the JIRA loop. Fetches the ticket, reproduces the original STR, confirms the fix, runs regression checks against the affected area, and transitions JIRA.

These three commands together mean tests stay in sync, design bugs get caught in both isolation and integration, and verified fixes ship while regressions stay caught.

*[~65 sec]*

---

## Slide 8 — Power Feature #1: Top 5 MCP Servers

MCP — Model Context Protocol — is the standard Claude uses to call external tools. These are the agent's hands, eyes, and memory.

**#1 Playwright trio** — three real browser drivers, Chrome / Firefox / Edge, isolated contexts, HAR capture, screenshots, full parallel execution. This is what makes the agents act like real users.

**#2 VirtoOZ** — and this is the headline change. VirtoOZ is our **primary Virto Commerce documentation source**. 12 topic-scoped retrieval tools cover PlatformUserGuide, PlatformDeveloperGuide, StorefrontUserGuide, StorefrontDeveloperGuide, BackendSourceCode, MarketplaceUserGuide, DeploymentGuide, B2BExperts. Before VirtoOZ, agents had to guess about VC internals. Now they read live, topic-scoped documentation via the `/vc-docs` skill before writing a test, filing a bug, or proposing a fix.

**#3 Atlassian** — JIRA + Confluence. Read tickets, file bugs with evidence, transition statuses, close the QA loop.

**#4 GitHub** — searches across `vc-module-*` repositories, reviews PRs, pulls source for cross-referencing behavior.

**#5 Postman** — REST and GraphQL collections, drives `/qa-seed-data` for test environment seeding.

Five more support roles below: Chrome DevTools for HAR and console, Figma for pixel-diff, Azure for App Insights logs, Context7 for third-party library docs, Microsoft Learn for Azure docs.

*[~85 sec]*

---

## Slide 9 — Power Feature #2: Business Rules & Edge Case Libraries

This is the difference between "passed/failed" and **understanding why**.

All 14 agents share one `business-logic.md` file with testable BL-* invariants — pricing must never go negative, discount stacking must never exceed 100%, out-of-stock items must not be purchasable, org users can't see other orgs' data. Each is a one-line rule with a unique ID.

When a test fails, the agent doesn't say "expected X, got Y". It says **"BL-PRICE-001 violated — applied coupon caused net price below $0"**. That's a different conversation with the developer.

Edge cases get their own ECL-* identifiers. **13 generic** e-commerce patterns plus **7 VC-specific** ones — expired credit card, zero-price product, last item reserved during checkout, concurrent cart modification, role boundary violations. Each is cross-referenced to BL-* invariants. Every generated test case cites both.

Update one rule, every agent enforces it on every future test. That's the leverage.

*[~70 sec]*

---

## Slide 10 — Power Feature #3: Parallel Regression with Quality Gates

How regression actually runs. Three browser slots simultaneously — Chrome, Firefox, Edge. Each runs its own isolated context with HAR capture. The orchestrator queues remaining suites and feeds them to slots as they free up.

Selection table on the right: smoke 2 suites / ~140 tests, critical 5 P0 suites / ~230 tests, sprint plan-driven ~88 suites / ~2,700 tests, full all 97 suites / ~3,000 tests.

Quality gate verdicts on the right are non-negotiable. **APPROVED**: ≥95% pass rate, zero P0 bugs, safe to deploy. **CONDITIONAL**: only P2/P3 issues, deploy with tracked follow-ups. **BLOCKED**: any P0/P1 failure — no deployment regardless of schedule.

When a suite fails, the retry chain falls back across browsers — chrome → firefox → edge — up to two retries. That's how we recover from flakes without manual intervention.

*[~60 sec]*

---

## Slide 11 — Power Feature #4: Top 4 Knowledge Files + VirtoOZ

The agent's shared brain. All 14 agents consult the same knowledge base. Update once — every agent benefits.

**business-logic.md** — testable BL-* invariants across 15+ domains. Cited in every test report. Already covered.

**graphql-schema.md + runner doc** — a live introspection snapshot of the xAPI GraphQL schema plus the canonical authoring contract for runner-native CSV cases. Every GraphQL query consults the schema first to avoid invented field names. We'll dig into the runner in two slides.

**live-discovery.md** — the decision tree for runtime test-data resolution. When to use `{{VAR}}` vs `@td()` vs `live-discover` vs `random-data`. This file is the reason our tests survive catalog reseeds and B2B org re-creation.

**test-runner-tags.md** — the CSV grammar both browser-mode runners speak. Step tags, assertion tags, cross-layer tags.

And the fifth pillar — **VirtoOZ MCP** via the `/vc-docs` skill. 12 topic-scoped tools covering every Virto Commerce knowledge domain.

23 knowledge files total — the other 18 are referenced at the bottom.

*[~80 sec]*

---

## Slide 12 — GraphQL xAPI: Schema Truth + Runner-Native Tests

This is one of the most important slides for any backend QA. Two knowledge files plus `scripts/graphql-runner.ts` turn xAPI testing into deterministic, schema-validated CSV cases.

**Schema-update workflow**: when the xAPI evolves, we re-run introspection against `{BACK_URL}/graphql`, regenerate `graphql-schema.md`, and CI immediately catches any test referencing dropped fields. No more silent breakage when the schema changes.

The **canonical runner** does schema validation, variable substitution, `@td()` resolution, and evidence capture. We never write custom JS to execute GraphQL CSV cases — one `npx tsx scripts/graphql-runner.ts --case <csv>:<ID>` command is the contract.

Look at the CSV example on the right. **Steps** use `[AUTH]`, `[GQL-OP]`, `[GQL-VARS]`, `[GQL-EXEC]`, `[GQL-CAPTURE]`. **Assertions** use `[ERRORS]`, `[NULL]`, `[COUNT]`, `[DATA]`, `[VAR]`. Predicates support getByPath, arithmetic, cross-path, OR-AND.

Gold-standard reference suite is `050i-graphql-configurations.csv` — ready for new authors to copy.

*[~80 sec]*

---

## Slide 13 — Live Test-Data Discovery: No Hardcoded IDs

This solves the most boring but most-common cause of test rot.

Catalogs get reseeded. B2B orgs get re-created. Virtual-catalog roots migrate between environments. Hardcoded IDs and SKUs rot within a sprint or two.

Four data layers solve this. **`{{VAR}}`** — environment config from `.env`: URLs, credentials, store IDs. **`@td(ALIAS.field)`** — named entities you assert by name: "the configurable laptop the test was designed for", "the canonical Skyflow card", "the TechFlow org". **`live-discover`** — when you need shape, not exact value: "first available product", "any active coupon". **`random-data`** — for unique inputs you never assert exactly: registration emails, org names. Defaults to the `AGENT-TEST-*` prefix so teardown sweeps cleanly.

The anti-pattern is hardcoding a product GUID or SKU in `Test_Data`. A literal that isn't `{{VAR}}` or `@td()` is a review failure — Dimension 6 of the 7-dimension review.

*[~70 sec]*

---

## Slide 14 — Test Runner Tags + @td() Resolver

The browser-mode CSV grammar. `test-runner-tags.md` is the canonical reference both runners speak — `test-runner-agent` and `autonomous-test-runner`.

**Step tags**: `[NAV]` for navigation, `[ACT]` for click/type/select, `[WAIT]` for sync points, `[LOGIN]` for auth, `[SETUP]` for preconditions.

**Assertion tags**: `[DOM]` for element presence, `[STATE]` for component state, `[MATH]` for numeric checks, `[API]` for backend assertions, `[CONSOLE]` for browser console.

**Cross-layer tags**: `[HAR]` to capture network, `[SCREEN]` for screenshots, `[PERF]` for timings.

The `@td()` resolver reads `test-data/aliases.json` plus CSV rows in `test-data/`. Catalogs reseed, IDs change — the alias stays stable. One CSV update propagates to every consumer. `validate-td-refs.ts` verifies every reference before a run. The GraphQL runner rejects unresolved tokens at lint time.

This grammar is what makes a CSV row both human-readable and machine-executable.

*[~65 sec]*

---

## Slide 15 — Critical UI Scope: Regression-Enforced Matrix

A focused but important slide. There's a 7×8 matrix — 7 components × 8 pages — that pins down exactly which BL-UI invariant applies to which component on which page.

The seven components are the ones every page reuses: VcButton, VcProductCard, VcLineItem, VcTable, VcDialog, Popover, VcSidebar. The eight pages are the critical user paths: home, catalog, PDP, cart, orders, lists, members, company info.

For each covered cell, the matrix lists the applicable `BL-UI-*` invariants — focus-ring visibility, hover state, disabled state, loading skeleton, layout stability under data, empty state, error state, keyboard navigation.

The validator script `npm run scope:validate` exits non-zero if any covered cell points at a missing test ID. So the matrix can't silently drift out of sync with the suite.

Suite `048b-layout-stability.csv` covers this matrix exclusively. Selection name: `layout-stability`.

*[~60 sec]*

---

## Slide 16 — /qa-test-lifecycle: Keep Tests in Sync with Code

This is the command that fixes the oldest problem in test maintenance — tests rotting after PRs land.

One command for the entire test-case lifecycle. Eight steps: **scope → sync stale → analyze gaps → generate → review (7-dim) → fix → verify → approve**. Each step has clear deliverables.

It accepts any scope. `suite <ID>` for direct quality review. `domain <name>` for a per-domain coverage audit. `VCST-XXXX` to derive cases from a JIRA ticket's acceptance criteria. `PR #NNN` for change-driven sync against a pull request. `module <name>` for a `vc-module-*` repo. `diff` or `changelog <ver>` for pure git-driven gap analysis.

What it produces: updated Steps and Assertions for stale cases, new cases with BL-* and ECL-* citations, typed tags, a 7-dimension quality review report, and a live-verification gate before merge.

This command replaced the deprecated `/qa-sync-tests`. Delegates to test-management-specialist for authoring and review, and qa-testing-expert for live verification.

The pipeline runs unattended. You point it at a PR, you get back an approval-ready set of test-case updates.

*[~80 sec]*

---

## Slide 17 — /qa-seed-data: Full Test Environment in One Command

Test data infrastructure. `/qa-seed-data` generates a complete test environment via Postman MCP — catalogs, products, pricing, B2B organizations, users with roles — and tears it all down safely when done.

Five profiles. **`minimal`** is one catalog, one product, one price, one inventory record — perfect for smoke tests and API connectivity. **`catalog`** is a 3-level category tree, 5 products, multi-currency pricing — for search and browse tests. **`b2b`** is one organization, three users (admin/buyer/viewer), roles — for RBAC tests. **`pricing`** is two price lists (USD + EUR), tiered prices, quantity breaks. **`full`** combines everything.

Every seeded entity carries the `AGENT-TEST-*` prefix so `/qa-seed-data teardown` sweeps cleanly without touching real data. Safe to run on any QA environment.

The pattern matters: pick a profile, Postman MCP builds and runs the collection, data is ready, tests execute, teardown cleans up. No manual database access required.

*[~60 sec]*

---

## Slide 18 — Live Flow: /qa-test VCST-XXXX

End-to-end demonstration. One command turns a JIRA ticket into a verdict.

**Step 1**: Atlassian MCP fetches the ticket — title, description, acceptance criteria. The orchestrator identifies feature scope: storefront, admin, or API.

**Step 2**: dispatches specialists in parallel. Frontend-expert on Chrome takes the storefront ACs. Backend-expert on Edge takes the API + admin ACs.

**Step 3**: each agent navigates real browsers, verifies each AC, captures screenshots plus HAR, watches console for errors.

**Step 4**: failed ACs become JIRA bugs with P0–P3 severity, BL-* rule references, and full evidence — auto-created in JIRA.

**Step 5**: all ACs pass → transition ticket to Testing Complete, link evidence, notify the team. Bugs found → block the release.

This is what a typical sprint looks like from the QA side. No manual scripting, no JIRA copy-paste, no missed evidence.

*[~70 sec]*

---

## Slide 19 — Roadmap: What's Next

The shipped column on the left, the planned column on the right.

**Shipped**: `/qa-test-lifecycle` for unified test-case sync. Runner-native GraphQL with schema validation and full `[GQL-*]` grammar. Agent Teams autonomous regression with token bucket and exponential backoff.

**Q2 2026**: CI/CD GitHub Actions pipeline — daily smoke and weekly full, Teams notifications, 90-day rolling history. GraphQL Runner v2 with schema-diff alerts and capture chaining. Multi-browser CI plus pixel-diff visual baselines for all 55 Storybook components.

**Q3 2026**: AI root-cause analyzer that cross-references HAR + console + Azure App Insights + git blame to pre-classify each bug. Mobile and real-device testing via BrowserStack — critical for B2C checkout and BOPIS. Self-updating suites where agents observe failures and code churn, then open PRs proposing Steps/Assertions updates.

**Long term**: continuous production QA shadowing real traffic via App Insights to surface synthetic regression cases. ML-based test impact and cost optimizer that picks the cheapest sufficient regression scope per PR. Multi-tenant white-label testing.

The vision is a fully autonomous QA system that continuously tests, learns from failures, updates its own test cases against real production signals, and provides real-time quality plus cost signals — with zero manual scripting.

That's where we're heading. Questions?

*[~95 sec]*

---

## Total runtime

19 slides × average ~70 seconds = **~18 minutes** of speaking time. Add 5–7 minutes for Q&A and demo handoff — fits in a 25-minute session comfortably.
