# Pilot Rehearsal Protocol

A step-by-step script a colleague follows **cold** — without prior exposure to the plugin — to validate that the install + first smoke path works for a real human. Closes Phase 1 workstream #12.

> **Audience:** The colleague serving as the rehearser (Section 1) + the VC observer who debriefs them (Section 6).
>
> **Not a customer pilot.** A pilot is a paying / committed customer running this in their own org. A rehearsal is a friendly colleague pretending to be a customer. Rehearsal is cheap and discovers friction before any real customer sees it.
>
> **Time budget:** 90 minutes wall-clock. Hard stop at 2 hours — if they can't complete in that window, that IS the finding and the protocol pauses for fixes.

## Section 1 — Recruit the Rehearser

| Required of rehearser | Why |
|----------------------|-----|
| Has used Claude Code at least once before | Otherwise install friction conflates "plugin friction" with "Claude Code friction" |
| Has installed an npm package + run a node script | We need someone who won't get stuck on `npm install` itself |
| Has NEVER seen this plugin before | The whole point of the rehearsal is fresh eyes |
| Is willing to think aloud / take notes | We can't observe what we don't hear |
| Has 90 minutes uninterrupted | This is the budget |

**Useful to have (not blocking):**
- Some VC product context (knows storefront from admin SPA)
- Has done QA work in their career
- Tolerates ambiguity (the install isn't all polish)

**Disqualifying:**
- They built or maintained any part of `vc-mcp-testing-module`
- They've read `~/.claude/plans/functional-singing-cosmos.md`
- They've reviewed this PR

## Section 2 — Brief the Rehearser (5 min)

Read this aloud OR send as the only context. Do not show the plan, the changelog, or any other internal doc.

```
You're a QA lead at a Virto Commerce customer. Your team has been using
VC's platform for a year. You've heard VC ships a QA plugin — a Claude
Code plugin that runs agentic regression against your VC deployment.
You've never seen it. You're going to install it and run a smoke test
against the VC demo env, then tell us what was confusing.

Your environment:
- Your storefront: https://virtostart-demo-store.govirto.com
- Your admin SPA: https://virtostart-demo-admin.govirto.com
- We've put test credentials in a file at the start of this exercise

You DO NOT have access to internal VC Slack, internal docs, or the
team that built the plugin. Pretend you're a customer reading the
public README. Treat the GitHub repo as your only authoritative source.

What we want from you:
1. Follow the install instructions. Note every place you stalled,
   guessed, or had to ask "what does this mean?"
2. After install, run /qa-smoke and report what happened.
3. After 90 minutes (or completion, whichever comes first), tell us
   what you wish had been clearer.

Talk out loud or take notes — we can't observe what we don't hear.
There are no wrong answers. Friction is the data.
```

## Section 3 — Setup (10 min, observer-only)

Before handing over to the rehearser, prepare:

| Action | Why |
|--------|-----|
| Create a fresh local directory: `mkdir vc-qa-rehearsal && cd vc-qa-rehearsal` | Simulates a clean clone with no leftover state |
| Confirm rehearser has Claude Code installed: `claude --version` | If not, install Claude Code first — that's a separate Claude Code rehearsal, not ours |
| Provide rehearser with **only** these credentials in a text file: virtostart `USER_EMAIL`, `USER_PASSWORD_VIRTOSTART`, `ADMIN`, `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY` | These would be a real customer's pre-existing assets |
| Make sure rehearser has the repo URL: `https://github.com/VirtoCommerce/vc-mcp-testing-module` | The only doc surface |
| Start a timer | 90 min cap |
| Open a notes doc: `reports/pilot-rehearsal/rehearsal-YYYY-MM-DD-{rehearser-initials}.md` | Where friction notes get captured |

## Section 4 — The Rehearsal Script (75 min)

The rehearser drives. The observer takes notes. **Do NOT help unless they're blocked > 5 min on a single step.** Helping defeats the purpose.

### Stage A — Discover (target: 5 min)

Rehearser opens the repo URL in their browser. They have 5 minutes to figure out what this is and what to do next.

**Observer captures:**
- Did the README make the value prop clear?
- Did they find `docs/onboarding.md` on their own, or did they get lost in `.claude/agents/`?
- Did they understand what a "plugin" means here vs an npm package?

**Pass:** they navigate to `docs/onboarding.md` (or `docs/test-authoring.md` for advanced) within 5 min without help.
**Fail:** they don't know what to do after 5 min → that's a README problem; observer notes it and points them at `docs/onboarding.md` so the rest of the rehearsal can proceed.

### Stage B — Install (target: 20 min)

They follow `docs/onboarding.md` to install via `/plugin marketplace add` + `/plugin install`.

**Observer captures, per step:**
- Did the command they were told to run actually work?
- Did the prompts match what the doc described?
- Did they understand which `.env.local` entries they needed?
- Did `npm run plugin:check` exit clean?

**Pass:** `/plugin install vc-qa@vc-tools` returns success + `npm run plugin:check` reports green.
**Fail modes (don't help; just record):**
- They didn't realize they needed to run `/plugin marketplace add` first
- They pasted the wrong marketplace-source format (see `docs/troubleshooting.md` entry for this exact friction)
- `.env.local` is undefined to them — they don't know the per-env-suffix promotion model
- They got Playwright browser install errors and didn't know to run `npx playwright install chromium`
- They got `Browser "chromium" is not installed` from the MCP

**If they get stuck > 5 min on any sub-step**, observer offers ONE hint, records both the friction and the hint, and continues.

### Stage C — First env:check (target: 10 min)

`npm run env:check` on `TEST_ENV=virtostart`. Should be green if `.env.local` was filled in correctly.

**Observer captures:**
- Did they understand the output of `env:check`?
- Did missing-var errors point them at the right file?
- Did they have to guess at the per-env-suffix convention (`USER_PASSWORD_VIRTOSTART`)?

**Pass:** `env:check` exits 0.
**Fail:** they get a missing-var error and can't trace it to which file to edit → that's a `.env.local.template` clarity problem.

### Stage D — Multi-env filter dry-run (target: 5 min)

`npm run verify:multi-env` (offline, no token spend). They should see the 6 scenarios passing.

**Observer captures:**
- Did they understand what the output meant?
- Did they grasp that this is a pre-flight before the real smoke?

**Pass:** they see "Passed: 6 · Failed: 0" and understand it.

### Stage E — First real smoke (target: 25 min, ~$3-5 in tokens)

This is the moneyball test. Run the actual smoke against virtostart.

```bash
TEST_ENV=virtostart \
  ENV_RISK=test \
  SUITE_SELECTION=smoke \
  npx tsx ci/run-regression.ts
```

**Observer captures:**
- Did they hit the ANTHROPIC_API_KEY question (covered in the test brief)?
- Did the orchestrator's progress output make sense to them — could they tell it was working?
- Did suites pass / fail / get skipped? Did the skip reasons make sense?
- Did the consolidated `reports/regression/REG-*/` report come out usable?

**Pass:** smoke completes. The rehearser can navigate to `reports/regression/REG-*/regression-report.md` and tell you the pass/fail/skip counts without help.
**Fail modes:**
- Smoke crashes mid-run → real-customer-impacting issue, document precisely
- Smoke passes but the report is unreadable → docs/reports formatting issue
- Smoke fails 50%+ of cases → either a real virtostart issue OR a plugin issue; observer triages later

### Stage F — Wrap (target: 10 min)

Rehearser narrates their three biggest friction points. Observer transcribes them verbatim into the friction-capture template (Section 5).

**Observer asks (open-ended):**
- "What did you wish had been clearer?"
- "What did you have to guess?"
- "What surprised you?"
- "Would you recommend this to a real customer in its current state? Why or why not?"

Then the observer takes back the laptop, runs `cd .. && rm -rf vc-qa-rehearsal/` (cleanup), and thanks the rehearser.

## Section 5 — Friction-Capture Template

The output file lives at `reports/pilot-rehearsal/rehearsal-YYYY-MM-DD-{initials}.md`. Use this exact structure:

```markdown
# Pilot Rehearsal — {rehearser initials} — YYYY-MM-DD

**Rehearser:** {first name only or initials}
**Observer:** {first name only}
**Duration:** {actual minutes}
**Outcome:** {Pass | Pass-with-friction | Stalled-out | Blocked-completely}

## Stage results

| Stage | Target | Actual | Outcome |
|-------|--------|--------|---------|
| A — Discover | 5 min | __ min | __ |
| B — Install | 20 min | __ min | __ |
| C — env:check | 10 min | __ min | __ |
| D — verify:multi-env | 5 min | __ min | __ |
| E — Smoke | 25 min | __ min | __ |
| F — Wrap | 10 min | __ min | __ |

## Top 3 friction points (verbatim from rehearser)

1. ...
2. ...
3. ...

## Observer-recorded issues

| # | Stage | What happened | Severity | Suggested fix |
|---|-------|---------------|----------|---------------|
| 1 | __ | ... | __ | ... |

Severity:
- **Blocker** — rehearser couldn't proceed without help
- **Major** — they could proceed but spent > 5 min off-track
- **Minor** — confusing but they recovered alone
- **Polish** — they noticed and asked, but it didn't slow them

## Quotes worth keeping (rehearser verbatim)

> "..."

> "..."

## Recommendation

{Ship to first paid customer as-is | Fix Blockers + Majors first | Major rework needed before any customer touches it}

## Files / docs to update before next rehearsal

- [ ] ...
- [ ] ...
```

## Section 6 — Triage (within 24h of rehearsal)

The observer triages the report:

1. **Blockers** → open GitHub Issues immediately, label `pilot-blocker`. These gate the next rehearsal.
2. **Majors** → open Issues, label `pilot-friction`. Fix before any paid customer pilot.
3. **Minors** → log in `docs/troubleshooting.md` as new entries (someone else will hit them).
4. **Polish** → backlog; address in a future minor release.

**Don't fix during the rehearsal.** Don't even discuss fixes with the rehearser. The rehearsal captures the state-as-it-is.

## Section 7 — When to Re-Rehearse

Re-run with a NEW rehearser (never the same one twice) when:

- All Blockers and ≥80% of Majors from the prior rehearsal are fixed
- A non-trivial structural change lands (e.g. plugin manifest format changes, new install path)
- Before any paid customer pilot (always)

Target: **2 successful rehearsals (no Blockers, ≤2 Majors total) before the first paid pilot.**

## Section 8 — Common Failures (Pre-Known)

These are issues we already know exist. The rehearsal validates whether they actually trip up a fresh person, and whether the documented workarounds suffice. Recorded here so the observer can recognize them quickly.

| Failure | Documented at | Expected rehearser experience |
|---------|--------------|------------------------------|
| `Browser "chromium" is not installed` from playwright MCP | `docs/troubleshooting.md` entry for Playwright MCP browser version | Should recover via `cli.js install` per the troubleshooting entry |
| `Path does not exist: ./` from marketplace add | `docs/troubleshooting.md` entry for marketplace source format | Should recover by re-pasting just the `owner/repo` part |
| Missing `USER_PASSWORD_VIRTOSTART` in `.env.local` | `docs/onboarding.md` § per-env suffix promotion | Should find the convention by reading the template |
| `.env.local` not loaded | `config.js` load order documented in `CLAUDE.md` | Should diagnose via `env:check` output |
| Suite skips due to `ENV_RISK=production` | `docs/test-authoring.md` § 11 | Should understand from the orchestrator's per-suite skip-reason output |

## Section 9 — Outputs

After a rehearsal completes, three artifacts exist:

1. `reports/pilot-rehearsal/rehearsal-YYYY-MM-DD-{initials}.md` — the captured report
2. GitHub Issues for every Blocker + Major, labeled `pilot-blocker` / `pilot-friction`
3. PR draft (one or many) addressing the labeled issues, due before the next rehearsal

The PR titles should reference the rehearsal: `Fix pilot-blocker from rehearsal-2026-06-XX-AB: <one-line description>`.

## References

- Phase 1 plan workstream #12: `~/.claude/plans/functional-singing-cosmos.md` § Section 4 / Section 5
- Pilot runbook (the actual customer pilot, AFTER rehearsals pass): [`pilot-runbook.md`](pilot-runbook.md)
- Customer onboarding (what the rehearser reads): [`onboarding.md`](onboarding.md)
- Troubleshooting catalog (what they consult when stuck): [`troubleshooting.md`](troubleshooting.md)
- Release process (versioning that gates rehearsals): [`release-process.md`](release-process.md)
