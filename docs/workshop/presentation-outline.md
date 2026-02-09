# Presentation Outline: Project Onboarding & Claude Code for QA

**Companion to:** [workshop-plan.md](workshop-plan.md)
**Slide count:** ~25 slides
**Duration:** 1.5 hours

---

## Slide 1: Title

**Title:** LLM-Driven QA Testing with Claude Code
**Subtitle:** Project Onboarding & Power Features Workshop
**Visual:** Virto Commerce logo + Claude Code logo
**Speaker notes:** Welcome everyone. Today we'll get you up to speed on our QA testing approach and show you the most powerful features of Claude Code for testing.

---

## Slide 2: Agenda

| Part | Topic | Time |
|------|-------|------|
| 1 | Project Overview | 15 min |
| 2 | Live Demos: Claude Code Features | 40 min |
| 3 | Hands-On: Your First Test | 25 min |
| 4 | Wrap-Up & Next Steps | 10 min |

**Speaker notes:** We'll start with understanding the project, then I'll show you 5 live demos, then you get hands-on time, and we wrap up with your daily workflow.

---

## PART 1: PROJECT OVERVIEW

---

## Slide 3: What Is This Project?

**Title:** Not Your Typical Test Automation

- QA testing repo for Virto Commerce B2B e-commerce
- **No `.spec.js` files** - tests are written in plain English
- AI agent (Claude Code) executes tests through real browsers
- Natural language in, test results out

**Visual:** Side-by-side comparison:

```
Traditional:                    Our approach:
await page.goto('/login');      "Sign in to the storefront
await page.fill('#email',       with the test user and
  'user@test.com');              verify the dashboard loads"
await page.fill('#pass', '...');
await page.click('#submit');
```

**Speaker notes:** The key insight is that we replaced hundreds of lines of brittle test code with natural language instructions. Claude Code reads them and drives a real browser.

---

## Slide 4: Why LLM-Driven Testing?

**Title:** Benefits Over Traditional Automation

- No Playwright/Selenium coding expertise needed
- Tests self-heal when UI changes (no broken selectors)
- 40% faster test authoring
- Tests double as documentation (readable by anyone)
- Cross-browser testing built-in (4 browsers, one prompt)

**Speaker notes:** When a developer changes a button from `#submit-btn` to `[data-testid="login-submit"]`, traditional tests break. Claude just finds the "Sign In" button. It adapts.

---

## Slide 5: Architecture

**Title:** How It All Fits Together

**Visual:** Architecture diagram:

```
You (VS Code + Claude Code)
         |
    Claude Code  <-- CLAUDE.md (project knowledge)
         |
    MCP Servers  (Claude's "hands")
    /    |    |    \        \       \
Chrome  FF  WebKit Edge   JIRA   DevTools
```

**Bullet points:**

- MCP = Model Context Protocol (gives Claude tools to interact with the world)
- 4 Playwright browsers for cross-browser testing
- Chrome DevTools for console logs, network, performance
- Atlassian MCP for JIRA integration
- Figma MCP for design comparison

**Speaker notes:** Think of MCP servers as Claude's hands. Without them, Claude can only talk. With them, it can open browsers, click buttons, read JIRA tickets, capture screenshots.

---

## Slide 6: Repository Tour

**Title:** What's in the Repo

| Folder | Contains | Test Cases |
|--------|----------|------------|
| `regression/suites/` | 14 test suites (CSV) | 455 cases |
| `docs/prompts/` | Prompt templates | 5 templates |
| `.claude/agents/` | QA specialist agents | 6 agents |
| `test-data/` | Products, users, addresses, cards | 12 categories |
| `reports/` | Bug reports + regression reports | - |
| `ci/` | GitHub Actions CI/CD | Automated runs |

**Speaker notes:** You don't need to know all of this today. The key folders are `regression/suites` where our test cases live, `docs/prompts` for test templates, and `.claude/agents` for our AI specialists.

---

## Slide 7: The QA Agent Team

**Title:** 6 Specialized AI Agents

| Agent | Expertise | Model |
|-------|-----------|-------|
| **qa-lead** | Orchestration, JIRA, approvals | Sonnet (fast) |
| **qa-frontend-expert** | Storefront, checkout, mobile | Opus (smart) |
| **qa-backend-expert** | APIs, Admin, modules | Opus (smart) |
| **qa-testing-expert** | Interactive testing, debugging | Opus (smart) |
| **test-management** | Test plans, coverage | Sonnet (fast) |
| **ui-ux-expert** | Storybook, accessibility | Sonnet (fast) |

**Speaker notes:** Think of these as your AI team members. Each one has deep domain knowledge encoded in their definition file. You just tell them what to test.

---

## PART 2: LIVE DEMOS

---

## Slide 8: Demo 1 - Browser Automation

**Title:** Testing a Login Flow with English

**Demo instructions:**
1. Open Claude Code
2. Type: "Navigate to the storefront and sign in with test user credentials"
3. Show browser opening, form filling, screenshot capture

**Key point to display after demo:**

> "You just tested a login flow without writing a single line of code."

**Speaker notes:** Watch what happens when I type a simple instruction. Claude picks the right MCP server, opens a browser, and executes the test steps.

---

## Slide 9: How It Works Under the Hood

**Title:** English to Browser Actions

```
Your input:                    Claude translates to:
"Navigate to storefront"   --> browser_navigate(url)
"Click Sign In"            --> browser_click("Sign In")
"Type email"               --> browser_type(email_field, value)
"Take screenshot"          --> browser_take_screenshot()
"Check console"            --> browser_console_messages()
```

**Speaker notes:** Claude translates your English instructions into specific MCP tool calls. You don't need to know these tool names - Claude handles it. But it's good to understand what's happening.

---

## Slide 10: Demo 2 - Custom QA Agents

**Title:** Domain Experts at Your Command

**Demo instructions:**
1. Run `/agents` to show list
2. Open `qa-testing-expert.md` briefly
3. Type: "Use qa-testing-expert to test search functionality"
4. Show agent executing systematically

**Key point to display after demo:**

> "Each agent carries hundreds of lines of QA domain knowledge. No prompt engineering needed."

**Speaker notes:** Notice how the agent follows a methodology - it announces each step, captures evidence, reports pass/fail. That's all encoded in its definition.

---

## Slide 11: Agent Definition Structure

**Title:** What's Inside an Agent File

```markdown
---
name: qa-testing-expert
model: opus
---

# QA Testing Expert

## Core Mission
Execute test cases methodically with a bug-hunting mentality.

## Competencies
- UI Testing
- Console Log Analysis
- Network Request Analysis
- Cross-Browser Testing

## Methodology
Phase 1: Test Case Analysis
Phase 2: Environment Preparation
Phase 3: Case-by-Case Execution
Phase 4: Evidence Collection
Phase 5: Tear Down & Cleanup
```

**Speaker notes:** This is a simplified view. The real file is much larger. The key is that all this domain knowledge is version-controlled and shared across the team.

---

## Slide 12: Demo 3 - Multi-Browser Testing

**Title:** One Prompt, Four Browsers

**Demo instructions:**
1. Show `.mcp.json` with 4 Playwright servers
2. Run same test in WebKit (Safari engine)
3. Compare with Chrome result

**Key point:** Each agent gets its own browser:

| Agent | Browser |
|-------|---------|
| qa-frontend-expert | Chrome |
| qa-backend-expert | Edge |
| qa-testing-expert | Firefox |
| ui-ux-expert | WebKit (Safari) |

**Speaker notes:** When we run 4 agents in parallel, each gets its own browser session. They don't interfere with each other. That's 4x testing speed.

---

## Slide 13: Demo 4 - JIRA Integration

**Title:** Bug Reporting Without Leaving Your IDE

**Demo instructions:**
1. Type: "Get details of JIRA ticket VCST-4556"
2. Show ticket information returned
3. Type: "Add a comment: QA testing in progress"

**Key point:**

> "Read tickets, create bugs, update status - all from Claude Code."

**Speaker notes:** The Atlassian MCP server connects directly to JIRA. You can search tickets, read descriptions, create bugs, add comments, and transition status.

---

## Slide 14: Demo 5a - CLAUDE.md

**Title:** The Project Knowledge Base

**Demo instructions:** Open `CLAUDE.md` and highlight key sections.

**What CLAUDE.md gives Claude:**

- All MCP server configurations
- 14 regression suites with priorities
- 10 critical revenue flows
- Agent-to-browser assignment matrix
- 29 environment variable descriptions
- Bug report format and conventions

**Speaker notes:** This single file transforms Claude from a generic assistant into a Virto Commerce QA expert. Without it, you'd have to explain everything in every conversation.

---

## Slide 15: Demo 5b - Plan Mode

**Title:** Review Before Execution

**Demo instructions:**
1. Press Shift+Tab (Plan Mode ON)
2. Type: "Create a test plan for the cart checkout flow"
3. Show plan generation (no execution)
4. Press Shift+Tab (Plan Mode OFF)

**When to use Plan Mode:**

- Production environments
- Destructive operations
- Complex multi-step tests
- When you want to review strategy first

**Speaker notes:** Plan Mode is your safety net. Claude explains what it will do before doing it. Great for when you want to think through the approach first.

---

## Slide 16: Demo 5c - VS Code Features

**Title:** IDE Integration Highlights

- **Slash commands:** `/agents`, `/compact`, `/help`
- **@-mentions:** `@regression/suites/01-smoke-tests.csv` to reference files
- **Inline diffs:** Accept/reject file changes visually
- **Conversation history:** Reference past test sessions

**Speaker notes:** Quick tour of the most useful shortcuts. `/compact` is especially useful when your conversation gets long - it compresses history to free up context.

---

## PART 3: HANDS-ON EXERCISE

---

## Slide 17: Your Turn!

**Title:** Write & Execute Your First Test

**Pick a feature:**

| # | Feature | Suggested Test |
|---|---------|---------------|
| 1 | Search | Search for "bolt", verify suggestions |
| 2 | Catalog | Browse a category, apply a filter |
| 3 | Sign In | Log in, verify dashboard |
| 4 | Cart | Add product, check cart badge |
| 5 | Product Page | View product details, check price |

**Speaker notes:** Each person pick a different feature. We'll compare results at the end.

---

## Slide 18: Test Template

**Title:** Use This Template

```
Test the [FEATURE] on our storefront.

Steps:
1. Navigate to the storefront homepage
2. [YOUR ACTION]
3. [YOUR ACTION]
4. [YOUR ACTION]
5. Take a screenshot after each major step
6. Check the browser console for JavaScript errors

Expected Result:
- [WHAT SHOULD HAPPEN]
- No console errors
```

**Speaker notes:** Replace the brackets with your specific test steps. Be as descriptive as you want - Claude handles the details. I'll walk around to help if anyone gets stuck.

---

## Slide 19: Exercise Time

**Title:** 20 minutes - Go!

**Display on screen:** Timer + template + "Need help? Raise your hand!"

**Speaker notes:** Walk around helping. Common issues:
- MCP not connected? Restart VS Code
- Wrong URL? Check `.env`
- Browser won't open? Check `.mcp.json` syntax

---

## Slide 20: Let's See Your Results

**Title:** Show & Tell

- Ask 2-3 volunteers to share their screen
- Compare results across features
- Did anyone find a real bug? (Celebrate!)

**Speaker notes:** Let's see what you found! Anyone want to share their screen?

---

## PART 4: WRAP-UP

---

## Slide 21: Top 5 Takeaways

**Title:** Remember These

1. **No-code testing** - Write tests in English, not JavaScript
2. **Specialized agents** - 6 domain experts, just ask them
3. **Multi-browser** - 4 browsers simultaneously
4. **JIRA integrated** - Bug reports from your IDE
5. **CLAUDE.md** - One file = project-expert Claude

**Speaker notes:** If you remember nothing else, remember these five things. They'll save you hours every week.

---

## Slide 22: Your Daily Workflow

**Title:** A Day in the Life

```
Morning:
  Check JIRA for "Ready for Test" tickets

Testing:
  "qa-testing-expert, test VCST-XXXX on QA environment"
  Agent opens browser, tests, captures evidence

Reporting:
  Bug? "Create bug report in reports/bugs/"
  Pass? "Update JIRA: transition to Tested"
```

**Speaker notes:** This is what your typical day looks like with this setup. Ask Claude to check JIRA, delegate testing to an agent, and report results back to JIRA.

---

## Slide 23: Regression Cadence

**Title:** When to Run What

| Trigger | Suite | Time |
|---------|-------|------|
| Every deploy | Smoke (01) | 30 min |
| Sprint release | Critical (01,04,05,06,08) | 3-4 hrs |
| Major release | Full regression (00) | 4-5 hrs parallel |
| Quarterly | A11y + i18n + browsers (09,10,12) | 11 hrs |

**Speaker notes:** Smoke tests after every deployment - that's 12 test cases, 30 minutes. For releases, we run the critical path suites. Full regression runs automatically via GitHub Actions CI/CD.

---

## Slide 24: Where to Find Help

**Title:** Resources

| Need | Go To |
|------|-------|
| Setup guide | `README.md` |
| Project context | `CLAUDE.md` |
| Test suites | `regression/suites/README.md` |
| Prompt templates | `docs/prompts/` |
| Test data | `test-data/README.md` |
| CI/CD | `ci/README.md` |
| Questions | QA Slack channel |

**Speaker notes:** Everything is documented in the repo. Start with README.md if you need to re-setup anything. Use the Slack channel for questions.

---

## Slide 25: Thank You & Q&A

**Title:** Questions?

**Contact:** [your name / Slack handle]
**Workshop recording:** [link - to be shared]
**Template files:** [shared drive link]

**Next steps:**
- Week 1: Run daily smoke tests
- Week 2: Try automated CI regression
- Month 1: Create your own custom agent

**Speaker notes:** Thank you all! The workshop recording and template files will be shared in Slack. Start with daily smoke tests this week. Any questions?

---

## Appendix: Screenshots to Capture Before Workshop

Prepare these screenshots as backup visuals for slides:

1. **VS Code with Claude Code panel open** - for Slide 1/title
2. **Browser automation in action** - Claude driving a browser (for Slide 8)
3. **Agent list output** (`/agents` command) - for Slide 10
4. **JIRA ticket fetched in Claude Code** - for Slide 13
5. **CLAUDE.md open in editor** - for Slide 14
6. **Plan Mode output** - for Slide 15
7. **Inline diff view** - for Slide 16
8. **GitHub Actions regression workflow** - for Slide 23
9. **Generated regression report** - for Slide 23
