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

Additional MCP servers (configured at user/IDE level, or — depending on your local `.mcp.json` — project-level; `.mcp.json` is gitignored and per-machine, so some of these may appear there too):
- **Chrome DevTools MCP** - Console logs, network requests, performance tracing, HAR export
- **Azure MCP** - Azure Application Insights, resource health, monitoring, and diagnostics
- **Atlassian MCP** - JIRA integration for test case management and bug reporting
- **Figma MCP** (`figma-remote-mcp`) - Visual comparison testing against design specs, design-to-code workflow
- **Microsoft Learn MCP** - Microsoft/Azure docs search, code samples, and full-page fetch
- **VirtoOZ MCP** (`claude_ai_VirtoOZ_for_virtocommerce_com_docs`) - **Primary Virto Commerce documentation source.** 12 topic-scoped retrieval tools: `VirtoCommerce` (general), `PlatformUserGuide`, `PlatformDeveloperGuide`, `PlatformBackendSourceCode`, `PlatformFrontendSourceCode`, `StorefrontUserGuide`, `StorefrontDeveloperGuide`, `FrontendSourceCode`, `MarketplaceUserGuide`, `MarketplaceDeveloperGuide`, `DeploymentGuide`, `B2BExperts`. **All agents should use this via the `/vc-docs` skill** for VC architecture, module, API, deployment, and B2B questions — prefer it over Context7 for any Virto-specific topic.

The 6 servers in the table above are configured in `.mcp.json` (project-level). The additional servers above are typically at the user/IDE level, though a given machine's `.mcp.json` may also include Chrome DevTools, Azure, Figma, and Atlassian — verify against your local file.

## Browser Automation Rules

- Install browsers: `npx playwright install chromium firefox` (Edge uses the system-installed `msedge` channel).
- Default to `chromium` (not `chrome`) for Playwright MCP browser launches. WebKit is NOT supported on Windows — fall back to Edge or Chrome immediately without attempting installation.
- Always verify MCP server config uses correct browser engine names: `chromium`, `firefox`, `webkit` (not `chrome`, `edge`).
- After any MCP config change, remind the user that a server restart is required before the new config takes effect.
- Browser configs set viewport to 1920x1080, HAR capture enabled, video on failure, isolated contexts.

## `.mcp.json` Setup

This file is gitignored. After cloning, create it locally. Windows uses `cmd /c npx`, Linux/Mac uses `npx` directly.

> Storybook visual regression (`/qa-storybook` + `ui-ux-expert`) is full `vc-qa` plugin only, not shipped here.
