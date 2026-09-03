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

### Browser login secrets (`--secrets`) — use the SCOPED file, never `.env.local`

Suites that sign into the storefront/Admin SPA must enter real passwords via the **real UI** (never an API/token bypass). The Playwright MCP `--secrets <dotenv>` flag makes this safe: call `browser_type` with the secret's **NAME** (e.g. `browser_type(text="B2B_USER_PASSWORD")`) and the MCP substitutes the value and **redacts it in logs** — the plaintext never enters the agent's context or the transcript. Substitution triggers only when the typed text exactly equals a NAME in the file.

- **Point `--secrets` at a dedicated, minimal file — NOT `.env.local`.** `.env.local` also holds API tokens/keys (`ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `GITHUB_FIX_BUGS_TOKEN`, `JIRA_API_TOKEN`, `FIGMA_API_KEY`, `POSTMAN_API_KEY`, `BROWSERSTACK_ACCESS_KEY`). If those were reachable, a malicious page or prompt-injection could get the agent to type a PAT/API key into an arbitrary web form. Least privilege = a separate file with **login passwords only**.
- **Setup:** copy `templates/.env.playwright.local.template` → `.env.playwright.local` (auto-gitignored by the `.env.*.local` rule), fill from the team secret store, and add `"--secrets", ".env.playwright.local"` to each Playwright server's args (see `templates/.mcp.json.example`). Reconnect/restart the MCP after editing.
- The file is **not** suffix-promoted (read raw by the MCP) — put the concrete value for whichever env you run browser suites against, matching that env's `.env.local` values.

#### Chrome DevTools MCP has **no `--secrets`** — do not brief an agent as if it does

`--secrets` is a **`@playwright/mcp` flag only**. `chrome-devtools-mcp` (Google’s) exposes no
name-substitution or secret-redaction option at all — verified against `npx chrome-devtools-mcp@latest
--help` on 2026-09-02. Typing a variable NAME into a password field on that lane submits **the literal
string**, the sign-in is refused, and an auth-gated route bounces to `/sign-in?returnUrl=…`.

This bit a real run: `/qa-test` VCST-5733’s visual axis was dispatched to `ui-ux-expert` (whose lane IS
Chrome DevTools, per `.claude/rules/agents.md`) with a brief telling it to type `TEST_USER_PASSWORD`.
All three axes came back `INCONCLUSIVE`/`SKIPPED` — correctly reported as blocked rather than clean,
but a whole agent turn was lost. The agent then tried to print the credential and to route it via the
clipboard; **both were denied by the permission classifier, and stopping there was the right call.**

**How to sign a Chrome DevTools lane in — persistent profile, not secrets.** `--isolated` defaults to
`false` and `--userDataDir` defaults to a stable cache path, so **the profile already persists across
MCP restarts**. Sign in **once, by hand**, in that profile and every later session is already
authenticated — strictly stronger than `--secrets`, because the credential never reaches an agent, a
tool call, or the transcript at any point. The repo now pins the path explicitly
(`--userDataDir <home>/.chrome-devtools-mcp/vc-qa-profile`) so a cache clean cannot silently wipe the
session, and sets `--viewport 1920x1080` to match the Playwright lanes.

**Also now set: `--redactNetworkHeaders`.** It defaults to **`false`**, and this is the lane whose whole
job is returning network requests to the model — so `Authorization: Bearer …` from an xAPI call could
land in an agent’s context. This is the closest true analogue to `--secrets` the server offers, and it
was off.

**Briefing rule:** the `--secrets` “type the variable NAME” instruction applies to `playwright-chrome` /
`playwright-firefox` / `playwright-edge` **only**. For a Chrome DevTools lane, either rely on the
pre-signed persistent profile or dispatch the pass to a Playwright lane. Never tell an agent to type a
plaintext password, and never work around a permission denial on a credential.

**A subagent does not inherit `DesignSync`.** Same run, same lane: the `vs. DESIGN` axis was briefed at
`ui-ux-expert` after the orchestrator had verified `DesignSync` in its own session. Subagents do not get
it, so that axis is **unrunnable inside a subagent** and must report `SKIPPED` — `unresolved` is then
*unknown*, never zero. Either the orchestrator reads the spec itself and passes the declared
expectations into the brief **as data**, or the axis runs in the main session.

## Storybook Visual Regression

Visual regression baselines are captured on-demand by the `/qa-storybook` skill (delegated to `ui-ux-expert` agent). No persistent `storybook/` directory is needed — baselines are stored in test evidence directories per ticket. Naming convention: `{story-name}-{viewport}.png` (e.g., `basic-desktop.png`, `hover-state-tablet.png`). See `skills/qa-storybook/` for methodology and guides.
