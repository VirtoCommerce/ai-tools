# ADR — Default-deny closed-schema for the self-diagnostics upstream signal

- **Status:** Accepted (2026-07-22)
- **Scope:** the vc-fix self-diagnostics *upstream contribution* path only
  (`/vc-self-check deliver` → the PUBLIC `VirtoCommerce/vc-mcp-testing-module`). Local
  capture (`hooks/session-telemetry.mjs`) and the local `DIAG-*.md` are unaffected.

## Context

`/vc-self-check deliver` contributes a quality report about the *plugin itself* back to the
public VirtoCommerce repo. It kept leaking **client** data there. Three independent
adversarial review rounds each found a *new* leak shape:

1. bare / prose `github_pat_…` fine-grained tokens (and `AKIA…` AWS keys),
2. lowercase-first camelCase client identifiers (`orderSyncService`),
3. all-caps / all-lowercase unconfigured org slugs, non-latin identifiers, …

Each was fixed by adding another rule. That is the tell of the wrong architecture: the
outbound report was **composed from free-form text derived from the client session**
(LLM-authored DIAG cells `signal`/`rootcause`/`fix`, plus `/vc-feedback` prose), and the
send boundary was a **denylist** — `hooks/redact.mjs` secret patterns +
`deliver.mjs`'s `containsClientShape`/`isClientSpecific`/`scrubText` shape heuristics. A
denylist over an **unbounded** input space (arbitrary client source, paths, identifiers,
secrets of every future format) is never complete; it always trails reality. Worse, the
over-broad shape rule also *withheld genuine plugin evidence* (Fix 3), forcing a
plugin-symbol allowlist — a second denylist fighting the first.

## Decision

**Invert the trust direction: default-deny by TYPE, not default-allow with a denylist.**

- Two artifacts, one-way reduction:
  - **LOCAL diagnostic** (`DIAG-*.md`) — rich, private, never transmitted; may contain
    anything (it is the client's own data). Unchanged.
  - **UPSTREAM signal** — a strongly-typed struct of **enum / number / bool fields only**,
    with **zero free-text fields** (see [`upstream-schema.md`](./upstream-schema.md)).
- A pure, deterministic `reduce(local) -> UpstreamSignal` builds it from **only the
  collector's structured jsonl** (span records + feedback verdicts). LLM-authored DIAG
  free-text cells never enter the upstream path; `/vc-feedback` prose is dropped (only
  `up`/`down` counts travel).
- Error **text** is never sent: a LOCAL `classifyError()` maps an already-redacted snippet
  to a closed **taxonomy code** (`AUTH_MISSING_SCOPE`, `NETWORK_TIMEOUT`, … / `UNKNOWN`);
  only the code travels.
- Repo/module/org **names are never sent** — only a `repoKind` enum.
- A runtime `validateUpstream()` barrier re-checks every field against its vocabulary and
  coerces anything out-of-vocabulary to a safe default, so even a buggy reducer/classifier
  cannot emit a novel string.
- The fingerprint (`fingerprintStruct`) is computed over the structural enum tuple, never
  raw text.

The output **TYPE is the schema**, so there is structurally nothing to leak. The proof is a
property/fuzz test (`scripts/unit/upstream-reduce.test.mjs`) asserting adversarial
client-shaped strings injected into every local slot never appear in the serialized struct —
impossibility by construction, not by enumerating rules.

## Consequences

**Positive**
- The client-data-leak class is closed by construction; no new leak shape can reappear.
- `verdict`/`severity` become deterministic functions of the Tier-1 `outcome`, not LLM
  free judgment — more reproducible dedup.
- Human review is now trivial: the outbound payload is a tiny enum+number struct the
  operator can read in full before any send (`ask` mode).

**Negative / trade-offs**
- **Loss of free-text richness upstream** (no root-cause prose, no proposed-fix text). This
  is deliberate. *Mitigation:* the rich detail stays in the LOCAL `DIAG-*.md` for the
  operator; `errorCode` + `struggle` + `signalClass` + counts + `repoKind` are enough to
  triage a plugin defect, and cross-client occurrence counts convey prevalence. When a
  human opens a PR they can attach a sanitized repro by hand (PRs are always human-in-loop,
  quality-gates §2).
- **Coarser signals** — a new error shape becomes `UNKNOWN`, a client MCP tool `mcp_other`,
  an ambiguous backend agent `backend` rather than `module`/`platform`. Fail-safe: we lose
  distinguishability, never containment. New codes are added by widening the closed set.

**Secret redaction retained on the LOCAL persist path.** `redact()` (the shared
`hooks/redact.mjs` secret rules) still scrubs the snippets the collector writes to the local
`<sid>.jsonl`. The former free-text client-shape scrubbers
(`containsClientShape`/`isClientSpecific`/`scrubText`) were **removed as dead code** (PR #143
review round 2, Finding 1): once the upstream artifact carries only enum/number fields there is
no free text for them to scrub — they had zero call sites in the send path, and a comment
promising an active backstop that did not exist was worse than none. The closed schema
(`validateUpstream`) is the sole upstream guard, in both the distributed `plugins/vc-fix/`
surface and the in-repo `.claude/` mirror (kept in sync for this subsystem).

## Invariants preserved
Client-code containment (quality-gates §2a) — now structural. No-auto-merge (§2) — end at an
open PR/issue for human review. Capture stays OPT-IN and the collector is unchanged.
