---
description: "Triage a completed regression run's, or with `ticket <KEY>` a /qa-test or /qa-test-fast checklist's, non-passing cases — runs the vc-test plugin's `qa-triage-results` skill."
argument-hint: "[RUN_ID | latest | ticket <KEY>] [--fix] [--verify] [--min-severity P0|P1|P2|P3]"
disable-model-invocation: true
---

# /qa-triage-results — shim for `vc-test:qa-triage-results`

Invoke the Skill tool with `skill: "vc-test:qa-triage-results"` and the arguments exactly as given
(`$ARGUMENTS`), then follow it. Nothing else runs here.

It needs vc-test ≥ 0.11.0, enabled in `.claude/settings.json` (`vc-test@ai-tools`). Not in your skill list ⇒
**STOP**: "install or update vc-test (`/plugin install vc-test@ai-tools`, or `/plugin marketplace update ai-tools`),
then restart Claude Code".

The procedure — Phases 0–6, the `--fix` gate and `## Rules` — lives in
[`plugins/vc-test/skills/qa-triage-results/SKILL.md`](../../plugins/vc-test/skills/qa-triage-results/SKILL.md).
