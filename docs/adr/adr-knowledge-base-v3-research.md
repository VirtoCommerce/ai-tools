# Research digest — Knowledge Base v3

Companion to `adr-knowledge-base-v3.md` (cited there as **[R§n]**). Facts are cited;
assessments are labeled **ASSESSMENT** and are ours. Anything we could not verify is
flagged. Compiled 2026-09-01.

Sections: §0 the PR #252 review record · §1 autonomous KB construction & truth
maintenance · §2 agent memory systems 2024–26 · §3 knowledge extraction from code ·
§4 dedup, KCS v6, retrieval components, storage formats · §5 `vc-Cortex-SecondBrain`
transferability & incident checklist.

---

## §0 — Where the PR #252 review record actually lives

**FACTS.** GitHub PR #252 carries zero review artifacts: 0 reviews, 0 inline review
threads, 0 conversation comments, `reviewDecision: null` (verified via `gh` 2026-09-01).
The team architecture review (~2026-08-30/31) happened off-GitHub; its only written
record is the author's verbatim relay of the team's 8 findings (+1 raised in the
follow-up walkthrough) into a working session on 2026-08-31, plus `adr-knowledge-brain-v2.md`
(the structured response, never ratified) and the "Knowledge Brain v2" team artifact
page. No finding is attributed to an individual; only finding 7 (standalone plugin) is
marked unanimous. All nine findings were accepted by the author; the foundations the
review left standing are listed in the v2 ADR's context section and re-confirmed in
v3 §1.2.

**ASSESSMENT.** For ratification purposes the binding record is the findings list as
relayed + v2's findings-and-verdicts table. v3 §1.1 flags the one point where the new
mandate *reverses* an accepted finding (meeting ratification) — that reversal is the
main thing the ratifying meeting must consciously vote on.

---

## §1 — Autonomous KB construction & truth maintenance

*(pending — research agent A)*

---

## §2 — Agent memory systems 2024–26

### 2.1 Production systems

**mem0** (arXiv 2504.19413, 2025-04). v1/v2: extraction LLM + an update LLM choosing
ADD/UPDATE/DELETE/NOOP over similarity-shortlisted neighbors. **v3** (≈2026-04,
mem0's own migration docs): the reconciliation pass is removed — single-pass,
**ADD-only** extraction; "nothing is overwritten or deleted"; conflicts handled at
retrieval time by a multi-signal ranker. A third-party reproduction (dev.to,
2026-08) documented the v2 failure: two scope-qualified preferences were stripped of
their qualifiers at extraction, judged contradictory, and one silently deleted —
"a missing fact reappearing as wrong behavior, not an exception".
**Correction to the claim v2's ADR carried**: mem0 v3 removed the *second* LLM pass,
not the LLM from the write path; the silent-deletion → redesign causality is
third-party, not mem0-stated. **ASSESSMENT:** two lessons transfer — (a) no
destructive LLM decision at write time, supersede as a recorded state change (v3 ADR
§10.3); (b) the dedup key must include **scope**, or two scoped truths collapse into
one false contradiction (our fingerprint already hashes scope). mem0-v3's own answer
(ADD-only + rank-at-read) does NOT transfer: without their ranker, coexisting
contradictions land raw in context — the exact STALE failure surface. Flat files must
adjudicate at **consolidation time, deterministically**.

**Zep / Graphiti** (arXiv 2501.13956, 2025-01; engineering post 2024-10). Bi-temporal
edges (`valid_at`/`invalid_at` world-time + `created_at`/`expired_at` ingestion-time);
contradiction **invalidates** an edge (sets `expired_at`), never deletes; and — the
under-appreciated part — **the stored fact text is rewritten into past tense**
("Maria used to work as a junior manager, until her promotion"). Their benchmark war
with mem0 (zep-papers issue #5; Zep's response conceding a calculation error: one
LoCoMo number ran 84% → 58.44% → 75.14% depending on evaluator) is itself a finding:
**vendor-run memory benchmarks are unreliable to ±25 pp** — grade a KB only with its
own held-out exam. **ASSESSMENT:** the invalidate-not-delete state machine transfers
as frontmatter; the LLM-per-edge contradiction detector does not (deterministic key
collision + gated supersede instead); the past-tense rewrite transfers as v3's
**supersession banner** (§2.4).

**Letta (MemGPT)** (memory blocks 2025-05; sleep-time compute 2025-04, arXiv
2504.13171). After two years of "the agent edits its own memory in-line", Letta's
production design **takes core-memory editing rights away from the task agent**: a
separate sleep-time agent alone consolidates. **ASSESSMENT:** independent validation
of the capture (append-only, task-time) vs consolidation (offline, sole curator)
split v1 already had and v3 keeps.

**LangMem / cognee** — hot-path vs **background** memory formation; the background
pattern is the cross-vendor consensus. cognee = graph+vector+relational stores (the
"heavy" direction v3 rejects).

**Anthropic first-party stack** (memory tool `memory_20250818`; Claude Code
auto-memory; Agent Skills): uniformly **file-based, index-first, progressive
disclosure, lexical, zero embeddings** — with an enforced index budget and a loud
over-limit error. Notable gap: **no validity mechanics at all** (no status, no
supersede, no verification stamps). **ASSESSMENT:** first-party precedent that the
v3 shape (markdown + generated index + lexical) is a deliberate design; the validity
layer is exactly what v3 adds on top.

**Official MCP memory server** (`@modelcontextprotocol/server-memory`): entities/
relations/observations serialized to one JSONL file; lexical search; **only hard
deletes, no timestamps, no validity state**. A merge-conflict magnet at scale.
**ASSESSMENT:** per-entry files + a generated index is the corrected form of the
same idea.

### 2.2 Research 2025–26 (all arXiv preprints — flagged as not yet peer-reviewed)

- **MemGuard** — "Persisting Verifier Signals for LLM-Agent Memory Governance",
  arXiv 2608.21867 (2026-08). Verifier output kept as **persistent lifecycle
  metadata** reused at retrieval/conflict/summarization/archival; best metrics in
  **16/16 settings** (4 backbones × 4 benchmarks, FDR-corrected); a verifier-only
  control at matched budget underperforms — **the persistence carries the gain, not
  the verification act**. ⚠ Two other 2025–26 papers share the name (A-MemGuard
  2510.02373; 2605.28009) — cite by number. → v3's `evidence[]` event log IS this
  mechanism (ADR §6.2).
- **STALE** — arXiv 2605.06527 (2026-05). 400 conflict scenarios / 1,200 queries;
  best model **55.2%**; **retrieval is not the bottleneck** — updated evidence was
  retrieved in 77.5%/67.8% of cases and models still failed to adjudicate the current
  state. → default retrieval must serve **one adjudicated current state per key**;
  the current entry must *name* what it supersedes (arming premise resistance) —
  ADR §9.2/§10.3.
- **TEPA** — arXiv 2608.07429 (2026-08). "Validity as an explicit state": keyed
  precedents, same-key conflict → local revocation transition, revoked kept for
  audit. Under drift: append-only **0.210**, last-write-wins **0.210**, **no memory
  0.309**, TEPA **0.950** — *a memory without invalidation mechanics is worse than no
  memory at all*. Revocation costs nothing when nothing drifts. → the flat-file-
  friendliest design in the literature; v3's status machine is this shape.
- **Manufactured Confidence** — arXiv 2606.29279 (2026-06). Consolidation strips
  hedges and agents obey the rewritten flat assertion ("it is the confidence of the
  phrasing, not the source"); a **passive "unverified" tag is ignored**; a blunt
  "do not trust" instruction over-corrects; **one redundant source restores correct
  decisions**. → v3: preserve the epistemic register of captures verbatim; require
  ≥2 independent evidence events to confirm; encode invalidation in the **wording**
  (the supersession banner), never only in a metadata field.
- **Belief-based memory** — arXiv 2606.22030 (2026-06): per-observation reliability
  derived from **epistemic language cues**, beating last-write-wins. Same direction.
- ⚠ **The "RAG numeric-confidence inversion" study cited by the v2 ADR could not be
  located** (no primary source for "inverting all scores changed accuracy by zero").
  The *direction* (numeric metadata is behaviorally inert) is supported by
  Manufactured Confidence — which is harsher: passive categorical tags were inert
  too. v3 therefore relies on **status-conditioned wording + serving discipline**,
  not on any confidence field doing behavioral work, and the v3 ADR cites 2606.29279
  instead of the unverifiable study.

### 2.3 The documented failure modes (condensed; sources above)

1. Silent destructive conflict resolution at write time (mem0 v2).
2. Scope-stripping at capture manufacturing false contradictions (mem0 v2).
3. Stale memory beats the retrieved update — read-time adjudication fails ~45% even
   in the best model (STALE).
4. Un-invalidated memory is worse than no memory under drift (TEPA 0.210 vs 0.309).
5. Confidence laundering: consolidation rewrites hedges into flat facts (2606.29279).
6. One-shot verification decays; outcomes must persist per record (MemGuard).
7. Task agents as their own memory editors — capability removed by the vendor with
   the most production data (Letta).
8. Vendor self-evaluation untrustworthy to ±25 pp (Zep/mem0 affair).
9. No lifecycle ⇒ unbounded rot (MCP memory server; Anthropic stack).
10. Index overflow silently truncates knowledge (Anthropic's 200-line budget lesson).
11. Memory poisoning via untrusted content (A-MemGuard) — adjacent; v3's evidence
    requirements and containment reduce but do not eliminate it.

### 2.4 What v3 adopts from §2

Explicit lifecycle state + supersede-never-delete (TEPA/Graphiti) — already core ·
**one current state per key in the default view** (STALE) — the resolver's grouping +
status weights, restated as a hard rule · **the supersession banner**: when an entry
is superseded, the machine prepends a deterministic template line to its body
("Superseded on DATE by @kb(ID) — the claim below no longer holds") so the
invalidation lives in the words a model actually reads (Graphiti past-tense rewrite +
2606.29279), while the original text stays below and in git · scope inside the
fingerprint (already v1) · **verification outcomes persisted** as `evidence[]` events
(MemGuard) · capture/consolidation separation (Letta) · epistemic register preserved;
≥2 independent events to confirm (2606.29279) · own exam only, no imported benchmark
numbers (Zep/mem0 affair) · index budget → catalog sharding at S2 (Anthropic lesson).

---

## §3 — Knowledge extraction from code

*(pending — research agent C)*

---

## §4 — Dedup & canonicalization · KCS v6 · retrieval components · storage formats

*(pending — research agent D)*

---

## §5 — `vc-Cortex-SecondBrain` @ a48a365: what transfers, what does not

Studied via the GitHub API (never cloned), 2026-09-01: full tree, every README/doc/
config (`why` fields), and all incident comments. The repo is a colleague-designer's
**personal** second brain over his own working corpus: single user, single Windows
machine, Node stdlib + a pinned Python venv, no database; extraction delegated to a
pinned LLM engine (`graphify`) over a free-tier Gemini quota ring; retrieval = local
embeddings + BM25 fused by RRF + Personalized PageRank over a graph; nightly "sleep"
consolidation; ~50 dated incident post-mortems written directly into code comments and
config `why` fields. The team liked the approach; the standing question was which parts
transfer to a shared, agent-written, multi-role, multi-client, near-zero-human KB.

### 5.1 Transferability verdicts (mechanism → verdict → v3 disposition)

| Cortex mechanism | Verdict | v3 disposition |
|---|---|---|
| Post-mortems as dated in-code comments + config `why` fields | **transfer** | Kept as authoring discipline for the engine; the eval's goldens double as "is incident knowledge findable" checks |
| graph-guard: snapshot → verify → **union-merge** (protection must not become a lock) | **transfer (the single most important pattern)** | Layer guard + exam auto-revert kept from v1; v3 adds the consecutive-revert escalation (ADR §7.4, risk #5) so a binary gate cannot silently halt all learning (Cortex measured 6 rollbacks/day, zero accepted batches) |
| Manifest/stamp + poisoned-cache hygiene (revoking a "processed" stamp must also purge every cache along the path; attempts counted only with a witness) | **transfer** | v3 tombstones are explicit and final; consolidation digests record dispositions; any future cache added to the pipeline inherits this rule (recorded in the risk register rationale) |
| Sandbox re-extraction (decouple extraction from publish; inject only verified-good) | **transfer** | Already the drafts/→entries/ shape; promotion-by-issue ingests to drafts only (ADR §10.4) |
| Dispatcher: one door for heavy jobs, cross-process lock, priorities, watchdog | transfer as principle | Single-writer consolidation in brain-repo CI; local runs take a lock file; the repo already knows collector-contention pain |
| Corpus-gate quarantine for bulk arrivals | **transfer** | v1 anomalous-batch quarantine kept (ADR §7.4) |
| Health metrics: number+delta not progress bars; incident-excluded self-baselines; queues alarmed on "stalled", not "non-empty"; every alarm says what to do | **transfer** | v3 digest + `kb-status` follow these display rules; re-check queue alarmed on starvation (risk #11) |
| Deterministic repair pipeline INSIDE the write path (outside edits get cancelled by guards) | **transfer** | Index/catalog regeneration runs inside consolidation before the batch commit |
| Eval: ground truth = file/entry id + a `must` marker; the golden set self-checks; runs stamped with conditions | **transfer (already v1)** | Kept; v3 adds condition stamping (engine + vendored-library hash) per §9.1 pinning |
| Outcome loop: deterministic behavioral verdicts (re-ask = miss, cited-file-touch = hit); human 👍/👎 overrides; auto never overrides auto | **transfer, adapted** | v3 harvests golden candidates and usage metrics from resolver logs the same way; the "human confirms every golden" boundary is replaced by source-grounded verification + digest veto (ADR §7.3) — the one deliberate divergence, argued in ADR §1.1/§7 |
| Focus (working-memory prior with ★ marks; measurement runs must disable priors) | partial | No global focus in a multi-user KB; the meta-lessons kept: no priors in exam runs; any ranking modifier must be visible in the answer |
| Two-speed memory (fast layer queryable before consolidation) | **transfer** | Drafts are indexed and served as leads (ADR §9.2) — the fresh layer is visible before promotion |
| Episodic capture with salience gate; contradictions only signaled, never auto-applied | partial | v3 capture keeps the gate shape; contradiction *is* auto-resolved — but only via the re-check protocol with fresh evidence (ADR §10.3), never by text similarity |
| Contradiction appliedness-check (quoted displaced wording as sensor) | superseded | v3 uses the base pin + pointer pairs instead of quotes (finding 9); "was it applied" = status + supersedes links, machine-readable |
| Typed decay whitelist (age only for types with a lifetime; unknown never deleted) | **transfer, inverted** | v3 removes calendar decay entirely; the surviving lesson is the asymmetry: when in doubt, never delete (supersede/retire only with positive evidence) |
| Gemini key/model ring, quota accounting ("capacity ≠ remainder") | not needed | No LLM in the v3 pipeline at all; the meta-lesson (parse limits from the provider's refusal, never name a ceiling a remainder) recorded for any future model-bound step |
| Hook-guard (grep-vs-brain escalation 1/3/5, Bash-less exemption, self-test generated from config) | **already transferred** | v1 `kb-guard` is this design; v3 adds the R1 fix (entry Reads never counted) and should borrow the config-generated self-test |
| RU→EN bridge dictionary (deterministic, mode-pinned, self-checkable, never embedder-derived) | **transfer** | v3 `synonyms.json` is exactly this; the channel-independence argument (don't let one signal re-vote another) recorded |
| Thematic masking (presentation-layer pseudonymization) | **reject** | Cosmetic by the author's own admission; §2a containment needs separate repos + by-type refusal, which v3 has |
| Embedder passport + fixed-phrase canary + pinned deps | **transfer (conditionally)** | Mandatory precondition of the A3 embeddings rung (ADR §9.3); the same passport idea applied NOW to the vendored MiniSearch version (ADR §9.1) |
| Atomic index builds (tmp + rename, meta last; failed write leaves the previous index intact) | **transfer** | Engine writers already/must follow tmp+rename; recorded as an implementation requirement for P1 |
| Answer cache keyed by (question ∪ corpus fingerprint ∪ exclusions ∪ embedder canary) | not needed yet | No answer cache in v3.0; the key checklist recorded for if one appears |
| Open-loops scanner (marker grammar, rule-versioned baselines, --explain) | not needed | Out of scope; the meta-pattern (a detector change reseeds its baseline) recorded for the extractors' `unresolved[]` reporting |
| peaks.js measurement discipline ("build the instrument before claiming the effect"; print what you measured) | **transfer as practice** | Applied to the metrics plan (§12): every claimed improvement must name its instrument |

### 5.2 Incident checklist → v3 protection mapping

Cortex records ≈50 dated incidents; grouped into classes, each with the v3 answer.
(The task requires: "any new architecture must be able to answer how it is protected
from each".)

| # | Incident class (Cortex examples) | v3 protection |
|---|---|---|
| 1 | **Silent knowledge-layer loss** — the flagship: −42% knowledge nodes overnight; every aggregate instrument said `ok`; manifest stamped everything "extracted" | Layer guard per scope (count may not fall without explicit retire); one batch commit + exam gate + auto-revert; derived layer regenerable by construction (loss = regenerate) |
| 2 | **Protection became a lock** — rollback-on-regression → 6 reverts/day, zero accepted batches | Consecutive-revert escalation: 2 reverts → hold + loud digest, never an infinite loop (ADR §7.4) |
| 3 | **Poisoned cache** — the stub itself was cached; removing the stamp alone made the cure a no-op; 501/635 cached fragments were stubs | v3 pipeline has no LLM extraction cache; tombstones/dispositions are explicit; rule recorded: any added cache must be invalidated together with its stamp |
| 4 | **Bulk ingestion without a gate** — a copied dist folder doubled the brain in a day (+3,739 duplicate nodes) | Anomalous-batch quarantine (apply NOTHING over threshold); bootstrap is extractor-driven with aggregate granularity, not directory ingestion |
| 5 | **Dead/lying instruments** — a dead metric masked a day-long outage; "0 in/0 out" forever; success invented from absence ("nine failed runs" that never happened); a warning that doesn't stop | Every gate exits non-zero on failure (never "pass on unreachable source"); extract/consolidate emit one structured record per run including empty ones; `--check` gates are hard CI failures; "absence of data must not look like a fact" is the extractor `unresolved[]` rule |
| 6 | **Frankenstein diagnostics** — one report line stitched from two unrelated events; truncated stderr shown as the cause | Digest lines carry the run id of the event they describe; the engine reports causes only from the named run's own record (rule recorded for P1 implementation) |
| 7 | **Stale/one-pass-behind derived state** — index permanently one pass behind; refresh raced the writer; A/B under a live server clobbered a fresh index | Regeneration inside the batch (before commit); `--check` byte-compare in CI; single-writer consolidation with a lock file; atomic tmp+rename writes |
| 8 | **Failed write destroyed the previous state** — live index truncated before the new write proved possible (2.5 h lost) | tmp + atomic rename, meta written last (implementation requirement, P1) |
| 9 | **Self-measuring ruler** — the exam moved what it measured (focus prior reinforced per query); eval history without measurement conditions | No priors in v3 retrieval; exam runs record conditions (engine version + vendored-lib hash); deterministic ranking end-to-end |
| 10 | **Silently changed dependency semantics** — fastembed changed pooling under the same model name; the only warning was self-muffled | Vendored, hash-pinned MiniSearch; the hash rides in the index meta; embeddings (if ever) require passport + canary |
| 11 | **Retellings outranked sources**; long files won by having more words | Field-weighted scoring with body length damping (kept from v1, now BM25-native); source-of-truth fields (`subject`, `question`) outrank body |
| 12 | **Duplicate forking** — "addresses" → "addresse" singularization bug forked one observation into two drafts | Fingerprint normalization is versioned (`FINGERPRINT_VERSION`); a change is a corpus migration, not a silent drift; unit tests pin the token pipeline |
| 13 | **Wrong-currency budget** — counted passes while the provider limited requests | No quota-bound dependency in the pipeline; recorded as a rule for any future model-bound step |
| 14 | **Links authored ≠ links resolved** — 58% orphans because authors linked by slug and the engine named nodes by meaning | v3 links are by id only (a citation contract with a validator + dangling-ref gate); no inferred linking |
| 15 | **Notification noise from the healthy path** — 64 red alerts/day from normal operation; contradiction digest re-asking to fix the fixed every morning | Digest = journal, not alarm; loud paths are enumerated and few (quarantine, revert escalation, veto-claim re-observation); resolved disputes are tombstoned and cannot resurface |
| 16 | **Time lost to un-queryable fresh knowledge** — a note written during the day didn't exist until 05:00 | Drafts are indexed immediately and served as leads (two-speed memory) |
| 17 | **Retroactivity gaps** — ignore rules applied only prospectively; already-indexed garbage lived forever | Consolidation/tombstones act on the corpus as it is; retire/veto acts retroactively by definition; derived layer regenerates wholesale |
| 18 | **Self-scored hits** — the brain's own writes counted as outcome-loop hits | Usage metrics exclude the engine's own file operations; golden verification must cite sources outside the corpus (validator-enforced) |

### 5.3 Admitted limits worth keeping in view

The author's own: hand-written goldens "measure what we guessed to ask"; auto-outcomes
are fit for statistics and candidate mining only; single-user assumptions are pervasive
in the implementations (one lock, one focus, one human's 👍) — the *designs* transfer,
the code mostly does not. **ASSESSMENT:** this matches our disposition: v3 borrows
Cortex's mechanisms as design patterns and inherits code only from our own #252 donor.

---

*§1–§4 are appended below as the research agents report.*
