# VC QA Plugin — Pilot Runbook

Internal-to-VC playbook for running the first customer pilots (Phase 4 of the strategic plan). Use this to (1) decide if a customer is pilot-ready, (2) run the pilot, (3) capture every friction point so v0.2 ships better defaults.

> **Audience:** VC QA / partner-engineering staff running the pilot. Not customer-facing.
>
> **Goal of every pilot:** the customer's QA lead runs `/qa-smoke` on their own across ≥ 2 envs and files a real bug in the standard `reports.md` format — without VC support. That's the [Phase 4 success metric](functional-singing-cosmos.md).

## Section 1 — Pilot Candidate Qualification

Before approaching a customer, confirm all of the following. If any answer is no, work the issue first; don't run a pilot you can't complete.

### Customer-side prerequisites

| Item | Why | How to verify |
|------|-----|---------------|
| VC deployment in production (or near-prod) | Pilot needs a real env to test against. Toy/demo deployments waste both teams' time. | Ask: "What's your production storefront URL? Admin URL? How long live?" |
| Active QA contact who works both surfaces | Phase 4 success requires both storefront AND admin runs. Storefront-only QA lead can't complete. | One named person with both responsibilities. Get an email. |
| At least 2 envs available (e.g. dev + staging) | Multi-env verification is the third hard success check. Single-env pilots can't prove the env-switching story. | Ask for URLs of both. |
| Claude Code installed locally on the QA lead's machine | The plugin requires Claude Code ≥ 1.0. | Ask them to send `claude --version` output. |
| Node 18+ | Plugin scripts are Node/TypeScript. | Ask for `node --version`. |
| Customer-side JIRA project for bug filing | `/qa-bug` files there. Atlassian MCP must authenticate to it. | JIRA project key + confirmation they have admin or Bug-Create permission on that project. |

### VC-side prerequisites

| Item | Why |
|------|-----|
| Named pilot owner (one VC person, not a team) | When the pilot hits friction, the customer must reach ONE person. |
| Anthropic API key + token budget allocated to the customer's runs | Pilot runs cost $5–$80 per `/qa-regression`. Confirm budget before starting. |
| Approval from VC leadership to commit ~10 hrs of pilot owner time over 2 weeks | Pilots that get under-resourced fail at Step 4. |
| Plugin at a tagged version (not branch tip) | Customers must be able to pin. Branch tip changes underneath them. |

If all qualified: send the customer the **Customer Welcome Pack** below.

---

## Section 2 — Customer Welcome Pack

Paste this into the kickoff email to the customer's QA lead. (Edit URLs/version to current values.)

```
Hi [name],

Welcome to the VC QA plugin pilot. Here's everything you need to start:

1. Plugin repo:    https://github.com/VirtoCommerce/vc-mcp-testing-module
2. Version to pin: v0.1.0-alpha (commit: ${SHA})
3. Onboarding:     docs/onboarding.md (in the repo)

Before our kickoff call, please:
  ☐ Clone the repo and run `npm install`
  ☐ Open docs/onboarding.md and skim the Prerequisites section
  ☐ Confirm your team has the 3 Playwright MCP servers configured
  ☐ Pick the first env to target (dev or staging — NOT prod for the kickoff)
  ☐ Have the env's URLs, store ID, and a non-admin test user ready

At the kickoff (60 min), we'll:
  - Walk through `npm run plugin:install` together (5 min)
  - Run /qa-onboarding on your env (15 min)
  - Verify both surfaces are reachable + run smoke (15 min)
  - Discuss the rest of the suite (15 min)
  - Capture any friction points (5 min)

After kickoff you should be able to run /qa-smoke unaided. We'll check in after
one week to see how a second env went.

Questions? Reply to this thread. Plugin docs: docs/onboarding.md.
```

---

## Section 3 — Pilot Execution

Follow this exactly. Capture timestamps for the friction-point analysis.

### Kickoff (60 min, video call)

| Time | Step | Capture (in feedback notes) |
|------|------|-----------------------------|
| 0:00 | Customer screenshares their terminal in their plugin clone | — |
| 0:05 | They run `npm install` | How long? Any warnings or errors? |
| 0:10 | They run `npm run plugin:install` | Did they answer every prompt without asking you? Which prompts confused them? |
| 0:25 | They run `npm run plugin:check` | Did it pass first try? If not, what was the blocker? |
| 0:30 | They run `/qa-onboarding` | Step-by-step, where did they pause? What did they read? |
| 0:50 | First `/qa-smoke` result | Pass rate? Bugs found? Time to first result? |
| 0:55 | Tour of available commands (Step 5 of onboarding) | Which commands did they ask about? |
| 0:58 | Confirm they have everything for next week | Any blockers? |

### Solo run (week +1, customer alone)

Customer commits to:
1. Configure a SECOND env (`npm run plugin:install -- --env=<other>`)
2. Run `/qa-smoke` against the second env without VC help
3. Run `/qa-regression critical` against the first env
4. File one real bug via `/qa-bug` (if smoke surfaces any)
5. Send back: how long each took, any blockers, any docs they had to read

This is the **Phase 4 hard success check.** If the customer's QA lead does all five without escalating, the pilot is a success.

### Wrap (60 min, end of week 2)

| Item | Discussion |
|------|------------|
| Did the customer's solo run complete? | If no — what blocked them? Triage as v0.2 fix. |
| Bug they filed (if any) — does the format match `reports.md`? | If no — what differs? Adjust the bug template. |
| Manual touchpoints during the solo run | Each one becomes a doc fix, default change, or error message improvement in v0.2. |
| Cost incurred (Anthropic tokens) | Document for the next pilot's expectation setting. |
| Net Promoter ish question: "Would you tell another VC customer to install this?" | One-sentence answer, capture verbatim. |

---

## Section 4 — Feedback Capture Template

For every pilot, file a structured report at `reports/pilot-feedback/customer-${name}-${YYYY-MM-DD}.md`. Use this template:

```markdown
# Pilot Feedback — ${Customer Name}

**Pilot owner (VC):** ${name}
**Customer QA lead:** ${name}, ${email}
**Plugin version:** ${version} (commit ${SHA})
**Dates:** ${kickoff} → ${wrap}
**Envs configured:** ${count} (${env names})

## Outcome

- Phase 4 success metric (customer ran /qa-smoke solo on ≥ 2 envs + filed a real bug in standard format): ☐ Yes ☐ No
- If No, blocker:

## Time-to-value

- Time from clone → first green smoke: ${HH:MM}
- Time from clone → second env configured: ${HH:MM}
- Time from clone → first bug filed: ${HH:MM}

## Friction Points (everything that needed manual help)

| Step | What happened | Doc / default / error message that would have prevented it |
|------|---------------|------------------------------------------------------------|
| ${step} | ${verbatim quote or paraphrase} | ${specific change to ship in v0.2} |

(Aim for 5–15 entries. If fewer, the pilot wasn't deep enough.)

## Quantitative

- Smoke runs: ${count}
- Critical runs: ${count}
- Full runs: ${count}
- Bugs filed: ${count} (link to JIRA)
- Anthropic spend: $${amount}
- Time invested by VC pilot owner: ${hours} hrs

## Bugs found in the plugin itself (not the customer's storefront)

- ${bug 1}
- ${bug 2}

(Track these separately from customer-storefront bugs. They become GitHub issues against the plugin repo.)

## v0.2 changes proposed

From the friction-points table, the top-3 changes the customer would value most:

1. ${highest-value change}
2. ${next}
3. ${next}

## Customer quote (optional, for marketing later)

> ${verbatim, attributed if customer consents}

## Sign-off

VC pilot owner: ${name}  ${date}
Customer QA lead: ${name}  ${date}
```

---

## Section 5 — What Counts as a Successful Pilot

The pilot succeeds when ALL of these hold:

1. Customer's QA lead ran the universal suite subset green on ≥ 2 envs without VC support (vcst-specific suites can fail/skip; that's expected, not a pilot failure).
2. Customer **authored at least one of their own suites** for a customer-specific feature, in the standard Enriched CSV format using `@td()` resolver. Suite runs under the same orchestrator as the shipped reference suites.
3. Customer filed at least one real bug in their JIRA project in the standard `reports.md` format — bug can come from any suite (reference or customer-authored).
4. No critical plugin bugs surfaced (a critical = "couldn't run any test on any env", or "framework is broken on Windows", or similar).
5. Customer's quote answers "yes, recommend to another VC customer."
6. Feedback report filed at `reports/pilot-feedback/customer-${name}-${date}.md`.

Pilot is a partial success if 1–4 hold but 5 is wobbly — capture the wobble and ship the v0.2 fix; offer a re-pilot.

Pilot has failed if 1, 2, 3, or 4 don't hold. Stop. Triage the blockers. Don't run a second pilot until they're fixed.

> **Why metric #2 matters:** the plugin's actual value proposition is "framework for authoring + agent crew + methodology", with the reference suites as a starting library. A pilot that runs only the universal subset without ever writing a customer-specific suite hasn't validated the actual product. If the customer can't or won't author their own suite during the pilot week, that signals either (a) the docs/framework aren't approachable enough, or (b) the customer doesn't have features worth testing — both are blockers worth surfacing.

---

## Section 6 — Triage Workflow for Pilot Findings

After each pilot, every friction point gets one of three labels:

| Label | Meaning | SLA to ship the fix |
|-------|---------|---------------------|
| `must-fix-before-next-pilot` | Will block any other customer | Before next pilot starts |
| `must-fix-before-ga` | Won't block, but is a clear papercut | Before v1.0 GA |
| `nice-to-have` | Real but minor | Backlog, no SLA |

Track in `reports/pilot-feedback/triage.md` (one running file across all pilots). When something graduates from must-fix to fixed, link the commit + plugin version.

---

## Section 7 — Customer Sequencing

Don't run > 1 pilot at a time. The pilot owner can't context-switch effectively.

Order matters:

1. **Pilot 1:** internal-friendly customer with low-stakes deployment (mostly to exercise the flow).
2. **Pilot 2:** active VC customer with > 1 year on the platform (more interesting bugs, more edge cases).
3. **Pilot 3:** customer with a complex deployment (custom modules, custom checkout, multi-region).

After Pilot 3, if all three are successes, ship v0.2 → v1.0 in the same release cycle.

---

## Section 8 — When to Pause

If Pilot 1 fails on success metric #1 (customer can't run smoke solo on 2 envs), **stop scheduling pilots**. The plugin isn't ready. Fix the blockers. Re-pilot the same customer first before trying a new one.

Watching for: 3+ "must-fix-before-next-pilot" findings from one pilot. That's a signal the customer is doing free QA on the plugin itself, which isn't fair to them.

---

## References

- Strategic plan: [`~/.claude/plans/functional-singing-cosmos.md`](file:///~/.claude/plans/functional-singing-cosmos.md) § Phase 4
- Customer-facing onboarding: [`./onboarding.md`](onboarding.md)
- Distribution model: [`./distribution.md`](distribution.md)
- Tier governance: [`./versioning.md`](versioning.md)
- Customer-onboarding command: [`../.claude/commands/qa-onboarding.md`](../.claude/commands/qa-onboarding.md)
