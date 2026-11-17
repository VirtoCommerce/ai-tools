# Browser work goes through Playwright MCP — and nothing else

<!-- Written by vc-init /project-init (write-agent-rules.mjs). Re-running /project-init or
     /project-init --check overwrites this file; put project-specific additions in another file. -->

**Every browser action in this project — opening a stand, signing in, clicking, filling a form,
taking a screenshot, reading console or network — goes through a Playwright MCP server
(`mcp__playwright-<lane>__*`; `playwright-chrome` unless a task names another lane).** This binds
every plugin, skill, command, agent and subagent in this project, including plugins installed after
this file was written. A plugin, skill or agent that names another browser tool — even as "an
alternative" — yields to this rule.

**Never use any other browser for this project:**

- the desktop app's built-in browser pane (`mcp__Claude_Browser__*`);
- Claude in Chrome (`mcp__claude-in-chrome__*`);
- a Playwright server that `/project-init` did not configure — e.g. the Playwright plugin's own
  (`mcp__plugin_playwright_playwright__*`): it is Playwright, but it receives no password;
- Chrome DevTools MCP (`mcp__Chrome_DevTools__*`, `mcp__chrome-devtools__*`);
- computer use / desktop screenshots, or a browser started from Bash or PowerShell
  (`start msedge`, `Start-Process chrome`, an ad-hoc Playwright or Puppeteer script).

**Why.** None of those can sign in: they refuse to type a password, and none of them can take one
from the project's credential store. Only the Playwright lanes `/project-init` configured receive the
test-user passwords — from `test-accounts.local.json` (or vc-secrets) — so the agent never holds one.

**Signing in.**

- Type the password's NAME with the env under test into the password field — `browser_type` with
  `text: "ADMIN_PASSWORD_<ENV>"` (e.g. `ADMIN_PASSWORD_QA`; or `USER_PASSWORD_<ENV>`, or another
  `*_PASSWORD` the project declares). The bare name (`ADMIN_PASSWORD`) works only on a project with one
  env, or a lane started for one env from vc-secrets. On a master stand, `MASTER_PASSWORD`. The lane
  types the value and masks it in every response.
- Never type `{{ADMIN_PASSWORD}}`, `$ADMIN_PASSWORD` or the value itself, never read a password
  from a file to type it, and never ask the operator for a password in chat.
- The login (user name / email) is not secret: read it from the env (`ADMIN`, `USER_EMAIL`,
  `<KEY>_LOGIN` — the loader takes them from `test-accounts.local.json`) and type it as plain text.

**When Playwright is not available, stop — do not switch browsers.** If no `mcp__playwright-*`
tool is loaded, a lane fails to start, or the typed name lands in the field as literal text, report
it to the operator and suggest restarting Claude Code (MCP servers start with the session) or
running `/project-init --check`. Falling back to another browser only moves the failure to the
password field.

**Parallel agents** each get their own lane — never two agents on one Playwright server at once.
A dispatch brief that sends a subagent to the browser names its lane (`playwright-chrome`,
`playwright-edge`, `playwright-firefox`).
