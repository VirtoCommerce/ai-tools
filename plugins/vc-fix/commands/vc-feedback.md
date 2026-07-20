---
description: "Attach an explicit thumbs-up/down verdict (with optional note) to the current vc-fix session's telemetry trace — the highest-value signal for the client→vendor feedback loop and the main detector of SILENT failures (a task done wrong with no error). Local + silent: the verdict is recorded to <outputRoot>/.vc-fix/diagnostics/<session>.jsonl by the UserPromptSubmit hook; nothing is sent (upstream delivery is the separate feedback.mode-gated `deliver` step). Plugin-wide, not qa-prefixed."
argument-hint: "\"<what happened>\" [👍|👎]"
---

# /vc-feedback — Operator verdict on this session

Tier 2b of the vc-fix self-diagnostics feedback loop (VCST-5509). Use it to tell the
plugin, in your own words, whether the plugin's commands/skills/agents just did the
right thing — especially when they *looked* fine but were actually wrong (a **silent
failure** the automatic heuristics can't catch).

## Usage
```
/vc-feedback "the /qa-fix PR fixed the symptom but broke pagination" 👎
/vc-feedback "great — the bug report was spot on" 👍
/vc-feedback "the repro missed the B2B case"          # verdict inferred (neutral if unclear)
```

## What happens
- The `UserPromptSubmit` hook ([`hooks/session-telemetry.mjs`](../hooks/session-telemetry.mjs)
  `prompt`) parses the 👍/👎 (or `up`/`down`/`good`/`bad`) and the text, redacts secrets,
  and appends a `{ type:"feedback", verdict, text }` record to this session's trace. It
  attaches to the currently-open command/skill span.
- **You (the model) just acknowledge** in one short line — the hook already captured it;
  do not run any tool, do not diagnose, do not send anything. If the user clearly wants a
  diagnosis now, point them at `/vc-self-check`.

## What it never does
- Never modifies the installed plugin. Never files a tracker ticket. Never sends anything
  externally — a 👎 becomes an upstream contribution only through the separate,
  `feedback.mode`-gated `deliver` step (`/vc-self-check deliver`), where it is scrubbed of
  all client identifiers first.
- Recorded only when `selfDiagnostics: true` in `project-profile.json` (same capture gate
  as the rest of the collector); otherwise the hook is a full no-op.
