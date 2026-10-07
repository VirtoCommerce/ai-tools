# /qa-hotfix — offer self-diagnostics (consent-gated)

Supporting file for [`SKILL.md`](SKILL.md) §Final step. Read it at the very end of every run.

## Final step — offer self-diagnostics (consent-gated)

At the **very end of every `/qa-hotfix` run** — whether it published a hotfix, STOPPED, or BAILed —
offer to self-diagnose this session with [`/vc-self-check`](../vc-self-check/SKILL.md), the plugin's
Tier-B self-diagnostician. A hotfix touches many moving parts (PR/release gates, cherry-picks across
support lines, the Release-hotfix workflow, JIRA transitions), so a run is a rich signal for catching
a degraded or broken skill.

**How to offer it (respect `vc-self-check`'s hard invariant — NEVER auto-trigger unprompted):**

1. **Ask, don't run.** Present a single Yes/No (`AskUserQuestion`): *"Run self-diagnostics on this
   session? (`/vc-self-check` — local report only, nothing is sent anywhere.)"* Run it **only** on an
   explicit **Yes**; on No, end normally.
2. **On Yes → invoke `/vc-self-check` (default `latest`).** It reads this session's passive telemetry
   + transcript against the skill-expectations oracle and writes a **local** `DIAG-*.md` under
   `.vc-fix/diagnostics/`. It is **read-only** w.r.t. the install and **sends nothing externally** —
   upstream contribution is the separate, independently-consented `/vc-self-check deliver` (never run
   it from here).
3. **No double-nag.** If the global end-of-session consent prompt already offered self-check for this
   session (its one-shot `selfCheckSeen` guard fired), or telemetry hasn't been collected (no
   `.vc-fix/diagnostics/*.jsonl` — the `SessionStart` hook isn't wired), **skip this offer silently**.
   Never re-prompt a session that already ran the diagnostician.
4. **Trivial / clean runs:** a no-op run (e.g. a fast STOP before any write, or `--dry-run`) rarely
   yields findings — the offer is still fine, but don't insist; a declined offer is a normal ending.
