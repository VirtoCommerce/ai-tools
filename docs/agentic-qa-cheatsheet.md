# Agentic QA Quick Reference

## 1. Commands (10)

| Command | Arguments | Auto | Example |
|---------|-----------|:----:|---------|
| `/qa-smoke` | `[storefront\|admin]` | No | `/qa-smoke` |
| `/qa-test` | `VCST-XXXX \| feature \| PR #N` | No | `/qa-test VCST-1234` |
| `/qa-regression` | `[smoke\|critical\|sprint\|full\|frontend\|backend\|IDs]` | No | `/qa-regression critical` |
| `/qa-status` | `[run\|jira\|env]` | Yes | `/qa-status env` |
| `/qa-bug` | `description \| VCST-XXXX \| screenshot` | No | `/qa-bug Cart shows $0 total` |
| `/qa-exploratory` | `[checkout\|catalog\|B2B\|mobile\|new]` | No | `/qa-exploratory checkout` |
| `/qa-env-check` | `[vars\|endpoints\|mcp]` | Yes | `/qa-env-check mcp` |
| `/qa-coverage-generation` | `[p0\|p1\|full\|domain <name>\|ci-dry-run]` | No | `/qa-coverage-generation p0` |
| `/ba-analyze` | `[full\|flows\|api\|docs\|stories\|module <name>]` | No | `/ba-analyze flows` |
| `/ba-stories` | `feature name \| VCST-XXXX` | No | `/ba-stories checkout redesign` |

---

## 2. Skills (18)

### vc-knowledge (1) — auto-invocable

| Skill | Purpose |
|-------|---------|
| `/vc-docs` | Virto Commerce documentation via Context7 |

### testing (8) — manual invocation

| Skill | Purpose | Delegates To |
|-------|---------|--------------|
| `/qa-storybook` | Visual regression, responsive breakpoints | ui-ux-expert |
| `/qa-accessibility` | WCAG 2.1 AA accessibility audit | ui-ux-expert |
| `/qa-design` | Design system consistency, UX heuristics | ui-ux-expert |
| `/qa-plan` | Test plans from E2E scenario catalog (105 scenarios) | test-management-specialist |
| `/qa-checklist` | Domain checklists (18 domains, 158 items) | test-management-specialist |
| `/qa-api` | REST API & GraphQL xAPI testing | qa-backend-expert |
| `/qa-coverage-gap` | Autonomous coverage gap analysis and test generation | test-management-specialist |
| `/qa-seed-data` | Generate test data via Postman MCP | qa-backend-expert |

### qa-methodology (9) — manual invocation

| Skill | Purpose |
|-------|---------|
| `/qa-process` | ISTQB 7-phase lifecycle with entry/exit criteria |
| `/qa-investigate` | 5-phase bug investigation and root cause analysis |
| `/qa-evidence` | Evidence capture policy, output paths, sign-off templates |
| `/qa-defect` | Defect lifecycle, JIRA bug workflow (16 statuses), triage |
| `/qa-test-design` | EP, BVA, decision tables, state transitions, pairwise |
| `/qa-test-cases-generator` | Generate agent-native test cases in enriched CSV format |
| `/qa-risk` | 5x5 risk matrix, severity/priority, test depth allocation |
| `/qa-metrics` | Pass rate, defect density, DRE, quality gates enforcement |
| `/qa-sbtm` | Session-based exploratory testing, CRISP/SFDPOT, tours |

---

## 3. Agents (14)

| Agent | Model | Browser | Role |
|-------|-------|---------|------|
| **qa-lead-orchestrator** | Sonnet | — | Coordination, JIRA workflow, go/no-go decisions |
| **qa-frontend-expert** | Opus | chrome | Storefront, checkout, mobile, cross-browser |
| **qa-backend-expert** | Opus | edge | REST APIs, GraphQL xAPI, Admin SPA, modules |
| **qa-testing-expert** | Opus | firefox | Interactive execution, Figma comparison, debugging |
| **ui-ux-expert** | Sonnet | DevTools | Storybook (55 components), WCAG 2.1 AA |
| **test-management-specialist** | Sonnet | — | Test planning, case writing, coverage tracking |
| **regression-orchestrator** | Sonnet | — | Parallel regression, quality gates |
| **autonomous-regression-orchestrator** | Sonnet | — | Agent Teams regression, failure recovery, JIRA |
| **autonomous-test-runner** | — | assigned | Parameterized template for Agent Teams suite execution |
| **test-runner-agent** | — | assigned | Parameterized template for standard suite execution |
| **ba-system-analyzer** | Sonnet | — | Architecture, module inventory, user flows |
| **ba-api-specialist** | Sonnet | — | API surface via Postman/Swagger |
| **ba-story-writer** | Sonnet | — | BDD user stories with acceptance criteria |
| **ba-doc-writer** | Sonnet | — | User docs, admin guides, API quick-start |

---

## 4. Common Workflows

```bash
# Daily smoke test (~15 min, GO/NO-GO verdict)
/qa-smoke

# Test a specific JIRA ticket
/qa-test VCST-1234

# Sprint regression (26 suites, parallel batches of 3)
/qa-regression sprint

# Full release regression (all 36 suites, ~$80 budget)
/qa-regression full

# Custom suite selection
/qa-regression 01,04,06,14

# Bug investigation and filing
/qa-bug Cart total shows $0 after coupon applied

# Analyze test coverage gaps
/qa-coverage-gap analyze

# Guided exploratory testing
/qa-exploratory checkout

# Check environment health
/qa-env-check

# Direct agent usage
"Use qa-frontend-expert to test the checkout flow"
"Use qa-backend-expert to verify the GraphQL catalog queries"
"Use ui-ux-expert to audit accessibility on the product page"
"Use ba-story-writer to create stories for VCST-5678"
```

---

## 5. Regression Selection Groups

| Selection | Command | Suites | Use Case |
|-----------|---------|--------|----------|
| smoke | `/qa-regression smoke` | 01 | Daily pre-deploy |
| critical | `/qa-regression critical` | 01, 06, 08, 14 | P0 gate |
| sprint | `/qa-regression sprint` | 26 suites | Sprint release |
| full | `/qa-regression full` | All 36 | Production release |
| frontend | `/qa-regression frontend` | 01-13, 35-36 | Frontend only |
| backend | `/qa-regression backend` | 14-34 | Backend only |
| custom | `/qa-regression 01,04,06` | Specified IDs | Ad hoc |

---

## 6. Quality Gates

| Gate | Pass Rate | P0 Allowed | P1 Allowed | Verdicts |
|------|-----------|:----------:|:----------:|----------|
| Smoke | 100% | 0 | 0 | GO / NO-GO |
| Sprint | >= 95% | 0 | Any | APPROVED / CONDITIONAL / BLOCKED |
| Full Release | >= 95% | 0 | <= 3 | APPROVED / CONDITIONAL / BLOCKED |

---

## 7. Key File Paths

| Path | Purpose |
|------|---------|
| `CLAUDE.md` | Project knowledge base for Claude Code |
| `.claude/agents/` | 14 agent definitions (.md files) |
| `.claude/agents/knowledge/` | 12 shared knowledge files |
| `.claude/skills/` | 18 skills in 3 category directories |
| `.claude/commands/` | 10 slash commands |
| `.claude/ROUTING.md` | Decision tree: when to use which command/skill/agent |
| `config/test-suites.json` | Regression suite manifest (source of truth) |
| `regression/suites/Frontend/` | 16 frontend CSV suites |
| `regression/suites/Backend/` | 21 backend CSV suites |
| `docs/prompts/` | LLM prompt templates for QA automation |
| `reports/bugs/` | Bug reports with evidence |
| `reports/regression/` | Regression results + history.json |
| `tests/SprintXX-XX/` | Test cases by sprint/JIRA ticket |
| `test-data/` | Test fixtures (users, addresses, payment cards) |
| `config.js` | Environment configuration (loads .env) |
| `.mcp.json` | MCP server configuration (gitignored, local-only) |

---

## 8. Environment Variables (33 total)

| Group | Variables |
|-------|----------|
| **URLs** | `FRONT_URL`, `BACK_URL`, `VIRTO_START_FRONT`, `VIRTO_START_BACK`, `STORYBOOK_URL`, `STORYBOOK_DEV_URL` |
| **Credentials** | `ADMIN`, `ADMIN_PASSWORD`, `USER_EMAIL`, `USER_PASSWORD`, `USER2_EMAIL`, `USER2_PASSWORD`, `USER_VIRTO`, `USER_VIRTO_PASSWORD` |
| **Store** | `STORE_ID` |
| **Skyflow** | `SKYFLOW_VISA`, `SKYFLOW_MASTERCARD`, `SKYFLOW_EXPIRY`, `SKYFLOW_CVV` |
| **CyberSource** | `CYBERSOURCE_CARD`, `CYBERSOURCE_EXPIRY`, `CYBERSOURCE_CVV` |
| **Authorize.Net** | `AUTHORIZNET_CARD`, `AUTHORIZNET_EXPIRY`, `AUTHORIZNET_CVV` |
| **Datatrance** | `DATATRANCE_MASTERCARD`, `DATATRANCE_EXPIRY`, `DATATRANCE_CVV`, `DATATRANCE_OTP` |
| **APIs** | `FIGMA_API_KEY`, `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`, `POSTMAN_API_KEY` |
| **CI** | `ANTHROPIC_API_KEY`, `TEAMS_WEBHOOK_URL` |

**Validate:** `npm run env:check`

---

## 9. MCP Servers (9)

| Server | Purpose | Config / Notes |
|--------|---------|----------------|
| playwright-chrome | Chromium browser automation | `config/mcp-playwright-chrome.config.json` |
| playwright-firefox | Firefox browser automation | `config/mcp-playwright-firefox.config.json` |
| playwright-edge | Edge browser automation (msedge) | `config/mcp-playwright-edge.config.json` |
| postman | API testing (collections, monitors) | `--minimal` flag |
| github | PR review, issues, code search | Uses `GIT_TOKEN` |
| context7 | VC documentation lookup | HTTP MCP, uses `CONTEXT7_API_KEY` |
| Chrome DevTools | Console, network, HAR, performance | User-level config |
| Atlassian | JIRA tickets, bug filing, status | User-level config |
| Figma | Design comparison testing | User-level config |

---

## 10. npm Scripts

| Script | Description |
|--------|-------------|
| `npm install` | Install dependencies |
| `npm run env:check` | Validate all 33 required environment variables |
| `npm run ci:smoke` | CI regression: suite 01 only ($5 budget) |
| `npm run ci:critical` | CI regression: P0 suites 01, 06, 08, 14 |
| `npm run ci:frontend` | CI regression: all frontend suites (01-13, 35-36) |
| `npm run ci:backend` | CI regression: all backend suites (14-34) |
| `npm run ci:full` | CI regression: all 36 suites ($80 budget) |
| `npm run ci:regression` | CI regression: custom via `SUITE_SELECTION` env var |
| `npm run ci:notify` | Send Teams notification (requires `TEAMS_WEBHOOK_URL`) |
