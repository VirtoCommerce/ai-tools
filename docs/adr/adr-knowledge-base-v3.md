# ADR — Knowledge Base v3: an autonomous, role-general platform + client knowledge system

| | |
|---|---|
| **Status** | **Proposed** — written for team ratification; implementation starts only after it |
| **Date** | 2026-09-01 |
| **Ticket** | VCST-5776 (re-scoped to this deliverable) |
| **Supersedes** | `adr-knowledge-brain.md` (v1 — the "Accepted" in its header is document bookkeeping, not an acting mandate: the PR #252 team review rejected part of it) and `adr-knowledge-brain-v2.md` (written as the review response, **never ratified**, partially inapplicable after the task re-scope) |
| **Fate of PR #252** | Closed unmerged. Its branch remains the **code donor** (disposition table in §14) — a fresh PR sequence into `plugins/vc-kb/` reviews cleaner than a diff-on-diff |
| **Companion** | `adr-knowledge-base-v3-research.md` — the research digest with sources; facts and assessments separated. Cited here as **[R§n]** |
| **Meeting packet** | https://claude.ai/code/artifact/fc025b53-edad-46e7-9f6e-ddf1133d9534 — the same decisions in a form a meeting can read end to end; this file stays the record |
| **Fixed inputs** | The operator questionnaire of 2026-09-01 — 31 answers covering the 27 mandatory themes (§2) |

## 1. Context — how we got to v3, and what changed

The corpus problem is unchanged since v1: ~11,800 lines of knowledge across 37 files, no
entry contract, no index, no client layer, and a bundled duplicate that measurably
drifted (18 of 29 shared files; the plugin's `business-logic.md` silently carried 144 of
196 `BL-*` invariants). Retrieval was a grep over a 1,713-line file.

The path: **v1** ("Two Brains", implemented as PR #252) → **team architecture review**
(8+1 findings, all accepted — verbatim record reconstructed in [R§0]) → **v2** (the
response: statuses, meeting ratification, scaling ladders, standalone plugin — never
ratified) → **the task statement itself changed**. The v3 mandate:

1. **One base for all roles** — manager, lead, QA, backend dev, frontend dev, analyst.
   The QA oracle was the first *consumer*; v1/v2 mistook it for the *purpose* (QA-shaped
   `kind` vocabulary with `locator` in it; suite-citation-centric indexing).
2. **Agents are the only writers; humans consume only through an agent.** The human
   role in filling and maintaining the base tends to zero — review and approvals are an
   exceptional measure, never a pipeline stage.
3. **The system self-maintains**: raises and lowers trust itself, schedules its own
   re-verification, resolves contradictions by evidence.
4. **Cold start = deterministic repository scanning** — only facts that are 100%
   derivable from sources.
5. **Staleness by supersession and source drift, never by calendar.**
6. **The engine is a standalone plugin** (`vc-kb`), not a `vc-fix` internal.
7. **Two bases** — platform + per-client delta — with one resolver over both.

### 1.1 The one explicit reversal of a team decision

The PR #252 review decided (finding 4): *machine prepares candidates, a team meeting
ratifies; machines may lower trust, only humans raise it to approved* (v2 R2/R4). The
v3 mandate contradicts that, and this ADR **does not silently replay it**: §7 replaces
the meeting with a mechanical anti-self-confirmation design, §6 gives the machine the
power to reach the top status, and the human keeps veto instruments only (§8).
**Ratifying this ADR is ratifying that reversal.** The argument for why it is safe here
when it was not safe in the general case: unlike a personal-notes corpus, this domain
has an **external ground truth the machine can be graded against — the platform source
code, the live deployment, and the official docs**. Every autonomy mechanism in §7 is
anchored to that external oracle, never to the corpus itself.

### 1.2 What the review left standing (and v3 keeps)

Typed entries with a closed schema · **ids as a citation contract** (never renumber,
never reuse) · **supersede never delete** · the **explicit MISS object** · capture-time
evidence · the retrieval **exam** · the **one-way platform/client boundary** (§2a
containment) · the standalone-plugin decision (unanimous) · **annotate-never-hide**
(v2 R1) · the **base-pin instead of a copied quote** (v2 R5a/finding 9).

### 1.3 What v1/v2 got wrong, per the re-scoped mandate

| # | Error | v3 answer |
|---|---|---|
| 1 | Scale: QA taken for the purpose | Role-neutral vocabulary (§4), fix-cycle is the *first* consumer, not the axis (§2 Q3) |
| 2 | QA-shaped kinds (`locator`) | New vocabulary; `locator` leaves the KB for QA test infrastructure (§4.1) |
| 3 | Evidence bar assumed empirical verifiability | Three knowledge planes with per-plane evidence models; provenance-based proof for normative knowledge (§5) |
| 4 | Human as a mandatory gate (v2) | Full autonomy + human veto instruments; the reversal recorded in §1.1 |
| 5 | Calendar-only staleness (v2 typed lifetimes) | Supersession + anchor drift; age never touches status (§6.4) |
| 6 | Catalog treated as a crutch for Bash-less subagents | `catalog.md` is a first-class retrieval surface (§9.4) |
| 7 | NIH BM25 planned | Vendored MiniSearch (§9.1); rejected alternatives recorded |
| 8 | Search-only metrics (hit@k/MRR) | Usage metrics: live MISS rate, citation rate, dispute rate; exam demoted to a regression gate (§12) |

---

## 2. Fixed inputs — the questionnaire decision list (2026-09-01)

Every decision below was made explicitly by the operator; the ADR builds on them and
does not re-litigate them. (31 answers; two questions were re-asked with plain-language
explanations before being answered.)

| # | Theme | Decision |
|---|---|---|
| 1 | Content boundaries | IN: behavior, API contracts, domain rules, pitfalls; architecture **with rationale**; conventions; processes and ownership. OUT: roadmap (tracker owns it; rots faster than the base confirms) |
| 2 | Explicitly not knowledge | Secrets/env-URLs/test data (owned by env layers, `@td()`, secret store) · restating code an agent can read (store synthesis + anchors, not paraphrase) · client-identifying data in the platform base (§2a, by construction) · claims without evidence (refused at capture) |
| 3 | First consumers | Working task agents: the fix cycle (`/qa-bug`, `/qa-fix`, `/qa-verify-fix`, triage) plus "how does X work" questions. Other roles arrive through the same resolver later |
| 4 | Corpus shape | ONE corpus, one entry contract, one resolver; per-kind rules (evidence model, drift sensors) are fields of the type, not separate stores |
| 5 | Autonomy vs the #252 review decision | **Full autonomy**: machine promotes through mechanical gates; the meeting mode is removed from the architecture; the reversal is recorded (§1.1) and ratified once, with the ADR |
| 6 | Human powers | All four instruments, none a pipeline stage: retire/veto with a tombstone (machine never resurrects) · **pin** (machine cannot change a pinned entry) · force-dispute (no evidence bar needed; machine cannot clear without fresh proof) · a readable change digest (not a gate) |
| 7 | Trust raising | Weighted evidence model — independent re-observations, cross-axis (docs/live/source) confirmation, deterministic re-derivation against code, and usage-without-refutation as the **weakest** class (operator: "введи веса; использование без опровержений — меньший вес"). Arithmetic stays internal; agents see categorical labels (§6.2) |
| 8 | Trust lowering | Contradicting observation with evidence · failed scheduled re-check · source drift under the fact's anchors. Age is NOT a trigger |
| 9 | Re-verification initiative | All three layers: source-drift events (targeted, immediate) + rotating CI sweep (covers anchor-less knowledge) + on-read flags (the reading agent, who has the live environment, re-checks what is actually being used) |
| 10 | Trust ceiling without a human | Machine reaches the **top status**; a human mark (`pinned`) is an optional overlay, not a higher rung — no consumer waits for a human |
| 11 | Novelty protocol | All three steps mandatory before any write: resolver query in the writer's own words → exact fingerprint → near-duplicate scan; four outcomes: duplicate→confirmation, same-subject-other-aspect→linked entry, contradiction→dispute, miss→new draft |
| 12 | Contradictions | Both entries stay; the dispute itself is a re-verification event; re-check decides (new confirmed → supersede; old confirmed → dispute closed rejected); undecided → both served, labeled, with dates and provenance. Never recency-wins |
| 13 | Kind vocabulary | Role-neutral, closed: `behavior · contract · decision · convention · pitfall · process · structure`. Old kinds map in (invariant→behavior, quirk→pitfall, module→structure, flow→behavior); `locator` leaves the KB |
| 14 | Non-empirical evidence | Provenance for birth (ADR / PR discussion / tracker decision / config as the authoritative artifact) + observed practice for elevation; staleness only by supersession |
| 15 | Staleness model | Supersession + anchor drift; calendar never changes status; age may act only as a mild ranking modifier among otherwise-equal results |
| 16 | Bootstrap sources | Platform: `vc-platform` + `vc-module-*` (manifests, REST routes, GraphQL schema, permissions, settings) and `vc-frontend` (routes, config flags, component/operation map). Tracker/wiki mining is NOT part of cold start (not 100% deterministic) |
| 17 | Bootstrap volume | Aggregates per module/schema-area/settings-group (hundreds platform-wide); full inventories live as **derived tables** entries reference, not as entries. Selection test: "would an agent re-ask this in every task" |
| 18 | Client base location | A dedicated knowledge repo in the client's own org (mirrors the platform layout; GitHub or Azure Repos); `/project-init` finds it by marker or scaffolds it from zero |
| 19 | Client bootstrap | Yes — same extractors over client repos + a computed delta against the platform (custom modules, fork divergence, installed-but-not-native modules) |
| 20 | Isolation & promotion | Isolation by type (unchanged §2a). Client→platform promotion = a **fixed-format GitHub issue** (issue form) that the engine ingests into the platform brain's `drafts/` — designed here (§10.4), implemented after the core; nothing auto-flows in v3.0 |
| 21 | Retrieval | Deterministic lexical BM25 via **vendored MiniSearch** + curated synonyms + explicit MISS; embeddings only later, behind a measured exam ceiling, with an embedder passport + canary |
| 22 | Execution environment | Deterministic zero-dep core (resolve/index/exam/consolidate/extractors) runs in any CI with no network and no keys; every model-bound step (capture, novelty classification, live re-checks) lives only in agent sessions; the pipeline never depends on a model |
| 23 | Packaging | Standalone plugin **`vc-kb`** (no dependencies); `vc-fix` depends on it (`>=` range); hooks ship in `vc-kb`; dependents keep only call sites |
| 24 | Citation contract | Ids eternal, never reused; consumers: other entries, client deltas (relation + base pin), QA suites (legacy `BL-*`/`ECL-*` grandfathered), agent reports/tickets via `@kb(id)`; dangling refs caught by the index gate. Client id namespace `KB-C-*` vs platform `KB-*` — collision impossible by construction |
| 25 | Answer contract | Mandatory minimum with every relayed fact: id + categorical trust + freshness + provenance + dispute flag; caveats voiced only below top trust (quiet at the top, loud where reduced); audit surface = git + the generated catalog — no dedicated UI |
| 26 | Success metrics | Usage package: live MISS share (falling = coverage), `@kb(id)` citation rate in tasks (rising = adoption), disputes per 100 answers (falling = correctness). The exam is a retrieval regression gate, not a success metric |
| 27 | Failure mode | Empty-but-true: confident answers only in the main result; an explicit MISS otherwise; relevant drafts/candidates in a separately-fenced **leads** section ("зацепки, не факты") |
| 28 | Fate of #252/engine | Close unmerged; engine modules migrate file-by-file into `plugins/vc-kb/` with v3 semantics (fresh PR sequence); corpus migration is a separate phase under the new vocabulary |

Operational answers recorded alongside: the SessionStart hook must stay light (no
regeneration in hooks — §11.2); derived-layer regeneration happens in the brain repo's
CI once for all consumers; the client knowledge repo is discovered-or-created by
`/project-init`.

---

## 3. The design in one page

Three planes of knowledge, one entry contract, one resolver, one autonomous lifecycle:

```
                    ┌─────────────────────────────────────────────────────────┐
                    │ PLATFORM BRAIN  (VirtoCommerce/vc-knowledge, GitHub)     │
                    │  derived/   ← regenerated by extractors @ pinned commits │
                    │  entries/   ← experiential + normative, id = KB-*        │
                    │  drafts/    ← capture layer (incl. ingested promotions)  │
                    │  exam/ catalog.md knowledge-index.json brain.json        │
                    └────────────────────────┬────────────────────────────────┘
                              read-only, pinned to a commit (fetch-down only)
                                             │
   client repos ──extractors──┐              ▼
                    ┌─────────────────────────────────────────────────────────┐
                    │ CLIENT BRAIN  (<client-org>/<kb-repo>, their host)       │
                    │  derived/  entries/ (KB-C-*, relation+base-pin deltas)   │
                    │  drafts/  exam/  catalog.md  index  brain.json           │
                    └────────────────────────┬────────────────────────────────┘
                                             │ one resolver over both roots
                                             ▼
        agents (capture · resolve · verify · dispute) ⇄ humans (ask agents; veto tools)
                                             ▲
              client→platform promotion: fixed-format GitHub issue → platform drafts/
```

- **Derived plane** (§5.1): 100%-deterministic facts regenerated from source at a pin;
  no lifecycle, cannot rot; its regeneration **diff is the event stream** that triggers
  re-verification of everything anchored to what changed.
- **Experiential plane** (§5.2): observed behavior and pitfalls; empirical evidence
  (docs/live/source axes), confirmations, disputes.
- **Normative plane** (§5.3): decisions, conventions, processes; provenance-based
  evidence; lives until superseded.
- **Lifecycle** (§6): `draft → candidate → confirmed` — all machine transitions,
  driven by an internal weighted-evidence score with per-plane thresholds; `disputed`
  and `pinned` are overlays; `superseded`/`retired` keep files forever.
- **Anti-self-confirmation** (§7): every trust-raising signal is anchored to an oracle
  *outside the corpus* (source code, live system, docs, authoritative artifacts);
  retrieval is deterministic (no learned feedback loop); goldens come from real usage
  with source-grounded verification; metrics measure usage, not self-scores.
- **Humans** (§8): four veto instruments, zero pipeline stages.

---

## 4. D1 — The entry model

### 4.1 Kind vocabulary (closed)

| kind | What it is | Plane | Example |
|---|---|---|---|
| `behavior` | How the system observably behaves; invariants and flows | experiential | "Cart tax is estimated before an address is entered" |
| `contract` | An interface commitment: API shape, schema, event, config surface | derived-first | "`createOrderFromCart` requires a validated cart id" |
| `decision` | An architecture/product decision **with its rationale** | normative | "Modules communicate via domain events, not direct refs — decided in ADR-N" |
| `convention` | An agreed way of working (code, naming, process-adjacent) | normative | "Admin blades use platform CSS classes, never inline positioning" |
| `pitfall` | A trap: surprising, dangerous, or repeatedly-tripped-over | experiential | "Firefox+MCP cannot click on the Admin SPA — schedule on chromium" |
| `process` | How work flows: release, hotfix, review, escalation | normative | "A hotfix lands on `support/<X.Y>` via cherry-pick + the Release workflow" |
| `structure` | What exists where: module map, ownership, repo topology | derived-first | "Loyalty lives in vc-module-loyalty; depends on Core + Customer" |

Mapping from v1: `invariant → behavior`, `flow → behavior` (tag `flow`),
`quirk → pitfall`, `module → structure`. **`locator` leaves the knowledge base** — a
selector is QA test-infrastructure data with a test-asset lifecycle, not knowledge
about the platform; the QA plugin keeps locators in its own assets.

**Rejected**: keeping the v1 vocabulary + additions (drags `locator` into a base for
all roles); a 3-kind minimal set (`fact/decision/pitfall` — merges `contract` and
`behavior`, which have different drift sensors, §6.4).

### 4.2 Fields (closed schema — an unknown field is an error)

Carried over from v1/v2 unchanged: `id`, `title`, `scope` (platform|client),
`appliesTo` (platform version range), `status`, `relation` (`new` | `override <id>` |
`extend <id>` | `suppress <id>`), `supersedes`/`supersededBy`, `tags`, deterministic
serialization (fixed field order, byte-stable), the hand-rolled frontmatter parser
(zero-dep; errors, never partial parses — the VCST-5807 lesson).

Adopted from v2 (R5): `subject` (required — the canonical slug the fingerprint and
retrieval anchor on), `aliases`, `domain` (closed per-root taxonomy; the shard key),
`question` (the canonical question this entry answers), `base` **pin** `{hash, commit}`
on `override`/`extend`/`suppress` — **replacing v1's copied `quotes`** (finding 9: the
pin is a whole-body drift sensor with no platform prose stored client-side);
`evidence.method` vocabulary gains `stated`.

New in v3:

| Field | What | Why |
|---|---|---|
| `anchors[]` | Machine-checkable pointers into sources: `{repo, ref: <commit>, path, symbol?, hash}` — the hash is of the normalized anchored fragment | The drift sensor for experiential/derived-adjacent knowledge: when regeneration diffs touch an anchor, the entry is flagged for re-check (§6.4). Optional but strongly encouraged at capture |
| `provenance` | For normative kinds: `{kind: adr\|pr-discussion\|tracker\|config\|readme, ref, at}` | The birth credential of a decision/convention/process (§5.3) |
| `evidence[]` | An append-only list of typed evidence **events** (was: a single audited stamp) | The weighted trust model needs the event history, not just the latest stamp (§6.2) |
| `confirmations` | `{count, lastAt}` (machine-written) | Reuse-is-review made mechanical (v2 R2, kept) |
| `disputed` | Overlay block `{at, ref, reason}` (machine- or human-written) | A dispute must travel with the entry (v2, kept) |
| `pinned` | Overlay block `{at, by, reason}` (human-written only) | The §8 veto instrument: the machine may not modify or demote a pinned entry |
| `leads[]` | Optional links to related entries (`same subject, different aspect`) | The novelty protocol's outcome 2 (§10.1) |

### 4.3 Ids and namespaces

`KB-<KIND>-NNN` in the platform brain; **`KB-C-<KIND>-NNN`** in a client brain. The
namespace prefix is declared in each root's `brain.json` and enforced by the entry
validator, so a client root physically cannot mint a platform-shaped id and vice versa.
Different clients never see each other's brains, so cross-client collision does not
arise. Legacy `BL-*` / `ECL-*` ids are grandfathered verbatim at migration (the
citation contract; `regression/suites/**.csv` keeps resolving).

### 4.4 Storage format

Markdown + closed frontmatter per entry, plus a **generated** `knowledge-index.json`
(and `catalog.md`) per root — unchanged in kind from v1/v2, re-confirmed against the
alternatives in [R§4]: SQLite (binary blobs don't git-review; needs a runtime no client
CI has), a property graph (our relation density is low: supersedes/extends/base — three
edge types; a graph store buys nothing at 10²–10⁴ entries), JSONL-only (loses
per-entry files = loses meaningful git diffs and the folder write-boundary). Agents are
the only readers/writers, but git-reviewability is still load-bearing — it is the audit
surface (§2 Q25) and the revert mechanism (§6.5). The shape is also the convergent one:
Anthropic's three shipping memory surfaces and Beads (git-tracked line-text as the sync
source, a derived DB gitignored) arrive at it independently ([R§4]).

**The honest costs, budgeted rather than argued away** ([R§4]): frontmatter must stay a
JSON-safe subset with a lint (no free YAML); schema evolution needs explicit migration
scripts (there is no `ALTER TABLE`); referential integrity — a dangling `supersedes`,
a `leads` link to a retired id — needs a lint gate a database would have given for free
(it is part of the index `--check`); concurrent writers need one-writer-per-entry
ownership, with file-level conflicts as the *visible* failure mode; and at the top of
the range (10⁴ entries) the layout needs directory sharding plus a few hundred
milliseconds of index build in CI. JSONL is kept for exactly one job — the append-only
capture/usage queues, where line-per-record merges well and no one reviews prose.

---

## 5. D2 — Three planes, three evidence models

The v1 evidence bar ("fresh evidence + ≥2 of docs/live/source") assumed everything is
empirically re-checkable. A decision or a convention is not. v3 types the *proof
obligations* by plane:

### 5.1 Derived plane — facts with a generator

REST routes, GraphQL schema areas, module manifests + dependency graph, settings
flags, permission constants, storefront routes, component/operation maps.

- Produced by **extractors** (§11.1) from sources at a **pinned commit**; stored under
  `derived/` as generated tables + aggregate entries that reference them.
- **No lifecycle.** No statuses, no confirmations, no disputes. A derived fact is not a
  belief — it is a projection of the source; the source is the truth.
- Regenerated when the pin moves; `--check` regenerates in memory and byte-compares
  (the repo's `tokens:sync`/`tokens:check` ratchet), so the layer cannot silently lag.
- Served with provenance `derived @ <commit>` at the **top trust label by definition**.
- **The regeneration diff is an event stream**: "type `CartType` changed", "module X
  dropped dependency Y" → every lifecycle entry whose `anchors[]` intersect the diff is
  flagged `verification-due` (§6.4). This is how "изменение в GraphQL-схеме
  отслеживается": the schema is re-derived, not re-checked, and its diff re-checks
  everything downstream. Precedents for diff-classification tooling (graphql-inspector,
  oasdiff, buf breaking): [R§3].

### 5.2 Experiential plane — facts with observations

`behavior` and `pitfall` (and client-observed `contract` deviations).

- Born from **capture with evidence attached at capture time** (unchanged v1 rule —
  consolidation later has no environment). Evidence axes: `docs | live | source`.
- Promotion needs **≥2 independent axes** (v1 bar kept) *or* one axis + a
  deterministic anchor check (a `behavior` claim whose `anchors[]` re-derivation
  confirms the mechanism exists is source-corroborated).
- Re-checkable: on anchor drift, by rotation, and on read (§6.4).

### 5.3 Normative plane — facts with an author

`decision`, `convention`, `process` (and `structure`'s ownership half).

- Born from **provenance**: a reference to the authoritative artifact — an ADR, a PR
  discussion, a tracker decision, a config that encodes the choice. `evidence.method:
  stated` + `provenance` block. No browser re-check can confirm a rationale; the
  artifact is the proof.
- Elevated by **observed practice**: agents that see the convention actually followed
  (a merged PR conforming, a process executed as described) record practice
  confirmations; usage-without-dispute contributes the weakest weight (§6.2).
- **Never rots by age** (§2 Q15): a decision lives until superseded by a newer
  decision (a newer artifact) or force-disputed. The rotation sweep still *visits*
  normative entries — but the only demotion it can produce is "the provenance artifact
  is gone/changed" (e.g., the ADR file was replaced), which is anchor drift, not age.

---

## 6. D3 — Lifecycle: statuses, weighted evidence, transitions

Why a lifecycle is not optional: measured under drift, an append-only memory and a
last-write-wins memory both scored **0.210** while **having no memory at all scored
0.309** — and a keyed-revocation design scored **0.950** (TEPA, [R§2]). Past the point
where the underlying system changes, a knowledge base without invalidation mechanics is
not a weaker asset; it is a net liability. Everything in this section exists to make
that outcome unrepresentable, and the same paper's second result is the reassurance:
revocation costs nothing when nothing has drifted.

### 6.1 Statuses and overlays

```
draft ──(gates)──► candidate ──(score ≥ threshold)──► confirmed ──► superseded
                        │                                  │            (terminal-with-pointer)
                        └──────────── demotion ◄───────────┘        ──► retired (terminal)
overlays (orthogonal, never statuses): disputed · pinned
```

| Status | Meaning | Set by |
|---|---|---|
| `draft` | A captured observation with evidence; no id | machine (capture) |
| `candidate` | Passed structural gates (novelty, evidence shape, dedup); id minted; usable, labeled "not confirmed" | machine (consolidate) |
| `confirmed` | The weighted evidence score cleared the per-plane threshold | **machine** (consolidate) — the v3 reversal |
| `superseded` | Replaced; keeps file/id/body + `supersededBy` | machine (via contradiction resolution §10.3) or human |
| `retired` | Dead subject, no successor; kept forever for citations | machine (positive evidence of death: feature/module gone from derived layer) or human veto |

`disputed` (machine or human): trust reads `none` both ways until resolved.
`pinned` (human only): the machine may not edit, demote, supersede, or retire the entry;
capture against it still records confirmations/disputes for the digest.

**Rejected**: `approved` as the top-status name (implies an approver; `confirmed`
states the actual basis — evidence); a sixth `disputed` status (loses lifecycle
position — v2's overlay argument stands); numeric trust exposed to consumers — the
measured finding is harsher than v2 assumed: a **passive** tag (numeric *or*
categorical) is largely inert, while a blunt "do not trust this" instruction
over-corrects; what models act on is the **wording of the entry itself** plus
redundant sourcing ([R§2], *Manufactured Confidence*). Hence categorical labels **plus**
the supersession banner (§6.6), never a `confidence: 0.6` field expected to do
behavioral work. (v2 cited a "numeric-score inversion" RAG study for this; that study
could not be located — [R§2] flags it as unverifiable, and v3 does not rely on it.)

### 6.2 The weighted evidence model (internal arithmetic, categorical outside)

The operator asked for weighted confirmations with usage-without-refutation weighted
lowest. Every evidence **event** appended to `evidence[]` carries a class; the score of
an entry is the capped sum:

| Event class | Weight | Cap | Notes |
|---|---|---|---|
| `derivation` — a deterministic anchor/extractor check passed | 3 | uncapped | The strongest signal a machine can have; repeatable |
| `axis` — a **new** evidence axis (docs/live/source) confirmed the claim | 3 for the 2nd axis, +2 for the 3rd | 8 | Independence premium — cross-axis agreement is worth more than repetition |
| `provenance` — an authoritative artifact states it (normative birth credential) | 3 | 3 | One artifact = one credential; a second *independent* artifact counts as `axis` |
| `observation` — an independent re-sighting (different session/agent), same axis | 2 for the first two, then 1 | 6 | Diminishing returns; fingerprint-deduped restatements count here (reuse-is-review) |
| `practice` — a normative rule observed actually followed | 2 | 4 | |
| `usage` — a window of retrievals with zero disputes (e.g., ≥5 reads / 30 days) | 1 per window | 2 | **The weakest class, by decision** — absence of refutation is not confirmation |

Demotion events subtract: `dispute-upheld` −∞ (supersede path), `recheck-failed` −3,
`anchor-drift` sets `verification-due` (no score change until a re-check fails).

**Thresholds** (defaults; per-root tunable in `brain.json`, and recorded in the digest
whenever tuned): `candidate → confirmed` at **score ≥ 6** AND the per-plane floor —
experiential: ≥2 distinct axes or 1 axis + `derivation`; normative: `provenance` +
≥1 further event (`practice`, second artifact, or a full `usage` window).

**What agents see is never the number.** The resolver computes a categorical trust
label: `confirmed` + no flags → **high** (silent); `confirmed` + `verification-due` →
**medium** (one-line caveat); `candidate` → **medium-low** ("not confirmed — verify
before load-bearing use"); `draft` → **low** ("a lead, not an answer"); any +
`disputed` → **none** (symmetric ban both ways). The score itself appears only in the
digest and the index, for the pipeline's own decisions. Rationale: the in-context
evidence that in-context confidence *metadata* — numeric or passive-categorical — is
largely inert while phrasing is not ([R§2]); and a number invites arithmetic nobody can
defend. The label is therefore paired with §6.6's wording rules, not trusted alone.

### 6.3 Transition table

| From → To | Trigger | Actor |
|---|---|---|
| — → draft | capture with capture-time evidence (refused without) | machine |
| draft → candidate | novelty protocol passed (§10.1) + evidence block valid + quarantine/layer-guard clean; id minted | machine |
| draft → (tombstoned) | consolidation rejects (restates existing → recorded as a confirmation of that entry, not a rejection; or human veto) | machine / human |
| candidate → confirmed | weighted score ≥ threshold + plane floor + exam gate green on the batch | **machine** |
| confirmed/candidate → +disputed | dispute capture passes the evidence bar; **or** drift-check `changed`/`retired` on a delta's base pin; **or** failed re-check; **or** human force-dispute | machine / human |
| +disputed → cleared | an independent re-check (§10.3) re-confirms the original claim with fresh evidence | machine |
| +disputed → superseded | the re-check confirms the challenger; the pair is linked `supersedes`/`supersededBy` | machine |
| confirmed → superseded | a newer confirmed entry replaces it (contradiction resolution or explicit replacement) | machine |
| any id-bearing → retired | positive evidence of death: the subject vanished from the derived layer (module removed, endpoint gone) and no successor claim exists; or human veto | machine / human |
| any → pinned overlay | human command only | human |

A revived fact after `retired`/`superseded` is a **new entry** with a new id citing the
old one — the id contract survives every path (unchanged).

### 6.4 Staleness = supersession + anchor drift (never the calendar)

- A `contract`/`structure` fact drifts when its **generator diff** touches it (§5.1).
- An anchored `behavior`/`pitfall` drifts when its `anchors[]` hashes stop matching
  the re-derived sources → `verification-due` flag → re-check task (§6.5).
- A normative fact drifts only by supersession or provenance-artifact drift.
- Unanchored experiential facts are covered by the rotation sweep — where **age orders
  the re-check queue** (oldest-confirmed first) but never lowers trust by itself.
- Ranking may apply a mild age damp only between otherwise-equal results (§2 Q15).

### 6.5 Re-verification — three initiating layers (§2 Q9)

1. **Event-driven**: platform pin moves / a release lands → extractors regenerate →
   the diff flags every entry whose anchors intersect → `verification-due`.
2. **Rotating sweep**: the brain repo's CI takes the next slice (N entries by re-check
   priority: verification-due first, then highest-`citedBy`, then oldest
   `lastConfirmed`) and emits a **re-check queue** (`recheck-queue.json`) — CI itself
   can only run `derivation` checks (deterministic anchors); everything needing an
   environment lands in the queue.
3. **On-read**: the resolver, serving an entry with `verification-due` (or from the
   queue), includes a one-line re-check instruction; the reading agent — which has the
   browser/env the CI lacks — verifies opportunistically and captures the outcome
   (confirmation or dispute). Reuse-is-review, made explicit.

The consuming-agent duty (dispute-or-confirm what you touched) is part of the
consumption protocol (§9.5), inherited from v2 R8.

### 6.6 Invalidation must live in the words, not only in the metadata

Two measured results force this ([R§2]): **STALE** — the best model scored **55.2%** at
judging which of two retrieved states is current, *with the updated evidence already in
its context in 77.5% of cases* — and **Manufactured Confidence**, which found a passive
"unverified" tag ignored while the **phrasing** of the claim drove behavior. A KB that
serves an old and a new claim side by side, trusting a `status:` field to sort them out,
is betting against a measured ~45% failure rate. Three rules follow:

1. **One adjudicated current state per key in the default view.** A superseded entry is
   excluded from default `lookup` results (it remains resolvable by id, and is reachable
   as history), so a consuming agent is never handed two rival current answers. Status
   weights damp; the default view *excludes*.
2. **The supersession banner.** When the machine supersedes an entry it prepends a
   deterministic template line to that entry's body — *"SUPERSEDED on `<date>` by
   `@kb(<id>)`: the claim below no longer describes current behavior."* — and prepends a
   `supersedes` line to the successor's body naming what it replaces. The original text
   stays underneath, unedited (git holds every version). This is Graphiti's past-tense
   rewrite applied to files, and it is what arms an agent against a stale-premise
   question (STALE's premise-resistance dimension).
3. **Never rewrite hedges into assertions.** Consolidation copies a capture's claim
   verbatim; the epistemic register of the observation is part of the evidence. An entry
   may be *promoted* by accumulating events (§6.2) but its wording is not "cleaned up"
   into a flatter, more confident sentence.

The `disputed` overlay carries the same discipline: the reason text travels in the
served body, not only as a field.

---

## 7. D4 — Anti-self-confirmation: what replaces human ratification

The central risk of autonomy (problem 3.2 of the task statement): a system that grades
its own answers converges on confidently finding what it already knows. NELL — the
longest-running autonomous-KB precedent — documented exactly this as semantic drift
from self-training [R§1]. v2's answer was a human meeting; v3 removes it, so the
replacement must be structural. Five mechanisms, each anchored **outside the corpus**:

1. **An external ground truth exists and is wired in.** Every trust-raising event
   class in §6.2 references an oracle that is not the corpus: `derivation` re-runs
   extractors against the *source code*; `axis`/`observation` evidence points at the
   *live system*, *docs*, or *source*; `provenance` points at *human-authored
   artifacts*. The corpus cannot cite itself as evidence — an evidence `ref` into a
   knowledge root is rejected by the validator. This is the difference from NELL
   (whose beliefs bootstrapped later beliefs) and the reason near-zero-human is
   defensible in this domain at all.
2. **Deterministic retrieval, no learned components.** Ranking has no feedback loop to
   drift (the Cortex reranker lesson: +0.007 MRR, switched off as overfitting). The
   exam stays meaningful because the thing it measures is frozen mechanics, not a
   moving model.
3. **Goldens grounded in usage + source, not in the corpus.** v1/v2 made goldens
   human-owned ("the machine must never grade its own misses"). v3 splits the golden
   set: **(a) regression goldens** — auto-generated at bootstrap from derived
   aggregates' `question` fields; they only sense *retrieval regression* (did a batch
   bury what was findable), a mechanical property where self-reference is harmless;
   **(b) truth goldens** — harvested from real agent questions (resolver logs): a MISS
   that a later capture answered, or a hit the outcome loop confirmed, becomes a
   golden *candidate*; it is **frozen only after a verification pass that re-derives
   the expected answer from sources without consulting the corpus** (an agent-run
   check, recorded with its evidence), and every newly frozen golden is listed in the
   digest under the human veto window. The self-confirmation loop is broken by the
   source-grounding step, not by a mandatory human.
4. **The gates stay, plus the gate-becomes-lock escalation.** Layer guard (a scope's
   confirmed count may not silently fall — the 196→144 class), anomalous-batch
   quarantine, exam gate with auto-revert — all kept from v1. New: a **consecutive-
   revert counter** — two auto-reverts in a row stop the loop and escalate loudly to
   the digest instead of retrying forever (the Cortex incident where rollback-on-
   regression became a lock: 6 reverts/day, zero accepted batches, learning halted).
5. **Success is measured outside the system.** The §12 metrics are live usage signals
   (MISS rate on real questions, citation rate, dispute rate) — the corpus cannot
   inflate them by liking its own answers; a self-satisfied brain that stops being
   consulted *shows* as a falling citation rate.

What the human still owns (all veto-shaped, none blocking): the four §8 instruments,
the thresholds file (`brain.json` — rules of the game, versioned in git), and the
option to veto a newly frozen golden from the digest.

---

## 8. D5 — Human instruments (all interventions, no stages)

| Instrument | Command shape | Effect | Machine's obligations |
|---|---|---|---|
| **Veto / retire** | `kb retire <id> --reason` | `status: retired`, fingerprint tombstoned | Never resurrects the fingerprint; a re-observation of the same claim is recorded in the digest as "vetoed claim re-observed" (signal, not entry) |
| **Pin** | `kb pin <id> --reason` | `pinned` overlay | No machine edit/demote/supersede/retire; disputes against it surface in the digest instead of the overlay |
| **Force-dispute** | `kb dispute <id> --reason` (no evidence bar) | `disputed` overlay | Cannot clear it without fresh ≥2-axis (or derivation) re-confirmation |
| **Digest** | generated per consolidation/sync run | applied / superseded / quarantined / reverted / new goldens / vetoed-claim re-observations | Reading is optional; nothing waits for it |

Everything else that v2 gave the human (candidate ratification, dispute resolution,
golden confirmation, retirement decisions) is machine-owned in v3 under §6/§7
mechanics. This is the §1.1 reversal, stated once more so the ratifying meeting sees
it in the section where it bites.

**Measured against KCS** ([R§4]) — the industry standard for knowledge lifecycles — v3
is *more* orthodox than v2 was, not less: KCS's own economics say "reviewing every
article that is created is a huge waste of time and money", and its confidence states
are earned by **use** (*reuse is review*), not by a reviewer. Its structure maps onto
v3 almost field for field: content standard → the closed schema + lint gates; WIP /
Not Validated / Validated / Archived → `draft` / `candidate` / `confirmed` /
`superseded`-`retired` (with archive as a visibility change, never deletion); *flag it
or fix it* → flagging is permissionless (dispute, drift) while fixing is gated
(consolidation); earned-and-revocable license levels → capability tiers (capture-only →
consolidate-behind-gates → promote-upstream), earned by exam track record and revoked
by quarantine. KCS names three functions that must survive in some form — the
**standard-setter**, the **independent grader** (the Coach, who must never be the
writer), and the **outcome owner**. v3 keeps the first and third human (§8's digest and
the thresholds file) and is the only place it diverges knowingly on the second: the
grader is **mechanized** by grounding golden verification outside the corpus (§7 item 3)
rather than by requiring a person. That divergence, not autonomy in general, is the
thing to argue about at ratification.

---

## 9. D6 — Retrieval and surfaces

### 9.1 Engine

**Vendored MiniSearch 7.2.0** replaces both v1's hand-rolled overlap scorer and v2's
planned hand-written BM25 — the task statement names that NIH as error #7. The choice
is measured, not assumed ([R§4], from the shipped tarballs): it is the only candidate
that is simultaneously **true BM25+ in the shipped code** (k=1.2, b=0.7, δ=0.5 — the
README says only "modern ranking algorithm"), **MIT**, **genuinely zero-dependency**,
**one self-contained ES file** (78 KB raw / 18 KB gz, no imports — so "vendor a single
file" is literal), **language-neutral by default** (Unicode tokenizer + lowercase, no
stemmer, no stopwords ⇒ nothing mis-fires on mixed EN/RU, and Cyrillic tokenizes
correctly), and free of internal randomness (**no `Math.random`/`Date.now`** in the
module).

- Fields and boosts: `subject`, `aliases`, `title`, `question` (top), `tags` (mid),
  `body` (low, length-damped). Exact `@kb(id)` in a query short-circuits to
  `resolveId`.
- **Version-pinning discipline** (the sourced form): vendor the exact file, record
  `minisearch@7.2.0` + its **sha256** in the index meta, and never consume it through
  an npm range. An upgrade is a deliberate **two-commit migration** that swaps the file
  and regenerates the exam baselines in the same reviewed change. Precedent for why:
  Lucene changed its *default* similarity to BM25 at 6.0 (Elasticsearch inherited it at
  5.0) and MiniSearch itself swapped scoring at v5.0.0 — engines do move relevance at
  majors. Same class as Cortex's fastembed pooling incident, caught the same way.
- **Byte-stability rules for the index**: entries are sorted by id before indexing (so
  filesystem enumeration order cannot leak in), the index is written with a canonical
  serializer (RFC 8785-shaped: sorted keys, fixed number formatting), and volatile
  fields are stripped from anything snapshotted — Orama's wall-clock `elapsed` field is
  the cautionary example.
- Curated `synonyms.json` per root (domain vocabulary: "PLP" ⇢ "product listing page",
  RU⇢EN bridges for the team's query language), identity until populated.
- Same normalization pipeline (`claimTokens`) for queries and corpus fields.

**Rejected**: hand-rolled BM25 — a legitimate *maximum-determinism* fallback (~100 lines;
scores could then change only by our own commit) but it forfeits fuzzy/prefix matching
and the calibration burden lands on us; embeddings now (breaks the zero-dep client-CI
invariant, needs passport+canary, marginal measured wins at this scale); **Orama**
(47 shipped files ⇒ needs a bundling step, a wall-clock field in results, a shipped
language-map bug, and a company whose flagship moved to AGPL Rust); **FlexSearch**
(contextual/proximity scoring, **not BM25, no IDF**); **lunr** (no release since
2020-08); **wink-bm25-text-search** (four runtime dependencies).

### 9.2 Resolution semantics

Kept from v1/v2: two entry points (`resolveId`, `lookup`), typed answers always, the
**explicit MISS object** with `searched[]`. Changed:

- **Annotate, never hide** (v2 R1 adopted — the donor `resolve.mjs` still *drops*
  shadowed platform entries; this is rewritten): a platform entry with a client delta
  returns as **one grouped row** — platform body + `clientDelta {verb, id, reason,
  baseDrift}`; ranking may damp a suppressed base (×0.8), never exclude it; notes are
  audience-neutral (QA: don't test here; dev: the native mechanism exists — don't
  reinvent it).
- **Leads section** (§2 Q27): below the confident results, a separately-fenced
  `leads[]` block carries relevant drafts/candidates labeled "leads, not facts"; a MISS
  with leads is still a MISS.
- The answer contract (§9.5) rides on every result.

### 9.3 Storage/scaling ladder (v2 R3, kept)

S1: one `knowledge-index.json` per root → S2: catalog + `index/<domain>.json` shards at
256 KB / 1,000 entries (automatic, `--check` covers whichever layout is live).
Retrieval ladder: A1 (MiniSearch as configured) → A2 (synonyms table growth) → A3
(local-embedding hybrid) — **A3 only on a measured exam ceiling, opt-in, with an
embedder passport + fixed-phrase canary**, and lexical stays the exact-id layer
forever.

### 9.4 `catalog.md` — a first-class surface

Generated one-line-per-entry digest (`id · kind · status · subject · title`), next to
the index, covered by the same `--check`. It is the door for Bash-less subagents
(progressive disclosure: read the catalog, then `Read` the one entry file it names) and
the human audit surface (§2 Q25) — no dedicated UI is built; git + catalog is the
"readability for incident review" the mandate allows for free.

### 9.5 Answer contract and consumption protocol

Every result carries: `id`, categorical `trust {level, reasons[]}` (§6.2), freshness
(`lastConfirmed`, `verificationDue`), **provenance** (`derived @ commit` |
`observed {axes, lastAt}` | `decided-in <ref>`), `disputed` (with reason),
`clientDelta`, file path, and the one-line protocol pointer. Relay obligations for the
human-facing agent (§2 Q25): silent at top trust; one-line caveat at medium; explicit
warning + verify-before-load-bearing at lower levels; disputed always voiced with both
sides. The consumption protocol keeps v2 R8's rules: the brain is a lens, never ground
truth; reality outranks it; cite `@kb(id)` for load-bearing use; verification ∝ blast
radius; the dispute duty; MISS discipline; never bulk-load a root.

### 9.6 The guard

`kb-guard` (PreToolUse) kept with the v2 R1 correction: escalation (1 nudge → 3
context → 5 deny) applies **only to searches** over knowledge roots; a `Read` of an
entry file by path is never counted — the resolver hands out file paths and following
them is the intended flow. Bash-less subagents are never denied (they cannot unblock
themselves); contract by-name reads exempt. Fail-open absolute.

---

## 10. D7 — Writing: novelty, capture, contradiction, promotion

### 10.1 The novelty protocol (mandatory before any write — §2 Q11)

0. **Canonicalize** (before anything is hashed or scored): Unicode NFC, lowercase, the
   Russian **ё→е** fold, and the root's committed alias map. Deliberately **no stemming
   and no stopword stripping** — stemming is language-specific and lossy for Russian,
   and stripping function words from a short claim can erase a negation ("must" vs
   "must not") and merge a claim with its converse ([R§4]; this is also why the
   fingerprint's stopword list is short and keeps `no/not/never`).
1. **Ask as a reader**: `lookup` with the writer's own words. A hit on the same claim →
   no write; record a `confirmation` event on the hit (+ observation phrasing).
2. **Fingerprint**: `sha256(kind ␟ scope ␟ subjectSlug ␟ claimBag)` — v1 D5-F kept
   verbatim (phrasing-insensitive, deterministic, versioned). Match → confirmation.
   This is an **I-Match-shaped** key (Chowdhury et al., 2002 — hash of the
   order-insensitive term set), and its documented brittleness (one token flips the
   digest) is precisely why step 3 exists.
3. **Near-duplicate scan**: top-k (k≈10–20) MiniSearch over same-`subject` candidates as
   a **candidate generator only** — rank is the signal, **never the BM25 score**, which
   drifts with IDF as the corpus grows. Each candidate is then verified with
   corpus-independent measures: **Jaccard** *and* **containment** (`|A∩B| / min(|A|,|B|)`,
   which catches a short claim embedded in a longer one, where Jaccard under-fires).
   Bands, committed as config: **≥0.90 duplicate** → confirmation; **0.70–0.90
   near-duplicate** → the aspect/contradiction decision below; **<0.70 novel** → new
   draft. Outcomes: same subject, different aspect → new draft with a `leads` link to
   the neighbor; contradiction (the claim negates a confirmed entry) → a **dispute
   capture** against it, not a new entry; nothing → genuinely new draft.

**Threshold discipline.** The bands are calibrated once against a labeled sample of our
own entries and live in `brain.json`; a threshold change is a scoring change and must
regenerate the exam baselines **in the same reviewed commit**, never drift silently
(same rule as the vendored-library hash, §9.1). MinHash/SimHash/LSH is deliberately
**not** used: below ~10⁵ entries it buys sub-linearity we do not need at the price of
probabilistic error and a tuning surface ([R§4]).

The deterministic steps (0, 1-index, 2, 3-scoring) are engine code; the *classification*
of step 3's outcome is made by the capturing agent in-session (it has a model), against
a rubric shipped in the skill — recorded in the draft so consolidation can audit it.

### 10.2 Capture (v1 mechanics kept)

Append-only `drafts/`, one file per fingerprint, repeat sightings merge
(`count++`, phrasing appended, freshest evidence wins), tombstones are final,
**capture refuses an observation without evidence**, `assertWritable` enforces the
root boundary by data (readOnly platform cache), `KbContainmentError` on any client-
scope emit toward a platform path. New: capture accepts `anchors[]` and `provenance`,
and a `--dispute <id>` mode (v2 R8) that targets an existing entry.

### 10.3 Contradiction resolution without a human (§2 Q12)

A dispute (agent-captured with evidence, drift-flagged, or human-forced) sets the
`disputed` overlay and **enqueues a re-check task** (§6.5's queue — the dispute IS a
re-verification event). The next agent to take the task re-derives the claim from
sources/live with fresh evidence:

- challenger confirmed → the challenger becomes a new confirmed entry; the old one →
  `superseded` (pair linked; body kept; no copied quote — the git history and the
  pointer pair answer "what did it say").
- original confirmed → overlay cleared; the dispute is tombstoned as a rejected claim.
- unresolvable (both evidenced, environment-dependent) → both stay served, grouped,
  labeled with dates + provenance — "the knowledge is contested" is itself the honest
  answer. Never recency-wins (one hallucinated session must not erase a year of
  confirmations — the mem0-class failure, [R§2]).

### 10.4 Client → platform promotion (designed now, implemented post-core)

A client-brain entry that passes the split-rule test ("true on a clean platform") is
flagged `promotable` locally. Promotion is explicit (`kb promote <id>`), and:

1. The client side builds a **GitHub issue from a fixed issue-form**: structured
   fields (kind, domain, subject slug from the *platform* vocabulary, appliesTo,
   evidence axes) + the claim text + evidence refs. **Pre-send lint on the client
   side**: the claim/refs are scanned against the client's own known identifiers
   (org, repo names, hosts, domains from `project-profile.json`) and refused on a hit;
   evidence refs must point at platform-public sources only.
2. The platform brain's CI ingests issues matching the form (`kb ingest-issues`):
   schema-validated → lands in `drafts/` as an ordinary draft (never directly into
   entries), deduped by fingerprint against open issues and existing drafts. Malformed
   → labeled `kb-invalid`, not parsed.
3. From there the normal lifecycle applies — and consolidation will only confirm it
   with **platform-side evidence** (a re-verification against platform sources), which
   is the real containment: client-context prose can never become confirmed platform
   knowledge on its own authority.

This keeps §2a: nothing flows upward automatically; the platform never learns which
client filed (the issue is filed by a bot/service identity or the operator's own
GitHub account at their choice — the form carries no client fields).

---

## 11. D8 — The derived layer and bootstrap

### 11.1 Extractors (deterministic, zero-LLM)

| Fact class | Source | Method | Build vs reuse ([R§3]) |
|---|---|---|---|
| Module map + dependency graph, declared settings + defaults, permissions | `vc-module-*/module.manifest` | XML parse | reimplement (trivial; it is Virto's own declared contract) |
| Settings & permission constant ids/values | `ModuleConstants`-style declarations | **Roslyn** symbol walk + constant-value evaluation — never regex, so concatenated constants resolve correctly | Roslyn as a library |
| REST surface — per-module, static | controllers' `[Route]`/`[Http*]` attributes | AST pass; route-token replacement and inherited prefixes are the reimplementation risk, so these records are labeled **`derived-static`** | reimplement on Roslyn |
| REST surface — authoritative | ApiExplorer / build-time OpenAPI against a composed platform host | full framework semantics applied; labeled **`derived-hosted`** | reuse as-is |
| REST drift classification | two OpenAPI snapshots | **oasdiff** — ERR / WARN / INFO with `--fail-on` | reuse as-is |
| GraphQL schema | xAPI introspection at a pinned platform version | normalized, **sorted** SDL snapshot (sorting is what makes the diff stable) | reuse as-is |
| GraphQL drift + storefront coupling | SDL pair; storefront GraphQL documents | **graphql-inspector** `diff` (breaking / dangerous / safe) and `validate` (documents against the SDL) | reuse as-is |
| Storefront routes / config flags | `vc-frontend` router + config | **ts-morph** walk of the config literals | reimplement (thin) |
| Component contracts (props/events/slots) | `.vue` SFCs | static AST extraction | **vue-docgen-api** reuse as-is |
| Client delta | client repos vs platform at `upstreamRef` | same extractors + set difference (custom modules, fork-divergent files, non-native installed modules) | — |

Outputs: `derived/**` tables (JSON/markdown, generated headers) + aggregate `structure`
/`contract` entries (one per module / schema area / settings group) that cite the
tables. The extraction rule inherits the repo's GOLDEN RULE: **never transcribe —
generate from the source, gate on drift, exit non-zero on an unreachable source.**
Extraction runs in the brain repo's CI (once for all consumers) and locally only by
explicit command — never in hooks (§11.2).

**Severity is the re-check priority.** The three tools above already classify each fact
change; v3 reuses their vocabulary rather than inventing one: a **breaking** diff forces
re-verification of every lifecycle entry whose `anchors[]` touch the affected coordinate
*before* the next consolidation batch; **dangerous/WARN** enqueues it at normal priority;
**safe/INFO** merely re-stamps the anchors as still-valid. The anchor format follows
GraphQL Hive's **schema coordinate** idea (`Type.field`, `Module.Setting`, route+verb),
which is what lets a diff mechanically select what to re-check instead of re-checking
everything ([R§3]).

An extractor that cannot parse a construct **skips it and reports the skip** (an
`unresolved[]` list in the table header) — a guessed fact fails every correct consumer;
an announced gap is honest (the design-spec extractor lesson from this repo). And where
`derived-static` and `derived-hosted` disagree about the same endpoint, that
disagreement is itself a reported finding, never a tie broken silently.

### 11.2 Sync (SessionStart) — light by contract

One fetch, pin comparison, fast-forward of the pinned cache, drift-check of client
deltas' base pins against the new tree (hold back the *decision*, never the pin), a
one-line context message, fail-open, ≤ ~2s budget. **No regeneration, no extraction,
no consolidation in the hook path** — heavy work happens in CI; the hook only picks up
its results. (Direct answer to the operator's hook-load concern.)

### 11.3 Bootstrap (cold start)

Platform brain: run extractors over `vc-platform`, `vc-module-*`, `vc-frontend` →
derived tables + aggregate entries (hundreds, not thousands — the "would an agent
re-ask this every task" selection test; full inventories stay tables). Client brain:
`/project-init` finds-or-scaffolds the knowledge repo (marker: `brain.json`), runs the
same extractors over client repos + the delta vs platform, writes a machine-derived
`project-overview` structure entry ("what this deployment is, how it differs") — **no
operator interview** (v2 R6's interview is dropped with the human→0 mandate; what the
interview used to seed now comes from the delta computation and normal capture).
Regression goldens are auto-seeded from aggregates' `question` fields (§7 item 3) so the
exam gate is armed from day 0; truth goldens grow from usage.

---

## 12. D9 — Metrics: usage, not self-scores (§2 Q26)

Collected by the resolver into a local, append-only usage log per root (`usage.jsonl`,
gitignored; aggregated counts only in the digest — no question prose leaves the root):

| Metric | Signal | Direction |
|---|---|---|
| **Live MISS share** | corpus coverage of real demand | ↓ good |
| **Citation rate** (`@kb(id)` per task/report, harvested like `citedBy`) | adoption — the base is actually load-bearing | ↑ good |
| **Dispute rate** (disputes per 100 served answers) | correctness in the field | ↓ good |
| Confirmation velocity (evidence events/week) | the flywheel is turning | context |
| Median time from draft → confirmed | pipeline latency | context |
| Exam hit@k/MRR | retrieval regression **gate only** | must not fall |

The first three are the success definition ("прирост производительности" proxies);
task-time A/B measurements are explicitly out of scope as the primary signal (noisy,
expensive) and may be run as spot checks later.

---

## 13. D10 — Packaging, environment, delivery

### 13.1 `vc-kb` (v2 R7 kept, unanimous)

```
plugins/vc-kb/
  .claude-plugin/plugin.json      name vc-kb, 0.1.0, no dependencies
  skills/kb/                      engine: entry, fingerprint, gen-index, resolve (rewritten),
                                  exam, capture, consolidate (extended), drift-check (rewritten),
                                  kb-paths, trust.mjs (new), recheck.mjs (new), catalog.mjs (new),
                                  vendor/minisearch.js (pinned, hashed)
  skills/kb-extract/              derived-layer extractors (§11.1)
  skills/kb-bootstrap/            §11.3
  commands/kb-status.md           corpus health: counts by status, drift, exam trend, usage metrics
  hooks/hooks.json                kb-sync.mjs (SessionStart), kb-guard.mjs (PreToolUse)
  rules/knowledge-consumption.md  §9.5 protocol
  templates/                      brain scaffolding (brain.json, taxonomy.json, synonyms.json,
                                  exam/), CI ymls (GitHub + Azure), promotion issue-form
```

`vc-fix` adds `dependencies: [{name: vc-kb, version: ">=0.1.0"}]`, keeps only call
sites (capture opportunities in `/qa-bug`/`/qa-fix`/`/qa-verify-fix`, resolver
consultations in triage); `vc-perf` reaches it transitively. Versioning/tags per
`docs/release-process.md` (the stranded-dependents rule). Cross-plugin invocation via
the installed-plugin-root resolution pattern (`claude plugin list --json`). During
transition the `.claude/` mirror + parity test continue; the kb rows leave the mirror
when this repo consumes `vc-kb` as an installed plugin.

### 13.2 Execution environment (§2 Q22)

| Component | Runs where | Needs |
|---|---|---|
| resolve / index / catalog / exam / drift / consolidate / extractors / ingest-issues | any CI, any client, offline | Node ≥18 only |
| capture / novelty classification / re-checks / disputes / promotion decision | agent sessions | model + env (already there by definition) |
| sync + guard hooks | session lifecycle | fail-open, ≤2s, no network dependency beyond one bounded fetch |

The pipeline **functions with zero model access**: it consolidates what agents left,
regenerates what sources state, and measures itself deterministically. Model-bound
steps only *feed* it.

### 13.3 Delivery phases

| Phase | Deliverable | Gate |
|---|---|---|
| **P0** | This ADR ratified by the team (including the §1.1 reversal) | nothing below starts before it |
| **P1** | `plugins/vc-kb/` 0.1.0: engine port with v3 semantics (vocabulary, trust model, annotate-never-hide resolver, MiniSearch, catalog, recheck queue, consecutive-revert escalation), hooks, tests, marketplace entry + tag; `vc-fix` dependency bump; PR #252 closed with a pointer here | fresh PR sequence |
| **P2** | Derived layer: extractors + `--check` gates + diff-event stream; bootstrap for the platform brain; regression-golden seeding | extractor unit tests against fixture repos |
| **P3** | **VCST-5819 (re-scoped)**: `VirtoCommerce/vc-knowledge` repo + corpus migration under the v3 vocabulary — `BL-*`/`ECL-*` ids preserved verbatim; layer-guard baseline (196 BL) committed; suites keep resolving | zero dangling citations |
| **P4** | **VCST-5820 (as filed)**: `/project-init` knowledge stage (find-or-scaffold client brain, §11.3), plugin de-bundling, promotion channel (issue form + `kb ingest-issues`) | E2E on a client-shaped setup |
| **P5** | Usage metrics + digest reporting; truth-golden harvesting loop | first monthly metrics digest |

---

## 14. Disposition — what happens to v1/v2/the #252 engine

Verdicts from a file-by-file read of the donor branch (`claude/vcst-5818-kb-toolchain`),
percentages = surviving lines against the module's current size:

| Asset | Verdict | ~Reuse | Reasons |
|---|---|---|---|
| `fingerprint.mjs` (150 l) | **reuse as-is** | 100% | D5-F re-confirmed; vocabulary-independent; versioned normalization |
| `kb-paths.mjs` (113 l) | reuse, minor edits | ~90% | `assertWritable`/containment-by-data kept; env prefix already neutral (`VC_KB_`); layout gains `derived/`, `usage.jsonl`, `recheck-queue.json` |
| `entry.mjs` (403 l) | **rewrite on the same skeleton** | ~65% | Parser/serializer/closed-schema machinery kept verbatim; vocabularies (KINDS/STATUSES), field sets (`anchors`, `provenance`, `evidence[]`, overlays, `base` pin replacing `quotes` — KBE-004 restated), and validation profiles all change |
| `gen-index.mjs` (360 l) | extend | ~80% | Loader, CSV citation scan, drift ratchet kept; adds trust inputs, domain shards (S2), `catalog.md`, usage-log hooks |
| `resolve.mjs` (341 l) | **rewrite** | ~50% | `resolveId` precedence + MISS object survive; `lookup` is replaced (shadowing dropped for R1 grouping; hand-rolled scorer → MiniSearch; leads section; answer contract v3 with trust block) |
| `exam.mjs` (329 l) | reuse, extend | ~85% | Goldens/`--check`/metrics/compare/history kept; adds golden-class field (regression vs truth), candidate harvesting feed, supersede-chain acceptance already present |
| `capture.mjs` (278 l) | reuse, extend | ~80% | Append-only/dedup/tombstones/evidence-refusal kept; adds `--dispute`, `anchors`, `provenance`, confirmation-event emission (novelty outcome 1) |
| `consolidate.mjs` (568 l) | **rewrite on the same skeleton** | ~60% | The five-gate frame, batch-commit + revert, layer guard, quarantine, tombstoning survive; the promotion decision changes (weighted trust model, candidate stage, plane floors), supersede-with-quote writer → pointer-pair writer, adds consecutive-revert escalation + recheck-queue emission |
| `drift-check.mjs` (154 l) | **rewrite** | ~40% | Verdict vocabulary (`ok/changed/retired`) and never-auto-resolve stance survive; the sensor changes from quote-inclusion to `base {hash, commit}` comparison + git-diff rendering (v2 R5a), and gains anchor-drift checking for `anchors[]` |
| `kb-sync.mjs` hook | reuse, minor edits | ~85% | Pure planner + fail-open + pin semantics kept; drift input switches to the new sensor; picks up CI-built derived layer |
| `kb-guard.mjs` hook | reuse, one fix | ~90% | R1 correction: entry-file `Read`s never counted; rest (escalation, exemptions, fail-open, state) kept |
| CI templates, npm script pattern, mirror-parity wiring | reuse | ~80% | Extended for extractor/ingest jobs |
| **new modules** | — | 0% | `trust.mjs` (evidence events, scores, labels), `recheck.mjs` (queue planner), `catalog.mjs`, `kb-extract/*`, `kb-bootstrap/*`, `ingest-issues.mjs`, `vendor/minisearch.js` |
| v1 ADR | superseded | — | Historical record; its D1/D3/D5-F reasoning is carried forward by reference |
| v2 ADR | superseded (never ratified) | — | R1/R3/R5a/R7/R8 adopted into v3; R2's asymmetry rule and R4's meeting are **reversed** (§1.1); R6's interview dropped |
| v1 `quotes` drift sensor | **discarded** | 0% | Replaced by the base pin (finding 9) — no platform prose client-side, whole-body sensitivity |
| v2 `review.mjs`/`apply.mjs`/meeting packet | **not built** | 0% | No ratification stage exists; the digest (§8) carries the observability half |
| Weighted net reuse of the ~2,700-line engine | | **~70%** | |

QA-corpus citation machinery (`Business_Rule`/`Edge_Case_Refs` scanning, `bl:lint`/
`ecl:lint` semantics) is retained as one consumer among several — demoted from axis to
edge, per mandate error #1.

---

## 15. Risk register — what autonomy creates, and what parries it

| # | Risk | Parry |
|---|---|---|
| 1 | **Self-confirmation drift** (NELL-class): the base converges on its own beliefs | §7: evidence must reference oracles outside the corpus (validator-enforced); truth goldens frozen only after source-grounded verification; deterministic retrieval; usage metrics external to the system |
| 2 | **Confident rot**: a wrong confirmed entry misleads every consumer | Dispute duty + on-read re-checks target exactly the entries being used; anchor drift flags on source change; answer contract forces provenance/freshness into every relay; disputes drop trust to `none` symmetrically |
| 3 | **A hallucinated capture poisons the corpus** | Capture refuses claims without evidence; drafts are quarantined from confirmed by status; promotion needs multi-source weighted evidence; one session physically cannot reach `confirmed` alone (axis/observation caps) |
| 4 | **Mass bad batch** (the copied-dist-folder class) | Anomalous-batch quarantine (applies NOTHING over threshold); layer guard; one batch commit → one `git revert` |
| 5 | **The safety gate becomes a lock** (Cortex: 6 reverts/day, zero learning) | Consecutive-revert escalation: 2 in a row → hold + loud digest line, never an infinite retry loop |
| 6 | **Retrieval silently degrades** (library update shifts scoring) | Vendored MiniSearch pinned + hashed into the index meta; exam baselines bound to that hash; exam gate on every batch |
| 7 | **Duplicate sprawl** (same fact, many phrasings) | Three-step novelty protocol; fingerprint dedup; near-dup scan; restatements become confirmations, not entries |
| 8 | **Client data leaks into the platform brain** | §2a by construction: separate repos, readOnly pin cache, `assertWritable`, containment errors by type, promotion via issue-form with client-side identifier lint + platform-side draft-only ingest + platform-evidence requirement to confirm |
| 9 | **An agent trusts a stale/disputed entry blindly** (STALE: 55.2% even with the update retrieved) | The default view serves **one adjudicated current state per key**; invalidation is written into the body as the supersession banner, not only into a field (§6.6); trust labels travel in-band; relay obligations; `/vc-self-check`-style oracle expectation: citing a disputed/stale entry as fact in an external artifact is a finding |
| 10 | **Empty-brain death spiral** (every query MISSes → agents stop asking) | Deterministic bootstrap seeds hundreds of derived facts + aggregates day one, client delta included; MISS-with-leads keeps partial value flowing; MISS share is a watched metric |
| 11 | **Verification-due backlog starves** (nobody re-checks) | Queue is bounded and prioritized (due → citedBy → age); on-read flags put the work where the users are; the digest reports queue depth; a starving queue is visible, not silent |
| 12 | **Fingerprint collision merges converse claims** ("A blocks B"/"B blocks A") | Accepted trade-off, unchanged from v1 D5-F: merge target is always a draft; phrasings kept; consolidation reads the claim, not the hash |
| 13 | **The digest becomes noise nobody reads** | Digest carries only deltas + escalations; nothing requires reading it (it is observability, not a gate); the loud paths (quarantine, revert-escalation, vetoed-claim re-observation) are few by design |
| 14 | **Normative knowledge fossilizes** (a dead convention nobody supersedes) | Practice confirmations stop accruing → surfaces in rotation as "no practice evidence since N"; force-dispute is one command; supersession requires only a newer authoritative artifact, which agents mine from ADR/PR streams |
| 15 | **Two brains diverge in engine versions** (client CI runs old engine) | The brain repo CI checks out the engine **pinned to a plugin tag**; `brain.json` records the minimum engine version; resolver refuses a root demanding a newer engine (loud, not wrong) |

The Cortex incident checklist (≈50 recorded incidents) is mapped against these
mechanisms in [R§5]; every incident class has a named v3 answer or an explicit
"accepted, out of scope" verdict.

---

## 16. Rejected alternatives (global)

- **Meeting ratification as the default** (v2 R4) — reversed by mandate; recorded in §1.1. The mechanical replacement is §7.
- **An LLM inside the consolidation/CI pipeline** — non-deterministic, quota-bound, unavailable in client CI; every v1/v2 rejection reason stands, plus the mem0 write-path retreat [R§2].
- **Embeddings-first retrieval** — breaks client CI, adds a silently-mutating dependency; deferred behind a measured ceiling (§9.3).
- **A knowledge MCP server / local service** — impossible on client installs; scripts + hooks suffice (v1 D4 stands).
- **SQLite / property-graph storage** — loses git reviewability and the folder trust boundary; nothing at this scale needs them (§4.4, [R§4]).
- **Confidence metadata expected to do the work alone** — numeric scores and passive tags alike are largely inert in context; what moves a model is the entry's wording and redundant sourcing, hence categorical labels **plus** the §6.6 banner rules [R§2]. (v2's "numeric-inversion study" could not be verified; v3 does not rely on it.)
- **Recency-wins conflict resolution** — the documented agent-memory failure class; evidence + re-check decide (§10.3).
- **Per-entry PRs / branch ceremony** — the v1 argument stands: a human bottleneck on the highest-volume lowest-stakes path.
- **Calendar lifetimes** (v2 staleness table) — contradicts the mandate; replaced by supersession + anchor drift (§6.4).
- **A separate "human-approved" top status** — no consumer may depend on a human; `pinned` is an overlay, not a rung (§6.1).
- **Roadmap in the KB** — the tracker owns it; a second copy rots by construction (§2 Q1).
- **Locators in the KB** — test-asset lifecycle, not platform knowledge (§4.1).
- **Free-text client→platform promotion with scrubbing** — deny-list scrubbing is the defect class §2a replaced with closed schemas; the issue-form + draft-only ingest + platform-evidence-to-confirm design (§10.4) is the by-construction version.

---

## 17. Ratification checklist for the team meeting

1. The §1.1 reversal: full autonomy with veto instruments, replacing the meeting model the review asked for. *(the load-bearing vote)*
2. The kind vocabulary (§4.1) and `locator`'s exit from the KB.
3. Machine-reachable top status `confirmed` + the weighted evidence defaults (§6.2).
4. The three-plane evidence model, incl. provenance-based proof for normative knowledge (§5).
5. Staleness = supersession + anchor drift; age only orders the re-check queue (§6.4).
6. Goldens: regression goldens auto-seeded; truth goldens auto-frozen after source-grounded verification with a digest veto window (§7 item 3).
7. Vendored MiniSearch + pinning discipline (§9.1).
8. The promotion channel design (issue form → draft-only ingest → platform-evidence to confirm) and its post-core timing (§10.4).
9. `vc-kb` packaging and the delivery phases (§13).
10. PR #252: close unmerged, donor branch kept (§14).
