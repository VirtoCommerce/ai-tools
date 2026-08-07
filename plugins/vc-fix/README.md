# vc-fix

Agentic **bug lifecycle** plugin for the Virto Commerce B2B e-commerce platform: project setup,
bug filing, autonomous bug fixing, fix verification, and online bug monitoring — as a fully
self-contained Claude Code plugin. **10 agents, 8 commands, 16 skills.**

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

### project-init modes

`/project-init` has one onboarding flow and two **day-2 modes** that skip the interview:

| Invocation | When | What it does |
|------------|------|--------------|
| `/project-init` | first onboarding of a deployment | full interview (**env name · tracker · code host · auth · self-diagnostics consent**) → derive `projectType` / client-vs-platform repo split / contribution mode from the token + a live scan → write `project-profile.json` + `.env.<env>` + `.env.local` + `.mcp.json` → verify access |
| `/project-init --add-env` | day-2: point an already-onboarded project at **another deployment target** (a second QA env, staging, a customer's second site) | asks the new environment name, guards against overwriting an existing `.env.<name>`, then scaffolds `.env.<new>` (its URLs) + the `_<ENV>`-suffixed per-env access creds in `.env.local` — **reusing** the project's tracker/host, leaving cross-env tokens untouched — and verifies the new env with `TEST_ENV=<new>`. Does **not** re-interview, re-scan repos, or rewrite the profile / `.mcp.json` (those are project-level, env-agnostic) |
| `/project-init --check` | day-2: after a plugin upgrade | reconciles the on-disk `project-profile.json` to the current schema (adds new fields with safe defaults, prunes obsolete ones, re-asks operator-decision fields like the self-diagnostics consent), then re-verifies access |

> An **environment** is only a URL set + its access creds, selected at runtime by `TEST_ENV`.
> A different **tracker or code host** is a different *project* — run a fresh `/project-init`
> in its own directory for that, not `--add-env`.

## Quick Start

```
/qa-bug <description>        # Reproduce, document, optionally file a bug
/qa-fix VCST-1234            # Autonomous fix of an already-filed bug — never auto-merges
/qa-verify-fix VCST-1234     # Verify a fix, transition the ticket
/qa-monitoring both          # Query App Insights, dedup, triage, live-repro, report
/qa-env-check                # Validate env vars, endpoints, MCP servers
/vc-self-check               # Diagnose whether the plugin's own skills ran correctly
/vc-feedback "…" 👎          # Attach your own verdict to this session (silent-failure signal)
```

## Self-diagnostics — the client→vendor feedback loop

`vc-fix` watches whether **its own** commands / skills / agents run correctly on your
deployment, so quality problems can flow back to VirtoCommerce and improve the plugin —
with strict privacy guarantees. **Capture is decoupled from escalation:** everything is
recorded silently; only *interesting* (non-clean) work is ever surfaced or sent.

- **What is captured (locally only).** A passive hook (`hooks/session-telemetry.mjs`) records
  every operation as a **span** — command, skill, agent, tool — with timings, and deterministic
  problem *signals* (tool errors, denied permissions, hook failures, STOP/BAIL markers). Spans are
  reconstructed from the session transcript (no per-tool-call overhead). It writes a small
  JSON-lines file to `<project>/.vc-fix/diagnostics/<session_id>.jsonl` (gitignored). **Raw payloads
  are never stored** — tool inputs are hashed (`arg_hash`) and **secrets are redacted** (tokens,
  passwords, card numbers, JWTs). The collector never blocks a tool and never fails your session.
  Capture is **opt-in**: it runs only when `project-profile.json` explicitly sets `selfDiagnostics: true` (and the env kill-switch `VC_FIX_DIAG_CAPTURE` is not off). No profile / no flag / any non-`true` value ⇒ a **full no-op** — no `.vc-fix/` is created. The opt-in is owned by `/project-init`, which asks the consent question as its **first** step and — on Yes — writes the flag **immediately** (before the interview), so its own remaining run is captured from that point on.
- **Capture records everything; judging happens later.** The collector logs *that* something
  happened and is **forbidden from deciding whether it matters** — every anomaly signal, however
  minor, becomes a durable observation with **no severity field**: a non-PASS row of its own
  readiness table, a script's **stderr even when it exited 0**, a non-zero exit, an HTTP non-2xx, a
  self-labelled fallback ("unverified defaults"), an artifact that came out empty, a signal on a
  span that ended fine, a sub-agent error, its own truncation and scan failures. `/vc-self-check`
  assigns severity afterwards. This inverted the original design, where the classifier's verdict at
  span close also decided what was *kept*, so anything it did not recognise ceased to exist — a real
  onboarding run printed a **WARN** in its own table and reported itself perfectly healthy.
- **Outcome, not error count, drives span classification.** Each skill/command span is classified with
  cheap heuristics (no LLM): `success` · `recovered` (a self-corrected error — **not** escalated) ·
  `degraded` (a *struggle* pattern: retry storm, search thrash, reread/fallback loop, low yield) ·
  `failed` (a blocking, unrecovered error) · `silent_suspect` (finished clean but produced none of
  its expected output — a *silent* failure). The old numeric `>= 6` anomaly gate is gone. Note these
  are **behavioural** detectors: a first-try, clean-exit *wrong* result trips none of them, which is
  why the observation layer above exists.
- **One silent auto-diagnosis, deduped — and three honest status lines.** When there is something
  new worth a look (a `failed`/`degraded`/`silent_suspect` span, a self-reported WARN/FAIL, a
  degraded artifact, a 👎 — or a signature whose occurrence count has *grown*), the end-of-turn hook
  runs `/vc-self-check` **silently** (no yes/no modal) to write a **local** `DIAG-*.md` and prints one
  info line. Otherwise it prints `vc-fix self-check: no blocking issues — N observation(s) recorded`
  when anything at all was observed, and `vc-fix self-check: no plugin issues detected` **only** when
  the record is genuinely empty (default ON; silence with `VC_FIX_DIAG_LINE=off`). It can therefore
  stay quiet without ever claiming "clean" while observations exist. Kill switch:
  `VC_FIX_DIAG_CONSENT=off` suppresses both the auto-run and the status line (capture still records).
- **Timed around sub-agents.** `Stop` fires at the end of *every* turn, including one that just handed
  work to a background sub-agent and is waiting. The hook detects that (`background_tasks`, with a
  fallback to any still-open agent op) and treats such a Stop as a **checkpoint** — it records a
  `deferred` decision to the jsonl and prints nothing; the real verdict + line wait for the
  **terminal** Stop after the sub-agent returns.
- **Tell it directly.** `/vc-feedback "<what happened>" [👍|👎]` attaches your verdict to the
  session — the highest-value signal, and the main way a *silent* failure (looked fine, was wrong)
  gets caught.
- **Delivery is consented (`feedback.mode`), scrubbed, and deduped.** Sending anything upstream is a
  separate step (`/vc-self-check deliver`) gated by `project-profile.json` `feedback.mode`
  (set once at `/project-init`): **`off`** = nothing ever leaves the machine · **`ask`** (default) =
  a dry-run + a single Show-diff/Send/Don't-send decision · **`auto`** = the Issue route files
  automatically, a PR/fork-PR is handed off as ready commands (a human always opens the PR). Every
  outbound report is scrubbed of all client source, paths, URLs, identifiers, tickets, and secrets —
  only plugin-file references and a generic reproduction survive; a client-specific finding is
  downgraded. Identical defects from many clients **dedup to one upstream issue with a "+1
  occurrence" comment**. Delivery **never touches your installed plugin** and routes by your GitHub
  token's real rights (PR / fork-PR / issue / local-only). See the
  [`/vc-self-check` skill](skills/vc-self-check/SKILL.md).
- **Nothing accumulates.** Once a finding is delivered, `deliver` removes that session's local
  artifacts (the PR/issue is now the source of truth). As a backstop for artifacts that are *never*
  delivered (`feedback.mode=off`, a PR hand-off you don't `--purge`, a clean no-finding run), the
  collector age-caps its own diagnostics at **SessionStart**: it deletes files older than
  `VC_FIX_DIAG_MAX_AGE_H` hours (default **24**; set `0` to disable), never the current session's.

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
