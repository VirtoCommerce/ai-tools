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

### 3.1 What LLM-generated code wikis get wrong (the case against generation)

**FACTS — DeepWiki (Cognition, launched 2025-04-25;
[cognition.com/blog/deepwiki](https://cognition.com/blog/deepwiki),
[docs.devin.ai/work-with-devin/deepwiki](https://docs.devin.ai/work-with-devin/deepwiki)).**
LLM-generated wiki pages per component, prompted with source + related files + a code
graph; capped at 30 pages (80 enterprise); **no re-index cadence and no accuracy
guarantee documented**. Recorded failures, from the HN thread "DeepWiki: Understand Any
Codebase" (2025-08-24, [item?id=45002092](https://news.ycombinator.com/item?id=45002092),
aggregated by [BigGo 2025-08-27](https://biggo.com/news/202508270142_DeepWiki_Accuracy_Concerns))
and from Blopker, "DeepWiki and the loss of control"
(2025-11-11, [blopker.com/writing/12-deepwiki/](https://blopker.com/writing/12-deepwiki/)):

- **LLVM** — the compilation-pipeline diagram misplaces the Clang-AST stage, and the wiki
  omits GlobalISel, InstCombine, the pass manager, LLVM IR and TableGen, while being
  "overly fixated on things that happen to be very large files".
- **LibreOffice** — claims the project uses **Buck** as its build system; it never has
  (it uses Make).
- **CLP / COIN-OR** — the pivot-tolerance explanation misses the actual
  sparsity/numerical-stability trade-off; "distinctly worse than what I would have found
  just traipsing through the code".
- **Naming-driven hallucination** — behavior inferred from an identifier that no longer
  matches what the code does.
- Blopker's own repo — DeepWiki recommended, as the primary installation route, **a VS
  Code extension that does not exist** (unfinished, unpublished code in the repo); every
  section that "seemed fine on first brush" carried at least one factual error; verdict
  "a fractal of misinformation", and — because the pages rank in search — "an Ouroboros
  of AI slop".
- Mitigations DeepWiki does use: per-section source links and two answer depths. That is
  all: verification is pushed onto the reader; no per-claim machine check, no freshness
  contract.

**FACTS — CodeWiki (FSoft-AI4Code, ACL 2026; [arXiv:2510.24428](https://arxiv.org/abs/2510.24428),
repo [FSoft-AI4Code/CodeWiki](https://github.com/FSoft-AI4Code/CodeWiki)).** A purpose-built
multi-agent documentation generator (dependency-aware decomposition → recursive agent
processing → text + Mermaid synthesis) evaluated on **CodeWikiBench** (21 repos,
rubric-based, **LLM-as-judge**). Overall **68.79%** vs DeepWiki's 64.06%; high-level
languages 79.14 vs 68.67; **systems languages 53.24 vs 56.39 — it loses to DeepWiki
there**, and the repo notes the degradation. The abstract concedes current approaches
"still fail to model rich semantic dependencies".

**FACTS — Google "Code Wiki"** (announced 2025-11-14,
[developers.googleblog.com](https://developers.googleblog.com/introducing-code-wiki-accelerating-your-code-understanding/)):
Gemini-generated wikis that "regenerate documentation after changes" — i.e. the vendor
concedes staleness is the default state and regeneration must be event-driven. No
engineering detail on cadence or factuality mitigation.

**FACTS — Karpathy's "LLM Wiki"** (gist 2026-04-04,
[gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)): raw sources
(immutable) + an LLM-maintained markdown wiki + a co-evolved schema; operations
ingest / query / **lint** (a periodic LLM audit for contradictions and stale claims).
Documented critiques: repeated-rewrite degradation — "the wiki version of model collapse"
— and practitioner reports of quality decay past ~200–300K tokens (third-party syntheses
of the comment thread, [starmorph](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide),
[kunalganglani](https://www.kunalganglani.com/blog/llm-wiki-karpathy-local-knowledge-base) —
practitioner-reported, not measured); "LLM Wiki v2" ([rohitg00 gist](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2))
names v1's failure modes as **knowledge rot without lifecycle**, **contradictions
persisting unresolved**, **retrieval collapse past ~100 pages**, **maintenance
abandonment**; a response gist ([V-interactions, 2026-04-12](https://gist.github.com/V-interactions/a0d2a62c1b16d1fecf1bd81e8f611fba))
names four structural gaps: no epistemic filter, no knowledge lifecycle, no negentropy
(no contradiction-surfacing immune function), **no grounding verification**.

**ASSESSMENT.** Two numbers frame the cold-start decision: the best purpose-built
generator scores **~69% on its own LLM-judged rubric** and regresses below the baseline
on systems languages. For a corpus whose entries are cited by regression suites and fix
routing, a ~30% wrongness rate at the fact layer is disqualifying. This is the empirical
case for the mandate's "only 100%-deterministic facts at cold start" — and it yields five
hard rules the v3 derived layer obeys (ADR §5.1/§11.1):

1. **No LLM-authored claim enters the derived layer.** Every documented failure (Buck,
   the phantom extension, the misplaced pipeline stage) is a model asserting something
   the code does not contain.
2. **Salience must be enumerative, not attention-driven.** The LLVM complaint isolates
   the mechanism: summarizers weight large files and miss distributed-but-critical
   machinery. An extractor enumerates; coverage is a property of the walker.
3. **Never infer behavior from names.** Extract declarations (routes, constants,
   schema, manifests), never purposes.
4. **Diagrams and prose are views over fact records**, regenerated — never stored as
   truth.
5. **Citations are not verification.** DeepWiki has source links and still misleads. The
   only verified claim is one whose content *is* extractor output.

Plus, from the Karpathy corpus: **never maintain the derived layer in place** —
regenerate from source. Regeneration is idempotent extraction, so the model-collapse
mechanism (an LLM rewriting an LLM's output) has no purchase. And the missing "grounding
verification" the critics name is exactly the gap this layer fills.

### 3.2 Deterministic extraction — what exists to reuse

**.NET / C# (FACTS).** Roslyn (`Microsoft.CodeAnalysis`) is the compiler-as-API and the
standard way to enforce code facts in CI
([learn.microsoft.com](https://learn.microsoft.com/en-us/visualstudio/code-quality/roslyn-analyzers-overview)).
`Microsoft.DotNet.ApiCompat` (in the .NET SDK) asserts API compatibility against a
baseline, with intentional breaks requiring an explicit suppression file
([overview](https://learn.microsoft.com/en-us/dotnet/fundamentals/apicompat/overview)) —
known rule gaps exist (generic constraints, [dotnet/sdk#39659](https://github.com/dotnet/sdk/issues/39659)):
determinism is not completeness. **GenAPI** emits a reference-source text of a public
surface ([dotnet/wpf docs](https://github.com/dotnet/wpf/blob/main/Documentation/gen-api.md)).
**PublicApiAnalyzers** is the cleanest committed-fact-file precedent in .NET: every public
symbol must appear in `PublicAPI.Shipped.txt`/`Unshipped.txt`, with RS0016/RS0017 failing
the build on mismatch ([help doc](https://github.com/dotnet/roslyn/blob/main/src/RoslynAnalyzers/PublicApiAnalyzers/PublicApiAnalyzers.Help.md)).
**apisof.net** is Microsoft's own generated fact catalog of the .NET API surface
([repo](https://github.com/dotnet/apisof.net)), and **dotnet/core** commits generated
per-release markdown **API diffs** into the repo
([release-notes](https://github.com/dotnet/core/tree/main/release-notes)). Endpoint
enumeration: **ApiExplorer** (`IApiDescriptionGroupCollectionProvider`) yields every route
template, verb, parameter and response type — Swashbuckle/NSwag are built on it
([Lock](https://andrewlock.net/introduction-to-the-apiexplorer-in-asp-net-core/)) — and
`Microsoft.Extensions.ApiDescription.Server` produces the OpenAPI document at build time
([Scalar](https://scalar.com/products/api-references/integrations/aspnetcore/build-time-generation)),
with the documented gotcha that referencing Swashbuckle.SwaggerGen silently disables it
([MS Q&A](https://learn.microsoft.com/en-us/answers/questions/5497489/errors-when-trying-to-generate-swagger-json-at-bui)).

**GraphQL (FACTS).** Introspection → normalized SDL snapshot is the standard deterministic
capture (`print_schema`; Apollo Rover `graph introspect`
[docs](https://www.apollographql.com/docs/rover/commands/graphs)). **graphql-inspector
`diff`** classifies every schema change as **breaking / dangerous / non-breaking** with
tunable rules, and `validate` checks client operations against a schema
([the-guild.dev](https://the-guild.dev/graphql/inspector/docs/commands/diff)). **GraphQL
Hive** conditions breaking-ness on real usage via persisted **schema coordinates**
([docs](https://the-guild.dev/graphql/hive/docs/schema-registry)); Apollo GraphOS does the
same registry-side ([docs](https://www.apollographql.com/docs/graphos/platform/schema-management)).
GitHub publishes its public schema plus a dated changelog and a separate breaking-changes
log ([docs.github.com](https://docs.github.com/en/graphql/overview/changelog)).

**OpenAPI / Protobuf (FACTS).** **oasdiff** classifies changes **ERR / WARN / INFO** —
WARN explicitly meaning "potential breaking… cannot be confirmed programmatically" — and
maps severity to a CI exit code via `--fail-on`
([repo](https://github.com/oasdiff/oasdiff),
[breaking-changes doc](https://github.com/oasdiff/oasdiff/blob/main/docs/BREAKING-CHANGES.md)).
**`buf breaking`** is the canonical "schema diff as CI gate": baseline = a git ref or the
registry, rules in four nested categories (FILE / PACKAGE / WIRE_JSON / WIRE), failure as
PR annotations ([buf.build/docs/breaking](https://buf.build/docs/breaking/)).

**JS / TS / Vue (FACTS).** **ts-morph** wraps the TypeScript compiler API for AST queries
with type information ([repo](https://github.com/dsherret/ts-morph)).
**@microsoft/api-extractor** generates a committed `.api.md` report and **fails the CI
build when the regenerated report differs from the committed one**
([docs](https://api-extractor.com/pages/overview/demo_api_report/)). **vue-docgen-api**
statically extracts a component's props, events, slots and methods
([docs](https://vue-styleguidist.github.io/docs/Docgen.html)), with documented blind spots
on proxy/dynamically-composed components
([issue #1040](https://github.com/vue-styleguidist/vue-styleguidist/issues/1040)).
**unplugin-vue-router** emits a generated typed route inventory for file-based routing
([uvr.esm.is](https://uvr.esm.is/)) — not applicable to a hand-written `createRouter`
config, which is what a storefront usually has.

**Scale precedents (FACTS).** **SCIP** (Sourcegraph, successor to LSIF) and **Glean**
(Meta, open-sourced 2024-12-19) both model code knowledge as **schema-typed fact records**
queried by tools — Glean explicitly "collecting, deriving and working with facts about
source code", and Meta generates documentation *from* those facts
([SCIP](https://sourcegraph.com/blog/announcing-scip),
[Glean](https://engineering.fb.com/2024/12/19/developer-tools/glean-open-source-code-indexing/)).

### 3.3 The pattern v3 adopts: generated fact layer + drift gate

**FACTS — precedent inventory.** Committed-file gates: api-extractor `.api.md` (CI fails
on mismatch), PublicApiAnalyzers `PublicAPI.*.txt` (build fails), ApiCompat suppression
files, checked-in GraphQL SDL snapshots re-introspected in CI, Rails' `schema.rb`
("check your schema file into source control", regenerated by migrations,
[guides](https://guides.rubyonrails.org/v7.0/active_record_migrations.html)),
dotnet/core's committed API diffs, unplugin-vue-router's generated `typed-router.d.ts`.
Registry gates: GraphQL Hive, Apollo GraphOS, **Pact broker** — whose `can-i-deploy`
blocks a deployment unless the provider has been verified against every consumer contract
([docs.pact.io/provider](https://docs.pact.io/provider)).

**ASSESSMENT.** Every committed-file precedent shares three properties the v3 derived
layer copies verbatim: **regeneration is the only write path** (humans never hand-edit the
artifact), **the diff is the review surface**, and **an intentional change leaves a
durable trace**. The severity taxonomies (oasdiff ERR/WARN/INFO, inspector
breaking/dangerous/safe, buf's four categories) hand us a ready-made **re-verification
priority vocabulary** for ADR §6.5: a *breaking* fact diff forces re-verification of every
lifecycle entry anchored to the affected coordinate before the next consolidation batch;
a *safe* diff merely re-stamps the anchors. Hive's **schema coordinate** is the strongest
precedent for our `anchors[]` format — an entry citing `Type.field` lets an SDL diff
mechanically select what to re-check. Pact's `can-i-deploy` is the right semantics for the
event stream itself: "may this knowledge still be served?" answered from a verification
matrix rather than from trust.

**Extractor order for the v3 cold start** (ADR §11.1, with reuse verdicts):

| Fact class | Method | Determinism | Tool |
|---|---|---|---|
| Module identity, dependency ranges, declared settings + defaults, permissions | XML parse of `module.manifest` | full (declarative source) | reimplement (trivial) |
| Settings / permission constant ids + values | Roslyn symbol walk + constant evaluation over `ModuleConstants` | full — resolve concatenated constants via Roslyn's constant value, never regex | Roslyn as a library |
| REST endpoints (per-module, static) | Roslyn walk of controllers + `[Route]`/`[Http*]` | high — route-token replacement and inherited prefixes are the reimplementation risk; label these records `derived-static` | reimplement on Roslyn |
| REST endpoints (authoritative) | ApiExplorer / build-time OpenAPI against a composed host | full given a bootable host; label `derived-hosted` | reuse as-is |
| REST drift classification | OpenAPI diff, ERR/WARN/INFO | full (closed rule set) | **oasdiff, reuse as-is** |
| GraphQL xAPI schema | introspection → normalized, sorted SDL snapshot | full (sort for stable diffs; introspection must be enabled on the snapshot env) | reuse as-is |
| GraphQL drift classification + operation coupling | SDL diff → breaking/dangerous/safe; `validate` storefront documents against the SDL | full | **graphql-inspector, reuse as-is** |
| Public C# API surface | reference-source generation / snapshot | full (known rule gaps) | GenAPI / PublicApiGenerator |
| Storefront route table | ts-morph walk of the router config literals | high — dynamic registration ⇒ `unresolved` record | reimplement on ts-morph |
| Component contracts (props/events/slots) | Babel/AST extraction of SFCs | high — proxy/dynamic components documented to fail ⇒ `unresolved` | **vue-docgen-api, reuse as-is** |

Disagreement between the static and hosted REST extractors is itself a finding, not a
tie to break silently. And the never-guess rule is inherited verbatim from this repo's
design-spec extractor: an unparsable construct yields an explicit `unresolved` entry
**with a reason**, never an inferred fact.

**Flagged as unverified** by the research pass: DeepWiki's "$300K compute / 4B lines"
figures (secondhand only); the Compiler Explorer maintainers' report (via aggregation);
DeepWiki's re-index cadence (undocumented); oasdiff's "506 change types" (site claim vs
"hundreds" in docs); the Karpathy gist-thread specifics (via third-party syntheses).
Virto-internal items still to verify against source rather than the web: xAPI
introspection availability per environment, the full `module.manifest` schema breadth,
and whether any module already ships a build-time OpenAPI document.

---

## §4 — Dedup & canonicalization · KCS v6 · retrieval components · storage formats

### 4.1 Novelty checking at our scale

**FACTS.** MinHash (Broder 1997) + LSH banding turns Jaccard estimation into sub-linear
candidate generation; the practitioner literature states the small-corpus counterpoint
directly — "for a small corpus, exact pairwise comparison is simpler"
([yorko.github.io, 2023](https://yorko.github.io/2023/practical-near-dup-detection/)).
Production configurations sit orders of magnitude above our scale: Lee et al.,
"Deduplicating Training Data Makes Language Models Better" (ACL 2022) uses **5-gram
shingles, 9,000 hashes (20×450)** and confirms a candidate only if **edit similarity >
0.8** ([ACL Anthology](https://aclanthology.org/2022.acl-long.577/)); FineWeb (NeurIPS
2024 D&B) uses 5-grams with 112 hashes in 14 buckets, "targeting documents at least ~75%
similar" ([paper](https://papers.neurips.cc/paper_files/paper/2024/file/370df50ccfdf8bde18f8f9c2d9151bda-Paper-Datasets_and_Benchmarks_Track.pdf)).
The industry band is **Jaccard ≈ 0.7–0.85 over 5- or 13-gram sets**. SimHash is the
cosine-side twin — Google's WWW 2007 deployment used **64-bit fingerprints with Hamming
distance k=3** over 8B pages
([paper](https://archives.iw3c2.org/www2007/papers/paper215.pdf)) — and for set
resemblance MinHash is argued to dominate it ([Shrivastava & Li, AISTATS
2014](https://arxiv.org/pdf/1407.4416)).

The **sorted-token-bag fingerprint has a citable ancestor**: **I-Match** (Chowdhury,
Frieder, Grossman & McCabe, ACM TOIS 20(2), 2002) hashes the document's *order-insensitive
term set* after IDF filtering; identical digest ⇒ near-duplicate; ~5–6× faster than
shingling ([paper PDF](https://ir.cs.georgetown.edu/publications/downloads/p171-chowdhury.pdf)).
Its known weakness — one surviving-token change flips the digest — motivated lexicon
randomization ([J. Supercomputing 2007](https://link.springer.com/article/10.1007/s11227-007-0171-z)).
**SpotSigs** (SIGIR 2008) teaches the opposite stopword lesson: stopwords are used as
*anchors* and verification is exact Jaccard, no hashing approximation
([ACM](https://dl.acm.org/doi/10.1145/1390334.1390431)).

**Mixed EN/RU:** a Snowball Russian stemmer exists
([snowballstem.org](https://snowballstem.org/algorithms/russian/stemmer.html)), but for
morphologically rich Russian the literature prefers **lemmatization over stemming**, with
rule-based stemming producing invalid stems
([arXiv:2305.10848, 2023](https://arxiv.org/pdf/2305.10848)); language-specific tooling
degrades when applied blind to multilingual text
([Programming Historian](https://programminghistorian.org/en/lessons/analyzing-multilingual-text-nltk-spacy-stanza)).

**Canonicalization:** **CESI** (WWW 2018) canonicalizes OpenIE triples by learning noun/
relation-phrase embeddings *jointly with side information* (entity linking, PPDB
paraphrases, WordNet, morphological normalization, token overlap), then clustering
([arXiv:1902.00172](https://arxiv.org/abs/1902.00172)).

**BM25 scores are not absolute:** Elastic's own guidance — a score "works perfectly to
compare search results for a given search query, but it's not useful to compare different
search requests"; scores are unbounded; normalize before thresholding
([Elastic docs](https://www.elastic.co/docs/solutions/search/full-text/search-relevance/consistent-scoring)).

**ASSESSMENT → the v3 novelty protocol (ADR §10.1).** At <5k short entries MinHash/LSH is
pure cost: worst-case all-pairs is ~12.5M token-set intersections on 30–80-token entries —
low single-digit seconds in Node, and an inverted-index prefilter cuts that 10–100×. LSH
buys sub-linearity at the price of probabilistic error and a tuning surface, below ~10⁵
documents. So the three-step protocol is right, with four disciplines the literature
supplies:

1. **Canonicalize before hashing**: Unicode NFC + lowercase + the Russian **ё→е** fold +
   a committed alias map (CESI's "side information", made deterministic). **No stemming,
   no stopword removal** — stemming is language-specific and lossy for Russian, and
   stripping function words from *short claims* can erase negation ("must" vs "must not")
   and merge opposite claims. (Our fingerprint's existing stopword list is deliberately
   short and keeps `no/not/never` — that choice is now sourced.)
2. **Stage 1 is I-Match-shaped** and already implemented: hash over
   `(kind, scope, subjectSlug, sorted unique claim tokens)`. Its documented brittleness
   (one token flips the digest) is exactly why stage 3 exists.
3. **BM25 is a candidate generator, never a threshold.** Rank, not score, is the signal —
   IDF drifts as the corpus grows, so a fixed BM25 cutoff silently changes meaning.
   Verify each candidate with corpus-independent **Jaccard** *and* **containment**
   (|A∩B|/min(|A|,|B|)) — Jaccard alone under-fires when a short claim sits inside a
   longer one.
4. **Three bands, committed as config**: **≥0.9 duplicate** (merge → confirmation event),
   **0.7–0.9 near-duplicate** (surface as extend/supersede/dispute decision — the ADR's
   outcome 2/3), **<0.7 novel** (new draft). Calibrated once against a labeled sample of
   our own entries; a threshold change is a scoring change and must regenerate exam
   baselines *in the same reviewed commit*, never drift silently.

### 4.2 KCS v6 → what survives near-zero-human

**FACTS** (Consortium for Service Innovation; KCS v6 Practices Guide PDF dated
2023-06-08). **Article states** ([Technique 5.2](https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/040/010/030)):
*Work in Progress* (captured, no resolution yet), *Not Validated* ("complete in that the
article has a resolution, but we are not confident in the structure or content due to
lack of feedback, others' use of the article, or because the article may not be structured
or written in a way that complies with the content standard"), *Validated* ("considered
complete and reusable, and we are confident in it" — requiring **both** responder
confidence **and** content-standard compliance, and typically requestor validation that it
resolved the issue), *Archived* (done "only when the article is defined as having no
value" — removed from search **while preserving links to previously associated
incidents**, i.e. a visibility change, not deletion).

**Reuse is review** ([Technique 4.1](https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/030/040/020)):
"Who better to validate the accuracy of an article than the person who uses it?" — with
the explicit economics, "**Reviewing every KCS article that is created is a huge waste of
time and money**", and the corollary that demand-driven review avoids "investment in
dedicated quality assurance and editorial staff". **Flag it or fix it**: fix if licensed
and confident, otherwise flag — doing one of the two is unconditional. **License levels**
([Technique 7.1](https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/040/030/020)):
Candidate (find, link, flag, frame WIP/Not Validated) → Contributor ("create or validate
articles in their product area without review by a Coach") → Publisher (external
audience); licenses are **earned by demonstrated behavior and revocable** for "poor
judgment or a lack of compliance with the content standard".

**KCS in the AI era.** "KCS Automation in the Age of AI" (2025-09-12): AI generates
articles from interactions, flags outdated content, avoids duplication, scores an
**Article Quality Index**; the human-side principle quoted is "we want our knowledge to be
human-ready first"
([serviceinnovation.org](https://www.serviceinnovation.org/kcs-automation-in-the-age-of-ai/)).
"KCS puts the R in RAG" (2025-07-09): "AI outcomes are only as good as the knowledge it
pulls from"
([post](https://www.serviceinnovation.org/q2-2025-recap-kcs-puts-the-r-in-rag/)). The
methodology was renamed **Knowledge-Centered *Success*** in April 2026, with the Solve Loop
reordered **Reuse-first**, and the stated division of labour: humans keep "managing
ambiguity" and "making meaning", AI handles pattern detection
([The Next Era of KCS](https://www.serviceinnovation.org/the-next-era-of-kcs/);
[successor guide](https://library.serviceinnovation.org/KCS/Knowledge-Centered_Success_Practices_Guide)).
*Intelligent Swarming* is a separate framework about organizing people, not the article
lifecycle ([library](https://library.serviceinnovation.org/Intelligent_Swarming)).

**ASSESSMENT.** KCS is already a near-zero-review methodology — its central economic claim
is that pre-publication review is waste and that *use* is the review. So v3's autonomy is
closer to orthodox KCS than v2's meeting was. The mapping:

| KCS v6 | v3 name | Note |
|---|---|---|
| Content standard | closed-vocabulary entry schema + lint gates | KCS defines validation as *compliance with the standard* — mechanically checkable |
| WIP → Not Validated → Validated → Archived | `draft → candidate → confirmed → superseded/retired` | Preserve the semantics: **confirmed = complete + used + standard-compliant** (evidence of process, not a quality vibe); archive is a visibility change, never deletion |
| Reuse is review | confirmation events + demand-ranked re-check queue | Endorses "no per-entry human review"; unused entries are never proactively polished |
| Flag it or fix it | flagging is permissionless (dispute/drift), fixing is gated (consolidation) | The asymmetry is the point |
| License levels (earned, revocable) | capability tiers: capture-only → consolidate-behind-gates → promote-to-platform | "Earned by demonstrated behavior" ⇒ gates keyed to exam outcomes; "revocable" ⇒ quarantine |
| Coach / Article Quality Index | ⚑ the independent grader — goldens + sampling | v3 keeps this function but **mechanizes it**: source-grounded golden verification instead of a person (ADR §7.3) — the one deliberate divergence |
| Performance Assessment → Performance Insight | ⚑ outcome owner | ADR §12 metrics are the artifact; a human still reads them |
| The "why" behind the standard | ⚑ standard-setter | `brain.json` thresholds + the ADR itself; changed by a human |

**Three functions must survive in some form**: the standard-setter, the independent grader
(never the writer — v3 satisfies this by grounding golden verification outside the corpus
rather than by requiring a person), and the outcome owner. Everything else — capture,
structuring, linking, dedup, flagging, validation-by-use — the Consortium's own 2025–26 AI
material treats as automatable. **Naming caution:** KCS is branded with a verification
programme ("KCS v6 Verified" tools); borrow the concepts, do not claim compliance.

### 4.3 Retrieval component — the MiniSearch decision, measured

**FACTS** (npm registry queried 2026-09-01; sizes and internals **[measured]** by the
research pass from the shipped tarballs):

| Library | Latest | License | Runtime deps | Scoring | Size | Verdict |
|---|---|---|---|---|---|---|
| **MiniSearch** | 7.2.0 (2025-09-16) | MIT | **none** | **BM25+** (k=1.2, b=0.7, δ=0.5 in shipped code) | ES build 78,014 B raw / **18,324 B gz**, **self-contained, no imports** | **pick** |
| Orama | 3.1.18 (2025-12-19) | Apache-2.0 | none | BM25 (k=1.2, b=0.75) | **47 files**, 228,992 B / 46,053 B gz | rejected |
| lunr.js | 2.3.9 (**2020-08-19**) | MIT | none | BM25 | 29,510 B / 8,434 B gz | rejected (6 years unreleased) |
| FlexSearch | 0.8.212 (2025-09-06) | Apache-2.0 | none | **not BM25** — contextual/proximity index, no IDF | 51,355 B / 17,711 B gz | rejected |
| wink-bm25-text-search | 3.1.2 (2022-11-21) | MIT | **4 deps** | BM25 | — | rejected (not zero-dep) |
| hand-rolled BM25 | — | ours | none | BM25 per Robertson & Zaragoza (FnTIR 2009) | ~100 LOC | viable fallback |

MiniSearch specifics: the README says only "modern search result ranking algorithm", but
the shipped code contains **BM25+**, and the changelog pins its adoption to v5.0.0
(2022-06-16) — "Use the BM25+ algorithm to score search results". Field boosting, fuzzy
(edit-distance) and prefix search are supported; the default pipeline is **language-neutral**
(Unicode space/punctuation tokenizer + lowercase, **no stemming, no stopwords**); the
shipped module contains **no `Math.random` / `Date.now`**; serialization is versioned
(`serializationVersion`, broken at majors 4.0.0 and 6.0.0); the documented limitation is
that the index must fit in process memory. Orama's "<2 kB" marketing claim is contradicted
by measurement, its results embed a wall-clock `elapsed` field (a snapshot-nondeterminism
source), its shipped `languages.js` maps `slovenian: 'ru'` (a wrong stemmer code), and the
company's flagship moved to the AGPL-3.0 Rust **OramaCore**.

**Precedent for the pinning discipline:** Lucene changed its **default** similarity from
TF-IDF to BM25 in 6.0 and Elasticsearch inherited it in 5.0 — a whole ecosystem's
relevance moved under an upgrade
([Elastic blog](https://www.elastic.co/blog/found-bm-vs-lucene-default-similarity));
MiniSearch itself swapped scoring at v5.0.0. **RFC 8785 (JSON Canonicalization Scheme,
2020)** defines byte-identical JSON serialization — sorted keys, fixed number formatting
([rfc-editor.org/rfc/rfc8785](https://www.rfc-editor.org/rfc/rfc8785)).

**ASSESSMENT.** MiniSearch is the only candidate that is simultaneously true BM25 *in the
shipped code*, MIT, genuinely zero-dep, **one self-contained file** (so "vendor a single
file" is literal), language-neutral by default (nothing to mis-fire on EN/RU; Cyrillic
tokenizes correctly under its Unicode splitter) and free of internal randomness. The
hand-rolled ~100-line BM25 remains a legitimate maximum-determinism fallback — scores then
change only when a commit in our repo changes them — at the cost of fuzzy/prefix matching.
**Pinning discipline for the ADR (§9.1), sourced:** vendor the exact file and record
`package@version` + **sha256** in the index meta; never consume via an npm range; an
upgrade is a deliberate two-commit migration that regenerates exam baselines in the same
reviewed change; **sort entries by id before indexing** so filesystem enumeration order
cannot leak in; serialize the index canonically (RFC 8785-style); strip volatile fields
from anything snapshotted (Orama's `elapsed` is the cautionary example); and let the exam's
hit@k/MRR byte-compare be the tripwire for any scoring drift. CJK, if it ever matters, is
a ~15-line custom tokenizer — MiniSearch accepts one.

### 4.4 Storage format — the convergent pattern

**FACTS.** Anthropic's shipping surfaces are all files + a small always-loaded index:
the **memory tool** is client-executed file operations over a `/memories` directory
([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool));
**Claude Code auto-memory** is `MEMORY.md` (one line per memory, first **200 lines /
25 KB** loaded) plus one topic `.md` per memory with YAML frontmatter carrying `type` and
an auto-stamped `modified` ([docs](https://code.claude.com/docs/en/memory)); **Agent
Skills** is a directory with `SKILL.md` + frontmatter and three-tier progressive
disclosure ([engineering blog](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)).
**Beads** (Yegge, 2025) independently converges on the same split: issues live in SQLite
for local queries (**gitignored**) and in **JSONL tracked in git** as the sync source of
truth ([announcement](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a)).
The **official MCP memory server** keeps a whole knowledge graph in one JSONL file
([repo](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)). By
contrast **mem0** requires a vector (or graph) store at runtime
([arXiv:2504.19413](https://arxiv.org/abs/2504.19413)) and **Zep/Graphiti** requires a
graph database plus embedding/LLM services
([arXiv:2501.13956](https://arxiv.org/abs/2501.13956),
[repo](https://github.com/getzep/graphiti)).

**ASSESSMENT** — scored against our constraints:

| Format | Reviewable diffs | CI determinism | No runtime services | Stable per-entry ids | Fit at 10²–10⁴ |
|---|---|---|---|---|---|
| **md + frontmatter, one entry per file** | best | high | yes | natural | good (shard dirs by kind/scope) |
| JSONL | poor for prose | high if canonically serialized | yes | id field | good for append-only queues |
| SQLite | none (binary) | poor | yes | keys | un-reviewable in git |
| graph service (mem0/Zep class) | none | poor (embeddings, LLM) | **no** | node ids | disqualified by client CI |
| **hybrid: md source + generated JSON index** | best | high | yes | id in both | **the convergent production pattern** |

The recommendation confirms ADR §4.4 with sources: **markdown + closed frontmatter, one
entry per file, plus a generated canonically-serialized JSON index, plus JSONL only for
the append-only capture queue.** Relations (`supersedes` / `relation` / `anchors`) are
frontmatter fields materialized into the index — a "poor man's property graph" that costs
nothing at this scale, where our edge density is three types. Honest costs to budget for,
which the ADR should not pretend away: frontmatter must stay a JSON-safe subset with a
lint; schema evolution needs explicit migration scripts (no `ALTER TABLE`); referential
integrity (dangling `supersedes`) needs a lint gate a database would have given free;
concurrent writers need one-writer-per-entry ownership (file-level conflicts are then
*visible*, which for an agent-written corpus is a feature); and at 10⁴ files, directory
sharding plus a few hundred ms of index build in CI.

**Flagged as unverified** by the research pass: the "Cortex-style JSON state files"
reference is ambiguous (at least three unrelated projects share the name); Orama's <2 kB
claim (contradicted by measurement); SpotSigs' exact experimental threshold; ё→е folding
is presented as common Russian-search practice rather than a cited study; KCS trademark
status (the "KCS v6 Verified" programme's existence is verified instead); the exact
publication date of the 2027 Knowledge-Centered Success guide.

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
