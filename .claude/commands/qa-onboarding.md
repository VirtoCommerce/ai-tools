---
description: "Customer onboarding flow: post-install handoff that walks a new user from 'plugin installed' to 'green smoke run + first bug filed'. Use after `npm run plugin:install`."
argument-hint: "[env name | smoke | tour | troubleshoot]"
disable-model-invocation: true
---

# /qa-onboarding — Customer Onboarding Flow

The first command a new customer runs after `npm run plugin:install` completes. Validates the install is functional, runs a guided smoke pass on both surfaces, and hands the user off to the rest of the plugin.

## Usage

```
/qa-onboarding                # full onboarding for the default TEST_ENV (recommended)
/qa-onboarding qa             # full onboarding targeting TEST_ENV=qa
/qa-onboarding smoke          # skip env-check; run smoke only
/qa-onboarding tour           # no execution, just walk through what's available
/qa-onboarding troubleshoot   # diagnostic mode for stuck installs
```

---

## Execution

Run as a structured handoff. At each step, report what's happening and the next action the user can take. If a step fails, stop and surface the remediation hint — do not proceed.

### Step 1 — Sanity check the install (always, except `tour`)

```bash
npm run plugin:check
```

This validates:
- `manifest.json` present + valid
- `.env.${TEST_ENV}` present
- `.env.local` present (gitignored — warn if missing)
- All required env vars resolve (delegates to `npm run env:check`)
- Active config printed: `TEST_ENV`, `ENV_RISK`, `STOREFRONT_PROFILE`, `MODULES_ENABLED`, `JIRA_PROJECT_KEY`

If this fails, surface the specific blocker and stop. Common fixes:
- Missing `.env.${TEST_ENV}` → run `npm run plugin:install -- --env=${envName}`
- Kebab-case `TEST_ENV` → re-run install with an underscore name
- Missing creds → check `.env.local` has `USER_PASSWORD_${TEST_ENV.upper()}` etc.

### Step 2 — Validate both surfaces are reachable

```
/qa-env-check endpoints
```

This pings:
- Storefront (`FRONT_URL`)
- Admin SPA (`BACK_URL`)
- Platform health (`$BACK_URL/health`)
- Auth token endpoint (`$BACK_URL/connect/token` with admin creds)
- GraphQL xAPI

If any UP/DOWN status is DOWN, stop. Common causes:
- Wrong URL → re-run install
- VPN / IP allowlist → check customer's network constraints
- Cert error → confirm `curl -k` flag (Windows + self-signed certs)
- Admin SSO blocking auth → see `docs/onboarding.md` § Atlassian / Admin SSO

### Step 3 — Confirm MCP servers

```
/qa-env-check mcp
```

Required MCPs missing → installer should have warned, but worth a final check. Optional MCPs missing → log which skills will be unavailable (postman, atlassian, figma, etc.), don't block.

### Step 4 — Guided smoke run on BOTH surfaces

```
TEST_ENV=${envName} /qa-smoke
```

This runs the canonical smoke suite (Frontend/smoke/042 + Backend smoke). Both surfaces are exercised. Expected outcome:
- ≥90% pass rate (some failures are normal on a customer env we've never seen before)
- 0 Critical bugs (anything Critical is a real problem — surface it immediately)
- Bugs filed go to `reports/bugs/` with the standard format (per `.claude/rules/reports.md`)

If `ENV_RISK=production`, the orchestrator will auto-skip admin-write suites — that's normal, not a failure.

### Step 5 — Learn how to drive the plugin (hands-on)

Before listing the toolkit, teach the interaction model **by doing** — the customer just ran a real
command in Step 4, so use that as the live example, then demonstrate the contrast.

**a. Name what just happened.** Tell the customer:

```
You just ran `/qa-smoke` — that's a COMMAND: you typed a slash and a testing workflow ran.
That's how you drive almost everything here.
```

**b. Show the contrast live.** Run ONE read-only tool so the difference is observable, not just
described:

```
/qa-status
```

Then narrate:

```
Notice you could also have just *asked* — "show me the QA dashboard" would have run that, because
`/qa-status` is read-only and safe to auto-trigger. You could NOT have done that for `/qa-smoke`:
anything that runs tests, files bugs, or changes code has a guard and must be typed as a slash.
```

(If `/vc-docs` is available, optionally also run `/vc-docs cart` to show a **skill** — same slash
invocation, but it pulls in reference knowledge rather than executing a test.)

**c. State the mental model in three lines:**

```
• Command — you type a slash, a test workflow runs now (/qa-smoke, /qa-regression, /qa-test, /qa-bug)
• Skill   — methodology/knowledge Claude pulls in; some run, some just inform (/qa-checklist, /vc-docs)
• Natural language only auto-runs the read-only three: /qa-status, /qa-env-check, /vc-docs.
  Everything with side effects you must type.

Full explanation + how to read an `argument-hint`: docs/using-commands-and-skills.md
```

**d. Show the toolkit.** Now summarize what the customer has:

```
Here's everything that's now available:

Test execution
  /qa-smoke                 — 5-minute health check (~$1 in tokens)
  /qa-regression critical   — P0 suites only (~$5)
  /qa-regression full       — every suite (~$80, --no-admin halves it)
  /qa-status                — dashboard: active runs, JIRA queue, env health

Test authoring
  /qa-test VCST-XXXX        — test a JIRA ticket end-to-end
  /qa-bug <description>     — reproduce + document + file a bug
  /qa-design <page>         — UX/accessibility audit on a storefront page
  /qa-api ref <module>      — REST/GraphQL API reference for one of your modules
  /qa-checklist <domain>    — domain-specific test checklist (33 storefront + 29 admin)

Multi-env workflow
  Configure a second env:    npm run plugin:install -- --env=staging
  Switch at runtime:         TEST_ENV=staging /qa-smoke
  Production-risk safety:    Set ENV_RISK=production in .env.${envName} → admin-write
                              suites refuse to run without --allow-admin-writes-on-prod

Knowledge surfaces
  docs/using-commands-and-skills.md  — how to drive the plugin: command vs skill, slash vs
                                        natural language, reading argument-hints (start here)
  .claude/ROUTING.md                 — "I want to…" decision tree: which tool for which intent
  .claude/agents/README.md           — what each agent does + when to use it
  .claude/skills/README.md           — 20 skills cross-referenced by purpose
  docs/onboarding.md                 — this flow in long-form, troubleshooting
  docs/versioning.md                 — what we promise to keep stable (Tier A)
  .claude/architecture/TIER.md       — file-by-file classification
```

### Step 6 — File one real bug as proof

If smoke surfaced ANY bug (P0 or otherwise), the recommended next step is:

```
/qa-bug <bug description from the smoke output>
```

This walks the customer through reproducing it, capturing evidence, and (with their OK) filing into their JIRA project. The bug filed must look format-identical to a vcst-internal bug per `reports.md` — that's the standardization promise paying off.

If smoke surfaced no bugs (rare on a fresh customer env — usually there's at least one cosmetic), recommend instead:

```
/qa-exploratory checkout
```

Exploratory session on a customer-chosen domain. Almost always finds something interesting; useful as a confidence check.

### Step 7 — Handoff

End with a short summary the user can paste into their team channel:

```
✅ VC QA plugin v${manifest.version} installed.
   TEST_ENV: ${envName}   ENV_RISK: ${envRisk}   STOREFRONT_PROFILE: ${profile}
   Both surfaces healthy. Smoke run: X/Y pass.
   Bugs filed: ${count} (JIRA project: ${JIRA_PROJECT_KEY})
   Next: /qa-regression critical OR /qa-test <your sprint ticket>
   Docs: docs/onboarding.md · docs/using-commands-and-skills.md (how to drive the plugin)
```

---

## Sub-modes

### `tour` (no execution)

For users who want to see what's available without running anything. Skip Steps 1, 2, 4, 6. From
Step 5, skip the live demo (5b runs `/qa-status`) — instead present the **three-line mental model**
(5c) and the **toolkit menu** (5d), and point prominently at `docs/using-commands-and-skills.md` for
the worked example and how to read an `argument-hint`.

### `smoke` (skip checks)

For users who already ran `/qa-env-check` and just want the smoke. Skip Steps 1–3, go straight to Step 4.

### `troubleshoot` (diagnostic mode)

For users whose install is broken. Run:
1. `npm run plugin:check` (full validation, verbose output)
2. `/qa-env-check vars` (per-bucket var listing — show what's set, what's missing)
3. `/qa-env-check endpoints` (both surfaces, with curl output on failure)
4. `/qa-env-check mcp` (list configured + missing servers)
5. Summarize the problem in one sentence + point at the right doc section in `docs/onboarding.md`.

---

## Pilot Mode (for Phase 4 VC-led pilots)

When VC runs the pilot WITH a customer, append:
- After each step, ask: "did anything need explanation? note it in `reports/pilot-feedback/`"
- After Step 7, run `/qa-onboarding troubleshoot` even on a successful install — the troubleshoot output is the baseline for future customers
- File a pilot-feedback report at `reports/pilot-feedback/customer-${name}-${date}.md` capturing every manual touchpoint (see `docs/pilot-runbook.md` for the template)

---

## Rules

- Read-mostly — Step 1–3 are read-only; Step 4 (smoke) is the only step that runs tests; Step 6 (bug filing) requires explicit user OK before any JIRA write
- Stop on first failure — never proceed past a broken step
- Always show env config prominently — the customer should never be uncertain which env they're hitting
- Never overwrite existing `.env.${TEST_ENV}` or `.env.local` — those are the customer's source of truth
- If JIRA filing is gated by missing atlassian MCP, complete the bug report locally + tell the user how to file it themselves
