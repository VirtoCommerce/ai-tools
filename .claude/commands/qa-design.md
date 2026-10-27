---
description: "Evaluate a design (components: dual Storybook + Storefront BL-UI audit; pages/flows: storefront audit) — runs the vc-test plugin's `qa-design` skill."
argument-hint: "component | page path or URL | flow name [--storefront-only] [--design <project|artboard>] [--design-dir <path>]"
disable-model-invocation: true
---

# /qa-design — shim for `vc-test:qa-design`

Invoke the Skill tool with `skill: "vc-test:qa-design"` and the arguments exactly as given
(`$ARGUMENTS`), then follow it. Nothing else runs here.

It needs vc-test ≥ 0.12.0, enabled in `.claude/settings.json` (`vc-test@ai-tools`). Not in your skill list ⇒
**STOP**: "install or update vc-test (`/plugin install vc-test@ai-tools`, or `/plugin marketplace update ai-tools`),
then restart Claude Code".

The procedure — Steps 1–5 and `## Rules` — lives in
[`plugins/vc-test/skills/qa-design/SKILL.md`](../../plugins/vc-test/skills/qa-design/SKILL.md); the methodology the
agent runs is its [`methodology.md`](../../plugins/vc-test/skills/qa-design/methodology.md).
