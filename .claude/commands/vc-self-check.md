---
description: "Self-diagnose the vc-fix plugin from this session's telemetry: read the passive collector's jsonl + the transcript + the skill-expectations oracle, and emit a per-skill verdict (OK/DEGRADED/BROKEN) with severity, evidence, a root-cause hypothesis, and a concrete proposed fix. Writes a LOCAL DIAG-*.md only — never modifies the install, never sends anything externally (that is the separate `deliver` step). Plugin-wide, not qa-prefixed."
argument-hint: "[latest | <session-id>]  (or: deliver [latest | <session-id>])"
---

# /vc-self-check — vc-fix Self-Diagnostician

Terminal entry for the Tier-B self-diagnostician. The methodology, flow, report
template, and hard invariants live in the [`/vc-self-check` skill](../skills/vc-self-check/SKILL.md) —
this command just invokes it.

## Usage
```
/vc-self-check                 # diagnose the current (latest) session → local DIAG-*.md
/vc-self-check latest          # same, explicit
/vc-self-check <session-id>    # diagnose a specific recorded session
/vc-self-check deliver         # Step 4: draft a scrubbed, consent-gated report to VirtoCommerce (deliver.mjs)
```

## What it does
- Reads `<outputRoot>/.vc-fix/diagnostics/<session-id>.jsonl` (the passive
  collector's output), the session transcript, and the oracle
  [`skill-expectations.md`](../knowledge/diagnostics/skill-expectations.md).
- Emits a per-skill verdict + severity (S0–S3) + evidence + root-cause hypothesis
  + a concrete proposed fix (which plugin file/line), then writes a local
  `DIAG-*.md` within the [`reports.md`](../rules/reports.md) size cap.

## What it never does
- Never modifies the installed plugin (the proposed fix is a recommendation, not
  an edit).
- Never files a tracker ticket and never sends anything externally. Contributing a
  confirmed DIAG back to VirtoCommerce is the separate, scrubbed, **explicitly
  consented** `deliver` sub-step (`deliver.mjs`, VCST-5478) — never run implicitly.
- Never diagnoses its own invocation (the collector drops `vc-self-check` spans), and
  never re-prompts in a session that already ran it (`selfCheckSeen`) → no recursion.
  It runs only on explicit user consent (the end-of-session prompt's **Yes**) or when the
  user runs `/vc-self-check` directly — never as an unprompted auto-trigger.

> The end-of-session `Stop` finalize offers an `AskUserQuestion` Yes/No **only when a
> skill actually ran and its skill-attributed anomaly score crosses the threshold**;
> answering **Yes** is what leads here (the model then runs this skill). It is never run
> without that consent.
