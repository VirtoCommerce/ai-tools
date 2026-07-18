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
/vc-self-check deliver --confirm   # file it (Issue route) — then auto-delete this session's local artifacts (--keep to retain)
/vc-self-check deliver --purge     # terminal cleanup: delete this session's local artifacts, send nothing
```
Lifecycle: **log → analyze → contribute (PR/issue) → delete**. Local diagnostics are
ephemeral — once a finding is upstream, the PR/issue is the source of truth, so the
processed session's artifacts are removed (only that session; never other sessions).

## What it does
- Reads `<outputRoot>/.vc-fix/diagnostics/<session-id>.jsonl` (the passive
  collector's output), the session transcript, and the oracle
  [`skill-expectations.md`](../knowledge/diagnostics/skill-expectations.md).
- Emits a per-skill verdict + severity (S0–S3) + evidence + root-cause hypothesis
  + a concrete proposed fix (which plugin file/line), then writes a local
  `DIAG-*.md` within the [`reports.md`](../.claude/rules/reports.md) size cap.

## What it never does
- Never modifies the installed plugin (the proposed fix is a recommendation, not
  an edit).
- Never files a tracker ticket and never sends anything externally. Contributing a
  confirmed DIAG back to VirtoCommerce is the separate, scrubbed, `feedback.mode`-gated
  `deliver` sub-step (`deliver.mjs`, VCST-5478/5509) — never run implicitly.
- Never diagnoses its own invocation (the collector drops `vc-self-check` spans), and
  never re-triggers in a session that already ran it (`selfCheckSeen`) → no recursion.

> **How the auto-run works (VCST-5509).** At `Stop`, the collector's `finalize` runs the
> Tier-1 outcome classifier over the session's spans. If ≥1 skill/command span was
> flagged (`failed` / `degraded` / `silent_suspect`) with a **new** signature, it returns
> a `{decision:"block"}` telling the agent to run this skill **silently** (no Yes/No
> modal) and print one info line. The happy path (`success` / `recovered`) emits nothing.
> Per-signature dedup (`seenSignatures`) + `selfCheckSeen` prevent re-nag/recursion. The
> old numeric `anomalyScore >= 6` gate and the interactive consent modal are gone. Kill
> switch: `VC_FIX_DIAG_CONSENT=off` suppresses the auto-run (capture still records).
