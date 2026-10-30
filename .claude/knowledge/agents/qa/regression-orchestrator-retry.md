# Regression orchestrator — retry ladder, rate-limit guard, fast-path failures

> Cited by `.claude/agents/regression-orchestrator.md` Step 5. Read it when a suite fails, times out or reports a rate limit; a run where every suite settles first time never reads it. Moved verbatim from the agent on 2026-10-30 (VCST-6423); the first retry table (failure type → action → delay) stays in the agent.

## Step 5: Retry Logic — backoff ladder, rate-limit guard, fast-path failures

**Backoff is a ladder, not a flat delay.** A retry that fires at the same interval as the attempt
that just failed tends to fail the same way; and a suite whose first retry hit a rate limit is the
least likely to succeed 30 seconds later.

| Attempt | Delay | Browser |
|---|---|---|
| 1 (original) | — | assigned slot |
| 2 (retry 1) | 30s | same slot |
| 3 (retry 2) | 60s | next in `defaults.fallbackChain` **that the suite is allowed on** |

A retry NEVER lands on a server the plan marked `NOT ON` for that suite. The fallback chain is
`playwright-chrome → playwright-edge → playwright-firefox`. Firefox sits third for continuity, not
because it is degraded: since 2026-09-08 it takes click-driven suites like any other slot
(`defaults.firefoxClickOk`). If clicks start timing out there at *"visible, enabled and stable"*, the
MCP server was not restarted after the occlusion-pref config change — see
`knowledge/automation/browser-quirks.md` §Firefox before assuming a suite defect.

**Rate-limit guard.** Rate limits are a property of the whole run, not of one suite, so treat them
globally rather than retrying into the wall:

| Signal | Action |
|---|---|
| 1 suite reports a rate limit | wait 60s before the next dispatch |
| 2 suites report rate limits | wait 90s between dispatches |
| 3+ suites report rate limits | pause ALL dispatch for 120s |
| cumulative hits > 10 | drop browser concurrency from 3 to 2 for the rest of the run |

**Fast-path specific failures:**

| Failure Type | Action | Delay |
|---|---|---|
| `graphql_lint_failed` | Do NOT retry — structural defect, mark suite failed, surface DV-019 in bug list | 0 |
| `schema_introspection_failed` | Run `npm run schema:refresh` then retry once | 60s |
| `graphql_runtime_fatal` (network / unexpected) | Retry once with fresh introspection | 30s |
| `authentication_failure` (token-grant) | Retry once, then mark failed | 30s |
