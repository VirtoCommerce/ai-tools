# vc-fix

Agentic **bug lifecycle** plugin for the Virto Commerce B2B e-commerce platform: project setup,
bug filing, autonomous bug fixing, fix verification, and online bug monitoring — as a fully
self-contained Claude Code plugin. **8 agents, 7 commands, 15 skills.**

Part of the [`vc-tools`](../../.claude-plugin/marketplace.json) marketplace hosted in
[`vc-mcp-testing-module`](https://github.com/VirtoCommerce/vc-mcp-testing-module) — currently the
**only** plugin listed there.

## Install

```
/plugin marketplace add VirtoCommerce/vc-mcp-testing-module
/plugin install vc-fix@vc-tools
/reload-plugins
```

Then, in the plugin install directory (Claude Code shows the path after install), run:

```
/project-init
```

It interviews you for env name, bug tracker (Jira or Azure Boards), code host (GitHub or Azure
Repos), and auth — never passwords — then derives the rest (native-platform vs client project,
fork account) from your token plus a live repo scan, and writes `project-profile.json` +
`.env.<env>` + `.env.local` + `.mcp.json`. That profile is what routes every `/qa-fix` to the
right repo and tracker.

## Quick Start

```
/qa-bug <description>        # Reproduce, document, optionally file a bug
/qa-fix VCST-1234            # Autonomous fix of an already-filed bug — never auto-merges
/qa-verify-fix VCST-1234     # Verify a fix, transition the ticket
/qa-monitoring both          # Query App Insights, dedup, triage, live-repro, report
/qa-env-check                # Validate env vars, endpoints, MCP servers
/vc-self-check               # Diagnose whether the plugin's own skills ran correctly
```

## Self-diagnostics

`vc-fix` watches whether **its own** skills run correctly on your deployment, so quality
problems can flow back to VirtoCommerce and improve the plugin — with strict privacy guarantees.

- **What is captured (locally only).** A passive hook (`hooks/session-telemetry.mjs`) records, per
  session, which plugin skills ran, their timings, and deterministic problem *signals* — tool
  errors, denied permissions, hook failures, STOP/BAIL markers. It writes a small JSON-lines file
  to `<project>/.vc-fix/diagnostics/<session_id>.jsonl` (gitignored). **Secrets are redacted**
  (tokens, passwords, card numbers, JWTs); the collector never blocks a tool and never fails your
  session.
- **Nothing runs, and nothing leaves, without you.** When a session looks anomalous, you get a
  single plain **yes/no** prompt at the end — never an automatic diagnosis. Only if you say yes does
  `/vc-self-check` read the telemetry + transcript and write a **local** `DIAG-*.md`. Sending
  anything to VirtoCommerce is a *separate*, explicitly-confirmed step (`/vc-self-check deliver`).
  Opt out of the prompt entirely with `VC_FIX_DIAG_CONSENT=off`.
- **Client-code containment.** The optional upstream report is scrubbed of all client source,
  paths, URLs, identifiers, tickets, and secrets — only plugin-file references and a generic
  reproduction survive; a client-specific finding is downgraded to a generic description. The
  delivery **never touches your installed plugin** and routes by your GitHub token's real rights
  (PR / fork-PR / issue / local-only). See the
  [`/vc-self-check` skill](skills/vc-self-check/SKILL.md).

## Why self-contained

`vc-fix` doesn't reference files in the parent repo — it has its own `knowledge/`, `.claude/rules/`,
`config.js`, `scripts/lib/`, `package.json`. Claude Code has no documented way for a plugin's
commands/skills to resolve bare relative paths against "wherever the plugin got installed" (no
`${CLAUDE_PLUGIN_ROOT}`-equivalent — paths resolve against the *user's* CWD, which may be an
unrelated project). See [`skills/qa-fix-routing/SKILL.md`](skills/qa-fix-routing/SKILL.md) for the
finding, and [`skills/qa-monitoring/SKILL.md`](skills/qa-monitoring/SKILL.md) for the same
treatment applied to the online-monitoring pipeline.

## What's shipped vs. what isn't

`vc-fix` is a **narrow slice** of the full `vc-qa` agent crew that this repo also hosts (source,
not currently marketplace-listed — see the [repo root README](../../README.md)). No regression
orchestration, no BA team, no Storybook/a11y/design-system tooling — those stay in `vc-qa`. Full
breakdown of what's included and what was intentionally dropped:
[`knowledge/agents/README.md`](knowledge/agents/README.md).

## Gate ladder

`/qa-fix` never auto-merges. Every fix ends at an open PR for human review. The full G0–G7 gate
ladder (triage → reproduce → fix → review → CI/E2E → human review) is documented in
[`.claude/rules/quality-gates.md`](.claude/rules/quality-gates.md) — the single source of truth
both this interactive plugin and any future headless twin must follow.

## Reference

- [`.claude/rules/mcp-browsers.md`](.claude/rules/mcp-browsers.md) — MCP servers + browser rules
- [`.claude/rules/reports.md`](.claude/rules/reports.md) — report categories + size caps
- [`knowledge/agents/README.md`](knowledge/agents/README.md) — full agent/command/skill inventory
