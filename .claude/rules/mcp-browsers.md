# MCP Servers & Browser Automation Reference

## MCP Servers (configured in .mcp.json)

| Server | Purpose | Config File |
|--------|---------|-------------|
| **playwright-chrome** | Browser automation with Chromium | `config/mcp-playwright-chrome.config.json` |
| **playwright-firefox** | Browser automation with Firefox | `config/mcp-playwright-firefox.config.json` |
| **playwright-edge** | Browser automation with Edge | `config/mcp-playwright-edge.config.json` |
| **postman** | API testing - collections, environments, monitors | N/A (uses `--minimal` flag) |
| **github** | PR review, code search, issue management | N/A (uses `GITHUB_PERSONAL_ACCESS_TOKEN` via `GIT_TOKEN`) |
| **context7** | Up-to-date library documentation lookup | N/A (HTTP MCP at `mcp.context7.com`, uses `CONTEXT7_API_KEY`) |

Additional MCP servers (configured at user level or in IDE settings, not in `.mcp.json`):
- **Chrome DevTools MCP** - Console logs, network requests, performance tracing, HAR export
- **Atlassian MCP** - JIRA integration for test case management and bug reporting
- **Figma MCP** - Visual comparison testing against design specs

All 6 servers in the table above are configured in `.mcp.json` (project-level). The 3 additional servers above are typically configured at the user/IDE level.

## Browser Automation Rules

- Install browsers: `npx playwright install chromium firefox` (Edge uses the system-installed `msedge` channel).
- Default to `chromium` (not `chrome`) for Playwright MCP browser launches. WebKit is NOT supported on Windows — fall back to Edge or Chrome immediately without attempting installation.
- Always verify MCP server config uses correct browser engine names: `chromium`, `firefox`, `webkit` (not `chrome`, `edge`).
- After any MCP config change, remind the user that a server restart is required before the new config takes effect.
- Browser configs set viewport to 1920x1080, HAR capture enabled, video on failure, isolated contexts.

## `.mcp.json` Setup

This file is gitignored. After cloning, create it locally. Windows uses `cmd /c npx`, Linux/Mac uses `npx` directly.

## Storybook Visual Regression

Visual regression baselines are captured on-demand by the `/qa-storybook` skill (delegated to `ui-ux-expert` agent). No persistent `storybook/` directory is needed — baselines are stored in test evidence directories per ticket. Naming convention: `{story-name}-{viewport}.png` (e.g., `basic-desktop.png`, `hover-state-tablet.png`). See `.claude/skills/testing/qa-storybook/` for methodology and guides.
