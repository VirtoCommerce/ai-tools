---
description: "Build or refresh a DOMAIN MAP — the feature-scoped, persistent answer to \"what is this thing and where are its surfaces\". Consolidates the per-ticket BA deliverables plus a live enumeration into .claude/knowledge/domain/<name>.md: actors, value chain, surface inventory per layer (back office / storefront / API), where the layers DISAGREE, the shape of existing QA coverage, and the open gaps. Built once per domain and cited thereafter, instead of re-derived per ticket. Read-only against the environment."
argument-hint: "<domain-slug> [--refresh] [--layers back-office,storefront,api] [--exclude <area>]"
---

# /qa-domain-map — build or refresh a domain map

**Model-invocable since 2026-09-10** — `disable-model-invocation` was removed, so this command runs both
ways: an operator types it, **and** a **FULL** `/qa-test` run whose domain has no map invokes it at item
`1c-map`, inside the wave already carrying `1c ‖ 1d` (§Auto-build from `/qa-test`). That is what turned
the map from a *nice to have* nobody found time for — **1 of 13 domains mapped after two months of
recommending it** — into an artifact the pipeline fills in as it goes.

**What still belongs to a human is `--refresh`, and Step 0 is what enforces it.** A build creates a file
that contradicts nothing. A refresh rewrites claims other tickets already cite, carries the `D*`/`G*` ids
forward and must contradict its own previous rev out loud — so a fresh map with no `--refresh` **STOPs**,
and **no pipeline ever passes that flag**. Staleness is a suspicion; rewriting on a timer is a decision.
An incremental write-back of what a run actually verified is neither, and has its own step
([`skills/qa-test/reporting.md`](../skills/qa-test/reporting.md) §5h-map).

**Shape:** [`.claude/knowledge/domain/domain-map.md`](../knowledge/domain/domain-map.md) — it lives beside the maps it shapes, not in `templates/`.
**Reference implementation:** [`.claude/knowledge/domain/b2b-organizations.md`](../knowledge/domain/b2b-organizations.md).
**Why the artifact exists:** `docs/decisions/qa-test-evolution.md` §Domain maps.

## Usage

```
/qa-domain-map b2b                                   # build (or refresh if it exists)
/qa-domain-map b2b --refresh                         # force a refresh + diff against the current rev
/qa-domain-map auth --layers back-office,storefront  # scope the enumeration
/qa-domain-map b2b --exclude sales-rep               # leave an area out, recorded in `excludes:`
```

`<domain-slug>` **must** be a real `bl:extract` domain — `npm run bl:extract -- --list` prints them.
An unknown slug **STOPs**: a map filed under a slug no oracle uses is a map nothing can look up.

---

## Step 0 — Resolve, and decide build vs refresh

1. Validate the slug against `npm run bl:extract -- --list`. Unknown ⇒ **STOP**, print the list.
2. Resolve the target: `.claude/knowledge/domain/<name>.md` where a `domain_slug: <slug>` field matches.
   **Match on the field, not the filename** — a descriptive filename (`b2b-organizations.md`) and a
   mechanical slug (`b2b`) are both wanted, and the field is what reconciles them.
3. **Exists and inside `stale_after_days`, with no `--refresh`?** → print its `rev`, `generated` date and
   §5 open gaps, and **STOP**. Do not rebuild a fresh map; the gaps are the useful output.
4. **Exists and stale, or `--refresh`?** → this is a **refresh**: carry the existing `rev`, the `D*`
   disagreement ids and the `G*` gap ids forward (§Refresh below).
5. **Absent?** → a build, `rev: 1`.

## Step 1 — Pre-flight, in ONE message

- Environment health and the **deployed** versions of every module in scope (`GET {{BACK_URL}}/api/platform/modules` with a context-free admin token; the storefront prints its theme version in the page footer). A map that does not say which build it describes cannot be checked later.
- The **prior art**: glob `reports/ba/**` for this domain's deliverables and `reports/ba/test-models/` for its models. Count the files and lines — the count is the argument for the map's existence.
- Any **existing** map for an adjacent domain, so conventions match rather than diverge.
- `config/test-suites.json` + the domain's suites, for §4.
- The live-introspected `.claude/knowledge/api/graphql-schema.md` and its refresh date, when a contract layer is in scope.
- The domain's `BL-*` and `ECL-*` **for orientation only** — the map records *surfaces*, never rules.
- **The PUBLISHED DOCS, via `/vc-docs` → VirtoOZ MCP — query EVERY guide the domain touches, not one.** A map covering back office + storefront needs **`PlatformUserGuide`** *and* **`StorefrontUserGuide`**; add `PlatformDeveloperGuide` / `StorefrontDeveloperGuide` / `FrontendSourceCode` for a contract layer, and `B2BExperts` for B2B. One guide answers for one audience, and **a disagreement between two guides about the same mechanism is itself a finding**. Context7 (`/virtocommerce/vc-docs`) is a fallback only.
  **VirtoOZ answers "how is it MEANT to work", never "what is new"** — its release corpus stops around Platform 3.917 while production is past 3.1050. A guide describing the pre-change behaviour is therefore **expected**, not a miss to retry; what turns it into a finding is the **live** check placed beside it.
  **Look for a PURPOSE statement while you are there.** §1's `UNDECLARED` verdict is only honest if the guides were actually checked — and a procedural guide that explains *how* to operate a feature without ever saying *what it is for* is the common case, so say that explicitly rather than leaving §1 looking unexamined.

## Step 2 — Dispatch `ba-system-analyzer`

It is the **sole writer** of `knowledge/domain/*.md`, on the same single-writer discipline it already
holds for `business-logic.md` and the ECL. The brief must carry:

| Must carry | Why |
|---|---|
| **The shape file + the reference map, by path** | so the output is citable in the same shape as its siblings |
| **The prior art as PATHS, never as a digest** | the agent has to triangulate each claim against a live check before it can carry `CONFIRMED`/`DRIFT`/`MISSING`/`UNVERIFIED`. A summary pre-answers the question the pass exists to ask ([`dispatch-pack.md`](../skills/qa-test/dispatch-pack.md)) |
| **Deployed versions**, and the schema's refresh date | otherwise every field name it reads is of unknown age and it will say so — correctly, and uselessly |
| **`BREADTH FIRST`, stated as a constraint** | a complete map with `UNVERIFIED` cells beats a deep dive on one screen. This is the instruction that prevents reproducing the failure the map exists to fix |
| **READ-ONLY on the environment** | no create, invite, lock, unlock, delete or modify. A capability confirmable only by mutating is `UNVERIFIED` **with the mutation named** |
| **Reserved fixtures, by name, as off-limits** | another run's lane accounts and any load-bearing fixture (e.g. a deliberately-blocked impersonation target) |
| **A browser lane that is free**, and never firefox for click-driven work unless its config prerequisite is met | `.claude/rules/agents.md` |
| **The published-doc quotes, VERBATIM, each with its URL** | a map that paraphrases a guide cannot be checked, and a quote relayed second-hand is not evidence — **never quote a guide the pass did not fetch itself.** Every doc claim is then **triangulated against live**: `{DOC}` says X, live says Y, and where they differ that is a **`D*` row**, not a footnote. A guide is customer-facing, so a docs-vs-build divergence is often the highest-impact row in the map |
| **The account contrasts to walk** | the richest multi-X fixture, a minimal one, and **the negative case** (an account *without* the feature) — the negative contrast is what reveals the gating logic, and it is the axis most often unmapped |
| **`--exclude` areas** | recorded in `excludes:`, and each excluded surface still gets a **one-line existence note** so the inventory is not silently incomplete |

**Credentials come from `process.env` after `import('./config.js')`.** Note that `config.js` exports a
**curated** `env` object — a missing key there is not proof a variable is unset.

On internal error, enumerate inline from source + the prior art rather than retrying the dispatch, and
mark everything not seen live `UNVERIFIED`.

## Step 3 — Assemble and write

The orchestrator writes the file; the agent returns content. Two rules that decide whether the map ages
well:

- **Never delete a `D*` or `G*` row on a refresh.** Update in place, mark a closed gap `CLOSED` with
  what closed it. The ids are a citation contract — tickets, cases and oracle audits point at them.
- **Contradict the previous rev out loud.** A refresh that silently drops a claim leaves readers who
  cited it with no signal. `rev: N+1`, and a short §Changed-since-rev-N note when anything material moved.

## Step 4 — Gate (inline, 8 clauses)

The template's own gate, re-derived rather than trusted: valid `domain_slug` + full frontmatter ·
**§1 purpose is a sentence or the literal `UNDECLARED` with where you looked** · every in-scope layer has
a §2 subsection **including a "not manageable from here" row** · **§3 has ≥1 row or an explicit
"compared and they agree"** · §4 counts each name their basis and separate *deliberate* from *hole* ·
every §5 gap says what it needs · **every claim carries a verdict** · no invented routes, fields or ids,
and no behavioural rule stated as an oracle.

Then: `npm run context:check` (the map must add no dangling path) and `npm run domain:check`.

## Step 5 — Route what the map found. It is not just a document.

A map pass reliably turns up things that belong somewhere else. **Route each; file none of them from
here.**

| Found | Goes to |
|---|---|
| A prior-art claim that is **`DRIFT`** | recorded in §6. If a **`BL-*`** depends on it → a `/qa-review-oracles bl` **proposal** (`ba-system-analyzer` is the sole writer; never an edit from here) |
| A **selection-group** defect (a group missing half the coverage, or running a suite with none) | report it; the fix is `config/test-suites.json` via `suites:sync`, not a hand edit |
| A **zero-coverage** area that matters | a `/qa-test-plan` input, or a `GAP-NN` in the next sprint plan |
| An **over-covered** area | the same, as a culling candidate for `/qa-review-tests` |
| A suspected **product defect** | **do not file.** The map pass is read-only and its evidence is an enumeration, not a repro. Hand it to `/qa-bug` or the next `/qa-test` run |
| A **cross-product convention divergence** | a human decision, stated as one; a map records it and never resolves it |

## Auto-build from `/qa-test`

A FULL run reaching item `1c-map` with `domain_map.state ∈ {ABSENT, unresolved}` and an all-layer chain
**invokes this command** — the whole procedure, not a lighter paraphrase of it: Step 0's resolve, Step 1's
pre-flight, Step 2's brief, Step 3's write, Step 4's 8-clause gate + `context:check` + `domain:check`.
(Model-invocation is what makes that an invocation rather than a re-implementation, and a
re-implementation is the thing to avoid: a hand-rolled lighter brief produces a map that is *not* citable
in the same shape as its siblings.) Four deltas, and only four:

| | Direct invocation | Auto-build inside `/qa-test` |
|---|---|---|
| **Scope** | build **or** refresh | **build only.** `STALE` is left alone and reported; a refresh is an operator's call |
| **Pre-flight** | Step 1 as written | reuses what `1b` already fetched — deployed versions, the `2-release` ledger Δ, the schema refresh date — and fetches only the rest |
| **Lane** | any free lane | **a lane `1c`'s analyzer is not on** (it holds `playwright-firefox`); named in the brief, never left to the agent |
| **On failure** | STOP and say why | **degrade**: `build_outcome: FAILED` + the reason, `state` stays `ABSENT`, the `/qa-test` run continues unchanged. Nothing here is ever a blocker or a product finding |

**Step 5's routing still applies** — a `DRIFT`, a selection-group defect, a zero-coverage area or a
suspected product defect found during an auto-build is routed exactly as it would be from a direct run,
into the host run's `5h`. **It is still filed from nowhere else.**

**When the map already EXISTS, the host run does not come back here.** It writes back what it verified at
[`skills/qa-test/reporting.md`](../skills/qa-test/reporting.md) §5h-map — a bounded append from evidence
the run already produced, costing no dispatch: new §2 surfaces, a `D*` verdict upgraded live, a `G*`
closed, a §4 count corrected. **An amendment sets `amended:` and never touches `generated` or `rev`**, so
staleness keeps measuring the last full *enumeration* and a trickle of true facts can never silence
`domain:check`. A refresh, when one is eventually run, **folds the `§7 — Amendments` log in and does not
drop it**: those rows are observations this map does not otherwise hold.

## What persists

| Artifact | Path |
|---|---|
| The map | `.claude/knowledge/domain/<name>.md` (`.claude/rules/reports.md` — knowledge, not a report category) |
| A one-row citation | `CLAUDE.md` Detailed References, on a **first** build only |

**No report file.** The map *is* the deliverable.

---

## Refresh

A refresh re-derives; it does not patch. Carry forward: every `D*` and `G*` id, the `excludes:` list,
and the previous `rev`. Then diff — **what moved is the interesting output**, and a version drift in a
module under enumeration usually explains it.

**Staleness is a warning, never a build failure.** `npm run domain:check` flags a map past
`stale_after_days`; a **missing** map fails nothing, because most domains still have none (`npm run
domain:check` prints how many exist — do not transcribe the number) and a hard gate would stop every
ticket in the repo. That asymmetry is deliberate — see the decision record. **`/qa-test`'s FULL auto-build
is how the missing ones get filled** — by a run that was already paying for the wave, not by a gate.
