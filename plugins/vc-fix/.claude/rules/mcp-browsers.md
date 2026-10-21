# MCP Servers & Browser Automation Reference

## MCP Servers (configured in .mcp.json)

| Server | Purpose | Setup |
|--------|---------|-------|
| **playwright-chrome** | Browser automation with Chromium (`--browser chrome`) | CLI flags only — no config file |
| **playwright-firefox** | Browser automation with Firefox (`--browser firefox`) | CLI flags only — no config file |
| **playwright-edge** | Browser automation with Edge (`--browser msedge`) | CLI flags only — no config file |
| **github** | PR review, code search, issue management | PAT axis (`auth.github: pat`): `node ${VC_SECRETS} run github` — vc-secrets injects the `github-pat` secret at launch, `.mcp.json` holds no token. Session axis: the hosted GitHub MCP with OAuth on first use |

Additional MCP servers (configured at user/IDE level, or — depending on your local `.mcp.json` — project-level; `.mcp.json` is gitignored and per-machine, so some of these may appear there too):
- **Chrome DevTools MCP** - Console logs, network requests, performance tracing, HAR export
- **Azure MCP** - Azure Application Insights, resource health, monitoring, and diagnostics
- **Atlassian MCP** - JIRA integration for test case management and bug reporting
- **Figma MCP** (`figma-remote-mcp`) - Visual comparison testing against design specs, design-to-code workflow
- **Microsoft Learn MCP** - Microsoft/Azure docs search, code samples, and full-page fetch
- **VirtoOZ MCP** (`claude_ai_VirtoOZ_for_virtocommerce_com_docs`) - **Primary Virto Commerce documentation source.** 12 topic-scoped retrieval tools: `VirtoCommerce` (general), `PlatformUserGuide`, `PlatformDeveloperGuide`, `PlatformBackendSourceCode`, `PlatformFrontendSourceCode`, `StorefrontUserGuide`, `StorefrontDeveloperGuide`, `FrontendSourceCode`, `MarketplaceUserGuide`, `MarketplaceDeveloperGuide`, `DeploymentGuide`, `B2BExperts`. **All agents should use this via the `/vc-docs` skill** for VC architecture, module, API, deployment, and B2B questions — prefer it over Context7 for any Virto-specific topic.

**Unclear product behaviour ⇒ ask VirtoOZ first.** Any agent, any task: when what the platform or the
storefront is *supposed* to do is not clear, query VirtoOZ via `/vc-docs` before acting on a guess. It
documents the platform's **CORE functionality** — on a CLIENT deployment it is authoritative for the core
path and silent, never negative, about custom modules / themes / storefront forks. The rule, the client
caveat and the 3-source bar: [`../../skills/vc-docs/SKILL.md`](../../skills/vc-docs/SKILL.md) §Scope.

The 4 servers in the table above are configured in `.mcp.json` (project-level); `postman` and `context7` are no longer generated (VCST-6402). The additional servers above are typically at the user/IDE level, though a given machine's `.mcp.json` may also include Chrome DevTools, Azure, Figma, and Atlassian — verify against your local file.

## Browser Automation Rules

- Install browsers: `npx playwright install chromium firefox` (Edge uses the system-installed `msedge` channel).
- Default to `chromium` (not `chrome`) for Playwright MCP browser launches. WebKit is NOT supported on Windows — fall back to Edge or Chrome immediately without attempting installation.
- Always verify MCP server config uses correct browser engine names: `chromium`, `firefox`, `webkit` (not `chrome`, `edge`).
- After any MCP config change, remind the user that a server restart is required before the new config takes effect.
- Playwright servers are configured entirely via CLI flags in `.mcp.json` — `--browser chrome|firefox|msedge`,
  `--isolated` (a clean in-memory context per session), `--viewport-size 1920x1080`, and
  `--output-dir`. Headed is the default (we deliberately do NOT pass `--headless`).
- **`--output-dir` is an ABSOLUTE path into the project's evidence tree** —
  `<project>/reports/bugs/screenshots/_incoming/<browser>/`, written by `gen-mcp.mjs`. It is absolute
  on purpose: playwright-mcp resolves a *relative* `--output-dir` against the MCP server's own cwd,
  which the plugin does not control, and that is how captures ended up at the project root
  (VCST-5582 C). Take screenshots with a **bare relative filename** (playwright-mcp: *"Prefer
  relative file names to stay within the output directory"*); `/qa-bug` Step 4a then makes ONE
  move into `reports/bugs/screenshots/<bug-slug>/`. Full mechanism: `skills/qa-evidence/output-paths.md`.
- **Teardown:** after a browser task, tear down what you started — kill any local dev server you launched
  (find the PID on its port, `taskkill //PID <pid> //F` on Windows / `kill` on POSIX) and delete stray
  helper files the MCP created that are not evidence. Keep only intentional evidence (screenshots) under
  the run's reports dir.

## `.mcp.json` Setup

This file is gitignored — `/project-init` generates it (`gen-mcp.mjs`) from `templates/.mcp.json.example`. Windows uses `cmd /c npx`, Linux/Mac uses `npx` directly (gen-mcp normalizes this automatically). The Playwright servers carry CLI flags plus `--secrets <project>/.env.playwright.local` (the login passwords, below) — or, on a project that keeps its passwords in vc-secrets, are `node ${VC_RUN} playwright <lane>`, which runs the current `TEST_ENV`'s declared lane with the passwords in memory and no file. Restart/reconnect the MCP servers after any edit.

### Browser login — the real UI, the password typed by NAME

Repro/verify runs that sign into the storefront/Admin SPA go through the **real UI** (never an API/token bypass). The login (`USER_EMAIL`, `ADMIN`) is typed as its value from `.env.<env>`. **The password is typed as its NAME** — `browser_type(text="USER_PASSWORD")`, `"ADMIN_PASSWORD"` — never as the value: Playwright MCP finds the name in its `--secrets` file (`.env.playwright.local`, which `/project-init` generates from `.env.local` for the current `TEST_ENV`) or, with the passwords in vc-secrets, in the lane's own memory — the same either way for you — types the value and masks it, so the password never enters your context, a report or the transcript. **Never read a password from `.env.local` to type it.** Use the BARE name — `{{USER_PASSWORD}}` or `$USER_PASSWORD` is typed literally and the login silently fails. A miss ("Login attempt failed" with the right name) means the file is missing or for another env — or, with vc-secrets, that env's password is not stored: `/project-init --check`, then restart.

If you ever want to **reuse a saved browser session** instead of logging in each run, that is an opt-in `--storage-state <path>` on the Playwright server, pointing at a file the client's **own** login flow produced — it is never shipped or generated by the plugin.

> Storybook visual regression (`/qa-storybook` + `ui-ux-expert`) is full `vc-qa` plugin only, not shipped here.
