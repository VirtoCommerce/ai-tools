# Upstream Signal Schema — vc-fix self-diagnostics

The **closed, default-deny schema** for anything the self-diagnostics subsystem contributes
to the PUBLIC `VirtoCommerce/vc-mcp-testing-module` repo (`/vc-self-check deliver`). This
file is the single source of truth for the vocabulary; keep it in **lock-step** with
[`../../skills/vc-self-check/upstream-reduce.mjs`](../../skills/vc-self-check/upstream-reduce.mjs)
(the `SKILLS` / `VERDICTS` / … / `ERROR_CODES` consts) and with the collector's own consts in
[`../../hooks/session-telemetry.mjs`](../../hooks/session-telemetry.mjs).

> **Why a schema, not a scrubber.** See the ADR:
> [`adr-upstream-default-deny.md`](./adr-upstream-default-deny.md). In one line: the upstream
> artifact is built ONLY from this fixed vocabulary of enum/number/bool primitives, so there
> is structurally no channel for arbitrary client bytes — the leak class is impossible by
> **type**, not chased by denylist rules.

---

## The struct

`reduce(local)` returns — and `validateUpstream(struct)` re-checks — exactly this shape.
**No field carries free text.** Repo/module/org **names never exist** — only `repoKind`.

```
UpstreamSignal = {
  schemaVersion: 1,                        // number (literal)
  pluginVersion: string,                   // numeric triple `\d{1,4}.\d{1,4}.\d{1,4}` only (any suffix DISCARDED) else "unknown"
  findings: UpstreamFinding[],             // 0..N
  feedback: { up: number, down: number },  // COUNTS ONLY — /vc-feedback text is dropped
  sessionCount: number,                    // 1..N (batch occurrence rollup)
}

UpstreamFinding = {
  skill:       SKILLS,          // closed enum (below); unknown → "other"
  verdict:     OK | DEGRADED | BROKEN,       // derived from outcome (deterministic)
  severity:    S0 | S1 | S2 | S3,            // derived from outcome (deterministic)
  outcome:     success | recovered | degraded | failed | silent_suspect,
  signalClass: tool_error | permission_denied | hook_failure | stop_bail |
               policy_block | none,
  struggle:    (retry_storm | reread_loop | search_thrash | fallback_loop |
                recurring_error | stall | low_yield)[],   // sorted, deduped
  errorCode:   ERROR_CODES,     // closed enum (below); default UNKNOWN
  toolFamily:  read | edit | bash | browser | git | github | tracker | mcp_other | none,
  repoKind:    module | platform | frontend | backend | unknown,
  retries:     number,          // clamped 0..99
  occurrences: number,          // 1..N (how many sessions hit this finding, batch)
}
```

### `SKILLS`
`project-init`, `qa-bug`, `qa-fix`, `qa-verify-fix`, `qa-monitoring`, `qa-env-check`,
`vc-docs`, `vc-self-check`, `dotnet-unit-test`, `dotnet-fix`, `angular-admin`,
`vue-unit-test`, `vue-fix`, `vc-shell-fix`, **`other`** (anything unrecognized).

### `ERROR_CODES`
`AUTH_MISSING_SCOPE`, `AUTH_EXPIRED`, `PERMISSION_DENIED`, `NETWORK_TIMEOUT`, `NETWORK_DNS`,
`RATE_LIMITED`, `HTTP_5XX`, `HTTP_4XX`, `FILE_NOT_FOUND`, `PATH_DENIED`, `MODULE_NOT_FOUND`,
`DEP_MISSING`, `HOOK_TSC_ERROR`, `BUILD_FAILED`, `TEST_FAILED`, `LINT_FAILED`, `GIT_CONFLICT`,
`GIT_PUSH_REJECTED`, `MERGE_BLOCKED`, `BAIL_LEGIT`, **`UNKNOWN`** (fail-safe fallback).

---

## Derivations (deterministic, from the jsonl only)

- **verdict / severity** ← `outcome`: `failed`/`silent_suspect` → `BROKEN`/`S1`;
  `degraded` → `DEGRADED`/`S2`; `recovered` → `OK`/`S3`; `success` → `OK`/`S0`. (Not the
  LLM's DIAG judgment — the jsonl carries only the Tier-1 `outcome`.)
- **signalClass** ← the first of `tool_error` / `permission_denied` / `hook_failure` /
  `stop_bail` / `policy_block` with a non-zero span count, else `none`. (`policy_block` is
  ordered last: it is non-blocking, so a genuine blocking class always wins.)
- **errorCode** ← `classifyError(snippet)` over the flagged span's (already-redacted)
  `details[].snippet` and its error children's — a LOCAL classifier that returns ONLY a
  fixed code, never the input. No marker → `UNKNOWN`.
- **toolFamily** ← the failing child tool span name mapped to a family (any client MCP tool
  collapses to `mcp_other`).
- **repoKind** ← the delegated child `agent` span name: `*frontend*` → `frontend`,
  `*backend*` → `backend`, else `unknown`. Never `module`/`platform` from an agent alone
  (ambiguous) — the fail-safe direction; those values are reserved for a future validated
  non-client signal.

### The analysis set — spans **and** observations

`reduce()` reads the FULL §1e analysis set: **observations ∪ flagged spans ∪ feedback**. It
originally iterated `spans` alone and required `outcome ∈ {degraded,failed,silent_suspect}`, so the
`type:"obs"` stream was read by nobody on the upstream path and a session whose command span ended
`recovered` (deliverable achieved, errors recovered) reduced to **zero findings** — exactly the
class VCST-5582 H introduced observations for.

`foldObservations` applies the
[`skill-expectations.md`](./skill-expectations.md) §1f rubric deterministically, in this order:

| Step | Rule |
|---|---|
| candidate severity | per `class` (§1f table); a class the table does not cover ⇒ **S3** — this is where the raw `tool_error`/`permission_denied`/`hook_failure`/`stop_bail` land, deliberately un-escalated |
| occurrence weighting | §1f rule 5 — a class with `count ≥ 3` promotes its own **S3 → S2** |
| same-subject merge | §1f rule 1 — observations sharing (owning `skill`, `subject`) collapse into **one** finding at `max(severity)` |
| triangulation | §1f rule 2 — **≥3 different non-noise classes** on one subject ⇒ **+1 severity step** |
| noise | `policy_block` / `self_reported_skip` / `harness_noise` never drive a finding on their own — supporting evidence only, and excluded from the triangulation count |
| actionability | only **S1/S2** (⇒ `BROKEN`/`DEGRADED`) are contributed; an **S3-only** group stays local and is still analysed by `/vc-self-check` |

Grouping is by (`skill`, `subject`) rather than `subject` alone — `subject` alone would fuse the
same tool failing under two different skills and lose the `skill` dimension that makes the report
actionable (§1f rule 4 handles genuine cross-skill clustering separately). Observation-derived
findings carry `struggle: []`, `retries: 0`, `repoKind: "unknown"` (an observation has no
delegated-agent dimension) and `occurrences: 1` (`obs.count` folds into **severity**, not into the
cross-session occurrence count). `toolFamily` comes from `toolFamilyOfSubject`, which matches the
collector's **slugified** subject shape (`mcp__playwright-edge__browser_snapshot` arrives as
`mcp_playwright_edge_browser_snapshot`). `/vc-self-check`'s own observations are dropped, the same
loop guard the span path applies.

The DIAG-table fallback (enum-only, from `parseDiag`) is reached **only** when neither structured
source produced a finding — a real observation always outranks a markdown guess.

---

## Guarantees (enforced by `upstream-reduce.mjs` + its tests)

1. **Closed vocabulary.** Every string field is a member of a fixed set; `validateUpstream`
   coerces anything else to the safe default — so even a buggy `reduce`/`classifyError`
   cannot emit a novel string.
2. **No free text.** `reduce` reads ONLY the structured jsonl (span records + feedback
   verdicts). LLM-authored DIAG cells (`signal`/`rootcause`/`fix`) and `/vc-feedback` prose
   never reach the struct — the latter travels only as `feedback.up`/`.down` counts.
3. **Structural fingerprint.** `fingerprintStruct` hashes the enum tuple only — never raw
   text — so dedup can't smuggle client bytes into the hash. Feedback counts fold in ONLY for
   a feedback-only report (no findings), so the same finding converges to one upstream issue
   across clients regardless of their feedback, while feedback-only 👍/👎 stay distinct.
4. **Fail-safe = loss of detail, never a leak.** New error shapes → `UNKNOWN`; new tools →
   `mcp_other`/`none`; new skills → `other`.

The property/fuzz proof lives in
[`../../../../scripts/unit/upstream-reduce.test.mjs`](../../../../scripts/unit/upstream-reduce.test.mjs):
adversarial client-shaped strings injected into every local slot never appear in the
serialized struct, and every field is asserted ∈ its vocabulary.

## Extending

Add an `ERROR_CODES` member (or a `SKILLS`/`TOOL_FAMILIES` value) by editing the const in
`upstream-reduce.mjs`, its marker (for an error code) in `ERROR_MARKERS`, this table, and a
test case. This only ADDS distinguishability; it never widens the leak surface, because the
validator still rejects everything outside the (now larger) closed set.
