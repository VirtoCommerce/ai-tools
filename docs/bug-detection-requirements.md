# Complex-bug detection — diagnosis and requirements

**Status:** draft, v0.1 · **Opened:** 2026-09-30 · **Owner:** QA (Elena Mutykova)
**Purpose:** a living requirements document for the work ahead. It grows as decisions are made;
every decision gets a line in §9 "Decision log".

Every number below is a **snapshot as of 2026-09-30**, not a constant. The command that recomputes it
is given next to it; when updating this document, recompute rather than retype.

---

## 1. Problem

Agents mostly find visible defects (layout, a11y, validation). Complex bugs — cross-cutting,
"silent", at layer boundaries, races, stale data — escape. And many bugs live in **gaps**:
scenarios no case exercises at all, where even a perfect assertion cannot fail because it never runs. Business rules (BL), test models
and mind maps barely change this.

**Reference escape:** `reports/bugs/open/critical-high/BUG-xapi-catalog-paging-drops-unhydrated-products.md` —
the catalog shows 3 products out of 3,569 on the default sort. Found by the frontend team, not by agents.
All 808 rows of suite `050a` pass on the broken build: the assertions are `items.length >= 1`,
no case uses the real page size, and no case walks the pages and reconciles them against `totalCount`.

## 2. Diagnosis (snapshot 2026-09-30)

| # | Observation | Figure | How to recompute |
|---|---|---|---|
| D1 | We find the "visible", not the complex | top bug archetype is `RENDER`; 0 bugs for `STALE`/`LIFECYCLE`/`CONFIG` | `grep -rhoE '\*\*Archetype:?\*\*:? *\`?[A-Z-]+' reports/bugs` |
| D2 | The fault model does not reach the cases | archetype on 314 of 4,886 cases (~6%); `RACE` 6, `STALE` 16 | grep `Archetype` across `regression/suites/` |
| D3 | Presence-only assertions | ~650 presence-only cases (rough regex that ignores the case's purpose — some are legitimate happy-path / visual cases); 518 of them cite BL | estimate script, see REQ-02 (an exact one is needed) |
| D4 | Citing a rule ≠ checking it | 2,971 cases cite BL | grep `BL-[A-Z]+-\d+` across the suites |
| D5 | A third of executions give no verdict | 6,267 executions / 35 runs: pass 57%, fail 10%, **blocked 22%, skipped 9%** | `reports/regression/history.json` |
| D6 | Deep bugs are found by investigation | module TypeLoad, missions resolver, catalog paging — `Found by: manual` / monitoring | `grep -rl 'Found by:\*\* manual' reports/bugs` |
| D7 | Unconfirmed rules produce false bugs | 7 of 18 rejected reports cite BL; e.g. `BL-LOY-016` was inferred from wording, not from AC → "by design" | `reports/bugs/rejected/` |
| D8 | Models do not learn from escapes | search mind map (2026-09-28, 110 nodes) has 0 nodes on paging/`totalCount`, although the catalog bug was filed 2026-09-15 | grep `.claude/knowledge/domain/search.mind-map.json` |
| D9 | The mind map describes "how it works", not "how it breaks" | nodes have no failure/archetype field; `CONFIRMED` = "seen working" | schema `templates/mind-map.schema.json` |
| D10 | Too many instructions | ~2.7M chars of prompts + 2.1M in `knowledge/`; `business-logic.md` 434K chars (~110k tokens); a `/qa-test` start ≈143K chars, 179 MUST/NEVER directives | `wc -c`, `context:check` |
| D11 | Effort goes into the meta-system | of 58 commits, ~26 are about the system itself (kb, prompt-review, diagnostics), ~18 about testing the product | `git log --format=%s` |
| D12 | No "do we catch bugs" metric | mutation score / replay of fixed bugs is not measured | — |
| D13 | Bugs live in uncovered scenarios, and escapes do not close the gap | of 448 Jira bugs closed 2025-10-01…2026-09-29, **74 (17%)** are referenced by key in any suite. This measures traceability, not coverage: a case may cover a scenario without citing the key. No command lists the scenarios that have no case. | JQL `type = Bug AND statusCategory = Done AND resolved >= -365d` (excluding `Cancelled`) × grep of the keys in `regression/suites/**/*.csv` |

**What already works (keep it):** the VCST-4933 test model explicitly recorded "AC8: no concurrency
check" — and that led to a real race bug, `VCST-4933-01-silent-lost-update`.
A model helps when it is **about failures** and its output is **executed right away**. BL are useful as
the expected result during an investigation (cited in 64 real bugs).

**Root cause:** an LLM is poor at knowing the "right answer" and tends to confirm what it sees. Here the LLM
both executes the case and gives the verdict, and knowledge about failures lives in prose, not in checks.

## 3. External sources (summary)

Checked against search results on 2026-09-30; arxiv is not directly reachable from the environment — abstracts only.

- **LLM proposes, a deterministic mechanism decides** — Meta TestGen-LLM (arXiv 2402.09171), Meta ACH mutation-guided (2501.12862), OSS-Fuzz + LLM (Google Security Blog, 2024-11), Agentic PBT (2510.09907, 56% of reports confirmed).
- **The oracle problem** — LLMs write assertions for current behaviour, not intended behaviour (arXiv 2410.21136).
- **A free-roaming browser agent without oracles** — 85% false positives (WebProber, 2509.05197); explicit pre/post-conditions — 96% precision/recall (WebTestPilot, 2602.11724).
- **AI does not belong in the test runtime** — Octomind, "AI doesn't belong in test runtime".
- **Complexity hurts** — IFScale (2507.11538: 68% at 500 instructions), Chroma "Context Rot" (2025), "Lost in the Middle" (2307.03172), MAST (2503.13657: ~79% of multi-agent failures are specification and coordination), Anthropic "Building effective agents", Cognition "Don't build multi-agents", Claude Code best practices ("If your CLAUDE.md is too long, Claude ignores half of it"; "hooks are deterministic").
- **Measure test strength with mutants** — Google "Practical Mutation Testing at Scale" (2102.11378).
- Gap: no study found specifically on agents finding races / stale data / cross-layer bugs in e-commerce.

## 4. Principles

- **P1. A check, not a rule.** Knowledge about a failure counts as adopted only when code executes it and it can fail.
- **P2. The LLM writes — code decides.** AI at authoring and investigation time; the verdict is a deterministic check.
- **P3. Comparison over judgement.** The oracle reconciles two sources (pages vs `totalCount`, UI vs API, before vs after, USD vs EUR), not "looks right".
- **P4. Measure first.** Every change is judged by the detection metric (REQ-01), not by feel.
- **P5. An escape changes the system.** Every escaped bug must leave an executable trace.
- **P6. Less text.** A new incident → a check / hook / lint, not a new paragraph.

## 5. Requirements

Priority: **P0** — do first, **P1** — next, **P2** — after the pilot. Status: `NEW` / `IN-PROGRESS` / `DONE` / `DROPPED`.

### REQ-01 · Detection metric · P0 · IN-PROGRESS → `npm run detect:mutate` (response mutants); first live run pending
**Why:** D12 — right now we cannot say whether we catch bugs.
**What:** two measures of test-suite strength.
1. *Replay of fixed bugs:* for the bugs in `reports/bugs/fixed/` — would the relevant case have failed on the pre-fix behaviour.
2. *Response mutants:* deterministic substitution of GraphQL/REST responses via `page.route` (truncate a page, switch currency, `200` + `errors[]`, a stale value, a duplicated effect).
**Acceptance criteria:**
- a script outputs the mutation score per domain and the list of "not caught" mutants;
- the pilot domain has a baseline figure before any change;
- the metric is recomputed by a command, not written into prose.

### REQ-02 · Assertion strength matches the case's purpose · P0 · NEW
**Why:** D3, the reference escape.
**What does NOT change:** happy-path and visual/UI cases **stay and keep being written** — especially for the frontend.
"Is visible / is displayed" is a legitimate oracle for the question "does the user see this".
The problem is not them but a **mismatch between purpose and assertion**: a functional claim
("paging works", "the total is right", "the filter narrows the list") checked only by presence.

**What:**
1. Each case has an explicit **purpose** (column or tag): `HAPPY` (the path completes) · `VISUAL` (how it looks: layout, tokens, screenshot diff, a11y) · `FUNC` (correctness of data/logic).
2. An exact assertion classifier (`PRES` / `REL` / `INV` / `DER` / `SHAPE`) in `suites:lint` — **report only** at first.
3. The strength rule applies **to `FUNC` only**: at least one non-`PRES` assertion (reconciliation, before/after, UI vs API, `totalCount`).
4. `HAPPY` and `VISUAL` are not constrained by the strength rule. A recommendation, not a requirement: if a reconciliation is free on the same step, add it (e.g. the catalog happy path: cards on the first page == page size while `totalCount` is larger).

**Acceptance criteria:**
- cases carry a purpose; the report lists `FUNC` cases that have only `PRES`;
- the gate (Phase 2) fires only on new `FUNC` cases with no non-`PRES` assertion; existing ones go into a baseline that may only shrink;
- no `HAPPY`/`VISUAL` case is blocked by the strength rule;
- an exact D3 figure (broken down by purpose) replaces the rough estimate in §2.

### REQ-03 · Library of cross-cutting invariants in code · P0 · IN-PROGRESS → `scripts/invariants/` (PAGE-WALK, SORT-SET, LAYER-PARITY)
**Why:** D1, D2, D8 — complex bugs live between features.
**What:** reusable checks applied by surface type, not by feature. Initial set:
- `PAGE-WALK` — walk all pages, union == `totalCount`, full pages at the real page size;
- `SORT-SET` — different sorts return the same set;
- `LAYER-PARITY` — UI == GraphQL == REST (== Admin) for the same value;
- `SILENT-200` — `200` with a non-empty `errors[]` = failure;
- `MONEY-VARIANT` — the same scenario in a non-USD currency and a non-`en` culture;
- `REPLAY` — a repeat with the same key → one effect;
- `RACE-N` — N concurrent requests, the invariant holds (operation history + consistency check);
- `STALE-RW` — write via one path → read via another → fresh.
**Acceptance criteria:** each invariant is code + a unit test on the derivation; attached to a case/node by one tag; catches its matching REQ-01 mutant.

### REQ-04 · Executable, trust-ranked BL · P1 · IN-PROGRESS → implemented by the new BL scheme (§7)
**Why:** D4, D7, D10.
**What:**
- every BL has a trust level: `DECLARED` (doc/AC) · `OBSERVED` · `INFERRED` (derived by an agent);
- no bug is filed on an `INFERRED` rule — it is a note in the run report; a rule unconfirmed by a source within N days is removed automatically (§7.0);
- the top 20–30 BL (P0 and cross-cutting) are turned from `Verify`/`Violation signal` into executable checks;
- `business-logic.md` is compressed to "rule · check · violation signal"; history moves to `docs/decisions/`.
**Acceptance criteria:** the share of rejected bugs citing BL goes down; executable BL are visible in REQ-01.

### REQ-05 · A failure layer in the mind map · P1 · NEW
**Why:** D8, D9.
**What:**
- each node lists its applicable archetypes and a check reference (REQ-03) for each;
- coverage is counted per "node × archetype";
- `CONFIRMED` is split into "observed" (surface) and "expected" (mechanism from DOC/AC); a mismatch is a finding.
**Acceptance criteria:** schema updated; `models:check` shows the empty "node × archetype" cells.

### REQ-06 · Escape loop · P1 · NEW
**Why:** D6, D8, P5.
**What:** every bug not caught by a case (`— none (not case-attributable)`) must carry a "why it was missed" section and a reference to the invariant/node/check that was added.
**Acceptance criteria:** the gate fails if a domain has such a bug with no node/archetype in its mind map or no REQ-03 check.

### REQ-07 · Fewer BLOCKED/SKIPPED · P1 · NEW
**Why:** D5 — a third of cases never reach a verdict.
**What:** BLOCKED/SKIPPED share per suite as a metric; data preflight before the run; mutable state is created inside the case (FIFTH RULE).
**Acceptance criteria:** a per-suite report with the blocked share; the target share is set after the first measurement.

### REQ-08 · Simplify the instructions · P1 · NEW
**Why:** D10, D11.
**What:**
- a moratorium on new prose rules: incident → lint/hook/check or nothing;
- review existing rules with the test "would the agent make a mistake if this line were removed?";
- a target always-loaded budget 3–4× smaller than today's.
**Acceptance criteria:** `context:check` with the new budget; a list of rules removed or turned into checks.

### REQ-09 · Fewer handoffs between agents · P2 · NEW
**Why:** MAST; context lost between the model, checklist, cases and run.
**What:** the fault model, its check and its execution belong to one agent; only an independent verifier is separate. Orchestration only where tasks are genuinely parallel (regression across suites).
**Acceptance criteria:** a one-page role diagram; a REQ-01 comparison before/after.

### REQ-10 · Verdicts on machine lanes · P2 · NEW
**Why:** P2; D5; Octomind, WebTestPilot.
**What:** a growing share of cases executed deterministically (`[GQL-OP]`, Playwright scripts); the browser agent is for exploration, visual and UX.
**Acceptance criteria:** share of machine-executed cases per domain as a metric; full-run duration.

### REQ-11 · BL freshness: staleness is detected by events, not by audit · P1 · IN-PROGRESS → implemented by the new BL scheme (§7)
**Why:** BL go stale silently. Today a rule has no structured "verified date and version" and
no code reference; freshness checking is a manual 3-source `/qa-review-oracles` audit of the whole file.
Snapshot 2026-09-30 (`npm run bl:lint`): references to non-existent `BL-SEC-001…005` in 19 cases
(false traceability); some rules have no case at all.
**What:**
1. **Metadata on every BL** (machine-readable): `module` (repo/module), `code_ref` (file or symbol that implements the rule), `verified` (date + module version), `trust` (REQ-04: `DECLARED`/`OBSERVED`/`INFERRED`).
2. **`SUSPECT` status is set automatically** on an event:
   - a release ships or a PR is merged in a module where `code_ref` changed (source: the existing change detection in `/qa-test-lifecycle` / `full-cycle`);
   - a case citing the BL fails — triage considers "the rule is stale" on a par with "bug" and "test defect";
   - a Jira bug in the rule's domain is closed (the feed from the bug catalog);
   - `verified` is older than a threshold (e.g. 90 days) — for `OBSERVED`/`INFERRED` only.
3. **Audit only the `SUSPECT` list**, in small batches, not the whole file. A rule outside `SUSPECT` is not re-checked.
4. **An executable BL is its own freshness check** (REQ-04): a run on a new build either passes (the rule is alive, `verified` is updated automatically) or fails (a bug or a stale rule — triage decides).
5. **`DECLARED` changes only with a new human source** (a new ticket with AC, updated docs, a bug resolution) — automatically, with no separate review (§7.0). Code and the live stand do not change a rule's meaning.
**Acceptance criteria:**
- `bl:lint` reports: BL without metadata, `SUSPECT`, expired `verified`, references to non-existent BL;
- a command outputs the `SUSPECT` queue with the reason (which PR / release / failure / bug);
- time from a code change to the `SUSPECT` mark is no more than one `full-cycle` run;
- false traceability (`BLC-002`) = 0.

### REQ-12 · Scenario gaps: find what no case exercises · P0 · IN-PROGRESS → `npm run gaps` (escape-derived + mind-map behaviour gaps)
**Why:** D13, D8. REQ-02 and REQ-03 make existing cases stronger, but a bug in a scenario nobody wrote
escapes whatever the assertions are. The reference escape is partly this: no case walks the pages.
**What:**
1. **The scenario space is computed, not written.** Per domain: surfaces (the domain map inventory) × the
   dimensions that break things × archetypes (REQ-05). Dimensions: role / org scope, currency / culture,
   store, entity state / lifecycle, data shape (empty / one / many / page boundary), and channel
   (UI / xAPI / REST / Admin). Pairwise keeps it finite. A **gap** is a cell with no case.
2. **Escape-derived gaps.** Every closed Jira bug, including the `support` label, is matched against the
   suites. A bug with no matching case becomes a gap row carrying the bug key; REQ-06 then requires the check.
3. **Production signals rank first.** Scenarios that real users hit (`support` bugs, `/qa-monitoring`
   signatures) outrank synthetic cells.
4. **Exploratory aims at gaps.** `/qa-exploratory` charters are built from the top-ranked gaps; each
   session ends with a new case or a bug.
5. **No human queue (§7.0).** The gap list is consumed by agents (`/qa-test-lifecycle` generation,
   exploratory charters) on the next run; it is never a file waiting for review.
**Acceptance criteria:**
- a command prints the gap list per domain (cell or escape, reason, rank) and the gap share;
- escape traceability (the D13 figure) is recomputed by the command and goes up from the 17% baseline;
  each newly closed bug gets a case or a stated reason why none is possible;
- in the pilot domain, the paging / `totalCount` cell shows as a gap before the pilot and as covered after;
- the REQ-01 metric does not get worse when gap cases are added.

## 6. Work plan — what to remove, what to add

Plan rule: **nothing is removed without a measurement.** Every removal or merge is checked against
the REQ-01 metric: it must not get worse. That is why the metric comes first. Dates are estimates, refined
after Phase 0.

### 6.1 Add

| What | Requirement | Phase |
|---|---|---|
| Detection metric: replay of fixed bugs + response mutants | REQ-01 | 0 |
| Gap list: computed scenario space + escape-derived gaps (baseline: escape traceability 17%) | REQ-12 | 0 |
| Case purpose (`HAPPY`/`VISUAL`/`FUNC`) + assertion classifier — report only at first | REQ-02 | 0 |
| BLOCKED/SKIPPED share per suite | REQ-07 | 0 |
| Library of cross-cutting invariants in code | REQ-03 | 1 |
| Failure layer in the mind map (archetypes + checks per node) | REQ-05 | 1 |
| Gate: ratchet on `FUNC` cases with only `PRES` (happy path and visual unaffected) | REQ-02 | 2 |
| Gate: escape loop | REQ-06 | 2 |
| Exploratory charters and case generation driven by the gap list | REQ-12 | 2 |
| New BL scheme — migration M0–M5 (§7.6) | REQ-04, REQ-11 | 0–3 |

### 6.2 Remove or freeze

Candidates, not decisions: each item is confirmed by a measurement and a decision in §9.

| What | Why | Action | Phase |
|---|---|---|---|
| New prose rules after incidents | D10, IFScale: every new rule weakens the others | **moratorium now**: incident → check/lint/hook or nothing | 0 |
| Meta-system development (kb, prompt-review, self-diagnostics, prompt budgets) | D11: ~half the commits, no effect on detection | **freeze** new features until the pilot results; maintenance = fixes only | 0 |
| Incident write-ups inside the always-loaded tier and prompts | D10: history is not an instruction | move to `docs/decisions/`, keep one rule line in the prompt | 3 |
| History and rationale in `business-logic.md` | 434K chars, the agent sees it in fragments | compress to "rule · check · signal" | 2 |
| Four modelling artifacts: domain map, test model, mind map, data model | they overlap; knowledge is lost between them (D8) | merge into one domain model with a failure layer + a separate failure-oriented ticket model | 3 |
| Overlapping skills: `qa-test` / `qa-test-fast` / `qa-test-lifecycle`; `qa-checklist` / `qa-test-cases-generator`; `qa-sbtm` / `qa-exploratory`; the `qa-review-bl` alias | duplicated instructions growing in parallel | map the overlaps; merge or remove based on the result | 3 |
| Unnecessary handoffs between agents in `/qa-test` | MAST: failures happen at coordination | model → check → execution in one agent + an independent verifier | 3 |
| Fields and steps nobody fills in (e.g. `timing.steps` — always `0`) | dead process | fill automatically or remove | 3 |

### 6.3 Phases

| Phase | Timing (estimate) | Content | Exit (decision before the next phase) |
|---|---|---|---|
| **0. Measure and freeze** | week 1 | REQ-01 baseline for catalog-search; REQ-12 gap list and escape traceability; REQ-02 classifier report; blocked share; moratorium and freeze from §6.2 | baseline figures recorded in §2 |
| **1. Pilot** | weeks 1–2 | §6.4 | do the new checks catch more mutants than `050a` → yes: scale up, no: rethink the approach |
| **2. Gates and scale** | weeks 3–4 | REQ-02 ratchet for `FUNC`, REQ-06, REQ-04; invariants on 2–3 domains (cart/checkout, orders, B2B scope) | mutation score grows on the new domains |
| **3. Simplify** | weeks 5–6 | REQ-08, REQ-09, merges from §6.2 | REQ-01 metric did not get worse; instructions 3–4× smaller |

### 6.4 Pilot (Phase 1)

**Domain:** catalog-search. **Duration:** 1–2 days.
**Scope:** REQ-01 (5 response mutants) + REQ-12 (catalog-search gap list before and after) + REQ-03 (`PAGE-WALK`, `SORT-SET`, `LAYER-PARITY`, `SILENT-200`, `MONEY-VARIANT`) + REQ-05 (failure layer in `search.mind-map.json`, nodes for the search/catalog bugs already found).
**Success:** the new checks catch the "truncated page" mutant and reproduce the catalog bug; mutation score compared with suite `050a`.

## 7. New BL scheme (BL 2.0) and migration plan

**Decision 2026-09-30 (owner):** the current way of working with BL is replaced. The goal is a **rule plus an executable
check instead of an encyclopedia**. It implements REQ-04 (trust, executability) and REQ-11 (freshness).

### 7.0 The main constraint — no queues for people

**Decision 2026-09-30 (owner):** nobody will separately review proposals, BL PRs or a `SUSPECT` queue —
there is no time. Any scheme that waits for a person turns into a dump: in two weeks
6 `bl-proposals-*` files piled up, each with a "the question that releases this" section, and over the whole
history 4 edits from such files were ever approved.

So BL 2.0 works **with no separate human review**:

1. **People take part only where they already do:** they write AC in a ticket, decide a bug's fate in Jira
   (Fixed / By design / Won't fix), write documentation. Those decisions **are already made** — the system
   reads them and turns them into rules automatically, with a link to the source.
2. **A rule is created or changed automatically, and only from a human source:** ticket AC,
   a documentation page, a bug resolution. Such a rule is `DECLARED`. A newer source than the old one
   (a new ticket on the same topic, updated docs) updates the rule automatically.
3. **An observation (code + live) never creates or changes a rule.** It is recorded as an observation
   (domain map / the `kb` observation base), not as BL. `DRIFT`/`MISSING` verdicts from code and live are removed.
4. **A run disagreeing with a rule is a failing test, not a proposal.** It follows the normal
   bug path. The Jira decision on the bug (Fixed / By design) is the decision on the rule: on "By design"
   the rule is updated automatically from the resolution.
5. **Nothing accumulates.** There are no proposal files. `SUSPECT` resolves automatically: the check
   is re-run on a new build — passes → `ACTIVE` with a new `verified`; fails → a bug. An
   `INFERRED`/`OBSERVED` rule not confirmed by a human source within N days is removed automatically.

### 7.1 Before → after

| | Today | BL 2.0 |
|---|---|---|
| Storage | a single `business-logic.md` (hundreds of thousands of chars), prose | one file per domain, machine-readable records; markdown is **generated** |
| Rule entry | rule + check + history + dates + rationale in one text | a short record with fields (§7.2); history kept separately |
| Who changes it | an agent auto-applies by "three sources", including code + live | **automatically, but only from a human source**: ticket AC, docs, a Jira bug resolution; observations do not change rules |
| Trust | not distinguished | `DECLARED` · `OBSERVED` · `INFERRED` (`UNREVIEWED` during migration) |
| Freshness | manual audit of the whole file | `SUSPECT` on events → **automatic check re-run**; fails → a bug |
| Coverage | a case cites the ID as text | a case references the **check**; coverage is counted by checks |
| Selection | everything | P0, cross-cutting, `DECLARED` or with a check stay; the rest becomes reference material in the domain description |

### 7.2 Rule record

File: `.claude/knowledge/oracles/bl/<domain>.yaml` (one per domain). Schema: `templates/bl.schema.json`.

```yaml
- id: BL-CART-004                 # the ID never changes and is never reused (citation contract)
  title: Short rule name
  rule: >-                        # 1–2 sentences, no history
    What must hold.
  priority: P0-revenue            # existing tags P0-revenue | P0-security | P1-data | P1-ux | P2-ux
  trust: DECLARED                 # DECLARED | OBSERVED | INFERRED | UNREVIEWED (migration only)
  source:                         # where the rule comes from; DECLARED requires doc or ac
    - { kind: doc, ref: "StorefrontUserGuide §…" }
    - { kind: ac,  ref: VCST-1234 }
  scope:
    module: VirtoCommerce.Cart
    code_ref: "src/…/CartService.cs#AddItemAsync"   # where the rule is implemented
  check:
    kind: executable              # executable | manual | none
    ref: "scripts/invariants/…"   # for manual — one paragraph of steps
  violation_signal: One line — what a violation looks like.
  verified: { date: 2026-09-30, version: "Cart 3.1042.0", by: "REG-… | manual" }
  status: ACTIVE                  # ACTIVE | SUSPECT | RETIRED
  suspect_reason: null            # the PR / release / case failure / bug that made it SUSPECT
  owner: <team> # who receives the bug when the check fails (not a reviewer)
```

Fields that are **not carried into the record**: `Promoted`, `Amended`, `Live`, `Severity rationale`,
`Suite coverage` (the last is computed, not written). A rule's grounding is its `source` list; there is no
history file (removed 2026-10-01). `Agents` is not stored:
it is derived from the domain.

### 7.3 Lifecycle

1. **Creation and change — automatic, only from a human source** (§7.0): ticket AC, docs, a bug resolution. The agent writes the rule with a link to the source; CI validates the schema. There is no separate review.
2. **`INFERRED` is not grounds for a bug.** A violation of an `INFERRED` rule is a note in the run report, not a bug report; without confirmation by a source within N days the rule is removed.
3. **`SUSPECT` is set automatically** (REQ-11): `code_ref` changed in a merged PR/release; a case citing the rule failed; a bug in the domain was closed; `verified` is older than the threshold (for `OBSERVED`/`INFERRED`).
4. **An executable check updates `verified` itself** on a successful run against a new build.
5. **`RETIRED`** — the rule is withdrawn, the ID is kept forever; cases citing it are a `bl:lint` error.
6. **One author per domain during a change** — as with suites (`regression.md`): no two people edit a domain's YAML at once.

### 7.3a When rules appear and change — today and in BL 2.0

**Today (snapshot 2026-09-30).** The only write path is **after a run**: `/qa-test-lifecycle`
Phase 2 (a STALE/BROKEN case → candidate `{currentRule, observedBehavior}`) and Phase 3 (a new case with no
rule → `PROPOSED-BL`) → Phase 4c `/qa-review-bl` → auto-apply on `CONFIRMED` /
`DRIFT` / `MISSING` verdicts. `/ba-analyze`, `/qa-exploratory`, `/qa-test-plan` only write `bl-proposals-*`.
Requirements (ticket AC) are almost never used as a rule's source: AC appears in `Source:` for 1 rule,
code for 133, live for 45; "docs N/A" appears 43 times.

**Why this breaks bug finding.** For new modules the docs axis is waived, leaving
**code + live**. But any bug is, by definition, present both in the code and on the stand — those axes always "agree".
A `DRIFT` verdict ("the axes agree, the rule text is stale") rewrites the rule to match current behaviour.
The rule thus **adapts to the implementation** and stops catching regressions — the oracle problem
(§3), built into the process.

**BL 2.0 — the moments:**

| Moment | What happens | Record status |
|---|---|---|
| Refinement / ticket acceptance, building the test model (before testing) | rules created **automatically** from AC and docs | `DECLARED` |
| Testing / run: behaviour ≠ rule | **failing test → the normal bug path**; the rule is not rewritten | rule → `SUSPECT` until the bug is decided |
| Testing: behaviour found that no rule covers | recorded as an **observation** (domain map / `kb`), not as BL | — |
| Code change at `code_ref`, a closed bug, age | automatic mark | `SUSPECT` |
| The Jira decision on the bug | Fixed → rule confirmed; By design / Won't fix → rule updated from the resolution; code change at `code_ref` → check re-run | `ACTIVE` / updated / `RETIRED` |

**BL 2.0 rule:** code and live agreeing **is not confirmation of a rule** — they are the same
observation. The only independent source for `DECLARED` is a requirement (AC, docs,
a Jira bug resolution).

### 7.4 What stays a rule and what becomes reference material

It stays BL if at least one holds: `priority` P0 · a cross-cutting invariant (REQ-03) · `trust: DECLARED` · it has a `check`.
Otherwise it moves into the domain description (`.claude/knowledge/domain/<slug>.md`, a "Reference" section) with a pointer to the former ID.
Decided per rule during the domain triage, **with no automatic deletion**.

### 7.5 What happens to today's tools

| Tool | Fate |
|---|---|
| `business-logic.md` | generated from YAML (a "generated — do not edit" header); after consumers switch over — decide whether to keep it as a view or delete it |
| `bl:extract`, `bl:lint`, `oracles:rank`, `bl:remap` | rewritten to read YAML; `bl:lint` adds checks for the schema, `SUSPECT`, expiry, references to non-existent/`RETIRED` IDs |
| `/qa-review-oracles bl`, `/qa-review-bl` | instead of an audit that auto-applies from code + live — syncing from human sources (AC, docs, Jira resolutions) and re-running `SUSPECT` checks |
| The "three sources" rule and auto-apply | removed |
| `reports/ba/bl-proposals-*.md` | **deleted** in M0 (#351) without the planned one-off pass, by the owner's decision; no new proposal files. A real contradiction they held resurfaces as a finding the next time a run observes it |
| The `plugins/vc-fix/knowledge/oracles/business-logic.md` copy | generated by the same generator (or from a chosen subset) so the plugin does not drift |

### 7.6 Migration

| Stage | Timing (estimate) | What we do | Done when |
|---|---|---|---|
| **M0. Freeze** — **done 2026-09-30 (#351)** | now, 1 day | turn off `DRIFT`/`MISSING` verdicts from code + live in `/qa-review-oracles` and `/qa-test-lifecycle` 4c; forbid creating new `bl-proposals-*`; fix the false traceability of `BL-SEC-001…005` (`BLC-002`) | `BLC-002` = 0; no BL edit without a human source; no new proposal files. **Met:** `bl:lint` reports 0 `BLC-002`; the audit rule is in `bl-audit-criteria.md` §M0 freeze; the proposals output path is removed from the report policies and the six existing files are deleted (moved forward from M4) |
| **M1. Schema and converter** — **done 2026-09-30** | week 1 | `templates/bl.schema.json`; a `md → yaml` converter (mechanical: `Rule`, `Verify` → `check: manual`, `Violation signal`, `Source`/`Docs` → `source`, the priority tag; the rest → `history`); a `yaml → md` generator; `trust: UNREVIEWED` for all | round-trip: the generated md has the same IDs and rule texts; a unit test on the converter and the generator (derivation)  **Met:** `npm run bl:convert:check` round-trips every domain through YAML and back, and `bl:lint`'s parser sees the same ids, order, titles, severities and Rule / Verify / Violation-signal texts; `scripts/unit/bl-yaml.test.ts` also checks that no line of an entry is lost (it goes to a field or to the domain's history file) and that the comparator catches a changed rule. No YAML is committed yet: `business-logic.md` stays the source of truth until a domain migrates in M2 (`npm run bl:convert -- --domain <slug> --write`) |
| **M2. Pilot domain** — **done 2026-09-30** | weeks 1–2 | catalog/search (same as the §6.4 pilot): triage each rule (keep / reference / `RETIRED`), `trust`, `code_ref`, `verified`; top rules → REQ-03 executable checks | no `UNREVIEWED` in the domain; ≥ N rules with `check: executable` (N to be decided) **Met:** `srch` and `cat` are owned by `bl/<slug>.yaml`; their sections of `business-logic.md` are generated (`npm run bl:render`) and `npm run bl:convert:check` (now a CI gate) fails a hand edit. 0 `UNREVIEWED`; trust is `DECLARED` only where a docs page, ticket AC or Fixed bug states the core claim, else `INFERRED`, and a clause disputed by a closed ticket makes the rule `SUSPECT` (BL-CAT-006). Every rule stays: each is cited by suites. Two rules created from Fixed bugs (BL-SRCH-006 paging, BL-SRCH-007 sort). Four rules carry an executable check (`scripts/invariants/`: PAGE-WALK, SORT-SET, LAYER-PARITY; N = 3 checks). Not done: `verified` (no live run from this environment) and `code_ref` beyond what the old `Source` lines named |
| **M3. Remaining domains** — **done 2026-09-30** | weeks 2–4 | by priority: P0 domains first (cart/checkout, B2B/scope, pricing, security); `trust` set automatically from the presence of AC/docs/a resolution in `source`; no source → `INFERRED` | `UNREVIEWED` share → 0; metric: share of rules with a check and with a human source **Met:** all 28 domains are owned by `bl/<slug>.yaml` and 0 records are `UNREVIEWED`. The remaining 204 rules were triaged like M2 (vc-docs, ticket AC, Jira resolutions; `DECLARED` only when a human source states the core claim). The per-domain split is printed by `npm run bl:convert:check`; each rule's sources are in its `source` list. Rules disputed by a closed ticket or a doc page are `SUSPECT` with the reason, never rewritten by hand |
| **M4. Switch consumers** | weeks 4–5 | scripts read YAML; `/qa-review-oracles` rewritten to sync from sources + re-run `SUSPECT`; references to the `business-logic.md` path replaced by `bl:extract` | no consumer reads the md directly |
| **M5. Freshness automation** | weeks 5–6 | `SUSPECT` on PR/release (`code_ref`), case failure, closed bug, age → automatic check re-run; Jira resolutions synced into rules | from a code change to the re-run is no more than one `full-cycle` run; no queue for people |

**Risks:** dozens of prompts and scripts reference the `business-logic.md` path — mitigated by the generated view until M4;
IDs are a citation contract, the converter must not change them; the `vc-fix` copy drifts — generated from the same source.

## 8. Open questions

1. Order: start with the pilot (REQ-01+03) or first with tagging case purposes (REQ-02)?
2. ~~Where does the invariant library live~~ — closed 2026-09-30: `scripts/invariants/<check>.ts`, each a pure verdict over fetched responses (unit-tested), with one live driver `npm run inv:run` that only fetches. The CSV runner can call the same functions later.
3. Always-loaded budget (REQ-08): a concrete number.
4. ~~Who confirms `INFERRED` → `DECLARED`~~ — closed 2026-09-30: confirmation comes only from a human source (AC, docs, a Jira resolution); there is no separate confirmer.
5. BL 2.0: the `verified` age threshold for `SUSPECT` (90 days proposed) and the lifetime of an unconfirmed `INFERRED` rule (N days).
6. BL 2.0: keep the generated `business-logic.md` after M4 or delete it.
7. ~~BL 2.0: the minimum number of executable checks in the pilot domain (N in M2)~~ — closed 2026-09-30 by the owner: N = 3 (PAGE-WALK, SORT-SET, LAYER-PARITY).
8. BL 2.0: the `vc-fix` copy — all rules or a subset for clients.

## 9. Decision log

| Date | Event |
|---|---|
| 2026-09-30 | Document opened: diagnosis D1–D12, external sources, requirements REQ-01…REQ-10, pilot. |
| 2026-09-30 | Work plan added (§6): what to add, what to remove or freeze, four phases. Removals only after the REQ-01 measurement. |
| 2026-09-30 | REQ-02 refined by the owner's decision: happy-path and visual/UI cases stay; the assertion-strength rule applies only to cases with the `FUNC` purpose. |
| 2026-09-30 | REQ-11 added: BL freshness — metadata, automatic `SUSPECT` marking on events, audit of the queue only. |
| 2026-09-30 | Owner's decision: the current BL system is replaced by BL 2.0 (§7) — structured records, trust, event-driven freshness, changes only through PRs; migration plan M0–M5. REQ-04 and REQ-11 are implemented through §7. |
| 2026-09-30 | §7.3a: recorded when rules are written today (after a run, auto-applied `DRIFT` from code + live) and in BL 2.0 (from requirements before testing; a run mismatch is a finding, not an automatic edit). |
| 2026-09-30 | §7.0: owner's decision — no queues for people. Rules change automatically, but only from a human source (AC, docs, a Jira bug resolution); observations never change rules; a mismatch is a failing test → the bug path; proposal files are deleted. |
| 2026-09-30 | Document translated from Russian to English at the owner's request; content unchanged. |
| 2026-09-30 | **M0 done (#351).** A `bl` `DRIFT`/`MISSING` edit now needs a human source; with none, a contradiction is a finding and uncovered behaviour goes to the `kb`. No proposal files are written, and the output path is removed from the report policies. The six existing `bl-proposals-*` files are deleted now instead of in M4, and the one-off review pass is skipped by the owner's decision. The false `BL-SEC-001…005` citations are dropped, so `BLC-002` = 0. |
| 2026-09-30 | Owner's addition: bugs also live in gaps — scenarios no case exercises. D13 added (escape traceability 17%: 74 of 448 closed bugs are referenced by a suite) and REQ-12 (computed scenario space, escape-derived gaps, production signals first, exploratory aimed at gaps, no human queue). |
| 2026-09-30 | **M1 done.** `templates/bl.schema.json`, and `scripts/knowledge/bl-yaml.ts` (`npm run bl:convert`) converts md → YAML and renders YAML → md. The file holds a `domain` block (heading, prefixes, agents, intro) above `rules`, so a domain's section can be regenerated whole; agents are kept per domain, as §7.2 says. Everything a record does not carry goes verbatim to `docs/decisions/bl/<slug>.md`. No domain is converted in the repo yet, so there is still one source of truth. |
| 2026-09-30 | **M2 done** on `srch` + `cat` (owner: both domains, N = 3). The YAML owns those sections; `bl:render` regenerates them and `bl:convert:check` guards them in CI. Triage: `DECLARED` needs a human source for the rule's core claim (docs, AC, a Fixed bug), else `INFERRED`; BL-CAT-006 is `SUSPECT` from a Cancelled ticket that disputes its UI clause. BL-SRCH-006 and BL-SRCH-007 were created from Fixed bug resolutions (§7.0). The record gained `check.steps` so an executable rule keeps its manual steps. Checks live in `scripts/invariants/` (§8 Q2 closed). |
| 2026-09-30 | **M3 done**: every domain is YAML-owned, 0 `UNREVIEWED`; 7 rules `SUSPECT` from closed tickets or docs that dispute a clause (BL-CART-009, BL-AUTH-008, BL-AUTH-009, BL-B2B-005, BL-NOTIF-005, BL-NOTIF-007, BL-GQL-004). REQ-01 harness rebuilt as code only (`npm run detect:mutate`; `DETECTION_OP` scopes a mutant to one operation so a parity check can see it); REQ-12 `npm run gaps` prints the gap list and escape traceability and writes no file (the figures are internal and go to the tracking ticket). `inv:run` reports a `200` with `errors[]` as a violation. The first live run of `inv:run` and `detect:mutate` — the REQ-01 "before" — needs a machine that can reach the QA stand. |
| 2026-10-01 | Owner removed `docs/decisions/bl/` (the per-domain history and per-rule triage notes) and the two 2026-09-07 audit files. The records' `history` links were dropped and the oracle re-rendered; a rule's grounding is its `source` list. `bl:convert` no longer writes a history file or a `history` link; `--write` prints the lines a record does not carry, and the schema has no `history` field. |
