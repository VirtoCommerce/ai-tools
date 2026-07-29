---
description: "Self-diagnose the vc-fix plugin from this session's telemetry. Spawns the self-check-diagnostician subagent to read the passive collector's jsonl + the transcript + the skill-expectations oracle and return a validated finding struct (per-finding OK/DEGRADED/BROKEN + severity + evidence + a proposed fix + vendor-provenance fields). The orchestrator relays a short summary and, for a BROKEN/DEGRADED finding, asks ONE binary question before filing one GitHub Issue PER FINDING (deduped against open AND closed issues). Writes NO local report files, never modifies the install, never sends without an explicit yes. Plugin-wide, not qa-prefixed."
argument-hint: "[latest | <session-id>]  (or: deliver [latest | <session-id>])"
---

# /vc-self-check — vc-fix Self-Diagnostician

Terminal entry for the Tier-B self-diagnostician. The orchestration contract, the subagent
hand-off, and the delivery rules live in the
[`/vc-self-check` skill](../skills/vc-self-check/SKILL.md) — this command just invokes it.

## Usage
```
/vc-self-check                 # diagnose the current (latest) session (spawns the diagnostician subagent)
/vc-self-check latest          # same, explicit
/vc-self-check <session-id>    # diagnose a specific recorded session
/vc-self-check deliver         # dry plan: what would be filed, deduped against open+closed issues
/vc-self-check deliver --confirm   # file the new issue(s) + comment the known ones — then delete this session's telemetry (--keep to retain)
/vc-self-check deliver --batch      # consolidate the pending per-finding records across sessions into one pass
/vc-self-check deliver --purge --session <sid>   # terminal cleanup: delete a session's telemetry, send nothing
```
Lifecycle: **log → analyze → contribute (issue) → delete**. Local diagnostics are ephemeral —
once a finding is upstream, the issue is the source of truth, so the processed session's telemetry
(`<sid>.jsonl` + `<sid>.state.json`) is removed (only that session; never others).

## What it does
- **Spawns the `self-check-diagnostician` subagent** ([`agents/self-check-diagnostician.md`](../agents/self-check-diagnostician.md))
  so the jsonl, the transcript and the oracle
  [`skill-expectations.md`](../knowledge/diagnostics/skill-expectations.md) stay OUT of the main
  conversation. The subagent returns a validated finding struct — no report file.
- **Relays a short summary** of the exact fields that would be sent (the disclosure surface), then —
  for a BROKEN/DEGRADED finding — asks ONE binary *file the issue(s) in Virto?* question.
- On yes (or `feedback.mode: auto`), files **one GitHub Issue per finding**, deduped on
  `(skill, subject)` against **open AND closed** issues: an open match gets a `+1 occurrence`
  comment, a closed match is reported as already fixed (upgrade), only a genuine miss is filed.

## What it never does
- Never writes a `DIAG-*.md` / `DIAG-*.json` / `DELIVERY-*.md` report artifact (PR #172 item 2 —
  the only persistence is a compact per-finding record in the session's `state.json`).
- Never modifies the installed plugin (the proposed fix is a recommendation, not an edit).
- Never sends anything without an explicit yes (or the hand-set `feedback.mode: auto`).
- Never diagnoses its own invocation: the collector drops both `vc-self-check` and
  `self-check-diagnostician` spans/observations, and a session that ran it is not re-triggered
  (`selfCheckSeen`) → no recursion.

> **How the auto-run works.** At `Stop`, the collector's `finalize` runs the Tier-1 outcome
> classifier over the session's spans. If ≥1 skill/command span was flagged (`failed` / `degraded`
> / `silent_suspect`) or a routing-class observation / 👎 was recorded with a **new** signature, it
> returns a `{decision:"block"}` telling the agent to run this skill **silently** (no Yes/No modal),
> which spawns the diagnostician and reports one info line; the offer question is asked only when a
> routable finding actually exists. The happy path emits nothing. Per-signature dedup + `selfCheckSeen`
> prevent re-nag/recursion. Kill switch: `VC_FIX_DIAG_CONSENT=off` suppresses the auto-run (capture
> still records).
