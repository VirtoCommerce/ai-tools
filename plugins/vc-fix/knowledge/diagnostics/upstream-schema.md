# Upstream Signal Schema — vc-fix self-diagnostics

The **default-deny schema** for anything the self-diagnostics subsystem contributes to the PUBLIC
`VirtoCommerce/vc-mcp-testing-module` repo (`/vc-self-check deliver`). This file is the single source
of truth for the vocabulary; keep it in **lock-step** with
[`../../skills/vc-self-check/upstream-reduce.mjs`](../../skills/vc-self-check/upstream-reduce.mjs)
(the `SKILLS` / `VERDICTS` / … / `ERROR_CODES` consts + the v3 provenance validators) and with the
collector's own consts in [`../../hooks/session-telemetry.mjs`](../../hooks/session-telemetry.mjs).

> **Why default-deny.** See the ADR:
> [`adr-upstream-default-deny.md`](./adr-upstream-default-deny.md). Through **v2** the guarantee was
> "no strings at all" — every field an enum/number/bool, so the leak class was impossible by TYPE.
> **v3** trades that for a sharper, more useful guarantee: a string MAY travel, but only if it
> originates from the **vendor's own shipped plugin source** (or is the vendor API's own stable error
> enum), and only after a boundary validator has failed to find any client value in it. Returning the
> vendor their own code cannot leak the client. The guarantee moved from *type-level impossibility*
> to *vendor-provenance + boundary validation*.

---

## The struct

`reduce(local)` returns — and `validateUpstream(struct, ctx)` re-checks — exactly this shape.
Enum/number/bool fields carry no free text. The v3 STRING fields are provenance-gated (below).

```
UpstreamSignal = {
  schemaVersion: 3,                        // number (literal)
  pluginVersion: string,                   // numeric triple `\d{1,4}.\d{1,4}.\d{1,4}` only (any suffix DISCARDED) else "unknown"
  nodeVersion: string,                     // v3 — `vMAJOR.MINOR.PATCH` numeric core only, else "unknown" (the RUNTIME, not the client)
  os: win32 | darwin | linux | other,      // v3 — the runtime OS
  findings: UpstreamFinding[],             // 0..N
  feedback: { up: number, down: number },  // COUNTS ONLY — /vc-feedback text is dropped
  sessionCount: number,                    // 1..N (batch occurrence rollup)
}

UpstreamFinding = {
  skill:       SKILLS,          // closed enum (below); unknown → "other"
  subject:     SUBJECTS,        // v2 — WHICH operation misbehaved; closed enum, unknown → "other"
  blockedDeliverable: boolean,  // v2 — did it stop the run achieving its purpose?
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

  // ── v3 provenance-gated STRING fields (each null unless it PROVES itself; see below) ──
  pluginFile:       string|null,  // path relative to plugin root; PLUGIN_REL_PATH, no `..`, must EXIST
  pluginLine:       number|null,  // 1..1_000_000
  codeExcerpt:      string|null,  // ≤400ch; must be a VERBATIM substring of pluginFile's content
  offendingLiteral: string|null,  // ≤120ch; must be a VERBATIM substring of pluginFile's content
  apiShape:         string|null,  // ≤200ch; vendor API shape, client values → placeholders; boundary-validated
  proposedFix:      string|null,  // ≤300ch; one sentence, plugin paths/symbols only; boundary-validated
  vendorErrorTypeKey:  string|null,  // §6a — the vendor's OWN error enum (ADO typeKey / …)
  vendorErrorName:     string|null,  // §6a
  vendorErrorCode:     string|null,  // §6a
  vendorHttpStatus:    number|null,  // §6a — 100..599
  vendorDocUrl:        string|null,  // §6a — https on learn.microsoft.com / docs.github.com ONLY
  vendorErrorMessage:  string|null,  // §6b — normalized to placeholders, denied on any client value, operator-disclosed
}
```

### v3 provenance rule — how a string is allowed to travel

`validateUpstream(struct, ctx)` takes a `ctx = { files: Map<pluginRelPath, content>, denyValues:
string[], states: string[] }` assembled by `deliver.mjs` (`buildProvenanceCtx`): the content of each
cited plugin file (read from the INSTALLED plugin, read-only), plus every value it can name from the
client's `.env.*` and `project-profile.json`. **Without a `ctx` every v3 string is dropped** —
unproven is the default, so a code path that forgets the context fails closed.

Two gates, both required, and a DENIED field is set to `null` (never coerced) while the finding
SURVIVES:

1. **Provenance** — `codeExcerpt` / `offendingLiteral` must be a literal substring of the cited
   `pluginFile`'s actual content (CRLF-normalized). No file, or no match ⇒ the field is dropped.
2. **Boundary** (`boundaryDenial`) — a string is denied if it contains a URL host, an absolute
   filesystem path, an email, a token-shaped run, a GUID (the ADO `projectId` IS a GUID), an IP, a
   value present in `denyValues`, a work-item state name in `states`, or a work-item field reference
   name outside `System.*` / `Microsoft.VSTS.*`. `pluginFile` is exempt from the absolute-path check
   (it is a relative path) and `vendorDocUrl` from the URL-host check (host-allowlisted instead).

**Still forbidden outright** (no field carries them): work-item STATE names, custom work-item TYPE
names, repo/org/project names, any path outside the plugin. Send counts instead ("14 states, custom
process").

### `proposedFix` — its own allowlist gate (VCST-5582 B2), not `boundaryDenial`

`proposedFix` is the single most actionable field, so it MUST be able to travel — but it is
model-authored prose, and `boundaryDenial`'s `violatesFieldNamespace` denies **any** `Capitalized.dotted`
token, which eats legitimate vendor-enum references (`WorkItemTypeFieldsExpandLevel.All`) and plugin
symbol paths and used to null it wholesale. So `proposedFix` runs through `proposedFixDenial(value, {
denyValues, files })` instead — same **default-deny**, plus an **allowlist** on the identifier shapes:

- **DENY outright** (a real leak vector — the field is dropped, never scrubbed): a URL host, an
  absolute filesystem path, an email, a token-shaped run, a GUID, or any value read from the client's
  `.env.*` / `project-profile.json` (`denyValues`).
- **ALLOWLIST** every `Capitalized.dotted` identifier — it must be a JS built-in namespace
  (`JSON.stringify`), a `System.*` / `Microsoft.VSTS.*` WIT field ref, a plugin filename
  (`*.mjs`/`*.ts`/`README.md`), or a literal that appears **verbatim in a cited plugin source file**.
  A FOREIGN dotted identifier (`Custom.ReviewState`, `Web.config`) is denied — it could be the
  client's own custom field or file.

Plugin-relative paths (`skills/…`, `*.mjs`, `*.ts`), `file:line` pairs, and lower-case plugin symbols
are permitted implicitly — they are not `Capitalized.dotted`, so the allowlist loop never inspects
them and no leak-shape check matches them. As with every v3 string, a denied `proposedFix` is set to
`null` while the finding SURVIVES, and **without a `ctx` it is dropped** (fail closed).

### §6b — the vendor error MESSAGE (the one bounded exception)

The message CAN interpolate client identifiers, so it is the single field whose safety is not "impossible
by construction". All three controls are required: (1) cap 300 chars, single line; (2) `normalizeVendorMessage`
replaces GUIDs / emails / URLs / absolute paths / IPs / token-shaped runs with placeholders FIRST;
(3) then `boundaryDenial` DROPS the field (keeping the finding) if any named client value survives. The
orchestrator renders the exact final string **verbatim** in its chat summary before the yes/no — that
mandatory disclosure is the reason the field is acceptable. **If the summary cannot show it, it is not sent.**

### `findingStructSig` — v3 strings excluded on purpose

The dedup signature (`findingStructSig`) folds ONLY the enum fields (`skill`, `subject`,
`blockedDeliverable`, `verdict`, `severity`, `outcome`, `signalClass`, `struggle`, `errorCode`,
`toolFamily`, `repoKind`). No v3 string is in it — a refactor that shifts a line number, or a slightly
different code excerpt, must NOT fork an already-filed issue. Per-finding DEDUP keys on `(skill,
subject)` alone (`findingKey`), which is coarser still, and is the identity `deliver` matches against
open/closed issues.

### `SKILLS`
`project-init`, `qa-bug`, `qa-fix`, `qa-verify-fix`, `qa-monitoring`, `qa-env-check`,
`vc-docs`, `vc-self-check`, `dotnet-unit-test`, `dotnet-fix`, `angular-admin`,
`vue-unit-test`, `vue-fix`, `vc-shell-fix`, **`other`** (anything unrecognized).

### `SUBJECTS` (v2)

A v1 finding read `other | BROKEN | S1 | failed | none | UNKNOWN | none | unknown` — enough to
prove *something* broke, never enough to act. The reproduction's S1 was an Azure Boards
`create-workitem` required-field gate and its S2 an admin-credential handoff gap, and the payload
could not tell them apart, or from noise. `subject` names the operation; `blockedDeliverable` says
whether it stopped the run. A row now renders as **`S1 · qa-bug · ado_create_workitem · blocked`** —
still zero free text.

`none` · `ado_create_workitem` · `ado_cli` · `ado_transition` · `jira_create_issue` ·
`jira_transition` · `tracker_field_contract` · `tracker_discovery` · `github_search_issues` ·
`github_issue_create` · `github_pr_create` · `git_push` · `vcs_auth` · `browser_login` ·
`browser_navigate` · `browser_snapshot` · `browser_evaluate` · `admin_credential_handoff` ·
`env_scaffold` · `profile_shape` · `repo_discovery` · `access_verification` · `mcp_config` ·
`dependency_install` · `repo_checkout` · `unit_test_harness` · `build` · `typecheck` · `lint` ·
`collector_verdict_integrity` · `collector_scan` · `collector_capture` · `self_check_delivery` ·
**`other`** (anything unrecognized).

> **It is a MAPPING, never an echo.** The collector's own `subject` is a slugified,
> client-influenced string (a tool name, a script name), so forwarding it would reopen by the back
> door exactly the free-text channel this schema exists to shut. `subjectEnum()` maps onto the list
> above and anything unrecognized becomes `other`.
>
> Every marker is **`_`-boundary delimited** on the slug, never a bare substring. An unanchored
> `/checkout|clone/` matched a *client repo name* containing the word — `leocorpCheckout` mapped to
> `repo_checkout`, which is not a leak (only the enum travels) but IS wrong information, and wrong
> information in a vendor-facing report is worse than none.

**`blockedDeliverable`** is derived, never judged: `true` for a span outcome of
`failed`/`silent_suspect`, for an S1 observation group, and for a `BROKEN` markdown-fallback row;
`false` otherwise. `validateUpstream` accepts only a real `true` — any other value becomes `false`.

> **Why the version bump.** `findingStructSig` now folds `subject` and `blockedDeliverable` in, so
> every fingerprint changed: two clients hitting the same defect still converge on one issue, but a
> v1 issue and a v2 issue for that defect will not dedup against each other. That is the correct
> trade — a v1 fingerprint could not tell the two culprits apart in the first place.

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

### Source — the diagnostician's struct on stdin (PR #172 items 1, 2)

`deliver` reads the finding struct from **stdin**. There is no source precedence any more and no
report parsing: the `self-check-diagnostician` subagent produces the struct (assigning severity and
subject, which the collector cannot express, and adding the v3 provenance fields from the plugin's own
source), and the orchestrator pipes it in. `deliver` re-validates it through `validateUpstream(struct,
ctx)` — so an out-of-vocabulary enum is coerced and an unproven/client-tainted string is dropped — but
it derives nothing from prose.

This replaces the earlier DIAG-markdown / DIAG-sidecar chain. Parsing a human-written report was the
shared root cause of a family of defects (header backticks swallowed the session id + version; the
first table column read ``/qa-bug · `ado` create-workitem …`` and collapsed to `other`). No amount of
regex hardening makes prose a reliable carrier of a closed vocabulary — so the report is no longer a
carrier at all. The enum fields still originate from the collector's structured jsonl (via `reduce()`,
used by `--batch` and available to the diagnostician); the LLM authors only the provenance strings,
which are proven at the boundary.

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

1. **Closed vocabulary (enum fields).** Every enum field is a member of a fixed set;
   `validateUpstream` coerces anything else to the safe default — so even a buggy
   `reduce`/`classifyError` cannot emit a novel enum.
2. **Vendor-provenance (v3 string fields).** A `codeExcerpt`/`offendingLiteral` travels ONLY when it
   is a verbatim substring of the cited plugin file; every string is boundary-validated and DENIED
   (never coerced) on any client value. `reduce` still reads ONLY the structured jsonl for the enum
   fields; the v3 strings are supplied by the diagnostician (which read the plugin's own source) and
   proven at the boundary. `/vc-feedback` prose never reaches the struct (counts only).
3. **Structural fingerprint.** `fingerprintStruct` / `findingStructSig` hash the ENUM tuple only —
   never any v3 string, never raw text — so dedup can't smuggle client bytes into the hash and a
   line-number shift can't fork an issue. Feedback counts fold in ONLY for a feedback-only report.
4. **Fail-safe = loss of detail, never a leak.** New error shapes → `UNKNOWN`; new tools →
   `mcp_other`/`none`; new skills → `other`; an unproven or client-tainted v3 string → `null`.

The property/fuzz proof lives in
[`../../../../scripts/unit/upstream-reduce.test.mjs`](../../../../scripts/unit/upstream-reduce.test.mjs):
adversarial client-shaped strings injected into every local slot (incl. every v3 field) never appear
in the serialized struct, and every enum field is asserted ∈ its vocabulary.

## Extending

Add an `ERROR_CODES` member (or a `SKILLS`/`SUBJECTS`/`TOOL_FAMILIES` value) by editing the const in
`upstream-reduce.mjs`, its marker (`ERROR_MARKERS` / `SUBJECT_MARKERS`), this table, and a
test case. This only ADDS distinguishability; it never widens the leak surface, because the
validator still rejects everything outside the (now larger) closed set. Two rules for a new marker:
keep it **`_`-boundary delimited** so a client-controlled string cannot steer the bucket, and put the
specific operation **before** the surface it runs on (first match wins).

Bump `SCHEMA_VERSION` only when the change alters `findingStructSig` — that is what re-forks dedup
against already-filed issues. Adding a vocabulary MEMBER does not; adding a FIELD to the signature
does. **v3 did NOT change `findingStructSig`** (the new strings are excluded), so a v2 and a v3 issue
for the same defect still dedup against each other — the bump reflects the new fields + the guarantee
change, not a signature change.
