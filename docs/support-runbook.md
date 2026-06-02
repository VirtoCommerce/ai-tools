# VC QA Plugin — Support Runbook

Internal-to-VC playbook for supporting customers running the VC QA plugin. Pre-v1.0 this is best-effort via GitHub Issues. Post-v1.0 GA, it becomes the three-tier model defined in [`docs/distribution.md`](distribution.md).

> **Audience:** VC partner-engineering / customer success / QA staff who answer customer questions about the plugin.
>
> **Not for customers.** Customer-facing material is [`docs/onboarding.md`](onboarding.md) + [`docs/pilot-runbook.md`](pilot-runbook.md) § 2 (welcome email).

## Section 1 — Support Tiers

| Tier | Audience | Channel | SLA target | What's in scope |
|------|---------|---------|-----------|-----------------|
| **0 — Self-serve** | Everyone | `docs/onboarding.md` + `docs/troubleshooting.md` + GitHub Discussions | Instant | Install, configure, run smoke. Most customers should stay here. |
| **1 — Public** | Free, all VC customers | [GitHub Issues](https://github.com/VirtoCommerce/vc-mcp-testing-module/issues) | Acknowledge within 2 business days, resolve P0 within 5 | Bugs in the plugin, doc clarifications, feature requests. |
| **2 — Direct** | Paid add-on (pricing TBD post-pilot) | Customer's named VC Slack channel + email to plugin-support@virtoworks.com | Acknowledge same business day, P0 within 24h | Customer-specific config issues, deployment quirks, urgent regressions, env triage. |
| **3 — Consulting** | Engagement | Schedule via VC account manager | Per SOW | Custom suite authoring, knowledge-pack extension, on-prem hardening, pilot kickoff for complex deployments. |

> **Pre-v1.0:** all customers are Tier 0/1. No paid tiers. Pilot customers temporarily get Tier 2 treatment by the pilot owner (named in `docs/pilot-runbook.md`).

## Section 2 — Triage Flow

When a customer reports an issue, route it through this triage before responding.

```
Customer reports issue
        │
        ▼
┌──────────────────────────────┐
│ Q1: Is it a plugin bug,      │
│     a customer config issue, │
│     or a customer-storefront │
│     bug surfaced BY the      │
│     plugin?                  │
└──────────────────────────────┘
        │
        ├─ Plugin bug ──────────► §3.A — file GitHub Issue, label appropriately
        │
        ├─ Config issue ────────► §3.B — point at the right doc section + confirm
        │
        ├─ Storefront bug ──────► §3.C — congratulate them; the plugin worked
        │                          as designed. Help them file in their JIRA.
        │
        └─ Don't know yet ─────► §3.D — diagnostic protocol
```

## Section 3 — Triage Branches

### §3.A — Plugin bug (issue with the plugin itself)

Symptoms: `npm run plugin:check` fails on a clean install · A skill throws an error mentioning a plugin internal file · `npx tsx scripts/...` script crashes · Schema validation fails on a manifest the plugin shipped.

Triage steps:
1. Reproduce locally with `TEST_ENV` matching customer's. If you can't reproduce, document why (Windows vs Mac, Node version, MCP version).
2. Severity label:
   - **P0**: any customer can't install or run smoke. Stop other work, fix today.
   - **P1**: customer can't use a major skill (`/qa-bug`, `/qa-regression`, `/qa-design`). Fix this week.
   - **P2**: edge-case error, workaround exists. Backlog.
3. File GitHub Issue with: customer-redacted repro steps, expected vs actual, env (Node version, OS, plugin version pinned), customer impact.
4. Fix → release patch (`v0.1.1`, etc.) → notify all pilot customers via the pilot-feedback channel.

### §3.B — Customer config issue

Symptoms: "It doesn't work" but `plugin:check` passes · Missing env var · Wrong MCP server configured · `TEST_ENV` validation rejection · `aliases.json` placeholder not replaced · Customer ran on wrong env (e.g. prod when they meant staging).

Triage steps:
1. Ask the customer to run `npm run plugin:check` and paste the output verbatim.
2. Ask: "What's the value of `TEST_ENV` and `ENV_RISK` you're using?"
3. Compare against [`docs/onboarding.md`](onboarding.md) § Troubleshooting — almost certainly one of:

| Customer symptom | Likely cause | Fix |
|------------------|--------------|-----|
| Suites are all skipping | `MODULES_ENABLED` doesn't list the modules they have | Help them set it correctly or unset it |
| Admin-write suite refuses to run | `ENV_RISK=production` on the env they're targeting | Either lower the risk class for that env, or pass `--allow-admin-writes-on-prod` |
| `Invalid TEST_ENV` error | Kebab-case (`customer-staging-eu`) | Switch to underscores (`customer_staging_eu`); update `.env.local` suffix too |
| Bug-filing fails | `JIRA_PROJECT_KEY` wrong or missing | Set in `.env.${TEST_ENV}`; default is `VCST` which won't match their JIRA |
| `/qa-design` fails | Figma MCP not configured | Optional MCP; either install or accept that `/qa-design` is unavailable |
| `Browser "chromium" is not installed` | Playwright MCP browser cache mismatch | `cli.js install` inside the MCP's bundled playwright-core |
| Per-env secret not resolving | `.env.local` has `USER_PASSWORD_QA` but customer set `TEST_ENV=qa-1` | Match the suffix exactly; `[a-z0-9_]+` only |
| Suites pass but bug filing posts to wrong project | They overrode `JIRA_PROJECT_KEY` in `.env.local` instead of `.env.${TEST_ENV}` | Move to the right file; secrets aren't required for the project key |

4. If `docs/onboarding.md` doesn't cover the issue, **update the doc** before closing the ticket. The customer is doing free triage for you.

### §3.C — Customer-storefront bug

Symptoms: A `/qa-` command surfaced a real bug in the customer's storefront or Admin SPA. Their question is "is this a real bug?" or "how do I file it?"

Triage steps:
1. Read the bug report the plugin produced. It should already follow `.claude/rules/reports.md` format.
2. Confirm with the customer that the bug looks reproducible.
3. Help them file it in their JIRA project (if `atlassian` MCP is configured, `/qa-bug` does this; otherwise paste the report).
4. **Capture for telemetry:** what suite found it, severity, env, customer (anonymized). Track in `reports/pilot-feedback/bugs-surfaced.md` (running file across all pilots).
5. **Close the ticket as success** — plugin worked as designed.

> This is the GOOD outcome. Plugin found a real bug, customer files it, customer ships a fix. Track these as the plugin's value-delivered metric.

### §3.D — Don't know yet (diagnostic protocol)

When the symptom is unclear, ask for these in one message:

```
To diagnose, please share:

1. The exact command you ran.
2. The full output (paste verbatim, including any colors/formatting).
3. Your TEST_ENV name and ENV_RISK.
4. Output of `npm run plugin:check`.
5. Output of `node .claude/skills/run-vc-mcp-testing-module/driver.mjs`.
6. Node version: `node --version`.
7. OS + Claude Code version.

Don't worry about being thorough — extra info just speeds triage.
```

Most issues resolve at this step because the customer realizes the problem while gathering the info.

## Section 4 — Escalation Paths

| Situation | Escalate to |
|-----------|------------|
| P0 plugin bug affecting any active pilot | Pilot owner (named per `docs/pilot-runbook.md` § 1) → loops in plugin maintainer |
| Customer security concern (credential leakage, evidence sanitization gap) | Plugin maintainer + VC security team in parallel |
| Customer requests custom suite authoring | Tier 3 (consulting). Forward to VC account manager. |
| Customer requests a new Tier A change | Plugin maintainer. Tier A changes need an RFC issue + reviewer signoff per `docs/versioning.md`. |
| Customer requests a non-storefront-or-admin surface (mobile, marketplace, modules-as-products) | Out of scope. Refer to the strategic plan; don't promise. |
| Customer wants to fork and self-maintain | Discourage. Offer to scope a Tier 3 engagement instead. Forks defeat the standardization story. |

## Section 5 — Patch Release Workflow (Tier 1 fixes)

When fixing a customer-reported plugin bug:

1. Cut a fix branch off the latest tag: `git checkout -b fix/<short-description> v0.1.0-alpha`
2. Fix + test (driver + targeted skill that exercised the bug).
3. PR against `main`. Reference the customer-redacted GitHub Issue.
4. After merge: tag the patch (`v0.1.1`, `v0.1.2`, etc.) and push the tag.
5. Update `CHANGELOG.md` under a new release header (move items from `[Unreleased]` to the dated version).
6. Notify all pilot customers + close the GitHub Issue with a "fixed in vX.Y.Z" comment.

## Section 6 — Customer Communication Patterns

### Acknowledging an issue (Tier 1, within 2 days)

```
Hi {name},

Thanks for filing. I've reproduced what you're seeing on my side and can confirm
it's a plugin issue, not a config one.

Severity: P{0|1|2}.
Tracking: {GitHub Issue URL}.
ETA: {today | this week | backlog}.
Workaround: {none | <describe>}.

Will update here when fixed. If urgent, ping me directly.

— {pilot owner / maintainer name}
```

### Closing an issue as "config, not bug"

```
Hi {name},

Looks like this is a config issue rather than a plugin bug. Specifically:
{one-line summary of the cause}.

Fix: {paste-able command / config snippet}.

After applying, please confirm `npm run plugin:check` passes. If it still
doesn't work, reopen this issue and I'll dig deeper.

The relevant doc section is {linked URL to docs/onboarding.md anchor}. I've
also added a note there to make this easier to find for the next customer.

— {name}
```

### Closing as "by design"

```
Hi {name},

Thanks for raising. The behavior you're seeing is intentional:

{explain the design rationale + link to the relevant rule in
.claude/rules/ or docs/versioning.md}

If this is causing real pain, please tell me more about your use case —
we can consider a feature request to address it without breaking the
current contract.

— {name}
```

### Telling a customer their storefront has a bug

```
Hi {name},

The plugin surfaced what looks like a real bug in your storefront — not
a plugin issue.

Reproduction (per .claude/rules/reports.md format):
{paste the bug report the plugin generated}

I'd recommend filing this in your team's JIRA. If you have atlassian MCP
configured, `/qa-bug` will do it for you. Otherwise paste the report above.

Happy to walk through it on a call if helpful.

— {name}
```

## Section 7 — Knowledge Base Contributions

When you close a support ticket, ask:

- Did the customer have to dig for the answer? → Update `docs/onboarding.md` § Troubleshooting.
- Did the customer use language we don't? → Add to a glossary stub.
- Did the customer report the same thing as another customer? → Pattern to fix in v0.2.

The support runbook **is** the plugin's knowledge base. Every ticket either resolves at Tier 0 (the docs answered) or generates a doc improvement.

## Section 8 — Anti-Patterns

Things we don't do:

- **Fix customer config bugs by editing files for them.** Always have them run the command themselves so they learn the system.
- **Bypass `plugin:check`.** If it fails, it fails. Don't tell customers "ignore the warning."
- **Promise features that aren't on the roadmap.** Refer them to `docs/versioning.md` + the strategic plan if they want a new capability.
- **Argue with customer about their env naming.** It's their env. As long as it's `[a-z0-9_]+`, they're right.
- **Apologize for the cost.** Document expected token spend up front so they're not surprised; if they think it's too expensive, that's a pricing-model conversation, not a support one.

## References

- Distribution model: [`./distribution.md`](distribution.md) § Support Model
- Customer onboarding: [`./onboarding.md`](onboarding.md)
- Pilot runbook: [`./pilot-runbook.md`](pilot-runbook.md)
- Versioning + Tier A freeze: [`./versioning.md`](versioning.md)
- Plugin manifest: [`../manifest.json`](../manifest.json)
- CHANGELOG: [`../CHANGELOG.md`](../CHANGELOG.md)
