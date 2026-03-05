# Pre-Workshop Setup Guide

**Workshop:** Project Onboarding & Claude Code for QA
**Duration:** 1.5 hours
**Please complete this setup BEFORE the workshop**
**Estimated setup time:** 45-60 minutes

---

## What You Need From Your Team Lead

Before starting, request the following from your team lead:

1. **Anthropic API key** (for Claude Code)
2. **`.env` file** with all credentials (33 variables: URLs, test users, payment cards, API keys)
3. **`CLAUDE.md`** file (project knowledge base)
4. **Postman API key** (for API testing MCP server)

**Note:** Agent definitions (11 agents), skills (18), commands (9), and knowledge files (8) are all tracked in git — they come with the repo clone. No need to copy them separately.

---

## Step 1: Install Prerequisites

| Tool | Version | Install | Verify |
|------|---------|---------|--------|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org/) | `node --version` |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) | `git --version` |
| **VS Code** | Latest | [code.visualstudio.com](https://code.visualstudio.com/) | Open VS Code |

### Install Claude Code Extension

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for **"Claude Code"** by Anthropic
4. Click **Install**
5. After install, set your Anthropic API key when prompted

---

## Step 2: Clone & Install

```bash
git clone https://github.com/VirtoCommerce/vc-mcp-testing-module.git
cd vc-mcp-testing-module
npm install
```

---

## Step 3: Create `.env` File

Create a `.env` file in the project root. **Paste the contents provided by your team lead**, or use this template and fill in the values:

```env
# ===== Application URLs =====
FRONT_URL=
BACK_URL=
VIRTO_START_FRONT=
VIRTO_START_BACK=
STORYBOOK_URL=
STORYBOOK_DEV_URL=

# ===== Admin Credentials =====
ADMIN=
ADMIN_PASSWORD=

# ===== Test User Credentials =====
USER_EMAIL=
USER_PASSWORD=
USER2_EMAIL=
USER2_PASSWORD=
USER_VIRTO=
USER_VIRTO_PASSWORD=

# ===== Store =====
STORE_ID=

# ===== Skyflow Payment =====
SKYFLOW_VISA=
SKYFLOW_MASTERCARD=
SKYFLOW_EXPIRY=
SKYFLOW_CVV=

# ===== CyberSource Payment =====
CYBERSOURCE_CARD=
CYBERSOURCE_EXPIRY=
CYBERSOURCE_CVV=

# ===== Authorize.Net Payment =====
AUTHORIZNET_CARD=
AUTHORIZNET_EXPIRY=
AUTHORIZNET_CVV=

# ===== Datatrance Payment =====
DATATRANCE_MASTERCARD=
DATATRANCE_EXPIRY=
DATATRANCE_CVV=
DATATRANCE_OTP=

# ===== External APIs =====
FIGMA_API_KEY=
BROWSERSTACK_USERNAME=
BROWSERSTACK_ACCESS_KEY=
POSTMAN_API_KEY=
```

**Validate your `.env`:**

```bash
npm run env:check
```

You should see all 33 variable values printed. If you see `Missing required environment variables`, add the missing ones.

---

## Step 4: Configure MCP Servers

### 4.1 Create `.mcp.json` in the project root

**Windows users** - use this exact config:

```json
{
  "mcpServers": {
    "playwright-chrome": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c", "npx", "@playwright/mcp@latest",
        "--config", "config/mcp-playwright-chrome.config.json"
      ]
    },
    "playwright-firefox": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c", "npx", "@playwright/mcp@latest",
        "--config", "config/mcp-playwright-firefox.config.json"
      ]
    },
    "playwright-edge": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c", "npx", "@playwright/mcp@latest",
        "--config", "config/mcp-playwright-edge.config.json"
      ]
    },
    "postman": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@anthropic-ai/postman-api-mcp-server@latest", "--minimal"],
      "env": {
        "POSTMAN_API_KEY": "<your-postman-api-key>"
      }
    },
    "github": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@anthropic-ai/github-mcp-server@latest"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<your-github-token>"
      }
    },
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp",
      "headers": {
        "x-api-key": "<your-context7-api-key>"
      }
    }
  }
}
```

**macOS/Linux users** - replace every `"command": "cmd"` and `"args": ["/c", "npx", ...]` with:

```json
{
  "command": "npx",
  "args": ["@playwright/mcp@latest", "--config", "config/mcp-playwright-chrome.config.json"]
}
```

**Note:** WebKit is NOT supported on Windows. Do not add a `playwright-webkit` server. Use Chrome, Firefox, and Edge only.

### 4.2 Browser config files in `config/` directory

The `config/` directory with 3 browser config files is already tracked in git — they come with the repo clone. Verify they exist:

- `config/mcp-playwright-chrome.config.json`
- `config/mcp-playwright-firefox.config.json`
- `config/mcp-playwright-edge.config.json`

Each config sets:
- Viewport: 1920x1080
- HAR capture: enabled (omitContent: true)
- Screenshot: only-on-failure
- Isolated context: true

---

## Step 5: Install Playwright Browsers

```bash
npx playwright install chromium firefox
```

This downloads Chromium and Firefox browser binaries (~400 MB total). Edge uses the system-installed `msedge` channel — no separate install needed.

**Important:** Do NOT install WebKit on Windows — it is not supported. If you attempt it, fall back to Chrome or Edge immediately.

---

## Step 6: Verify Agent Definitions (Already in Git)

Agent definitions, skills, commands, and knowledge files are all tracked in git — they come with the repo clone. Verify they exist:

```bash
ls .claude/agents/       # Should show 11 .md files
ls .claude/skills/       # Should show 3 category directories (18 skills)
ls .claude/commands/      # Should show 9 .md files
ls .claude/agents/knowledge/  # Should show 8 .md files
```

**11 agents (7 QA + 4 BA):**

| File | Agent |
|------|-------|
| `qa-lead-orchestrator.md` | QA coordinator — delegates, JIRA workflow, go/no-go |
| `qa-frontend-expert.md` | Storefront, checkout, mobile, cross-browser |
| `qa-backend-expert.md` | REST APIs, GraphQL xAPI, Admin SPA, modules |
| `qa-testing-expert.md` | Interactive testing, Figma comparison, debugging |
| `test-management-specialist.md` | Test planning, case writing, coverage |
| `ui-ux-expert.md` | Storybook, WCAG 2.1 AA, design system |
| `regression-orchestrator.md` | Parallel 36-suite regression, quality gates |
| `ba-system-analyzer.md` | Architecture, module inventory, user flows |
| `ba-api-specialist.md` | API surface analysis via Postman/Swagger |
| `ba-story-writer.md` | Agile stories with BDD acceptance criteria |
| `ba-doc-writer.md` | User docs, admin guides, API quick-start |

---

## Step 7: Verify `CLAUDE.md`

`CLAUDE.md` is tracked in git and comes with the repo clone. Verify it exists in the project root. This file gives Claude Code knowledge about the project structure, testing strategy, MCP configuration, all 11 agents, 18 skills, and 9 commands.

---

## Step 8: Verify Everything Works

### Checklist

Run through this checklist before the workshop:

- [ ] `node --version` returns 18+
- [ ] `npm install` completed without errors
- [ ] `npm run env:check` prints all 33 variables (no errors)
- [ ] `.mcp.json` exists in project root (6 servers: 3 Playwright + postman + github + context7)
- [ ] `config/` has 3 browser JSON files (chrome, firefox, edge)
- [ ] `npx playwright install chromium firefox` completed
- [ ] `.claude/agents/` has 11 `.md` files
- [ ] `.claude/skills/` has 3 category directories (18 skills)
- [ ] `.claude/commands/` has 9 `.md` files
- [ ] `CLAUDE.md` exists in project root
- [ ] VS Code with Claude Code extension installed

### Test Your Setup

1. Open the project in VS Code
2. Open Claude Code (click the Claude icon in the sidebar)
3. Type this message:

```
Navigate to the storefront and take a screenshot of the homepage
```

If everything is configured correctly:
- A Chrome browser window will open
- It will navigate to your `FRONT_URL`
- A screenshot will be captured
- Claude will describe what it sees

If this works, **you are ready for the workshop!**

---

## Troubleshooting

### "Missing required environment variables"

Your `.env` file is missing some variables. Run `npm run env:check` to see which ones. Add them to `.env`.

### Playwright MCP server not connecting

1. Verify `.mcp.json` exists in the project root (not inside a subdirectory)
2. Check `config/` has all 3 browser config files (chrome, firefox, edge — no WebKit)
3. Run `npx playwright install chromium firefox` to ensure browsers are installed
4. **Restart VS Code** after creating/modifying `.mcp.json` (required!)

### Browser not launching

- **Windows:** Make sure `.mcp.json` uses `"command": "cmd"` with `"args": ["/c", "npx", ...]`
- **macOS/Linux:** Use `"command": "npx"` with `"args": ["@playwright/mcp@latest", ...]`

### "Cannot find module './config.js'"

This project uses ES modules. Make sure you're importing with the `.js` extension:
```javascript
import { env } from './config.js';
```

### Agent not showing up

Make sure the agent `.md` file is in `.claude/agents/` (not `.claude/` root) and has the correct YAML frontmatter at the top:
```markdown
---
name: agent-name
model: opus
---
```

### WebKit/Safari not working

WebKit is NOT supported on Windows. Do not attempt to use it. Use Chrome, Firefox, or Edge instead. Remove any `playwright-webkit` entry from `.mcp.json`.

---

## Need Help?

If you're stuck, reach out to the team lead or post in the QA Team channel. Don't worry if you can't complete every step - we'll troubleshoot any remaining issues at the start of the workshop.
