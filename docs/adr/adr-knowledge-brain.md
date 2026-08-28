# ADR — Two Brains: the platform/client knowledge architecture

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 2026-08-24 (working sessions) · recorded 2026-08-28 |
| **Deliverable of** | VCST-5776 — this document closes it |
| **Implemented by** | VCST-5818 (kb toolchain, this PR) → VCST-5819 (vc-knowledge repo + corpus migration) → VCST-5820 (integration: project-init, plugin de-bundling, upstream promotion) |
| **Supersedes** | nothing — there was no prior storage concept, which is the problem |

## Context

The agentic QA system carries ~11 800 lines of knowledge across 37 files under
`.claude/knowledge/`, and had **no storage concept** for any of it: no owner, no entry
contract, no index, no client layer, and a hand-maintained duplicate in
`plugins/vc-fix/knowledge/`.

Three measurements framed the decision, all taken 2026-08-24:

1. **The duplicate had silently drifted.** 18 of 29 shared files differed. The plugin's
   `business-logic.md` carried **144 of 196** `BL-*` invariants and **nothing reported
   it** — a quarter of the oracle was missing on the surface clients actually install.
2. **Retrieval was a grep.** An agent needing one invariant opened a 1713-line file. On a
   client deployment it would read the platform rule and never learn the deployment had
   overridden it.
3. **Nothing measured whether any of it worked.** No index, no coverage signal, no
   staleness sensor, no way to answer "does the corpus still answer the questions agents
   actually ask?"

Two bodies of prior art were studied. The in-house **`vc-Cortex-SecondBrain`** (~13.7k LOC,
commit `a48a365`) supplied most of the mechanisms below, each already paid for there by an
incident. Karpathy's **"LLM Wiki"** (April 2026) supplied independent convergence on
compiled-not-retrieved knowledge, markdown + git, a schema as the real product, and
index-first navigation with no embeddings at this scale. Where we diverge from either, the
divergence is recorded with the decision it belongs to.

---

## D1 — Two brains, a one-way boundary

**Decision.** A dedicated **platform brain** repo (`VirtoCommerce/vc-knowledge`, GitHub) is
the single source of truth. Each client gets a **client brain** in the client's own org, on
the client's own host (GitHub or Azure Repos), holding **only the delta** from the platform.
The plugin **stops bundling** `knowledge/` and fetches the platform brain instead.

The platform project is **self-contained**: it knows nothing about clients, never notifies,
never pushes. Clients read it **read-only, pinned to a commit**. Exactly two things cross
the boundary — **down**, a read-only fetch; **up**, a closed-schema GitHub issue
(promotion), carrying zero client data *by type*, the `upstream-reduce.mjs` model.

**Why.** De-bundling kills the mirror-drift defect class by construction rather than by
discipline: there is no second copy to drift. The client layer exists because a client
deployment's truth genuinely differs from the platform's, and today that difference has
nowhere to live except a bug report. One-way is the §2a client-code containment invariant
applied to knowledge — the same rule `/qa-fix` already enforces for code.

**Rejected.**
- *One corpus with per-entry ownership tags.* Filtering is not partitioning. A filter is one
  forgotten predicate away from leaking client knowledge upstream; a separate repo on a
  separate host cannot leak by accident. This is the standard multi-tenant conclusion, and
  Cortex's own masking layer is the counter-example: explicitly cosmetic, single-trust-domain,
  and off by default — a precedent for *scoping*, never for *containment*.
- *Client knowledge as a branch of the platform brain.* Puts client bytes in a
  VirtoCommerce-owned repo. Non-starter under §2a.
- *Keep bundling `knowledge/` and add a sync check.* This is what we have, plus a gate. The
  144/196 gap proves a duplicate survives its guards; deleting the duplicate does not.

**Consequences.** Until VCST-5820 de-bundles, the existing rule stands: a knowledge change
lands in `plugins/vc-fix/` first and is copied to `.claude/` in the same change. The kb
toolchain itself is mirrored byte-identically and CI-enforced (`mirror-parity.test.mjs`).

---

## D2 — The entry model, and the trust boundary as a folder

**Decision.** One entry = one markdown file: frontmatter carrying the typed, machine-checked
half, then a body carrying the human half.

| Field | Vocabulary |
|---|---|
| `id` | a citation contract — see below |
| `scope` | `platform` \| `client` |
| `kind` | `invariant` \| `flow` \| `locator` \| `quirk` \| `module` |
| `appliesTo` | platform version range (`*`, or `>=3.800.0 <4.0.0`) |
| `audited` | date + evidence source + ref |
| `relation` | `new` \| `override <id>` \| `extend <id>` \| `suppress <id>` |
| `status` | `active` \| `superseded` \| `retired` |

Four rules ride on that shape:

- **IDs are a citation contract.** `regression/suites/**.csv` cites entry ids. Never
  renumber a surviving entry; never reuse a retired one. Renumbering silently repoints every
  previously-correct citation and **no gate can detect it** — the same rule the BL/ECL
  oracles already live under.
- **An `override` MUST quote the platform wording it replaces.** The quote is not
  documentation, it is an instrument: when the platform entry changes, the mismatch flags the
  override deterministically. A `suppress` must state its reason, or a hidden rule and a lost
  rule look identical.
- **Supersede, never delete.** A replaced entry keeps its file, id and body, and gains
  `status: superseded` + `supersededBy`. History stays intact; every change is revertable.
- **Each `kind` has its own lifetime and its own verification method.** A `locator` rots when
  the theme ships; an `invariant` rots when the platform does. Typing them separately is what
  lets a freshness sweep age one without deleting the other — Cortex's typed-memory rule,
  whose founding error was an mtime sweep aging out standing instructions.

**The trust boundary is a folder, not a branch.** `drafts/` is the capture layer: skills
write observations there **directly to main** — append-only, fingerprint-deduped, no branch,
**no PR**. `confirmed/` is the knowledge layer, and only consolidation moves anything into
it. Evidence is attached **at capture time**, because the agent verified the fact in a live
browser during the run and consolidation later has no environment at all.

**Rejected.**
- *A branch/PR boundary.* A PR per observation is a human bottleneck on the highest-volume,
  lowest-stakes step in the system. The folder split gives the same "untrusted until
  promoted" property at zero ceremony.
- *An open field set.* The schema is closed: an unknown field is an error. A tolerated extra
  field is how a second, undocumented contract grows.
- *A YAML dependency.* This code runs inside client installs and inside a brain repo's CI
  with no `node_modules`. The parser is hand-rolled over a small documented subset and
  **errors** rather than partially parsing — the VCST-5807 lesson, where an unquoted `": "`
  made a YAML reader abandon a whole frontmatter block and report empty metadata.

---

## D3 — The split rule: what goes where

One truth test, the same one `/qa-fix` applies to code (`classifyFrontendProvenance`):
**"Is this true on a clean platform of the client's version?"**

| Situation | Destination |
|---|---|
| True on a clean platform | platform brain (from a client — only via the promotion contract) |
| True only for this client | client brain, `new` |
| Platform rule works differently here | client brain, `override <id>` + quote |
| Rule inapplicable here | client brain, `suppress <id>` + reason |
| Unclear whose it is | client brain (containment-first) + triangulation flag |
| Secrets, URLs, test data, anything code or config already states | **nowhere** — not knowledge |

**Why containment-first on "unclear".** The two error directions are not symmetric.
Client knowledge misfiled as platform is a §2a leak; platform knowledge misfiled as client is
a duplicate that the promotion path can later fix. When in doubt, it stays client.

**Why the last row.** `.env.local`, `@td()` aliases and the GOLDEN RULE already own that
material, and a copy in the brain is a second source of truth that goes stale silently —
exactly the failure the hardcoded-spacing-grid incident produced elsewhere in this repo.

---

## D4 — Retrieval: one index, one resolver, one door

**Decision.** A generated `knowledge-index.json` per root — **one schema for both roots** —
mapping id to file, line range, kind, tags, `appliesTo`, relation and a `citedBy` count
harvested from the suite CSVs. The index is **generated, never hand-edited**; `--check`
regenerates and byte-compares (the `tokens:sync` / `tokens:check` ratchet).

One resolver reads platform base + client overlay, with an exact precedence:

```
client suppress → client override → client extend → client new → platform → explicit MISS
```

**A MISS is an object, never an empty answer.** An agent that greps and finds nothing
concludes no rule exists and invents one; handed `{outcome: "MISS", searched: [...]}` it
knows the corpus was asked and had nothing. Silence and absence are different facts and must
look different.

**A guard hook makes the door the only door.** Searches that walk a knowledge root instead of
resolving are counted and escalate 1 → nudge, 3 → mandatory context, 5 → deny. Two exemption
classes, both Cortex lessons: **contract by-name reads** of configured paths, and **Bash-less
subagents**, which cannot run the resolver and therefore cannot unblock themselves.

**Deterministic retrieval first; embeddings only against a measured need.** Cortex's own
numbers decided this: model-free selection rules moved hits 53.3% → 60% and MRR
0.308 → 0.403, while a weight-based reranker gave **+0.007 MRR** and was deliberately left
switched off as overfitting to 15 questions. Chunk size was measured, not guessed.

**Rejected.**
- *Embedding search from day one.* It needs a build step, a model, a passport for the derived
  index and a canary for pooling changes — infrastructure that cannot exist in a client
  install or a headless CI run. The exam (D5) is what would justify it later, with numbers.
- *A knowledge MCP server.* A localhost service is fine for one workstation and impossible
  for a client install. The resolver is a script; the guard is a hook.
- *An advisory index with no gate.* An index nothing checks is stale within a sprint, and a
  stale index is worse than none because it looks authoritative.

---

## D5 — A fully autonomous pipeline: no PRs, no per-entry human review

**Decision.** Consolidation runs on a schedule (cron, nightly) or a threshold (≥20 drafts) as
CI **inside the brain repo itself**: deterministic Node, zero external dependencies, no LLM,
no environment access. Where a client has no CI, the plugin's SessionStart hook runs it
locally when the last run is older than N days (fail-open). Passing drafts move to
`confirmed/` in **one batch commit tagged with the run id**; failing ones stay in `drafts/`,
visible to agents as unverified.

**The evidence bar replaces the reviewer**: capture-time live verification + a triangulation
stamp naming at least two of docs/live/source + no unhandled contradiction with a confirmed
entry. The precedent is in this repo already — `/qa-review-oracles` auto-applies oracle
changes on exactly this bar, gated by evidence rather than by approval.

**Five mechanical guards replace review**, and each is a specific past failure:

| Guard | The failure it exists for |
|---|---|
| **Exam gate with auto-revert** | Nothing measured whether the corpus still answers. A drop in hits or MRR reverts the batch commit; the entries return to `drafts/`. |
| **Layer-drop guard** | The 196 → 144 `BL-*` gap. Cortex's twin: knowledge nodes fell 948 → 551 (−42%) while the total moved −4.4% and all three instruments reported `ok`, because nobody measured the knowledge layer specifically. |
| **Anomalous-batch quarantine** | A copied dist folder doubled Cortex's brain with duplicates inside a day. Over the threshold, the run applies **nothing** and says so. |
| **Id-contract lint + index drift check** | A renumbered id silently repoints every citation; a hand-edited index lies about the corpus. |
| **Daily digest** | Read, not approved. The operator sees applied / superseded / quarantined and can revert a batch with one command. |

**The human's role shrinks to four things**, and this is the whole governance model:

1. Owns the rules and thresholds — the evidence bar itself.
2. **Owns the exam goldens.** The machine must never grade its own misses. Cortex states the
   reason plainly: a brain that scores its own retrieval self-confirms. Misses may become
   golden *candidates*; a human confirms the golden.
3. Reads the digest, and can revert a batch with one command.
4. Handles **client → platform promotions** — the only mandatory human gate in the system.

**No releases for the platform brain.** Continuous `main`; `brain.json` carries an
auto-incremented counter for readability; clients pin a commit SHA. The client update is
autonomous: SessionStart compares pin ↔ newest commit, fetches, drift-checks the client's
overrides against the new tree, and fast-forwards. Clean → the pin bumps with one context
line. Conflicts → the conflicting overrides are named in a review list, everything else
updates. Always pull; fail-open without network.

**Why the pin advances even with conflicts.** The cache is pinned to a *commit*, so there is
no partial fast-forward — holding it back would freeze the whole platform layer because one
client override went stale. What is actually held back is the *decision* about those
overrides, which is knowledge about that deployment and the one thing this toolchain has no
authority to guess.

**Rejected.**
- *A PR per batch with human approval.* This is the bottleneck the whole design removes. The
  measured alternative — gates plus a digest — catches the classes a reviewer catches
  (regression, mass change, silent layer loss) and never gets tired.
- *An LLM in the consolidation loop.* Cortex's extraction engine is quota-bound (20 req/day
  per key+model pair, a six-key ring, 429 cooldowns), non-deterministic in granularity (the
  same files yield 13 or 52 nodes depending on token budget), and produced silent-loss classes
  that needed three separate detectors. For a curated corpus under a citation contract that is
  all cost and no benefit — and it could not run in a client's CI regardless.
- *Karpathy's "LLM writes synthesis straight into the wiki".* No evidence bar. For QA oracles
  that corrupts every downstream check that cites the entry. Hence `drafts/` + capture-time
  evidence + triangulation.
- *"Answers filed back into the wiki" with no gate.* A self-confirmation loop. The outcomes
  loop keeps the human as owner of the goldens.
- *Lint as a checklist rather than a gate.* Karpathy's wiki lints for contradictions and stale
  claims but nothing measures whether the wiki works; the top flaw practitioners report is
  knowledge decay with contradictions persisting. The exam gate is mandatory precisely because
  the human reviewer is gone.
- *Gitignored state.* Correct for a personal brain, wrong for a team: git is what makes a
  corpus shared and reviewable.

### D5-F — The observation fingerprint (settled here)

VCST-5818 named this the open question: what exactly is hashed so the same knowledge, phrased
differently by two runs, dedups to one draft.

```
fingerprint = sha256( kind ␟ scope ␟ subjectSlug ␟ claimBag ).slice(0, 16)
```

- `kind`, `scope` — typed and closed. Two facts of different kinds about one subject are
  different knowledge with different lifetimes and must never merge.
- `subjectSlug` — **what** the observation is about, stated by the capturing agent as its own
  field and normalized to a slug. Deliberately not inferred from the prose: it is the anchor
  that stops the bag below from over-merging, and it is the same "name the operation, do not
  echo the text" move `upstream-reduce.mjs` makes with its `SUBJECTS` enum.
- `claimBag` — the claim reduced to a **sorted, deduped bag of content tokens**: lowercased,
  markdown and punctuation stripped, stopwords removed, a conservative plural strip. This is
  what survives rephrasing.
- **Not hashed:** the raw prose, run id, evidence ref, timestamp, capturing agent. Hashing any
  of them would make every repeat sighting a new draft — the exact failure dedup exists to
  prevent.

**Accepted trade-off.** A sorted bag is order-insensitive, so a claim and its converse over
the same subject collide. Three things make that survivable, and they are why no fuzzier
scheme was chosen: the merge target is always a **draft**, never a confirmed entry; every
distinct raw phrasing is kept in the draft's `observations[]`, so a wrong merge is visible in
the file and in the digest rather than silent; and consolidation reads the claim, not the
hash, when it applies the evidence bar. An LLM-normalized or embedding-based key was rejected
for the reason D5 rejects LLMs throughout: this must run deterministically in a client CI with
zero dependencies and produce the same key forever. `FINGERPRINT_VERSION` makes any future
change to the normalization an explicit corpus migration rather than a silent drift.

---

## What this PR implements (VCST-5818)

`plugins/vc-fix/skills/kb/` — `entry.mjs`, `fingerprint.mjs`, `gen-index.mjs`, `resolve.mjs`,
`exam.mjs`, `capture.mjs`, `consolidate.mjs`, `drift-check.mjs`, `kb-paths.mjs`; hooks
`kb-sync.mjs` (SessionStart) and `kb-guard.mjs` (PreToolUse), both strictly fail-open; CI
templates for both hosts; `kb:*` npm scripts; byte-identical `.claude/` mirror enforced by
`mirror-parity.test.mjs`. Every module resolves its paths off `import.meta.url`, so it works
from any working directory on any install.

## What is deliberately not decided here

- **The corpus migration itself** — which of the 37 files become which entries, and their ids
  — is VCST-5819. This ADR fixes the contract, not the content.
- **`project-init` integration, plugin de-bundling and the upstream promotion contract** are
  VCST-5820.
- **Embeddings.** Deferred, with a named trigger: the exam has to show a retrieval ceiling that
  deterministic ranking cannot lift. Until it does, the answer is no.

## The risk this whole design exists to manage

> "A neglected wiki is more dangerous than a neglected database."

Compiled knowledge that rots misleads *with confidence*. Every mechanism above — the exam
gate, the drift-check, the audit rotation, typed kinds with distinct lifetimes,
supersede-with-quote — is there to make rot visible rather than to hope it does not happen.
