# MCP Servers & Browser Automation Reference

## MCP Servers (configured in .mcp.json)

| Server | Purpose | Config File |
|--------|---------|-------------|
| **playwright-chrome** | Browser automation with Chromium | `config/mcp-playwright-chrome.config.json` |
| **playwright-firefox** | Browser automation with Firefox — full click-capable lane. Sets `widget.windows.window_occlusion_tracking.enabled=false` so a covered window keeps ticking rAF; that is the CONFIRMED root cause of the 2026-06→08 click timeouts, not a candidate (15/15 probe, `knowledge/automation/browser-quirks.md` §Firefox). Verified live 2026-09-11. Holds only while the MCP server actually loads this config — restart after editing it, and keep `@playwright/mcp` PINNED in `.mcp.json` | `config/mcp-playwright-firefox.config.json` |
| **playwright-edge** | Browser automation with Edge | `config/mcp-playwright-edge.config.json` |
| **postman** | API testing - collections, environments, monitors | N/A (uses `--minimal` flag) |
| **github** | PR review, code search, issue management | N/A (uses `GITHUB_PERSONAL_ACCESS_TOKEN` via `GIT_TOKEN`) |
| **context7** | Up-to-date library documentation lookup | N/A (HTTP MCP at `mcp.context7.com`, uses `CONTEXT7_API_KEY`) |
| **kb** | What the platform was **OBSERVED** to do — `kb_ask` / `kb_show` / `kb_capture` / `kb_confirm` / `kb_dispute` against the public `VirtoCommerce/vc-knowledge` base. **The only server here nobody registers by hand:** the tracked `SessionStart` hook `.claude/hooks/kb-register.mjs` merges it into the local `.mcp.json` and `enabledMcpjsonServers` pre-approves it, so it binds after **one** restart (MCP binds *before* SessionStart hooks run — that restart is inherent, not a bug). Reads need **no token**. When to reach for it: [`../../../CLAUDE.md`](../../../CLAUDE.md) §Essential Rules → *Product context* | N/A (`node scripts/kb/mcp.mjs`; `npm run kb:install` is the manual fallback, `npm run kb -- ask "<q>"` the no-server door) |

Additional MCP servers (configured at user/IDE level, or — depending on your local `.mcp.json` — project-level; `.mcp.json` is gitignored and per-machine, so some of these may appear there too):
- **Chrome DevTools MCP** - Console logs, network requests, performance tracing, HAR export
- **Azure MCP** - Azure Application Insights, resource health, monitoring, and diagnostics
- **Atlassian MCP** - JIRA integration for test case management and bug reporting
- **Figma MCP** (`figma-remote-mcp`) - Visual comparison testing against design specs, design-to-code workflow
- **Microsoft Learn MCP** - Microsoft/Azure docs search, code samples, and full-page fetch
- **VirtoOZ** (a claude.ai connector; its tool names carry the connector id, so name tools by their short name) - **Primary Virto Commerce documentation source.** 12 topic-scoped retrieval tools: `VirtoCommerce` (general), `PlatformUserGuide`, `PlatformDeveloperGuide`, `PlatformBackendSourceCode`, `PlatformFrontendSourceCode`, `StorefrontUserGuide`, `StorefrontDeveloperGuide`, `FrontendSourceCode`, `MarketplaceUserGuide`, `MarketplaceDeveloperGuide`, `DeploymentGuide`, `B2BExperts`. **All agents call it directly** (`doc-sources.md`) for VC architecture, module, API, deployment, and B2B questions — prefer it over Context7 for any Virto-specific topic.

The 6 servers in the table above are configured in `.mcp.json` (project-level). The additional servers above are typically at the user/IDE level, though a given machine's `.mcp.json` may also include Chrome DevTools, Azure, Figma, and Atlassian — verify against your local file.

## Browser Automation Rules

- Install browsers: `npx playwright install chromium firefox` (Edge uses the system-installed `msedge` channel).
- Default to `chromium` (not `chrome`) for Playwright MCP browser launches. WebKit is NOT supported on Windows — fall back to Edge or Chrome immediately without attempting installation.
- Always verify MCP server config uses correct browser engine names: `chromium`, `firefox`, `webkit` (not `chrome`, `edge`).
- After any MCP config change, remind the user that a server restart is required before the new config takes effect.
### Screenshot resolution and cropping — three knobs, measured 2026-09-17 on `@playwright/mcp@0.0.77`

**1. `scale` is a `browser_take_screenshot` PARAMETER, and it defaults to `"css"`.** `"css"` emits
exactly viewport-many pixels and **discards `deviceScaleFactor`**; `"device"` honours it. Proven on
`playwright-mobile` (viewport 390×844, `deviceScaleFactor: 3`): `scale:"css"` → **390×844 / 116 KB**,
`scale:"device"` → **1170×2532 / 594 KB**, exactly 3×. So `deviceScaleFactor` is not inert — it is
**inert unless the caller passes `scale:"device"`**, which is easy to mistake for the former. The three
desktop lanes run `deviceScaleFactor: 2`, so an evidence still taken with `scale:"device"` is 3840×2160
while the default stays 1920×1080.

**2. The viewport sets how much is captured, never how sharp it is.** A 1440×900 viewport at
`deviceScaleFactor: 2` with the default `scale` still produced 1440×900 / 57 KB; resizing to 1920×1080
produced 1920×1080 / 523 KB. Raising the viewport also moves responsive breakpoints, so it is a
behavioural change, not a quality knob.

**3. `element` + `target` crops to ONE node — the biggest readability win, and it costs nothing.**
`browser_take_screenshot` takes `element` (a human-readable description) and **`target`** (the ref from
`browser_snapshot`). **The parameter is `target`, NOT `ref`** — passing `ref` is silently ignored and you
get a full-viewport capture instead, with the emitted code reading `page.screenshot(...)` rather than
`locator(...).screenshot(...)`. That tell in the tool output is how to spot it. Measured on the same
toast: full viewport **1920×1080 / 302 KB**, the element **320×96 / 6 KB** — and only the second is
legible once Jira scales it to `|width=700!`. `fullPage: true` cannot be combined with an element shot.
- Browser configs set viewport to 1920x1080, HAR capture enabled, and isolated contexts. No `recordVideo` — motion evidence is a **GIF built from the run's own stills** (`npm run gif`), never a recorded video file; see `reports-policy.md` §5.2. The three desktop lanes render at 1920×1080; `playwright-mobile` (registered 2026-09-14) at 390×844 portrait. **`.mcp.json` is gitignored and per-machine** — a checkout missing the `playwright-mobile` entry loads that config not at all, and the tell is that `test-results/mobile/` never appears.
- **A run folder outside the project needs `--allow-unrestricted-file-access`.** A Playwright lane writes
  only inside its `--output-dir` and the project, so a `QA_OUTPUT_DIR` outside the project is reached either by
  that flag in each Playwright lane's `.mcp.json` args (it also lifts the lane's limit on reading local files
  and `file://` URLs, so it is the operator's call) or by capturing with a bare filename and moving the file
  ([`run-output.md`](run-output.md) §Screenshots).

## `.mcp.json` Setup

This file is gitignored. After cloning, create it locally. Windows uses `cmd /c npx`, Linux/Mac uses `npx` directly.

### Browser login secrets — the lanes read `test-accounts.local.json`, no secrets file

Suites that sign into the storefront/Admin SPA must enter real passwords via the **real UI** (never an API/token bypass). A Playwright lane holds the passwords as named secrets: call `browser_type` with the secret's **NAME** (e.g. `browser_type(text="B2B_USER_PASSWORD_VCST")`) and the MCP substitutes the value and **redacts it in logs** — the plaintext never enters the agent's context or the transcript. Substitution triggers only when the typed text exactly equals a NAME the lane holds.

**The token is the NAME with the env — `NAME_<ENV>` — never `{{NAME}}`.** The lanes hold every env's passwords at once, so the env travels in the name (`ORG_USER_PASSWORD_VCPTCORE_DEV`); on a master stand it is `MASTER_PASSWORD`. The repo's own test-data convention uses `{{VAR}}` ([`.claude/rules/test-data.md`](../../rules/test-data.md)) and it does **not** apply here: Playwright MCP looks the typed string up as a literal name, so `{{ORG_USER_PASSWORD}}` misses — and the miss is **silent**. `lookupSecret()` returns `{ value: secretName, isSecret: false }` on a miss (verified in `@playwright/mcp` 0.0.80 / `playwright-core` `coreBundle.js`), so the MCP types the literal string into the password field, raises no error, and the only symptom is the form's generic "Login attempt failed. Check your credentials". **It is not lane-specific** — there is no per-browser branch in that code path; the 2026-09-09 "works on edge, fails on chrome" report was a syntax difference between two runs, not an asymmetry.

**Confirm the hit in the same call — don't diagnose from the login error.** The tool response's *Ran Playwright code* line reads `fill(process.env['NAME'])` on a hit and `fill('NAME')` on a miss. Check it on a run's first sign-in. Substitution covers `browser_type` (the whole `text`) and `browser_fill_form` (the whole `value`, `textbox`/`slider` fields only) — it is a whole-value match, never an interpolation inside a longer string.

- **Where the values come from: `test-accounts.local.json`, the one file every test account's login and password live in** (gitignored; shape `templates/test-accounts.example.json`; design `docs/superpowers/specs/2026-11-17-test-accounts-store-design.md`). Each `playwright-*` server in `.mcp.json` starts as `npx -y -p @playwright/mcp@<pin> node scripts/lanes/playwright-lane.mjs <lane> @playwright/mcp@<pin> --config …` (`templates/.mcp.json.example`; `npm run creds:migrate` rewrites an old `--secrets` entry). The launcher reads the store through the loader and hands Playwright MCP the passwords **in memory** (`config.secrets`, the vc-init bridge's mechanism — `plugins/vc-init/bridge/playwright-mcp.mjs`), and keeps the lane's HAR scrubbed of them. No file is generated and nothing is synced.
- **Least privilege:** a lane holds **login passwords only** — the names the suite CSVs, `test-data/` `{{X_PASSWORD}}` tokens and `scripts/lib/user-roles.mjs` declare (`scripts/lib/browser-secrets.mjs` `deriveSecretNames`), for every env with a `.env.<env>` in the project root or a `QA_ENV_PATH` folder, production-risk envs left out. No token or API key ever reaches a lane: those are vc-secrets', and the store refuses a token-shaped name. A name whose value differs between a shared env and a ticket's override of it is not registered (one name, one value).
- **Master stands — type `MASTER_PASSWORD` in every password field.** A stand whose env file says `PASSWORDS=master` signs every test account in with one password, the store's `master` ([`run-env.md`](run-env.md) §Master stands); a master stand gets no `NAME_<ENV>` entries. The hook blocks `MASTER_PASSWORD` in a session whose stand did not opt in (it would send the master password to that stand's form).
- **A lane reads the store at START.** Each one leaves a manifest, `.vc-fix/lanes/<lane>-<pid>.json` (names + salted fingerprints, never a value). When a seeder adds an account or a password changes, `npm run creds:check`, `env:use` and the pre-flight say which lane is behind: reconnect it in `/mcp`, never while browser suites are in flight (a reconnect kills their sessions). Switching env needs no reconnect — every env is already held.
- **Pre-flight enforces it** (`/qa-regression`, `/qa-smoke`): no lane started by the launcher, or a `NAME_<ENV>` a selected browser suite types that a running lane lacks or holds an old value of, is a `secrets:lanes` BLOCK; a name the env has no value for in the store is a `secret:<NAME>` WARN naming its cases, which are reported BLOCKED without a sign-in attempt, and a suite every case of which needs one leaves the plan (`preflight.secrets.gated`). Why: REG-2026-10-14-1556 lost 120 of 124 cases of 089/091 to an unregistered `TEST_USER_PASSWORD`.

#### Chrome DevTools MCP has **no `--secrets`** — do not brief an agent as if it does

`--secrets` is a **`@playwright/mcp` flag only**. `chrome-devtools-mcp` (Google’s) exposes no
name-substitution or secret-redaction option at all — verified against `npx chrome-devtools-mcp@latest
--help` on 2026-09-02. Typing a variable NAME into a password field on that lane submits **the literal
string**, the sign-in is refused, and an auth-gated route bounces to `/sign-in?returnUrl=…`.

This bit a real run: `/qa-test` VCST-5733’s visual axis was dispatched to `ui-ux-expert` (whose lane WAS
Chrome DevTools then; since P2-5c `vc-test:ui-ux-expert` runs on a Playwright lane) with a brief telling it to type `TEST_USER_PASSWORD`.
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

**Third path — let the agent MINT the account through the UI.** For a **role-agnostic** target the
agent needs no credential at all: it registers one. It chooses the password, so nothing is fetched, and
the whole flow runs on real-user tools (`take_snapshot` → `fill_form` → `click`) — no `--secrets`, no
pre-signed profile, and no plaintext secret in a tool call. Measured 2026-09-03 on vcst-qa (theme
`2.57.0-pr-2444`): `/sign-up` *Personal account* → `/successful-registration`, which does **not**
auto-login (the header still renders *Sign in*); `/sign-in` with the same credentials then signs in.
**No verification gate on this store**, so the account is usable immediately.

Four conditions travel with it, and the third decides whether this path is available at all:

- **Verification is store-config, not a constant.** `emailVerificationEnabled`
  (`knowledge/domain/store-settings.md`; the invariant is BL-AUTH-002). When it is ON, QA mail reaches no
  inbox and the recovery path is Admin SPA → Security → Users → *Resend link* → Notifications → Preview →
  extract the `confirmemail?UserId=…&Token=…` URL (`email_verification_testing_workflow` memory) — which
  needs an **admin** session, i.e. straight back to the credential problem on this lane. Check the
  setting before committing to this route.
- **Prefix it `AGENT-TEST` explicitly.** `uniqueEmail()` in `scripts/lib/random-data.ts` defaults to
  `agent-<ts>-<id>@qa.test`, but every teardown sweep keys on `AGENT-TEST` (`seed-bopis.mjs`,
  `reconcile-test-data.mjs` — *"only deletes locations whose LIVE name starts with AGENT-TEST"*), so the
  default leaves an unidentifiable orphan. Pass `uniqueEmail("AGENT-TEST")`. Even then **nothing sweeps a
  storefront-registered personal contact** — the prefix sweeps cover catalogs, orgs, BOPIS locations and
  pricelists; contacts are not covered, so deletion is manual via Admin → Security → Users. The prefix
  buys findability, never automatic cleanup.
- **A minted account has NO role and NO data, so it is valid ONLY for a role-agnostic surface.** Public
  pages, the design system, WCAG/axe, tokens and geometry — fine, and cleaner than a fixture because the
  empty states are genuine. A **role-gated or data-bearing** surface renders its **empty state**, which is
  a *different surface* than the one under test and **reads as a pass** — the same failure shape as a case
  that certifies a defect. VCST-5733's sales-rep hub is the worked example: it needs the sales-rep role
  plus served customers, so a minted account audits the wrong screen and returns green. When the target is
  role-gated, use the persistent profile or a Playwright lane instead.
- **Sign out at the end of the pass, and never promote it to a fixture.** `Remember me` plus the
  persistent profile makes the throwaway the lane's **standing identity** — the next design/a11y run then
  audits as that account with no announcement. And being outside `scripts/lib/user-roles.mjs` it must
  never be cited by a test case as `@td()` or `{{VAR}}`: it is disposable, not a declared fixture.

**Briefing rule — three options, and the brief must NAME which one.** The `--secrets` “type the variable
NAME” instruction applies to `playwright-chrome` / `playwright-firefox` / `playwright-edge` **only**. A
Chrome DevTools brief picks one of: (1) the **pre-signed persistent profile** — the default, and the only
one that reaches a role-gated surface without leaving the lane; (2) **mint an account through the UI** —
role-agnostic targets only, under the four conditions above; (3) **dispatch the pass to a Playwright
lane**. Leaving it unstated is what produced the VCST-5733 loss: the agent inferred `--secrets`, and an
agent left to guess its own auth path burns a turn discovering the lane cannot do it. Never tell an agent
to type a plaintext password, and never work around a permission denial on a credential.

**No lane calls `DesignSync` any more — the `vs. DESIGN` source is files on disk.** This section
used to record how a subagent *could* call it (load the deferred schema with `ToolSearch
select:DesignSync` first; re-probed 2026-09-08 against project `518d0b90-…`). Since Claude Code
2.1.280 the tool's own description restricts it to the user-started `/design-sync` skill, and on
2026-10-01 (VCST-5957) the orchestrator declined it on exactly that ground — so a brief that names
the `ToolSearch` step now asks an agent to use a tool outside its declared purpose, and the outcome
depends on the model. The orchestrator instead runs `npm run design:extract` over the local copy
of the ticket's project (`.design-source/<uuid>/`) and hands the agent the **spec JSON path**:
`unresolved` is machine-counted, every input carries a sha256, and nothing about the lane or the
session decides whether the axis runs. Source ladder:
[`plugins/vc-test/skills/qa-design/claude-design-verification.md`](../../../plugins/vc-test/skills/qa-design/claude-design-verification.md) §1.

## Lanes that pile up — symptom, cause, `npm run lanes:reap`

**Symptom (measured 2026-11-27, Windows 11, 24 logical CPUs, 64 GB):** CPU at 100 % and ~26 GB held by `node.exe`; 530 node processes, 244 of them `playwright-lane.mjs` lanes (62 per lane name), 208 older than a day, the oldest 8 days, plus a wrapper (`cmd /c npx` → `npx-cli.js` → `cmd`) around each and ~30 copies each of the chrome-devtools-mcp, serena and vc-secrets stacks.

**Two causes, both fixed:**
- **CPU** — a lane started before vc-init 0.8.3 spun a core once its `test-results/<lane>/har` folder was deleted (`fs.watch` fired ~200 000 events/s, PR #684). A lane started with 0.8.3 or later burns 0 % idle, with a browser open, and after its HAR folder or all of `test-results/` is deleted (re-measured 2026-11-27).
- **Count** — a Claude session keeps its MCP servers for as long as the session exists, and the desktop app keeps idle sessions for days; the settings of this repo start **four** lanes (chrome, firefox, edge, mobile) in every one. A lane exits by itself when its stdin closes (killing the session takes the lane and its browser with it), but an open idle session never closes it. Nothing used the lanes, nothing stopped them.

**What stops them now (vc-init ≥ 0.10.0):**
1. **The lane ends itself** (`bridge/lane-watchdog.mjs`): when a process that was above it at start is gone (**orphaned**), or when nothing has crossed its stdin or stdout for **`VC_LANE_IDLE_HOURS`** (default **4**; `0` turns the idle exit off). A lane serving a request writes to stdout as it works, so it is never stopped mid-request. The client then shows the lane as disconnected — **reconnect it in `/mcp`**. Set the variable in the `env` block of `.claude/settings.local.json` (the lanes inherit the session's environment); the lane log line is `playwright-lane: stopping — idle: …`.
2. **`npm run lanes:reap`** (`plugins/vc-init/scripts/lanes-reap.mjs`; runs from any checkout with vc-init) lists the MCP stacks — lane, chrome-devtools-mcp, serena, vc-secrets — whose owner process is gone, and every lane older than **24 h** (`--older-than <h>`, `0` = off; `--all-kinds` applies the age rule to the other servers too). **Dry run by default**; `-- --apply` stops each stack whole, browser children first. It never touches a stack younger than `--min-age` minutes (default 30) nor its own process tree; `--lanes-only`, `--json`. A session that was still using a stopped server reconnects it in `/mcp`.

**Starting fewer** (what each session costs): the lanes below are only needed when a run names them — `agents.md` assigns edge to `qa-backend-expert`, firefox to `qa-testing-expert`, mobile to the mobile suites. `/project-init` enables **only `playwright-chrome`**; the other three are enabled by hand in `enabledMcpjsonServers` of `.claude/settings.local.json`. Leave them out of a session that does not run those lanes: each is four processes (`cmd`, `npx`, `cmd`, the lane) and ~50–80 MB before a browser opens. **Lazy start is not possible today:** Claude Code starts every enabled stdio server at session start and has no start-on-first-use; a stub that answers `tools/list` and spawns the real lane on the first call would be a protocol proxy in front of every lane, not worth its own failure modes. The wrappers do not outlive the lane: when the lane exits, `npx` and both `cmd` shells exit with it (verified), so reaping the lane takes its wrappers.

**Not enabled, for you to decide:** running `lanes:reap` (dry run, or `--apply`) from a `SessionStart` hook in the tracked `.claude/settings.json`, so every new session first sweeps the stacks of the ones that ended. It would add a process listing (~1–2 s on Windows) to every start and, with `--apply`, stop other sessions' servers without being asked; it is deliberately **not** wired up.

## Storybook Visual Regression

Visual regression baselines are captured on-demand by the `/qa-storybook` skill (delegated to the `vc-test:ui-ux-expert` agent). No persistent `storybook/` directory is needed — baselines are stored in test evidence directories per ticket. Naming convention: `{story-name}-{viewport}.png` (e.g., `basic-desktop.png`, `hover-state-tablet.png`). See `skills/qa-storybook/` for methodology and guides.
