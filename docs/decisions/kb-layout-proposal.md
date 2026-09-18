# The vc-knowledge layout — a proposal

**Status: PROPOSAL. Nothing here is decided, and nothing here is normative.** The normative
description of the base's layout is `VirtoCommerce/vc-knowledge/README.md` and
`plugins/vc-kb/src/planes.mjs`; this file argues that both should change, and records the
measurements the argument rests on.

Written 2026-09-18 on branch `claude/kb-tool`, against the base as it stood that day:
1 530 files, 7 directories, 13 files at the root, `kb stat` reporting 590 derived entries,
89 active captured, 217 rules, 3 flows, 354 addressable sections in `knowledge/`.

Open questions are in §8. They are open — this proposal deliberately does not answer them.

---

## 1. What the base holds today

| Store | Files | Who writes it | What gates it | Its artifacts |
|---|---|---|---|---|
| `derived/` (`entries/`, `rest/`, `graphql/`, 5 meta json) | 1 172 | `kb extract`, from a running deployment | byte comparison (`kb check`) | `derived-index.json` (1.0 MB), `derived-catalog.md` (107 KB) — **at the root** |
| `captured/` | 101 | agents, through `kb capture` | `kb validate` | `captured-index.json` (452 KB), `captured-catalog.md` — **at the root** |
| `rules/` | 217 | the BL-invariant import | `kb validate` | `rules-index.json` (1.0 MB), `rules-catalog.md` — **at the root** |
| `flows/` | 3 | `kb capture --flow` | `kb validate` | `flows-index.json`, `flows-catalog.md` — **at the root** |
| `knowledge/` (7 topic dirs) | 32 | people **and** four generator scripts | **nothing** | none — no index, no catalog |
| `sources/` | 2 | one import, once | nothing | — |
| `docs/` | 2 | by hand | nothing | — |
| `demand.jsonl` | — | the `kb` door | nothing | — |

Four stores with entries, ids and evidence; one store of pages; two directories and one log that
are none of those. Five different shapes.

---

## 2. Findings

Each is measured against the base or this repository on 2026-09-18, not inferred.

### 2.1 The root is a mixing bowl

Thirteen files, of which 2.6 MB is machine-written JSON. `captured/` and `captured-index.json` are
**siblings**, not parent and child, and the same holds for all four stores.

`planes.mjs` states the rule this violates, in its own header: *"The layout says which plane a file
belongs to, because nothing else did."* The rule was applied **inside** `derived/` and never to the
artifacts beside it.

### 2.2 Five stores, five conventions

`derived/` nests, and keeps its meta json inside itself. `captured/`, `flows/` and `rules/` are flat
with two satellites at the root each. `knowledge/` nests by topic and has neither index, catalog nor
gate. A sixth store has no precedent to copy, and a reader learning the base has to learn it five
times.

### 2.3 `knowledge/` is three kinds of file under one name

* **Authored by a person:** `domain/*`, `architecture/*`, `api/api-auth.md`, `api/platform-patterns.md`,
  `api/graphiql-interaction.md`, `api/order-creation-matrix.md`, `ba/virto-doc-style.md`,
  `automation/browser-quirks.md`, `automation/storefront-config-flags.md`,
  `automation/storefront-selectors.md`, `execution/*`, `oracles/critical-ui-scope.md`,
  `oracles/e-commerce-edge-cases-library.md`, `oracles/vc-bug-catalog.md`.
* **Generated, from a source that lives elsewhere:** `oracles/business-logic.md` (**410 KB**, rendered
  by `npm run bl:render` from the same 217 records `rules/` holds), `api/graphql-schema.md`
  (`scripts/graphql/refresh-graphql-schema.mjs`), `domain/sitemap.md`
  (`scripts/maintenance/refresh-sitemap.mjs`), `domain/release-ledger.md`
  (`scripts/maintenance/refresh-release-ledger.mjs`).
* **Deployment-pinned machine data:** `domain/sitemap-snapshot.vcst.json` — the environment name is in
  the **filename** — and `domain/release-ledger-snapshot.json` (232 KB).

The founding argument of this base is that *"a regenerated corpus that is byte-gated and a written
corpus that grows cannot share a file without one of them breaking the other's gate on every
change."* It is enforced rigorously between `derived/` and `captured/` and not at all here. Nothing
in the tree tells a reader that an edit to `business-logic.md` is lost at the next render.

### 2.4 `knowledge/` collides with `.claude/knowledge/`, measurably

Both trees carry an `api/` and an `execution/` subdirectory, and citations are written bare.
Measured across `.claude/`, `plugins/`, `ci/`, `scripts/` and `docs/`:

| Citation | Resolves to |
|---|---|
| `knowledge/execution/tracker-ops.md` — 13 occurrences | **this repository** (`.claude/knowledge/`) |
| `knowledge/execution/debugging-signals.md` — 12 occurrences | **the knowledge base** |
| `knowledge/api/graphql-test-cases-runner.md` — 9 occurrences | **this repository** |
| `knowledge/api/graphql-schema.md` — 71 occurrences | **the knowledge base** |

`CLAUDE.md` carries a paragraph whose only job is to resolve this (*"A path starting `knowledge/` is
in the KNOWLEDGE BASE, not this repository"*) — a documentation rule compensating for a naming
defect. `context:check`'s `DOC-003` path ratchet cannot see across the boundary at all, so a
dangling base reference is not caught by anything.

### 2.5 `knowledge/` has no index, no catalog and no gate

`kb stat` reports **354 addressable sections**, and `src/pages.mjs` re-derives them by walking all 32
files **on every `kb show`** — there is no persisted index. Meanwhile `pages.mjs`'s own header
records that `ECL-13.3` is cited 3 095 times in this project's regression suites: these ids are a
contract.

Every other store has a persisted index *and* a catalog whose byte comparison is what catches an
entry edited by hand. `knowledge/` has neither. A hand edit to `business-logic.md` is caught only by
`npm run bl:render:check` — a gate that lives in **this** repository, which a client install does
not have. `bin/kb.mjs` says so out loud: *"not checked here: the generated pages under `knowledge/`
— this tool holds no renderer."*

### 2.6 The `.gitignore` rule for the written indexes is inert for two of three

| File | Listed in `.gitignore` | Actually tracked |
|---|---|---|
| `captured-index.json` | yes | **yes** |
| `flows-index.json` | yes | **yes** |
| `rules-index.json` | yes | no |
| `derived-index.json` | no (deliberately) | yes |

`.gitignore` does not untrack a file that is already tracked, and these two predate the rule. The
base's README states all three are untracked "since 2026-09-17", which is false for two of them, and
`sync.mjs`'s `isUntracked()` therefore takes a different branch for `rules` than for its two
siblings on the same machine. `sync.mjs`'s own comment notices the symptom (*"its two siblings are
tracked from before the ignore rule, so nobody noticed"*) without fixing the cause.

### 2.7 `sources/` is read by nothing, and `docs/` is duplicated

No module under `plugins/vc-kb/src/` opens `sources/`. It is reachable only as a string inside rule
frontmatter (`from: sources/business-logic-2026-09-17.md`) — provenance for one import, filed at the
root as though it were a store. `docs/HISTORY.md` in the base sits beside
`plugins/vc-kb/docs/HISTORY.md` in the tool; two history files, and the tree does not say which is
whose.

### 2.8 There is no front door

The base is meant to be handed to an agent whole. The registers that make that possible — the four
catalogs — are scattered across the root among the indexes, and nothing says "read this first".

---

## 3. The proposal

One principle, from which the rest follows:

> **Each top-level directory answers exactly one question: what kind of material is this, and who is
> allowed to write it.** An index, a catalog, meta and provenance are *artifacts of a store*, not
> peers of it.

```
vc-knowledge/
  kb.json                 the base marker, plus "layout": 2
  README.md
  INDEX.md                NEW — the front door: five catalogs, one line each

  derived/                regenerated, byte-gated, never edited
    entries/  rest/  graphql/
    pin.json  modules.json  release.json  unresolved.json  anchor-baseline.json
    index.json            tracked — nothing can rebuild it without a deployment
    catalog.md
  captured/   entries/  index.json (ignored)  catalog.md
  flows/      entries/  index.json (ignored)  catalog.md
  rules/      entries/  index.json (ignored)  catalog.md
              sources/    the frozen import the rules were transcribed from
  pages/                  was knowledge/ — documents read whole
    oracles/ domain/ api/ architecture/ automation/ ba/ execution/
    snapshots/            sitemap.vcst.json, release-ledger.json
    index.json            NEW — the 354 sections, persisted
    catalog.md            NEW
  signals/    demand.jsonl
  docs/
```

Root: **three files and seven directories.** Every store has one shape —
`<entries>/ + index.json + catalog.md`.

### 3.1 Two decisions inside the proposal, argued rather than assumed

**(a) `entries/` now appears under the written planes too.** The base's README currently refuses it:
*"a nested `entries/` there would be a directory with no siblings, added only to make two trees look
alike."* That objection is answered by the move itself — once the index and the catalog come inside,
the siblings exist. The refusal was correct about the layout it was written against.

**(b) Generatedness is declared in the page's frontmatter, not encoded in its path.** The obvious
alternative — `pages/authored/` beside `pages/rendered/` — is **rejected**, because it splits a topic
in half: `pages/domain/catalog.md` (authored) and `pages/rendered/domain/sitemap.md` (generated)
would answer one question, "what do we know about this domain", from two places. Instead a page
carries `generated: true`, `source: rules/`, `renderedHash: <sha>`, and `kb validate` catches a hand
edit by comparing the hash — **without needing the renderer**, which is the whole point for a client
install that has the base and the tool and nothing else.

The precedent is in the base already, and it was chosen for the same reason. `citedAs:` lives in the
page rather than in `kb.json`: *"the fact belongs to the page, travels with it when it is renamed,
and is visible to whoever is editing it. A central registry of which page owns which prefix is a
second place to keep in step, and the one that rots."*

And the founding argument is satisfied literally: it forbids a regenerated and a written corpus
sharing a **file**. The gate is per file; different files in one directory were never the problem.

---

## 4. What this buys

1. **The root drops from 13 files to 3.** Opening the base shows knowledge, not 2.6 MB of indexes.
2. **One shape across five stores.** `WRITTEN_STORES` in `planes.mjs` stops being a map over three of
   five and becomes a descriptor over all of them; twelve scattered constants collapse into five
   objects, and a sixth store is added by copying one.
3. **The `knowledge/` ↔ `.claude/knowledge/` collision disappears.** `pages/domain/catalog.md` can
   only mean the base. The disambiguation paragraph leaves `CLAUDE.md`, and `DOC-003` can begin
   ratcheting base references for the first time.
4. **Finding 2.6 repairs itself.** A moved file is a new path, and the ignore rule bites on add.
5. **`kb show ECL-13.3` becomes an index lookup** instead of a walk over 1 MB of markdown, and gains
   the same staleness gate as every other index.
6. **A hand edit to a generated page is caught on a client machine**, not only in this repository's
   CI.
7. **The base becomes explainable in one sentence** — *five stores, each with its entries, its index
   and its catalog; one log; one history folder* — where today the explanation is a 13 KB README.
8. **It makes an unasked question askable:** whether a 410 KB rendered `business-logic.md` should
   exist beside the 217 records it is rendered from. Today the tree does not say it is a projection,
   so nobody asks.

---

## 5. The change surface

### 5.1 The tool — small, because the paths are already centralised

| File | Change |
|---|---|
| `plugins/vc-kb/src/planes.mjs` | 12 constants → 5 store descriptors |
| `plugins/vc-kb/src/refute.mjs` | two hardcoded `join(base, 'derived', 'entries')` / `'captured'` → constants |
| `plugins/vc-kb/src/extract.mjs` | five `derived/*.json` literals |
| `plugins/vc-kb/src/capture.mjs` | `derived/pin.json`, `capturedDir()` |
| `plugins/vc-kb/src/pages.mjs` | `PAGES_DIR`; build and persist `pages/index.json` |
| `plugins/vc-kb/src/demand.mjs` | `DEMAND_FILE` → `signals/demand.jsonl` |
| `plugins/vc-kb/src/validate.mjs` | new: gate the pages store (stale index, `renderedHash` mismatch) |
| `plugins/vc-kb/src/base.mjs` | recognise layout 1 vs layout 2 |
| `plugins/vc-kb/test/*.mjs` | roughly six files carry paths |

### 5.2 This repository

| File | Change |
|---|---|
| `scripts/lib/knowledge-base.mjs` | `KNOWLEDGE_DIR = "knowledge"` → `"pages"`; the other 15 call sites go through it |
| `scripts/knowledge/render-bl.mjs` | write target, plus stamping `renderedHash` |
| `scripts/maintenance/refresh-sitemap.mjs`, `scripts/maintenance/refresh-release-ledger.mjs`, `scripts/graphql/refresh-graphql-schema.mjs` | write target; snapshots to `pages/snapshots/` |
| `scripts/maintenance/lint-knowledge-refs.mjs` | walk root |
| `CLAUDE.md`, `.claude/rules/*`, `.claude/ROUTING.md` | delete the disambiguation paragraph; rewrite citations |
| ~320 `knowledge/**` citations across `.claude/`, `plugins/vc-fix/`, `ci/`, `scripts/` | mechanical rewrite — see risk 6.2 |

### 5.3 The base repository

`README.md` (a rewrite, not a `sed` — its prose is the project's memory and is load-bearing),
`.gitignore`, `kb.json`.

### 5.4 Deliberately NOT proposed

**No path map in `kb.json`.** It would be a second registry beside `planes.mjs`, and the one that
rots. `kb.json` gains exactly one field: `layout`.

---

## 6. Risks and costs

**6.1 Plugin/base version skew — the largest risk.** A client with the new plugin and an old base,
or the reverse, gets `degraded` on every `kb ask`. **This has already happened once**: a missing
`rules-index.json` made all 217 rules unreachable on every machine that followed the documented
setup. Mitigation is mandatory, not optional — `"layout": 2` in `kb.json`, the tool reading **both**
layouts for one release, and a refusal on the old one that names the exact remedy. An old base must
never look like an empty one; that is this base's own three-states-not-two rule, reaching one layer
out.

**6.2 The ~320-citation rewrite runs over an ambiguous prefix.** A naive `sed` on `knowledge/` will
damage `.claude/knowledge/**` (finding 2.4). It needs a script that resolves `api/` and `execution/`
per occurrence against the base's actual file list, followed by `npm run context:check`,
`npm run knowledge:refs`, `npm run bl:lint` and `npm run ecl:lint`. This is the single most dangerous
step in the whole change.

**6.3 Two git repositories have to land almost simultaneously.** The window in which they disagree is
a window in which `kb` does not work for the team.

**6.4 Paths get slightly longer.** `pages/…` is near parity with `knowledge/…`; `signals/demand.jsonl`
costs eight characters. In a repository with a prompt-byte budget (`BUDGET-004`, 19 000 chars) this
is small but not zero.

**6.5 File history folds.** `git mv` plus rename detection preserves it, but `git log <path>` now
needs `--follow`, and one move commit over 1 530 files is a visible crease in `git blame`.

**6.6 Frontmatter-declared generatedness is discipline, not structure.** A page can be added without
the field and nothing notices until the gate is taught to require it of everything a script writes.
A `rendered/` directory would be stricter. This proposal trades strictness for topic readability
(§3.1b) — a real trade, made on purpose.

**6.7 If the team judges `knowledge/` → `pages/` not worth ~320 citations**, there is a variant at
roughly 80 % of the benefit and 20 % of the risk: leave `knowledge/` where it is, move only the eight
root artifacts into their stores, add `signals/`, add `pages/index.json` + `catalog.md`, add the
layout marker. The name collision then survives and has to be closed by a gate rather than by the
structure.

---

## 7. Sequencing

| Phase | Where | What |
|---|---|---|
| 0 | tool | `layout` in `kb.json`; read both layouts; a named refusal on the old one. No moves. |
| 1 | base | artifacts into their stores; `entries/`; `signals/`; `sources/` under `rules/`; descriptors in `planes.mjs`; `.gitignore` repaired |
| 2 | base | `knowledge/` → `pages/`; `snapshots/`; frontmatter + `renderedHash`; `pages/index.json` + `catalog.md`; the validate gate |
| 3 | this repo | the resolver; four writer scripts; the scripted citation rewrite plus every gate; `CLAUDE.md` |
| 4 | tool | drop layout 1 |

---

## 8. Open questions — for the team, not for this document

1. **Should `pages/oracles/business-logic.md` exist at all?** It is 410 KB rendering the same 217
   records `rules/` holds, and `kb rules <domain>` already serves them. The restructure makes the
   question askable; it does not answer it.
2. **Is `pages/` the right name?** It is taken from the tool's own vocabulary — `PAGES_DIR`,
   `pages.mjs`, *"printed as a page"*. Alternatives: `library/`, `refs/`.
3. **`entries/` under all five stores** for symmetry, or keep the written planes flat?
4. **Variant A (with the rename) or variant B (§6.7, without)?**
5. **Does the base want its own `docs/`**, or should its history live beside the tool's in
   `plugins/vc-kb/docs/`?
