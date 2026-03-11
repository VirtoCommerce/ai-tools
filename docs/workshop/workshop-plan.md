# Workshop Plan: Project Onboarding & Claude Code for QA

**Duration:** 1.5 hours (90 minutes)
**Audience:** QA engineers, complete beginners to Claude Code
**Format:** Presentation + live demos + hands-on exercise
**Prerequisites:** Participants completed [pre-workshop-setup.md](pre-workshop-setup.md)

---

## Pre-Workshop Checklist (Instructor)

- [ ] Demo machine fully configured (all MCP servers, agents, .env working)
- [ ] Backup screen recordings for each demo (in case of connectivity issues)
- [ ] Template files ready to share: `.env`, `.mcp.json`, `CLAUDE.md`
- [ ] Shared Anthropic API key available (for participants who couldn't get their own)
- [ ] QA environment accessible (storefront + backend)
- [ ] Teams channel created for workshop Q&A
- [ ] Quick reference cheatsheet printed/shared (`docs/agentic-qa-cheatsheet.md`)
- [ ] Projector/screen share working
- [ ] Sent [pre-workshop-setup.md](pre-workshop-setup.md) to participants 1 week before

---

## Agenda Overview

| Part | Topic | Time | Format |
|------|-------|------|--------|
| **1** | Project Overview | 15 min | Presentation |
| **2** | Claude Code Power Features | 40 min | Live demos |
| **3** | Hands-On Exercise | 25 min | Participant practice |
| **4** | Wrap-Up & Next Steps | 10 min | Discussion |
| | **Total** | **90 min** | |

---

## Part 1: Project Overview (15 min)

### 1.1 What Is This Project? (5 min)

**Key message:** We test Virto Commerce B2B e-commerce platform using AI-powered browser automation instead of traditional test scripts.

**Speaker notes:**

> Welcome everyone. This project, vc-mcp-testing-module, is our QA testing hub for the Virto Commerce platform. But here's the important thing to understand upfront: **this is NOT a traditional test automation repo**. There are no `.spec.js` files, no Selenium, no hand-coded Playwright scripts.
>
> Instead, we write test instructions in **plain English**, and an AI agent (Claude Code) executes them through real browsers. This is called LLM-driven testing, powered by something called MCP - Model Context Protocol.

**Points to cover:**

- This repo contains: 36 test suites (CSV), prompt templates, 11 agent definitions, 18 skills, test data, and reports
- Tests are executed by typing natural language commands or slash commands in Claude Code
- Claude opens a real browser (Chrome, Firefox, Edge), clicks buttons, fills forms, captures screenshots
- No Playwright/Selenium coding expertise needed
- WebKit is NOT supported on Windows — we use 3 browsers: Chrome, Firefox, Edge

### 1.2 Architecture (5 min)

**Speaker notes:**

> Let me show you how all the pieces fit together.

**Draw/show this architecture:**

```
You (in VS Code with Claude Code)
  |
  |  "Test the login flow on QA environment"
  |
  v
Claude Code  <-- reads CLAUDE.md for project context
  |
  |  Selects appropriate tools
  |
  v
MCP Servers (the "hands" of Claude) — 9 total
  |
  ├── Playwright MCP (Chrome)   --> Opens browser, clicks, types, screenshots
  ├── Playwright MCP (Firefox)  --> Cross-browser testing
  ├── Playwright MCP (Edge)     --> Enterprise browser (msedge channel)
  ├── Chrome DevTools MCP       --> Console logs, network HAR, performance
  ├── Atlassian MCP             --> Read/write JIRA tickets
  ├── Figma MCP                 --> Compare UI vs design specs
  ├── Postman MCP               --> API test collections
  ├── GitHub MCP                --> PR review, code search, issues
  └── Context7 MCP              --> Virto Commerce documentation lookup
```

**Points to cover:**

- MCP = Model Context Protocol. Think of it as giving Claude "hands" to interact with tools
- Each Playwright MCP server controls one browser instance (max 3 concurrent)
- We can run 3 browsers in parallel — Chrome, Firefox, Edge (no WebKit on Windows)
- Chrome DevTools MCP gives us deep debugging (console, network, HAR, performance)
- Atlassian MCP lets us read/create JIRA tickets without leaving the IDE
- Postman MCP for API testing, GitHub MCP for PR review, Context7 for VC documentation

### 1.3 What's in the Repo (5 min)

**Speaker notes:**

> Let me give you a quick tour of the repository.

**Walk through key directories:**

| Directory | What's Inside | You'll Use It For |
|-----------|--------------|-------------------|
| `regression/suites/` | 36 test suites, 1,274 test cases (CSV) | Running regression tests |
| `docs/prompts/` | Natural language prompt templates | Starting test sessions |
| `.claude/agents/` | 11 specialized agents (7 QA + 4 BA) | Delegating testing tasks |
| `.claude/agents/knowledge/` | 8 shared knowledge files | Business logic, patterns |
| `.claude/skills/` | 18 skills in 3 categories | Methodology libraries |
| `.claude/commands/` | 9 slash commands | Quick actions |
| `test-data/` | Users, products, addresses, payment cards | Test data reference |
| `reports/bugs/` | Bug reports with evidence | Documenting defects |
| `reports/regression/` | Regression execution reports | Sprint/release reports |
| `tests/SprintXX-XX/` | Per-ticket test documentation | Feature-specific testing |
| `ci/` | Docker + GitHub Actions + Claude Agent SDK | CI/CD regression runs |

**Mention the 11 agents briefly (will demo in Part 2):**

**QA Team (7):**

| Agent | Specialty |
|-------|-----------|
| **qa-lead-orchestrator** | Orchestrates team, JIRA workflow, go/no-go decisions |
| **qa-frontend-expert** | Storefront, checkout, mobile, cross-browser |
| **qa-backend-expert** | REST APIs, GraphQL xAPI, Admin SPA, modules |
| **qa-testing-expert** | Interactive testing, Figma comparison, debugging |
| **test-management-specialist** | Test planning, case writing, 18 domain checklists |
| **ui-ux-expert** | Storybook (55 components), WCAG 2.1 AA, design |
| **regression-orchestrator** | Parallel 36-suite regression, quality gates |

**BA Team (4):**

| Agent | Specialty |
|-------|-----------|
| **ba-system-analyzer** | Repo structure, module inventory, user flows |
| **ba-api-specialist** | API surface analysis via Postman/Swagger |
| **ba-story-writer** | Agile stories with BDD acceptance criteria |
| **ba-doc-writer** | User docs, admin guides, API quick-start |

---

## Part 2: Live Demos - Claude Code Power Features (40 min)

### Demo 1: MCP Browser Automation (10 min)

**Goal:** Show that you can test a website by typing English.

**Setup:** Open VS Code with the project. Open Claude Code panel.

**Script:**

1. Type in Claude Code:
   ```
   Navigate to our storefront homepage and take a screenshot
   ```

2. **Point out:** Claude selected the `playwright-chrome` MCP server, called `browser_navigate`, then `browser_take_screenshot`. A real browser opened!

3. Continue with a login flow:
   ```
   Now sign in with the test user credentials from the .env file.
   After signing in, take a screenshot of the dashboard.
   Check the browser console for any JavaScript errors.
   ```

4. **Point out:**
   - Claude read the `.env` file to get credentials (it knows `USER_EMAIL` and `USER_PASSWORD`)
   - It filled in the login form, clicked submit, waited for the page to load
   - It checked the console for errors automatically

5. **Key takeaway to say out loud:**

   > "You just tested a login flow without writing a single line of code. No selectors, no `page.click()`, no `expect()`. Just English."

**If demo fails:** Show pre-recorded backup video. Common issue: MCP server not connected. Fix: restart VS Code.

---

### Demo 2: Custom QA Agents (10 min)

**Goal:** Show that agents are domain experts with pre-loaded knowledge.

**Script:**

1. Show the agents list:
   ```
   /agents
   ```
   Point out the 6 agents and their specialties.

2. Open one agent definition file to show structure:
   - Open `.claude/agents/qa/qa-testing-expert.md` in the editor
   - Show: name, model selection (opus for complex tasks), and the instructions section
   - Point out: "This agent knows about all our payment processors, all regression suites, the bug report format, evidence collection protocol"

3. Use an agent:
   ```
   Use the qa-testing-expert to test the search functionality:
   1. Go to the storefront
   2. Search for "bolt"
   3. Verify search results appear
   4. Check that the search dropdown shows suggestions
   5. Clear the search and try searching for a special character: &
   6. Take screenshots at each step
   ```

4. **Point out as it executes:**
   - The agent follows a systematic methodology (announces each step, captures evidence)
   - It checks for edge cases (special character search)
   - It reports results with PASS/FAIL status

5. **Key takeaway:**

   > "Each agent carries hundreds of lines of domain expertise. You don't need to explain what Skyflow is, or how to check console errors, or where to save screenshots. The agent already knows."

---

### Demo 3: Multi-Browser Testing (5 min)

**Goal:** Show cross-browser testing without separate frameworks.

**Script:**

1. Show `.mcp.json` - point out 3 Playwright servers (Chrome, Firefox, Edge)

2. Explain the concept:

   > "Each MCP server controls one browser. When we run agents in parallel, each agent gets its own browser so they don't interfere with each other. Max 3 concurrent browser agents."

3. Quick comparison demo:
   ```
   Using playwright-firefox, navigate to the storefront homepage and take a screenshot.
   Then compare: does the layout look the same as in Chrome?
   ```

4. Show the Firefox browser opening

5. **Key takeaway:**

   > "One prompt, three browsers. No separate test framework for each browser. And when we run agents in parallel, qa-frontend-expert gets Chrome, qa-testing-expert gets Firefox, qa-backend-expert gets Edge - all at the same time."

**Note:** WebKit is NOT supported on Windows. We use Chrome, Firefox, and Edge.

---

### Demo 4: JIRA Integration (5 min)

**Goal:** Show that bug reporting happens without leaving the IDE.

**Script:**

1. Fetch a JIRA ticket:
   ```
   Get the details of JIRA ticket VCST-4556
   ```

2. **Point out:** Claude fetched the ticket summary, description, status, assignee, priority - all from Atlassian MCP.

3. Show creating a comment (if appropriate):
   ```
   Add a comment to VCST-4556: "QA testing in progress. Initial smoke test on Chrome passed."
   ```

4. **Key takeaway:**

   > "You can read tickets, create bugs, update status, and add comments - all from Claude Code. No switching between IDE and browser to open JIRA."

---

### Demo 5: Essential Claude Code Features (10 min)

**Goal:** Cover Plan Mode, CLAUDE.md, slash commands, and VS Code integration.

**Script:**

**5a. CLAUDE.md - Project Knowledge Base (3 min)**

- Open `CLAUDE.md` in the editor
- Point out key sections: MCP servers, regression suites, critical revenue flows, agent assignment matrix, skills and commands
- Say:

  > "This file is the reason Claude knows our project. Without it, Claude is a generic assistant. With it, Claude knows we have 36 regression suites, 4 payment processors, 33 environment variables, 11 agents, 18 skills, and which agent should test what."

**5b. Plan Mode (3 min)**

- Press **Shift+Tab** to toggle Plan Mode
- Type:
  ```
  Create a test plan for the cart checkout flow with shipping address selection
  ```
- Show how Claude generates a structured plan but does NOT execute anything
- Say:

  > "Plan Mode is your safety net. Claude explains what it WILL do before doing it. Perfect for production environments where you want to review the test strategy before execution."

- Press **Shift+Tab** again to exit Plan Mode

**5c. Slash Commands & Shortcuts (2 min)**

- Show quick demos:
  - `/qa-status` - show QA dashboard (read-only, auto-invoke)
  - `/qa-env-check` - validate environment health
  - `/qa-smoke` - daily smoke test
- Mention `@` for referencing files:
  ```
  @regression/suites/Frontend/01-smoke-tests.csv - run the first 3 test cases from this suite
  ```
- Mention skills:
  ```
  /vc-docs dynamic properties
  /qa-checklist checkout
  ```

**5d. Inline Diffs (2 min)**

- If a previous demo generated a report file, show the inline diff in VS Code
- Show accept/reject buttons
- Say:

  > "When Claude creates or edits files, you see a diff view. You can accept, reject, or modify before saving. Nothing changes without your approval."

---

## Part 3: Hands-On Exercise (25 min)

### Exercise: Write & Execute Your First Natural Language Test (20 min)

**Instructions to read aloud:**

> Now it's your turn. Open Claude Code in your VS Code. You're going to write a natural language test and watch Claude execute it in a real browser.
>
> Pick ONE feature from this list. Each person should pick a different one if possible:

| Feature | What to Test |
|---------|-------------|
| **Search** | Search for a product, verify results, try special characters |
| **Catalog** | Browse a category, apply a filter, check product cards |
| **Sign In** | Log in with test user, verify dashboard loads |
| **Cart** | Add a product to cart, check cart badge, open cart page |
| **Product Page** | Navigate to a product, check price, images, add-to-cart button |

> Use this template - replace the `[brackets]` with your specifics:

```
Test the [FEATURE] on our storefront.

Steps:
1. Navigate to the storefront homepage
2. [YOUR FIRST ACTION]
3. [YOUR SECOND ACTION]
4. [YOUR THIRD ACTION]
5. Take a screenshot after each major step
6. Check the browser console for JavaScript errors

Expected Result:
- [WHAT SHOULD HAPPEN]
- No console errors
```

> For example, if you picked "Search":

```
Test the Search feature on our storefront.

Steps:
1. Navigate to the storefront homepage
2. Click on the search field in the header
3. Type "laptop" and wait for search suggestions to appear
4. Verify that product suggestions show in the dropdown
5. Press Enter to see full search results page
6. Take a screenshot of the search results
7. Check the browser console for JavaScript errors

Expected Result:
- Search suggestions appear while typing
- Search results page shows relevant products
- No console errors
```

**Instructor:** Walk around, help anyone stuck. Common issues:
- MCP not connected: restart VS Code
- Wrong FRONT_URL: check `.env` file
- Browser not opening: check `.mcp.json` syntax

### Wrap-Up Discussion (5 min)

- Ask 2-3 participants to share their screen and show results
- Did anyone find a bug? (Celebrate it!)
- What surprised you most?

---

## Part 4: Wrap-Up & Next Steps (10 min)

### Top 5 Takeaways (3 min)

1. **No-code testing** - Write tests in English, not JavaScript
2. **Specialized agents** - 11 pre-built domain experts (7 QA + 4 BA) ready to use
3. **Multi-browser** - Test Chrome, Firefox, Edge simultaneously (max 3 concurrent)
4. **JIRA integrated** - Bug reporting without leaving your IDE
5. **Slash commands** - `/qa-smoke`, `/qa-test`, `/qa-regression` for quick actions
6. **18 skills** - Built-in methodology (ISTQB, SBTM, WCAG, risk-based testing)
7. **CLAUDE.md** - One file makes Claude an expert on your project

### Your Daily Workflow (3 min)

```
Morning:
1. Check JIRA for "Ready for Test" tickets
2. Open Claude Code
3. Ask qa-lead: "What tickets need testing today?"

Testing:
4. Use qa-testing-expert: "Test VCST-XXXX on the QA environment"
5. Agent opens browser, executes tests, captures evidence
6. Review results - accept/reject findings

Reporting:
7. Bug found? "Create a bug report for the issue in reports/bugs/"
8. All passed? "Update JIRA ticket VCST-XXXX: QA passed, transition to Tested"
```

### Regression Testing Cadence (2 min)

| When | What | Command | Time |
|------|------|---------|------|
| Every deployment | Smoke test (Suite 01) | `/qa-regression smoke` | ~15 min |
| Sprint release | Critical P0 (01,06,08,14) | `/qa-regression critical` | ~2 hrs |
| Sprint release | Sprint suites (26 suites) | `/qa-regression sprint` | ~4 hrs |
| Major release | Full regression (all 36) | `/qa-regression full` | ~8 hrs parallel |
| Daily (CI) | Automated smoke | GitHub Actions Mon-Fri 6AM UTC | $5 |
| Weekly (CI) | Automated full | GitHub Actions Sunday 2AM UTC | $80 |

### Where to Find Help (1 min)

| Resource | Location |
|----------|----------|
| Full setup guide | `README.md` |
| Project context | `CLAUDE.md` |
| Repo navigation | `INDEX.md` |
| Architecture presentation | `docs/presentation/agentic-qa-workflow.md` |
| Quick reference cheatsheet | `docs/agentic-qa-cheatsheet.md` |
| Decision tree | `.claude/ROUTING.md` |
| Test suites | `regression/suites/` (36 CSV files) |
| Prompt templates | `docs/prompts/` |
| Skills & methodology | `.claude/skills/` (18 skills) |
| Test data | `test-data/README.md` |
| CI/CD docs | `ci/README.md` |
| QA Teams channel | [share link] |

### Q&A (1 min)

Open floor for questions. If time is short, direct to Slack channel for follow-up.

---

## Post-Workshop Actions (Instructor)

- [ ] Share workshop recording
- [ ] Share all template files (`.env`, `.mcp.json`, `CLAUDE.md`) via shared drive
- [ ] Share cheatsheet (`docs/agentic-qa-cheatsheet.md`)
- [ ] Post Teams message with links to key docs
- [ ] Schedule follow-up check-in in 1 week
- [ ] Collect feedback (quick survey: 3 questions)

### Feedback Survey Questions

1. On a scale of 1-5, how confident are you executing LLM-driven tests after this workshop?
2. What was the most valuable part of the workshop?
3. What topic would you like a deeper dive on?
