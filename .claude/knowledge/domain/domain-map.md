# Domain map — the shape

> **This file is the SHAPE, not a map.** It carries no `domain_slug`, so every slug-keyed
> consumer skips it: `/qa-test` `1b` lookup, `npm run domain:check`, and any `domain_slug:` match.
> It sits here rather than in `.claude/templates/` so it is beside the maps it shapes.

Fill-in shape for `.claude/knowledge/domain/<name>.md`. **Tier 2, on-demand** — cited from
`CLAUDE.md`'s Detailed References table, never always-loaded, so it costs nothing per turn and nothing
against the tier-1 budget `npm run context:check` enforces.

**Why this artifact exists.** `/qa-test`'s `2-map` step asks the right questions — purpose, operations,
properties, variants, constraints — but it asks them **about the ticket**, so it inherits the ticket's
narrowness, and its answers evaporate with the run. Measured on VCST-5317: one predicate on one control
tested in depth, against a feature whose Admin surface, second switcher component and 585 existing cases
went unexamined; nine prior-art BA docs (2,269 lines) were re-read for the lock question and nothing
else. A domain map is the **feature-scoped, persistent** counterpart. Rationale and the incident:
`docs/decisions/qa-test-evolution.md`.

**The reference implementation is `.claude/knowledge/domain/b2b-organizations.md`.** Read it before
filling this in — it is what these sections look like when they carry real content.

---

## The shape

````markdown
---
domain_slug: <slug>          # MUST match `bl:extract --domain <slug>` so lookup is mechanical
applicability: universal     # or `reference` when it is theme/CMS/deployment-specific
rationale: |
  What this domain IS, why the map was built, and what it is for.
generated: YYYY-MM-DD
rev: 1
stale_after_days: 60
expires_after_days: 120
sources:
  - <prior-art dir or file>  (N docs, N lines — verdicts in the prior-art section)
  - live enumeration on <env> (<which layers>), YYYY-MM-DD
  - <module repos @ revision>
  - .claude/knowledge/api/graphql-schema.md (introspection date) — when a contract layer is in scope
  - config/test-suites.json + regression/suites/**
excludes: <what was deliberately left out, and that it is a later pass>
---

# <Domain> — domain map

> Refresh with `/qa-domain-map <slug>`. This file answers **what the feature is and where its surfaces
> are**. It does **not** carry behavioural rules — those are `BL-*` in `oracles/business-logic.md` — and
> it can **never ground an assertion as `{DOC}`**. Pointer index plus surface inventory: it says *where
> to look* and *what exists*, never *what correct looks like*.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass ·
`DRIFT` = prior art says otherwise and prior art is wrong · `MISSING` = documented, does not exist ·
`UNVERIFIED` = not established, and **not** to be treated as true.

## §1 — Purpose and value chain

**Purpose: <one sentence, or `UNDECLARED`>.**

`UNDECLARED` is the correct answer when no purpose statement exists in the prior art, **every published
guide the domain touches** (`/vc-docs` → VirtoOZ: `PlatformUserGuide` **and** `StorefrontUserGuide` at
minimum), or a previous map — and it is a **finding**, not a blank. Say where you looked. Then reconstruct
the chain from source + live and mark it as **the first written statement**, to be cited against rather
than treated as authority.

| # | Link, in the customer's words | Mechanism |
|---|---|---|
| 1 | <the thing comes into existence> | <entity, and every path that creates it> |
| … | <one line per link, trigger → effect → persisted state → user-visible surface → what it unlocks> | |
| N | <the effect is reversed or taken away> | <and whether reversal is symmetric> |

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| <role> | <capabilities, and the ones ONLY this actor has> | `CONFIRMED` live / `UNVERIFIED` + why |

## §2 — Surface inventory, one section per layer in scope

One subsection per layer the feature crosses — typically **back office**, **storefront/customer**, and
**API/contract**. For each: what exists, addressed how, with which fields and controls.

**Enumerate; never infer.** A route, blade, field or capability you did not see render is `UNVERIFIED`,
not asserted. Never invent a route — this repo has a memory recording that exact mistake.

Per layer, cover:

- **Entry points and addresses** — routes / blade ids / endpoint paths, and the guard on each
- **The entity's fields**, with the control type, and **where a UI label differs from the model name**
- **What is hidden by default** — a hidden-by-default column on the field that governs access is
  load-bearing and belongs in the map, not in a footnote
- **What is absent** — a field, list or control the reader will look for and not find
- **What is NOT manageable from this layer**, and where it lives instead. This table is often the most
  used thing in the map

## §3 — Where the layers DISAGREE

**The highest-value section — write it even if it is short.** Number the rows (`D1`, `D2`, …) so
tickets, cases and oracles can cite them, and never renumber: the ids are a citation contract.

| # | Disagreement | Verdict |
|---|---|---|
| D1 | <what layer A shows vs what layer B shows, and the consequence> | `CONFIRMED` / source-only |

Look for these shapes specifically, because they recur across domains:

- **the same value rendered raw in one layer and mapped in another** (and the two vocabularies differ in size)
- **two distinct causes collapsing onto one label**, so the reader cannot tell them apart
- **a gate and its list computed from different predicates** — the control renders while the list is empty
- **a capability present in one layer and absent in another**, especially a write path
- **two surfaces for one action reading from different sources** (role pickers, status fields, role→permission maps)
- **an out-of-vocabulary value accepted and silently treated as benign**
- **state that exists in data and in navigation but has no form field**, so writing it is API-only
- **a PUBLISHED GUIDE that contradicts the build** — quote it verbatim with its URL and put the live
  observation beside it. This class outranks the others in impact because a guide is **customer-facing**:
  a reader follows it and is wrong. Three sub-shapes, all seen in practice: a guide **contradicting live**
  · **two guides disagreeing** about one mechanism · and a guide **contradicting itself inside one
  paragraph** (which usually means the build changed under a partially-updated page). Also record a
  divergence the docs **declare on purpose** — that is not a defect, and marking it as one wastes a
  reviewer’s time

Where a disagreement is **mid-change** — an unmerged-but-deployed PR alters it — say so in a call-out
naming the PRs and the date, and tell the next reader to re-read that row after they merge or revert.

## §4 — Coverage shape

**Shape, not an audit.** Do not re-review individual cases; `/qa-review-tests` owns that.

State the basis for every count, and **correct an earlier count out loud** if this pass shows it wrong.

| Suite | Org/feature-relevant | Suite | Feature-relevant |
|---|---|---|---|
| <id + name> | **N** of M | | |

Then, each as its own short table or list:

- **Suites the obvious tag or selection group MISSES** but that genuinely belong — and any suite that
  carries the tag with **zero** feature content
- **Zero / near-zero coverage**, with the count and whether the absence is *deliberate* (a disabled
  module, a `Deprecated` decision) or a **hole**
- **Over-covered relative to risk** — a count next to the count of the thing that actually decides
  whether data leaks is the argument; make it
- **Selection-group and executability problems** — what the group resolves to, `envRiskGate`,
  `requiresModules`, browser-lane denials, and **how much of the corpus is `Draft` and has never run**

## §5 — Open gaps

| # | Gap | State |
|---|---|---|
| G1 | <what could not be established> | **OPEN** + why (what fixture, permission, mutation or tooling it needs) |

A gap closed by a later pass is marked `CLOSED` **in place**, with what closed it. Never delete a row —
the numbering is cited.

## §6 — Prior-art verdicts

The per-ticket deliverables stay the detail; **this map supersedes them where they disagree**, and that
has to be written down or the next reader trusts the stale doc's authority.

| Claim | Verdict |
|---|---|
| <id> — <the claim in one line> | **DRIFT** — <what is actually true> |

Close with which entries from the prior art's own open-question list this map **resolves**.
````

---

## Gate — what makes a map good enough to cite

Self-checked by the author; `/qa-domain-map` re-derives it before writing.

1. `domain_slug` matches a real `bl:extract` domain, and the frontmatter carries `generated`, `rev`, `stale_after_days`, `sources`, `excludes`.
2. **§1 purpose is a sentence or the literal `UNDECLARED`** — with where you looked. A reconstructed chain says so.
3. Every layer the feature crosses has a §2 subsection, **including a "not manageable from here" row**.
4. **§3 has at least one row, or states in one line that the layers were compared and agree.** An empty §3 with no statement is the failure this section exists to prevent.
5. §4's counts each name their basis, and the zero-coverage rows distinguish **deliberate** from **hole**.
6. Every §5 gap says what it needs, not just that it is open.
7. **Every claim in the file carries a verdict.** An unmarked claim reads as `CONFIRMED` and is the way a stale map does more damage than no map.
8. **Every published guide the domain touches was queried, and every doc claim carried into the map is a VERBATIM quote with its URL, triangulated against a live observation.** A paraphrase cannot be checked; a quote the pass did not fetch itself is not evidence.
9. No invented routes, fields or ids. No behavioural rule stated as if it were an oracle.

## What consumes this

| Consumer | Uses it for |
|---|---|
| `/qa-test` `1b` `2-map` | read **first**, before per-ticket prior art; absent + all-layer scope ⇒ **recommend** `/qa-domain-map`, never block |
| `/qa-test` `1e` clause 11 | the ticket's chain stated as a **slice** of the domain chain — which links it touches *and which it does not*. Absent map ⇒ record `Domain map: ABSENT — chain position unverified` |
| `/qa-test` `1c` | briefed with the map path; **must report any surface it touched that the map does not list** — that is how each run repays the map instead of only consuming it |
| `/qa-test-plan`, `/qa-regression` | §4's selection-group and executability findings |
| `/qa-review-oracles` | §3 and §6 rows that contradict a `BL-*` become audit inputs — as **proposals**, never edits |
| `npm run domain:check` | staleness only; a **missing** map never fails a build |
