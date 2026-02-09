# Pre-Workshop Setup Guide

**Workshop:** Project Onboarding & Claude Code for QA
**Duration:** 1.5 hours
**Please complete this setup BEFORE the workshop**
**Estimated setup time:** 45-60 minutes

---

## What You Need From Your Team Lead

Before starting, request the following from your team lead:

1. **Anthropic API key** (for Claude Code)
2. **`.env` file** with all credentials (URLs, test users, payment cards, API keys)
3. **Agent definition files** (6 markdown files for `.claude/agents/`)
4. **`CLAUDE.md`** file (project knowledge base)
5. **Postman API key** (for API testing MCP server)

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
```

**Validate your `.env`:**

```bash
npm run env:check
```

You should see all 29 variable values printed. If you see `Missing required environment variables`, add the missing ones.

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
    "playwright-webkit": {
      "type": "stdio",
      "command": "cmd",
      "args": [
        "/c", "npx", "@playwright/mcp@latest",
        "--config", "config/mcp-playwright-webkit.config.json"
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

### 4.2 Create `config/` directory with 4 browser config files

```bash
mkdir config
```

**`config/mcp-playwright-chrome.config.json`**

```json
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": { "headless": false },
    "contextOptions": {
      "viewport": { "width": 1920, "height": 1080 },
      "recordVideo": {
        "dir": "./test-results/chrome/videos",
        "video": "on-failure",
        "size": { "width": 1920, "height": 1080 }
      },
      "recordHar": {
        "path": "./test-results/chrome/har",
        "omitContent": true
      }
    }
  },
  "isolated": true,
  "outputDir": "./test-results/chrome",
  "screenshot": "only-on-failure"
}
```

**`config/mcp-playwright-edge.config.json`**

```json
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": { "headless": false, "channel": "msedge" },
    "contextOptions": {
      "viewport": { "width": 1920, "height": 1080 },
      "recordVideo": {
        "dir": "./test-results/edge/videos",
        "video": "on-failure",
        "size": { "width": 1920, "height": 1080 }
      },
      "recordHar": {
        "path": "./test-results/edge/har",
        "omitContent": true
      }
    }
  },
  "isolated": true,
  "outputDir": "./test-results/edge",
  "screenshot": "only-on-failure"
}
```

**`config/mcp-playwright-firefox.config.json`**

```json
{
  "browser": {
    "browserName": "firefox",
    "launchOptions": { "headless": false },
    "contextOptions": {
      "viewport": { "width": 1920, "height": 1080 },
      "recordVideo": {
        "dir": "./test-results/firefox/videos",
        "video": "on-failure",
        "size": { "width": 1920, "height": 1080 }
      },
      "recordHar": {
        "path": "./test-results/firefox/har",
        "omitContent": true
      }
    }
  },
  "isolated": true,
  "outputDir": "./test-results/firefox",
  "screenshot": "only-on-failure"
}
```

**`config/mcp-playwright-webkit.config.json`**

```json
{
  "browser": {
    "browserName": "webkit",
    "launchOptions": { "headless": false },
    "contextOptions": {
      "viewport": { "width": 1920, "height": 1080 },
      "recordVideo": {
        "dir": "./test-results/webkit/videos",
        "video": "on-failure",
        "size": { "width": 1920, "height": 1080 }
      },
      "recordHar": {
        "path": "./test-results/webkit/har",
        "omitContent": true
      }
    }
  },
  "isolated": true,
  "outputDir": "./test-results/webkit",
  "screenshot": "only-on-failure"
}
```

---

## Step 5: Install Playwright Browsers

```bash
npx playwright install
```

This downloads Chromium, Firefox, and WebKit browser binaries (~500 MB total).

---

## Step 6: Set Up Agent Definitions

Create the `.claude/agents/` directory:

```bash
mkdir -p .claude/agents
```

Copy the 6 agent definition files provided by your team lead into this directory:

| File | Agent |
|------|-------|
| `qa-lead.md` | QA orchestrator - delegates tasks to specialists |
| `qa-backend-expert.md` | Backend/API testing specialist |
| `qa-frontend-expert.md` | Storefront/UI testing specialist |
| `qa-testing-expert.md` | Interactive testing & debugging |
| `test-management-specialist.md` | Test planning & documentation |
| `ui-ux-expert.md` | Accessibility & design system testing |

---

## Step 7: Create `CLAUDE.md`

Copy the `CLAUDE.md` file provided by your team lead into the project root. This file gives Claude Code knowledge about the project structure, testing strategy, and MCP configuration.

---

## Step 8: Verify Everything Works

### Checklist

Run through this checklist before the workshop:

- [ ] `node --version` returns 18+
- [ ] `npm install` completed without errors
- [ ] `npm run env:check` prints all 29 variables (no errors)
- [ ] `.mcp.json` exists in project root
- [ ] `config/` has 4 JSON files (chrome, edge, firefox, webkit)
- [ ] `npx playwright install` completed
- [ ] `.claude/agents/` has 6 `.md` files
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
2. Check `config/` has all 4 browser config files
3. Run `npx playwright install` to ensure browsers are installed
4. **Restart VS Code** after creating/modifying `.mcp.json` (required!)

### Browser not launching

- **Windows:** Make sure `.mcp.json` uses `"command": "cmd"` with `"args": ["/c", "npx", ...]`
- **macOS/Linux:** Use `"command": "npx"` with `"args": ["@playwright/mcp@latest", ...]`

### "Cannot find module './config.js'"

This project uses ES modules. Make sure you're importing with the `.js` extension:
```javascript
import { env } from './config.js';
```

### Agent not showing up in `/agents`

Make sure the agent `.md` file is in `.claude/agents/` (not `.claude/` root) and has the correct YAML frontmatter at the top:
```markdown
---
name: agent-name
model: opus
---
```

---

## Need Help?

If you're stuck, reach out to the team lead or post in the QA Slack channel. Don't worry if you can't complete every step - we'll troubleshoot any remaining issues at the start of the workshop.
